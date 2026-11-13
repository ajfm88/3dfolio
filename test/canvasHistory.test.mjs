import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "vite";

import { applyOps, MAX_OPS_PER_COMMIT } from "../server/src/shared/canvasOps.js";

process.env.VITE_API_URL ||= "http://127.0.0.1:3000/api";

const PROJECT = "64b0000000000000000000aa";
const OTHER_PROJECT = "64b0000000000000000000cc";
const TAB_B = "22222222-2222-4222-a222-222222222222";
const USER_A = "64b0000000000000000000a1";
const USER_B = "64b0000000000000000000b2";
const UNDO_NOTICE = "Undo interrupted. Some changes may have been saved.";
const REDO_NOTICE = "Redo interrupted. Some changes may have been saved.";

function node(id, label = "Saved", x = 10, y = 20) {
  return {
    id,
    type: "shape",
    position: { x, y },
    width: 160,
    height: 80,
    data: { shape: "rectangle", label, color: "#1F1F1F", textColor: "#EDEDED" },
  };
}

function edge(id, source, target) {
  return {
    id,
    source,
    target,
    sourceHandle: "right",
    targetHandle: "left",
    type: "link",
    data: { label: "" },
  };
}

function addOp(id, label = "New") {
  return { type: "node.add", node: node(id, label, 12, 24) };
}

function graph(nodes = [], edges = [], version = 0) {
  return { nodes, edges, version };
}

function defer() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function settle() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

async function settleAll() {
  for (let index = 0; index < 4; index += 1) await settle();
}

function createSocket(id = "sock-1") {
  const handlers = new Map();
  const socket = {
    id,
    connected: true,
    sent: [],
    sendBuffer: [],
    handler: () => Promise.resolve({ ok: false, message: "no handler" }),
    on(event, fn) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(fn);
    },
    off(event, fn) {
      handlers.get(event)?.delete(fn);
    },
    emit(event, payload) {
      socket.sent.push({ event, payload });
    },
    timeout() {
      return {
        emitWithAck: (event, payload) => {
          socket.sent.push({ event, payload, ack: true });
          return socket.handler(event, payload);
        },
      };
    },
    fire(event, payload) {
      for (const fn of [...(handlers.get(event) ?? [])]) fn(payload);
    },
    listenerCount(event) {
      return handlers.get(event)?.size ?? 0;
    },
  };
  return socket;
}

// The authoritative side of the fake socket. Commits are validated with the
// production applyOps, so a wrong op order or an oversized chunk fails here
// exactly as it would on the server.
function createAuthority(canvas) {
  const auth = {
    nodes: structuredClone(canvas.nodes),
    edges: structuredClone(canvas.edges),
    version: canvas.version ?? 0,
    commits: [],
    syncs: 0,
    holds: new Map(),
    failAt: null,
    timeoutAt: null,
    snapshot() {
      return structuredClone({ nodes: auth.nodes, edges: auth.edges, version: auth.version });
    },
    holdAt(n) {
      const gate = defer();
      auth.holds.set(n, gate);
      return gate;
    },
  };
  const apply = (payload) => {
    if (payload.baseVersion !== auth.version) {
      return { ok: false, message: "Canvas version mismatch", canvas: auth.snapshot() };
    }
    const result = applyOps({ nodes: auth.nodes, edges: auth.edges }, payload.ops);
    if (!result.ok) return { ok: false, message: result.error, canvas: auth.snapshot() };
    auth.nodes = result.canvas.nodes;
    auth.edges = result.canvas.edges;
    auth.version += 1;
    return { ok: true, version: auth.version };
  };
  auth.handler = (event, payload) => {
    if (event === "canvas:sync") {
      auth.syncs += 1;
      return Promise.resolve({ ok: true, canvas: auth.snapshot() });
    }
    if (event !== "canvas:commit") return Promise.resolve({ ok: false, message: "unexpected" });
    auth.commits.push(structuredClone(payload));
    const n = auth.commits.length;
    if (auth.failAt === n) {
      return Promise.resolve({ ok: false, message: "Canvas version mismatch", canvas: auth.snapshot() });
    }
    if (auth.timeoutAt === n) return Promise.reject(new Error("timeout"));
    const hold = auth.holds.get(n);
    if (hold) return hold.promise.then(() => apply(payload));
    return Promise.resolve(apply(payload));
  };
  return auth;
}

function turnPacket(userId, tabId, serverNow = 2) {
  return {
    projectId: PROJECT,
    holder: userId ? { userId, tabId } : null,
    holderSince: userId ? 1 : null,
    queue: [],
    idleDeadline: null,
    graceUntil: null,
    serverNow,
  };
}

function joinBody(socket, projectId, canvas, role) {
  const tabId = [...socket.sent].reverse().find((item) => item.event === "workspace:join")?.payload?.tabId;
  return {
    ok: true,
    project: { _id: projectId, name: "Design", description: "" },
    role,
    canvas,
    participants: [{ userId: USER_B, fullName: "Grace", img: "", role: "viewer" }],
    turn: role === "viewer"
      ? null
      : { holder: { userId: USER_A, tabId }, holderSince: 1, queue: [], idleDeadline: null, graceUntil: null, serverNow: 1 },
    serverNow: 1,
  };
}

describe("canvas history", () => {
  let vite;
  let useWorkspaceStore;
  let useSessionStore;
  let selectCanEdit;
  let selectCanUndo;
  let selectCanRedo;
  let selectCanChat;
  let sameGraph;
  let historyMod;
  let toastMod;
  let errors;
  let originals;
  let disposers;

  before(async () => {
    vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: "custom",
      logLevel: "error",
    });
    const storeMod = await vite.ssrLoadModule("/src/collaborate/store/useWorkspaceStore.js");
    const sessionMod = await vite.ssrLoadModule("/src/collaborate/store/useSessionStore.js");
    historyMod = await vite.ssrLoadModule("/src/collaborate/lib/canvasHistory.js");
    toastMod = await import("react-toastify");
    errors = [];
    originals = { error: toastMod.toast.error, success: toastMod.toast.success };
    toastMod.toast.error = (message) => {
      errors.push(message);
    };
    toastMod.toast.success = () => {};
    useWorkspaceStore = storeMod.useWorkspaceStore;
    useSessionStore = sessionMod.useSessionStore;
    selectCanEdit = storeMod.selectCanEdit;
    selectCanUndo = storeMod.selectCanUndo;
    selectCanRedo = storeMod.selectCanRedo;
    selectCanChat = storeMod.selectCanChat;
    sameGraph = historyMod.sameGraph;
    disposers = [];
  });

  after(async () => {
    toastMod.toast.error = originals.error;
    toastMod.toast.success = originals.success;
    useWorkspaceStore?.getState().resetWorkspace();
    await vite?.close();
  });

  function reset() {
    errors.length = 0;
    for (const dispose of disposers.splice(0)) dispose();
    useWorkspaceStore.getState().resetWorkspace();
    useSessionStore.setState({ authUser: { _id: USER_A, fullName: "Ada", img: "" }, socket: null });
  }

  async function open(canvas = graph(), { role = "editor", projectId = PROJECT, socket = createSocket() } = {}) {
    const auth = createAuthority(canvas);
    const gate = defer();
    useSessionStore.setState({ socket });
    socket.handler = (event) => (event === "workspace:join" ? gate.promise : Promise.resolve({ ok: false }));
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, projectId);
    disposers.push(dispose);
    gate.resolve(joinBody(socket, projectId, canvas, role));
    await settleAll();
    socket.handler = auth.handler;
    return { socket, auth, dispose };
  }

  const store = () => useWorkspaceStore.getState();
  const counts = () => {
    const { undo, redo } = store().history;
    return { undo, redo };
  };

  async function edit(ops) {
    assert.equal(store().dispatch(ops), true);
    await settleAll();
  }

  function assertSynced(auth) {
    const local = store().canvas;
    assert.equal(sameGraph(local, auth), true, "holder graph equals authoritative graph");
    assert.equal(local.version, auth.version);
  }

  function hubGraph(edgeCount = 600) {
    const edges = [];
    for (let index = 0; index < edgeCount; index += 1) {
      const kind = index % 3;
      edges.push(edge(`x${index}`, kind === 1 ? "other" : "hub", kind === 0 ? "other" : "hub"));
    }
    return graph([node("hub"), node("other", "Other", 300, 20)], edges);
  }

  it("undoes and redoes add, move, recolor and delete, and watchers see the same graph", async () => {
    reset();
    const { socket, auth } = await open();
    assert.equal(selectCanUndo(store()), false);
    assert.equal(selectCanRedo(store()), false);

    await edit([addOp("a", "One")]);
    assert.equal(store().commitNodePositions([{ id: "a", position: { x: 80, y: 90 } }]), true);
    await settleAll();
    assert.equal(store().setNodeColor("a", "Blue"), true);
    await settleAll();
    assert.equal(store().deleteElements({ nodes: [{ id: "a" }], edges: [] }), true);
    await settleAll();
    assert.deepEqual(counts(), { undo: 4, redo: 0 });
    assert.equal(auth.nodes.length, 0);

    const expected = [];
    for (let step = 0; step < 4; step += 1) {
      assert.equal(selectCanUndo(store()), true);
      assert.equal(store().undo(), true);
      await settleAll();
      expected.push(auth.snapshot());
      assertSynced(auth);
    }
    assert.deepEqual(counts(), { undo: 0, redo: 4 });
    assert.equal(auth.nodes.length, 0);
    assert.equal(store().undo(), false);

    for (let step = 0; step < 4; step += 1) {
      assert.equal(store().redo(), true);
      await settleAll();
      assertSynced(auth);
    }
    assert.deepEqual(counts(), { undo: 4, redo: 0 });
    assert.equal(auth.nodes.length, 0);
    const bases = auth.commits.map((commit) => commit.baseVersion);
    assert.deepEqual(bases, bases.map((_, index) => index), "versions advance one commit at a time");
    assert.equal(auth.version, 12);
    assert.equal(socket.sent.some((item) => item.event === "canvas:sync"), false);
  });

  it("keeps coalesced dispatches as separate undo frames", async () => {
    reset();
    const { auth } = await open(graph([node("base")]));
    const gate = auth.holdAt(1);
    assert.equal(store().dispatch([addOp("a")]), true);
    assert.equal(store().dispatch([addOp("b")]), true);
    assert.equal(store().dispatch([addOp("c")]), true);
    assert.equal(auth.commits.length, 1);
    gate.resolve();
    await settleAll();
    assert.equal(auth.commits.length, 2);
    assert.equal(auth.commits[1].ops.length, 2, "the queued dispatches travel as one transport commit");
    assert.deepEqual(counts(), { undo: 3, redo: 0 });

    for (const id of ["c", "b", "a"]) {
      assert.equal(store().undo(), true);
      await settleAll();
      assert.equal(auth.nodes.some((n) => n.id === id), false);
      assertSynced(auth);
    }
    assert.deepEqual(auth.nodes.map((n) => n.id), ["base"]);
  });

  it("disables commands while saves are pending but still queues ordinary edits", async () => {
    reset();
    const { auth } = await open();
    await edit([addOp("a")]);
    assert.equal(selectCanUndo(store()), true);

    const gate = auth.holdAt(2);
    assert.equal(store().dispatch([addOp("b")]), true);
    assert.equal(store().history.busy, true);
    assert.equal(selectCanUndo(store()), false);
    assert.equal(store().undo(), false);
    assert.equal(store().dispatch([addOp("c")]), true, "ordinary edits keep batching");
    assert.equal(auth.commits.length, 2);

    gate.resolve();
    await settleAll();
    assert.equal(store().history.busy, false);
    assert.equal(selectCanUndo(store()), true);
    assert.equal(counts().undo, 3);
  });

  it("clears redo only on a new graph-changing edit", async () => {
    reset();
    const { auth } = await open(graph([node("base", "Same")]));
    await edit([addOp("a")]);
    assert.equal(store().undo(), true);
    await settleAll();
    assert.deepEqual(counts(), { undo: 0, redo: 1 });

    assert.equal(store().setNodeLabel("base", "Same"), true, "unchanged label is not an op");
    assert.equal(store().dispatch([{ type: "node.remove", id: "ghost" }]), false);
    assert.equal(store().dispatch([{ type: "node.update", id: "base", patch: { width: 160 } }]), true);
    await settleAll();
    assert.equal(auth.commits.length, 3, "the no-net-change batch is still sent");
    assert.deepEqual(counts(), { undo: 0, redo: 1 }, "refused and no-change dispatches keep redo");

    assert.equal(store().setNodeLabel("base", "Changed"), true);
    await settleAll();
    assert.deepEqual(counts(), { undo: 1, redo: 0 });
  });

  it("keeps at most 100 undo frames", async () => {
    reset();
    const { auth } = await open();
    for (let index = 0; index < 105; index += 1) await edit([addOp(`n${index}`)]);
    assert.equal(counts().undo, 100);
    for (let index = 0; index < 100; index += 1) {
      assert.equal(store().undo(), true);
      await settleAll();
    }
    assert.equal(store().undo(), false);
    assert.equal(auth.nodes.length, 5, "the five oldest edits were evicted and stay");
    assert.deepEqual(auth.nodes.map((n) => n.id), ["n0", "n1", "n2", "n3", "n4"]);
  });

  it("undoes a node with 600 edges in 13 sequential commits and redoes it", async () => {
    reset();
    const start = hubGraph();
    const { auth } = await open(start);
    assert.equal(store().deleteElements({ nodes: [{ id: "hub" }], edges: [] }), true);
    await settleAll();
    assert.equal(auth.edges.length, 0);
    assert.equal(auth.commits.length, 1);

    assert.equal(store().undo(), true);
    assert.equal(store().history.replay, "undo");
    await settleAll();
    const replayCommits = auth.commits.slice(1);
    assert.equal(replayCommits.length, 13);
    assert.ok(replayCommits.every((commit) => commit.ops.length <= MAX_OPS_PER_COMMIT));
    assert.deepEqual(replayCommits.map((commit) => commit.baseVersion), replayCommits.map((_, i) => i + 1));
    assert.equal(replayCommits[0].ops[0].type, "node.add");
    assert.equal(auth.edges.length, 600);
    assert.equal(sameGraph(auth, start), true);
    assertSynced(auth);
    assert.equal(store().history.replay, null);
    assert.deepEqual(counts(), { undo: 0, redo: 1 });

    assert.equal(store().redo(), true);
    await settleAll();
    assert.equal(auth.edges.length, 0);
    assert.equal(auth.commits.length, 15);
    assertSynced(auth);
    assert.deepEqual(counts(), { undo: 1, redo: 0 });
  });

  it("blocks ordinary edits and previews during replay but not chat, cursors or turn controls", async () => {
    reset();
    const { socket, auth } = await open(hubGraph());
    store().deleteElements({ nodes: [{ id: "hub" }], edges: [] });
    await settleAll();
    const gate = auth.holdAt(3);
    assert.equal(store().undo(), true);
    await settleAll();
    assert.equal(auth.commits.length, 3, "the replay is held mid-flight");
    const state = store();
    assert.equal(state.history.replay, "undo");
    assert.equal(selectCanEdit(state), false);
    assert.equal(selectCanUndo(state), false);
    assert.equal(selectCanRedo(state), false);
    assert.equal(state.dispatch([addOp("blocked")]), false);
    assert.equal(state.setNodeLabel("other", "blocked"), false);
    assert.equal(state.commitNodePositions([{ id: "other", position: { x: 5, y: 5 } }]), false);
    assert.equal(state.undo(), false);
    assert.equal(state.redo(), false);
    const previewsBefore = socket.sent.length;
    state.onNodeDrag(null, null, [{ id: "other", position: { x: 1, y: 2 } }]);
    assert.equal(socket.sent.length, previewsBefore, "no preview is queued or sent");
    assert.equal(selectCanChat(state), true, "chat does not wait for a replay");
    state.moveCursor({ x: 1, y: 2 });
    state.onNodesChange([{ type: "select", id: "other", selected: true }]);
    assert.equal(store().rfNodes.find((n) => n.id === "other").selected, true);

    gate.resolve();
    await settleAll();
    assert.equal(store().history.replay, null);
    assert.equal(selectCanEdit(store()), true);
    assert.equal(auth.edges.length, 600);
  });

  it("blocks replay during an active gesture and rechecks inside the action", async () => {
    reset();
    await open();
    await edit([addOp("a")]);
    assert.equal(selectCanUndo(store()), true);
    store().beginGesture("drag");
    assert.equal(selectCanUndo(store()), false);
    assert.equal(store().undo(), false);
    store().endGesture("drag");
    store().beginGesture("resize");
    assert.equal(store().undo(), false);
    store().endGesture("resize");
    store().beginGesture("connect");
    assert.equal(store().undo(), false);
    store().endGesture("connect");
    assert.equal(store().undo(), true);
    await settleAll();
  });

  it("does not let a viewer or a second tab replay", async () => {
    reset();
    await open(graph([node("a")]), { role: "viewer" });
    assert.equal(selectCanUndo(store()), false);
    assert.equal(store().undo(), false);
    assert.equal(store().redo(), false);
    store().beginGesture("drag");
    assert.equal(store().history.gesture, false, "a viewer's pointer movement is not an edit gesture");
  });

  it("interrupts a large replay after a saved prefix: clears history, stops, recovers", async () => {
    reset();
    const start = hubGraph();
    const { auth } = await open(start);
    store().deleteElements({ nodes: [{ id: "hub" }], edges: [] });
    await settleAll();
    auth.failAt = 5;
    assert.equal(store().undo(), true);
    await settleAll();
    assert.equal(auth.commits.length, 5, "nothing is sent after the failing chunk");
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    assert.equal(store().history.replay, null);
    assert.equal(errors.filter((message) => message === UNDO_NOTICE).length, 1);
    assert.equal(auth.edges.length, 149, "the saved prefix is neither rolled back nor retried");
    assert.equal(store().canvas.edges.length, 149);
    assertSynced(auth);
    assert.equal(selectCanUndo(store()), false);
    assert.equal(store().redo(), false);
  });

  it("interrupts a redo with its own notice", async () => {
    reset();
    const { auth } = await open(graph([node("a")]));
    await edit([{ type: "node.update", id: "a", patch: { data: { label: "Two" } } }]);
    store().undo();
    await settleAll();
    auth.timeoutAt = auth.commits.length + 1;
    assert.equal(store().redo(), true);
    await settleAll();
    assert.equal(errors.includes(REDO_NOTICE), true);
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    assert.equal(auth.syncs, 1, "recovery uses the existing authoritative read");
    assertSynced(auth);
  });

  it("does not retransmit an uncertain chunk after a timeout", async () => {
    reset();
    const { auth } = await open(hubGraph());
    store().deleteElements({ nodes: [{ id: "hub" }], edges: [] });
    await settleAll();
    auth.timeoutAt = 4;
    store().undo();
    await settleAll();
    assert.equal(auth.commits.length, 4);
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    assert.equal(auth.syncs, 1);
    assertSynced(auth);
  });

  it("recovers when the first emit throws, with nothing orphaned", async () => {
    reset();
    const { socket, auth } = await open(graph([node("a")]));
    await edit([{ type: "node.update", id: "a", patch: { data: { label: "Two" } } }]);
    const timeout = socket.timeout;
    socket.timeout = () => ({
      emitWithAck: (event) => {
        if (event === "canvas:commit") throw new Error("socket closed");
        return auth.handler(event);
      },
    });
    store().undo();
    await settleAll();
    socket.timeout = timeout;
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    assert.equal(auth.commits.length, 1, "the throwing emit reached nobody");
    assert.equal(store().history.replay, null);
    assert.equal(store().history.busy, false);
    assertSynced(auth);
  });

  it("refuses a replay whose preflight fails and sends nothing", async () => {
    reset();
    const { auth } = await open(graph([node("a")]));
    await edit([addOp("b")]);
    // A remote-looking change to the optimistic graph that undo cannot expect.
    useWorkspaceStore.setState({ canvas: { ...store().canvas, nodes: store().canvas.nodes.filter((n) => n.id !== "b") } });
    const before = auth.commits.length;
    assert.equal(store().undo(), false);
    assert.equal(auth.commits.length, before);
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    assert.equal(errors.at(-1), "Could not undo. History was cleared.");
  });

  it("clears history on turn loss, queued or not, and a later grant starts empty", async () => {
    reset();
    const { socket, auth } = await open(hubGraph());
    const tabId = socket.sent.find((item) => item.event === "workspace:join").payload.tabId;
    await edit([addOp("a")]);
    assert.equal(counts().undo, 1);

    socket.fire("turn:state", turnPacket(USER_B, TAB_B, 2));
    await settleAll();
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    socket.fire("turn:state", turnPacket(USER_A, tabId, 3));
    await settleAll();
    assert.deepEqual(counts(), { undo: 0, redo: 0 }, "a later grant starts empty");
    assert.equal(selectCanUndo(store()), false);

    store().deleteElements({ nodes: [{ id: "hub" }], edges: [] });
    await settleAll();
    const gate = auth.holdAt(4);
    store().undo();
    await settleAll();
    assert.equal(auth.commits.length, 4);
    socket.fire("turn:state", turnPacket(USER_B, TAB_B, 4));
    await settleAll();
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    assert.equal(store().history.replay, null);
    assert.equal(errors.includes(UNDO_NOTICE), true);
    const sentBefore = auth.commits.length;
    gate.resolve();
    await settleAll();
    assert.equal(auth.commits.length, sentBefore, "queued chunks were discarded and none is sent");
    assert.deepEqual(counts(), { undo: 0, redo: 0 }, "the late ack restores nothing");
  });

  it("clears history on disconnect, retry, project change and disposal", async () => {
    reset();
    const first = await open();
    await edit([addOp("a")]);
    first.socket.connected = false;
    first.socket.fire("disconnect", "transport close");
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    assert.equal(store().status, "loading");

    reset();
    const second = await open();
    await edit([addOp("a")]);
    second.socket.handler = (event) => (event === "workspace:join"
      ? Promise.resolve(joinBody(second.socket, PROJECT, second.auth.snapshot(), "editor"))
      : second.auth.handler(event));
    store().retryWorkspace();
    await settleAll();
    assert.equal(store().status, "ready");
    assert.deepEqual(counts(), { undo: 0, redo: 0 });

    reset();
    const third = await open();
    await edit([addOp("a")]);
    const socket = createSocket("sock-2");
    const gate = defer();
    useSessionStore.setState({ socket });
    socket.handler = () => gate.promise;
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, OTHER_PROJECT);
    disposers.push(dispose);
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    third.dispose();
    assert.equal(store().status, "loading", "project A disposal did not disturb project B");
  });

  it("drops history when the session socket or account changes without a disconnect", async () => {
    reset();
    const { socket } = await open();
    await edit([addOp("a")]);
    useSessionStore.setState({ socket: null });
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    assert.equal(store().undo(), false);
    useSessionStore.setState({ socket });
    assert.equal(selectCanUndo(store()), false, "history does not come back with the socket");

    reset();
    const second = await open();
    await edit([addOp("a")]);
    useSessionStore.setState({ authUser: { _id: USER_B, fullName: "Grace", img: "" } });
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    assert.equal(store().undo(), false);
    assert.equal(second.auth.commits.length, 1);

    reset();
    await open();
    await edit([addOp("a")]);
    // Retrying the workspace does not relabel the connection for a new account.
    useSessionStore.setState({ authUser: { _id: USER_B, fullName: "Grace", img: "" } });
    store().retryWorkspace();
    await settleAll();
    assert.equal(selectCanUndo(store()), false);
  });

  it("ignores a late ack after invalidation and after a newer binding", async () => {
    reset();
    const { auth } = await open();
    const gate = auth.holdAt(1);
    store().dispatch([addOp("a")]);
    assert.equal(counts().undo, 1);
    store().retryWorkspace();
    gate.resolve();
    await settleAll();
    assert.deepEqual(counts(), { undo: 0, redo: 0 });

    reset();
    const old = await open();
    const oldGate = old.auth.holdAt(1);
    store().dispatch([addOp("a")]);
    old.dispose();
    const next = await open(graph([node("z")]));
    oldGate.resolve();
    await settleAll();
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    assert.equal(next.auth.commits.length, 0);
    await edit([addOp("b")]);
    assert.equal(counts().undo, 1);
  });

  it("keeps history for foreign and duplicate remote events and clears it for an accepted one", async () => {
    reset();
    const { socket, auth } = await open();
    await edit([addOp("a")]);
    const by = USER_B;
    const op = [addOp("remote")];

    socket.fire("canvas:ops", { projectId: OTHER_PROJECT, version: 2, ops: op, by });
    socket.fire("canvas:ops", { projectId: PROJECT, version: 1, ops: op, by });
    socket.fire("canvas:ops", { projectId: PROJECT, version: 0, ops: op, by });
    await settleAll();
    assert.deepEqual(counts(), { undo: 1, redo: 0 });

    auth.nodes.push(node("remote"));
    auth.version = 2;
    socket.fire("canvas:ops", { projectId: PROJECT, version: 2, ops: op, by });
    await settleAll();
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    assert.equal(store().canvas.nodes.some((n) => n.id === "remote"), true);
  });

  it("clears history when a remote event lands during local pending work", async () => {
    reset();
    const { socket, auth } = await open();
    await edit([addOp("a")]);
    const gate = auth.holdAt(2);
    store().dispatch([addOp("b")]);
    socket.fire("canvas:ops", { projectId: PROJECT, version: 2, ops: [addOp("remote")], by: USER_B });
    gate.resolve();
    await settleAll();
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
  });

  it("does not record history for hydration, selection or sync snapshots", async () => {
    reset();
    const { socket } = await open(graph([node("a")]));
    store().onNodesChange([{ type: "select", id: "a", selected: true }]);
    store().onNodesChange([{ type: "dimensions", id: "a", dimensions: { width: 160, height: 80 } }]);
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    assert.equal(socket.sent.some((item) => item.event === "canvas:commit"), false);
  });
  it("chunks without reordering, dropping or merging", () => {
    const ops = Array.from({ length: 121 }, (_, index) => ({ type: "node.remove", id: `n${index}` }));
    const chunks = historyMod.chunkOps(ops);
    assert.deepEqual(chunks.map((chunk) => chunk.length), [50, 50, 21]);
    assert.deepEqual(chunks.flat(), ops);
    assert.deepEqual(historyMod.chunkOps([]), []);
  });

  it("prepares a frame only for a net graph change", () => {
    const canvas = graph([node("a")]);
    const noChange = applyOps(canvas, [{ type: "node.update", id: "a", patch: { width: 160 } }]);
    assert.deepEqual(historyMod.prepareFrame(canvas, noChange.ops, noChange.canvas), { changed: false, frame: null });
    const change = applyOps(canvas, [{ type: "node.update", id: "a", patch: { width: 200 } }]);
    const prepared = historyMod.prepareFrame(canvas, change.ops, change.canvas);
    assert.equal(prepared.changed, true);
    assert.deepEqual(prepared.frame.inverse, [{ type: "node.update", id: "a", patch: { width: 160 } }]);
    assert.notEqual(prepared.frame.forward, change.ops, "the frame holds its own copy");
  });

  it("preflights every chunk and fails whole", () => {
    const canvas = graph([node("a")]);
    const good = historyMod.prepareReplay(canvas, [addOp("b"), addOp("c")]);
    assert.equal(good.ok, true);
    assert.equal(good.chunks.length, 1);
    assert.equal(good.canvas.nodes.length, 3);
    const ops = Array.from({ length: 60 }, (_, index) => addOp(`m${index}`));
    ops.push({ type: "node.remove", id: "missing" });
    const bad = historyMod.prepareReplay(canvas, ops);
    assert.equal(bad.ok, false);
    assert.equal("chunks" in bad, false);
  });

  it("transfers a frame only when it is still the top one", () => {
    const history = historyMod.createCanvasHistory();
    const first = { forward: [], inverse: [] };
    const second = { forward: [], inverse: [] };
    history.record(first);
    history.record(second);
    assert.equal(history.transfer("undo", first), false, "a stale frame cannot pop a newer one");
    assert.equal(history.transfer("undo", second), true);
    assert.deepEqual([history.undo.length, history.redo.length], [1, 1]);
    const before = history.generation;
    history.clear();
    assert.equal(history.generation, before + 1);
    assert.deepEqual([history.undo.length, history.redo.length], [0, 0]);
  });
  it("clears history when the turn is lost with only the replay chunk in flight", async () => {
    reset();
    const { socket, auth } = await open(graph([node("a")]));
    await edit([{ type: "node.update", id: "a", patch: { data: { label: "Two" } } }]);
    const gate = auth.holdAt(2);
    assert.equal(store().undo(), true);
    await settleAll();
    assert.equal(auth.commits.length, 2);
    socket.fire("turn:state", turnPacket(USER_B, TAB_B, 5));
    await settleAll();
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    assert.equal(store().history.replay, null);
    assert.equal(errors.includes(UNDO_NOTICE), true);
    gate.resolve();
    await settleAll();
    assert.deepEqual(counts(), { undo: 0, redo: 0 }, "the in-flight write settles without restoring history");
  });
  // The held commit is the first chunk of a 13-chunk undo. Retiring the session
  // socket must stop the other twelve from ever leaving the old connection.
  async function heldLargeUndo() {
    const opened = await open(hubGraph());
    store().deleteElements({ nodes: [{ id: "hub" }], edges: [] });
    await settleAll();
    const gate = opened.auth.holdAt(2);
    assert.equal(store().undo(), true);
    await settleAll();
    assert.equal(opened.auth.commits.length, 2, "the first replay chunk is in flight");
    return { ...opened, gate };
  }

  it("retires a held multi-commit replay when the session socket is removed", async () => {
    reset();
    const { socket, auth, gate } = await heldLargeUndo();
    useSessionStore.setState({ socket: null });
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    assert.equal(store().history.replay, null);
    gate.resolve();
    await settleAll();
    assert.equal(auth.commits.length, 2, "no further chunk is sent after ownership was retired");
    assert.equal(auth.edges.length < 600, true);
    assert.equal(store().status, "loading", "nothing republishes the retired optimistic graph");
    assert.equal(selectCanEdit(store()), false);
    useSessionStore.setState({ socket });
    await settleAll();
    assert.equal(auth.commits.length, 2, "restoring the socket does not resurrect old work");
    assert.equal(selectCanUndo(store()), false);
  });

  it("retires a held multi-commit replay when the session socket is replaced", async () => {
    reset();
    const { auth, gate } = await heldLargeUndo();
    const replacement = createSocket("sock-2");
    replacement.handler = auth.handler;
    useSessionStore.setState({ socket: replacement });
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    gate.resolve();
    await settleAll();
    assert.equal(auth.commits.length, 2);
    assert.equal(replacement.sent.some((item) => item.event === "canvas:commit"), false);
    assert.equal(store().status, "loading");
    assert.equal(errors.includes(UNDO_NOTICE), false, "retirement is not a replay failure notice");
  });

  it("retires a held replay on an account change and never resumes it when the account returns", async () => {
    reset();
    const { auth, gate } = await heldLargeUndo();
    useSessionStore.setState({ authUser: { _id: USER_B, fullName: "Grace", img: "" } });
    assert.deepEqual(counts(), { undo: 0, redo: 0 });
    useSessionStore.setState({ authUser: { _id: USER_A, fullName: "Ada", img: "" } });
    gate.resolve();
    await settleAll();
    assert.equal(auth.commits.length, 2, "the stale callback pumps nothing after the account came back");
    assert.equal(store().status, "loading");
    assert.equal(selectCanEdit(store()), false);
    assert.equal(store().dispatch([addOp("late")]), false);
  });

  it("keeps ordinary work when an unrelated session change leaves ownership intact", async () => {
    reset();
    const { auth } = await open();
    const gate = auth.holdAt(1);
    store().dispatch([addOp("a")]);
    useSessionStore.setState({ isConnected: true });
    gate.resolve();
    await settleAll();
    assert.equal(store().status, "ready");
    assert.equal(counts().undo, 1);
    assert.equal(auth.nodes.length, 1);
  });

  it("clears gesture tracking on cancellation without an end callback", async () => {
    reset();
    await open();
    await edit([addOp("a")]);
    store().beginGesture("drag");
    assert.equal(selectCanUndo(store()), false);
    store().cancelGestures();
    assert.equal(store().history.gesture, false);
    assert.equal(selectCanUndo(store()), true);
    store().beginGesture("resize");
    store().beginGesture("connect");
    store().endGesture("resize");
    assert.equal(store().history.gesture, true, "an unrelated active gesture stays until cancelled");
    store().cancelGestures();
    assert.equal(selectCanUndo(store()), true);
    assert.equal(store().undo(), true);
    await settleAll();
  });
});
