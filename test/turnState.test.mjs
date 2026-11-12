import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { createServer } from "vite";

const require = createRequire(import.meta.url);

// Zustand's server snapshot stays at store creation. React DOM's server
// renderer reads that snapshot, so setState would not show up in markup.
function useClientSnapshotOnServer() {
  const React = require("react");
  const original = React.useSyncExternalStore;
  if (original.__clientSnapshot) return () => {};
  const patched = (subscribe, getSnapshot, _getServerSnapshot) =>
    original(subscribe, getSnapshot, getSnapshot);
  patched.__clientSnapshot = true;
  React.useSyncExternalStore = patched;
  return () => {
    if (React.useSyncExternalStore === patched) React.useSyncExternalStore = original;
  };
}

process.env.VITE_API_URL ||= "http://127.0.0.1:3000/api";

const PROJECT = "64b0000000000000000000aa";
const OTHER_PROJECT = "64b0000000000000000000bb";
const SELF = "64b0000000000000000000a1";
const OTHER = "64b0000000000000000000b2";
const TAB_B = "22222222-2222-4222-a222-222222222222";
const TAB_C = "33333333-3333-4333-8333-333333333333";

function node(id, x = 10) {
  return {
    id,
    type: "shape",
    position: { x, y: 20 },
    width: 160,
    height: 80,
    data: { shape: "rectangle", label: "L", color: "#1F1F1F", textColor: "#EDEDED" },
  };
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

function emptyTurn(serverNow = 1) {
  return {
    holder: null,
    holderSince: null,
    queue: [],
    idleDeadline: null,
    graceUntil: null,
    serverNow,
  };
}

function heldTurn(userId, tabId, patch = {}) {
  return {
    holder: { userId, tabId },
    holderSince: 1,
    queue: [],
    idleDeadline: null,
    graceUntil: null,
    serverNow: 1,
    ...patch,
    holder: patch.holder === undefined ? { userId, tabId } : patch.holder,
  };
}

function clone(value) {
  return structuredClone(value);
}

function createSocket(id = "sock-1") {
  const handlers = new Map();
  const socket = {
    id,
    connected: true,
    sent: [],
    handler: () => Promise.resolve({ ok: false, message: "unexpected" }),
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
    volatile: {
      emit(event, payload) {
        socket.sent.push({ event, payload, volatile: true });
      },
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
    listeners(event) {
      return [...(handlers.get(event) ?? [])];
    },
    disconnect() {
      this.connected = false;
    },
  };
  return socket;
}

function ack({ role = "editor", turn = null, nodes = [], version = 0, participants = [], projectId = PROJECT } = {}) {
  return {
    ok: true,
    project: { _id: projectId, name: "Design", description: "Notes" },
    role,
    canvas: { nodes, edges: [], version },
    participants,
    turn,
    serverNow: 4,
  };
}

function tabOf(socket) {
  return [...socket.sent].reverse().find((item) => item.event === "workspace:join")?.payload?.tabId;
}

function sent(socket, event) {
  return socket.sent.filter((item) => item.event === event && !item.ack);
}

function createFakeClock() {
  let now = 1000;
  let nextId = 1;
  const timers = new Map();
  let saved = null;
  return {
    install() {
      saved = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now };
      globalThis.setTimeout = (fn, delay = 0) => {
        const id = nextId;
        nextId += 1;
        timers.set(id, { fn, at: now + delay });
        return id;
      };
      globalThis.clearTimeout = (id) => {
        timers.delete(id);
      };
      Date.now = () => now;
    },
    restore() {
      globalThis.setTimeout = saved.setTimeout;
      globalThis.clearTimeout = saved.clearTimeout;
      Date.now = saved.now;
      timers.clear();
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

describe("turn state", () => {
  let vite;
  let useWorkspaceStore;
  let useSessionStore;
  let selectCanEdit;
  let selectIsHolder;
  let normalizeTurn;
  let sameTurnTab;
  let soundMod;
  let realPlay;
  let TurnBar;
  let createElement;
  let renderToStaticMarkup;
  let errors;
  let successes;
  let chimes;
  let toastMod;
  let originalError;
  let originalSuccess;
  let originalWindow;
  let restoreReact;

  before(async () => {
    restoreReact = useClientSnapshotOnServer();
    vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: "custom",
      logLevel: "error",
    });
    const storeMod = await vite.ssrLoadModule("/src/collaborate/store/useWorkspaceStore.js");
    const sessionMod = await vite.ssrLoadModule("/src/collaborate/store/useSessionStore.js");
    const turnMod = await vite.ssrLoadModule("/src/collaborate/lib/turnState.js");
    soundMod = await vite.ssrLoadModule("/src/collaborate/lib/turnSound.js");
    const barMod = await vite.ssrLoadModule("/src/collaborate/components/workspace/TurnBar.jsx");
    const renderMod = await vite.ssrLoadModule("/test/ssrRender.js");
    toastMod = await import("react-toastify");
    errors = [];
    successes = [];
    chimes = [];
    originalError = toastMod.toast.error;
    originalSuccess = toastMod.toast.success;
    toastMod.toast.error = (message) => {
      errors.push(message);
    };
    toastMod.toast.success = (message) => {
      successes.push(message);
    };
    realPlay = soundMod.playTurnSound;
    // The SSR export is not configurable, and a successful context would be
    // cached for the rest of the process. Counting the constructor and
    // throwing leaves the module cache empty for the Web Audio test.
    originalWindow = globalThis.window;
    globalThis.window = {
      AudioContext: class {
        constructor() {
          chimes.push(1);
          throw new Error("chime counted");
        }
      },
    };
    useWorkspaceStore = storeMod.useWorkspaceStore;
    useSessionStore = sessionMod.useSessionStore;
    selectCanEdit = storeMod.selectCanEdit;
    selectIsHolder = storeMod.selectIsHolder;
    normalizeTurn = turnMod.normalizeTurn;
    sameTurnTab = turnMod.sameTurnTab;
    TurnBar = barMod.default;
    createElement = renderMod.createElement;
    renderToStaticMarkup = renderMod.renderToStaticMarkup;
  });

  after(async () => {
    restoreReact?.();
    globalThis.window = originalWindow;
    if (toastMod) {
      toastMod.toast.error = originalError;
      toastMod.toast.success = originalSuccess;
    }
    useWorkspaceStore?.getState().resetWorkspace();
    await vite?.close();
  });

  function reset() {
    errors.length = 0;
    successes.length = 0;
    chimes.length = 0;
    useWorkspaceStore.getState().resetWorkspace();
    useSessionStore.setState({ authUser: { _id: SELF, fullName: "Ada Lovelace", img: "" } });
  }

  function markup() {
    return renderToStaticMarkup(createElement(TurnBar));
  }

  // renderToStaticMarkup escapes the apostrophe in "You're editing".
  function visible(html) {
    return html.replaceAll("&#x27;", "'");
  }

  async function join(socket, body, projectId = PROJECT) {
    socket.handler = (event, payload) => {
      if (event === "workspace:join") return Promise.resolve(typeof body === "function" ? body(payload) : body);
      if (event === "canvas:commit") return Promise.resolve({ ok: true, version: payload.baseVersion + 1 });
      if (event === "canvas:sync") return new Promise(() => {});
      return Promise.resolve({ ok: false, message: "unexpected" });
    };
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, projectId);
    await settle();
    await settle();
    return dispose;
  }

  it("normalizes public snapshots and rejects impossible ones", () => {
    const local = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
    const other = "BBBBBBBB-BBBB-4BBB-ABBB-BBBBBBBBBBBB";
    const held = {
      holder: { userId: SELF.toUpperCase(), tabId: local, name: "drop me" },
      holderSince: 0,
      queue: [
        { userId: SELF, tabId: other.toUpperCase() },
        { userId: OTHER.toUpperCase(), tabId: TAB_C },
      ],
      idleDeadline: 0,
      graceUntil: null,
      serverNow: 0,
      extra: true,
    };
    const before = clone(held);
    const normalized = normalizeTurn(held);
    assert.deepEqual(held, before);
    assert.deepEqual(normalized, {
      holder: { userId: SELF, tabId: local.toLowerCase() },
      holderSince: 0,
      queue: [
        { userId: SELF, tabId: other.toLowerCase() },
        { userId: OTHER, tabId: TAB_C },
      ],
      idleDeadline: 0,
      graceUntil: null,
      serverNow: 0,
    });
    normalized.holder.userId = "changed";
    normalized.queue.push({ userId: SELF, tabId: TAB_B });
    assert.equal(held.holder.userId, SELF.toUpperCase());
    assert.equal(held.queue.length, 2);

    const empty = emptyTurn(0);
    const emptyBefore = clone(empty);
    assert.deepEqual(normalizeTurn(empty), empty);
    assert.deepEqual(empty, emptyBefore);

    const grace = {
      holder: { userId: OTHER, tabId: TAB_B },
      holderSince: 5,
      queue: [{ userId: SELF, tabId: TAB_C }],
      idleDeadline: null,
      graceUntil: 25,
      serverNow: 9,
    };
    assert.equal(normalizeTurn(grace).graceUntil, 25);
    assert.equal(normalizeTurn(grace).idleDeadline, null);

    assert.equal(sameTurnTab(
      { userId: SELF.toUpperCase(), tabId: local },
      { userId: SELF, tabId: local.toLowerCase() },
    ), true);
    assert.equal(sameTurnTab({ userId: SELF, tabId: local }, { userId: SELF, tabId: other }), false);
    assert.equal(sameTurnTab({ userId: SELF, tabId: local }, { userId: OTHER, tabId: local }), false);
    assert.equal(sameTurnTab({ userId: SELF }, { userId: SELF, tabId: local }), false);
    assert.equal(sameTurnTab(null, null), false);
    assert.equal(sameTurnTab({ userId: SELF, tabId: "" }, { userId: SELF, tabId: "" }), false);

    const rejected = [
      ["array", []],
      ["null", null],
      ["missing holder", { ...emptyTurn(), holder: undefined }],
      ["bad user", heldTurn("not-an-id", local)],
      ["bad tab", heldTurn(SELF, "not-a-tab")],
      ["negative time", { ...heldTurn(SELF, local), holderSince: -1 }],
      ["nan", { ...heldTurn(SELF, local), serverNow: Number.NaN }],
      ["infinity", { ...heldTurn(SELF, local), serverNow: Number.POSITIVE_INFINITY }],
      ["string time", { ...heldTurn(SELF, local), holderSince: "1" }],
      ["duplicate queue", {
        ...heldTurn(SELF, local),
        queue: [{ userId: OTHER, tabId: TAB_B }, { userId: OTHER, tabId: TAB_B }],
        idleDeadline: 3,
      }],
      ["holder in queue", {
        ...heldTurn(SELF, local),
        queue: [{ userId: SELF, tabId: local }],
        idleDeadline: 3,
      }],
      ["empty holder with queue", {
        ...emptyTurn(),
        queue: [{ userId: SELF, tabId: local }],
      }],
      ["empty holder with since", { ...emptyTurn(), holderSince: 1 }],
      ["holder without since", { ...heldTurn(SELF, local), holderSince: null }],
      ["grace and idle", { ...heldTurn(SELF, local), graceUntil: 2, idleDeadline: 2 }],
      ["empty queue with idle", { ...heldTurn(SELF, local), idleDeadline: 2 }],
      ["waiting without idle", {
        ...heldTurn(SELF, local),
        queue: [{ userId: OTHER, tabId: TAB_B }],
        idleDeadline: null,
        graceUntil: null,
      }],
    ];
    for (const [label, value] of rejected) {
      const snapshot = clone(value);
      assert.equal(normalizeTurn(value), null, label);
      assert.deepEqual(value, snapshot, label);
    }
  });

  it("keeps an empty or legacy join read-only and fails a malformed turn closed", async () => {
    reset();
    const emptySocket = createSocket("empty");
    await join(emptySocket, ack({ turn: emptyTurn() }));
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(useWorkspaceStore.getState().turn.holder, null);
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
    assert.equal(selectIsHolder(useWorkspaceStore.getState()), false);
    assert.equal(chimes.length, 0);
    assert.equal(successes.length, 0);

    reset();
    const legacy = createSocket("legacy");
    await join(legacy, ack({ turn: null }));
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(useWorkspaceStore.getState().turn, null);
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
    assert.equal(useWorkspaceStore.getState().requestTurn, useWorkspaceStore.getState().requestTurn);
    useWorkspaceStore.getState().requestTurn();
    assert.equal(sent(legacy, "turn:request").length, 0);

    reset();
    const broken = createSocket("broken");
    await join(broken, ack({ turn: { holder: null } }));
    assert.equal(useWorkspaceStore.getState().status, "error");
    assert.equal(useWorkspaceStore.getState().turn, null);
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
  });

  it("grants editing only to the matching owner or editor tab", async () => {
    reset();
    const socket = createSocket("holder");
    await join(socket, (payload) => ack({
      turn: heldTurn(SELF.toUpperCase(), payload.tabId),
      nodes: [node("n1")],
    }));
    const tabId = tabOf(socket);
    const state = useWorkspaceStore.getState();
    assert.equal(state.status, "ready");
    assert.equal(state.turn.holder.userId, SELF);
    assert.equal(state.turn.holder.tabId, tabId);
    assert.equal(selectIsHolder(state), true);
    assert.equal(selectCanEdit(state), true);
    assert.equal(chimes.length, 0);

    useSessionStore.setState({ authUser: null });
    assert.equal(selectIsHolder(useWorkspaceStore.getState()), false);
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
    useSessionStore.setState({ authUser: { _id: OTHER, fullName: "Grace", img: "" } });
    assert.equal(selectIsHolder(useWorkspaceStore.getState()), false);

    useSessionStore.setState({ authUser: { _id: SELF, fullName: "Ada Lovelace", img: "" } });
    socket.fire("turn:state", {
      projectId: PROJECT,
      ...heldTurn(SELF, TAB_B),
    });
    assert.equal(selectIsHolder(useWorkspaceStore.getState()), false);
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);

    socket.fire("turn:state", { projectId: PROJECT, ...heldTurn(OTHER, tabId) });
    assert.equal(selectIsHolder(useWorkspaceStore.getState()), false);

    socket.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, tabId) });
    assert.equal(selectIsHolder(useWorkspaceStore.getState()), true);
    useWorkspaceStore.setState({
      project: { _id: OTHER_PROJECT, name: "Design", description: "Notes" },
    });
    assert.equal(selectIsHolder(useWorkspaceStore.getState()), false);
    useWorkspaceStore.setState({
      project: { _id: PROJECT, name: "Design", description: "Notes" },
    });
    socket.id = "stale-connection";
    assert.equal(selectIsHolder(useWorkspaceStore.getState()), false);
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);

    reset();
    const viewer = createSocket("viewer");
    await join(viewer, (payload) => ack({
      role: "viewer",
      turn: heldTurn(SELF, payload.tabId),
    }));
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(selectIsHolder(useWorkspaceStore.getState()), false);
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);

    reset();
    const recovering = createSocket("recovering");
    await join(recovering, (payload) => ack({
      turn: heldTurn(SELF, payload.tabId),
      nodes: [node("n1")],
      version: 1,
    }));
    recovering.fire("canvas:ops", {
      projectId: PROJECT,
      version: 4,
      ops: [{ type: "node.add", node: node("gap") }],
      by: OTHER,
    });
    await settle();
    assert.equal(useWorkspaceStore.getState().syncStatus, "syncing");
    assert.equal(selectIsHolder(useWorkspaceStore.getState()), true);
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
    assert.equal(useWorkspaceStore.getState().turn.holder.tabId, tabOf(recovering));
  });

  it("lets the join acknowledgement beat an older turn packet", async () => {
    reset();
    const socket = createSocket("order");
    const gate = defer();
    socket.handler = (event) => (event === "workspace:join" ? gate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    const seen = [];
    const unsubscribe = useWorkspaceStore.subscribe((state) => {
      const turn = state.turn;
      const key = !turn ? "unknown" : `${turn.holder?.userId ?? "empty"}:${turn.holder?.tabId ?? ""}`;
      if (seen.at(-1) === key) return;
      seen.push(key);
    });
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
    const tabId = tabOf(socket);
    socket.fire("turn:state", { projectId: PROJECT.toUpperCase(), ...heldTurn(OTHER, TAB_B, { serverNow: 5 }) });
    socket.fire("turn:state", { projectId: PROJECT, holder: null });
    socket.fire("turn:state", { projectId: OTHER_PROJECT, ...heldTurn(SELF, tabId, { serverNow: 5 }) });
    gate.resolve(ack({ turn: heldTurn(SELF, tabId, { serverNow: 5 }) }));
    socket.fire("turn:state", { projectId: PROJECT, ...heldTurn(OTHER, TAB_C, { serverNow: 5 }) });
    socket.fire("turn:state", {
      projectId: PROJECT,
      holder: { userId: OTHER, tabId: TAB_B },
      holderSince: 5,
      queue: [{ userId: SELF, tabId }],
      idleDeadline: 80,
      graceUntil: null,
      serverNow: 5,
    });
    await settle();
    await settle();
    unsubscribe();
    assert.deepEqual(seen, [
      "unknown",
      `${SELF}:${tabId}`,
      `${OTHER}:${TAB_C}`,
      `${OTHER}:${TAB_B}`,
    ]);
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(useWorkspaceStore.getState().turn.holder.tabId, TAB_B);
    assert.equal(useWorkspaceStore.getState().turn.queue[0].tabId, tabId);
    assert.equal(chimes.length, 0);
    assert.equal(successes.length, 0);
    assert.equal(socket.listenerCount("turn:state"), 1);

    const chats = [];
    socket.on("chat:typing", () => {
      chats.push(1);
    });
    dispose();
    assert.equal(socket.listenerCount("turn:state"), 0);
    assert.equal(socket.listenerCount("presence:update"), 0);
    assert.equal(socket.listenerCount("chat:typing"), 1);
    socket.fire("chat:typing");
    assert.equal(chats.length, 1);
    assert.equal(useWorkspaceStore.getState().status, "idle");
    assert.equal(useWorkspaceStore.getState().turn, null);

    reset();
    const failed = createSocket("failed");
    const failGate = defer();
    failed.handler = (event) => (event === "workspace:join" ? failGate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    useWorkspaceStore.getState().bindWorkspace(failed, PROJECT);
    failed.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, tabOf(failed)) });
    failGate.resolve({ ok: false, message: "Project not found" });
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().status, "notFound");
    assert.equal(useWorkspaceStore.getState().turn, null);
    failed.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, tabOf(failed)) });
    assert.equal(useWorkspaceStore.getState().turn, null);

    reset();
    const retry = createSocket("retry");
    await join(retry, ack({ turn: { nope: true } }));
    assert.equal(useWorkspaceStore.getState().status, "error");
    const retryGate = defer();
    retry.handler = (event) => (event === "workspace:join" ? retryGate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    useWorkspaceStore.getState().retryWorkspace();
    retry.fire("turn:state", { projectId: PROJECT, ...heldTurn(OTHER, TAB_B, { queue: [], idleDeadline: null }) });
    const queued = {
      projectId: PROJECT,
      holder: { userId: OTHER, tabId: TAB_B },
      holderSince: 2,
      queue: [{ userId: SELF, tabId: tabOf(retry) }],
      idleDeadline: 40,
      graceUntil: null,
      serverNow: 2,
    };
    retry.fire("turn:state", queued);
    retry.fire("turn:state", { projectId: PROJECT, holder: "nope" });
    retryGate.resolve(ack({ turn: emptyTurn() }));
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().turn.holder, null);
    assert.equal(useWorkspaceStore.getState().turn.queue.length, 0);

    reset();
    const left = createSocket("left");
    const leftGate = defer();
    left.handler = (event) => (event === "workspace:join" ? leftGate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    useWorkspaceStore.getState().bindWorkspace(left, PROJECT);
    const obsolete = left.listeners("turn:state")[0];
    left.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, tabOf(left)) });
    const right = createSocket("right");
    const rightGate = defer();
    right.handler = (event) => (event === "workspace:join" ? rightGate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    useWorkspaceStore.getState().bindWorkspace(right, OTHER_PROJECT);
    rightGate.resolve(ack({ projectId: OTHER_PROJECT, turn: emptyTurn() }));
    leftGate.resolve(ack({ turn: heldTurn(SELF, tabOf(left)) }));
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().project._id, OTHER_PROJECT);
    assert.equal(useWorkspaceStore.getState().turn.holder, null);
    left.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, TAB_C) });
    obsolete({ projectId: PROJECT, ...heldTurn(SELF, TAB_C) });
    assert.equal(useWorkspaceStore.getState().turn.holder, null);
    assert.equal(left.listenerCount("turn:state"), 0);
    assert.equal(right.listenerCount("turn:state"), 1);

    reset();
    const dropped = createSocket("dropped");
    await join(dropped, (payload) => ack({ turn: heldTurn(SELF, payload.tabId) }));
    assert.equal(useWorkspaceStore.getState().turn.holder.userId, SELF);
    dropped.disconnect();
    dropped.fire("disconnect");
    assert.equal(useWorkspaceStore.getState().status, "loading");
    assert.equal(useWorkspaceStore.getState().turn, null);
    dropped.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, tabOf(dropped)) });
    assert.equal(useWorkspaceStore.getState().turn, null);

    reset();
    const mixed = createSocket("mixed");
    const mixedGate = defer();
    mixed.handler = (event) => (event === "workspace:join" ? mixedGate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    const mixedOrder = [];
    const stopMixed = useWorkspaceStore.subscribe((state) => {
      const turn = state.turn;
      const key = !turn ? "unknown" : `${turn.holder?.userId ?? "empty"}:${turn.holder?.tabId ?? ""}`;
      if (mixedOrder.at(-1) === key) return;
      mixedOrder.push(key);
    });
    useWorkspaceStore.getState().bindWorkspace(mixed, PROJECT);
    const mixedTab = tabOf(mixed);
    const packetA = { projectId: PROJECT, ...heldTurn(OTHER, TAB_B, { serverNow: 5 }) };
    const packetB = { projectId: PROJECT, ...heldTurn(OTHER, TAB_C, { serverNow: 5 }) };
    mixedGate.resolve(ack({ turn: heldTurn(SELF, mixedTab, { serverNow: 5 }) }));
    queueMicrotask(() => mixed.fire("turn:state", packetB));
    mixed.fire("turn:state", packetA);
    await settle();
    await settle();
    stopMixed();
    assert.deepEqual(mixedOrder, [
      "unknown",
      `${SELF}:${mixedTab}`,
      `${OTHER}:${TAB_B}`,
      `${OTHER}:${TAB_C}`,
    ]);
    assert.equal(useWorkspaceStore.getState().turn.holder.tabId, TAB_C);
    assert.equal(chimes.length, 0);
  });

  it("applies live turn snapshots and ignores stale ones", async () => {
    reset();
    const socket = createSocket("live");
    await join(socket, ack({ turn: emptyTurn(), nodes: [node("n1")] }));
    const tabId = tabOf(socket);
    const before = socket.sent.length;
    socket.fire("turn:state", { projectId: PROJECT, ...heldTurn(OTHER, TAB_B) });
    assert.equal(useWorkspaceStore.getState().turn.holder.userId, OTHER);
    socket.fire("turn:state", {
      projectId: PROJECT,
      holder: { userId: OTHER, tabId: TAB_B },
      holderSince: 1,
      queue: [{ userId: SELF, tabId }],
      idleDeadline: 90,
      graceUntil: null,
      serverNow: 1,
    });
    assert.equal(useWorkspaceStore.getState().turn.queue.length, 1);
    useWorkspaceStore.getState().releaseTurn();
    assert.equal(socket.sent.length, before);
    socket.fire("turn:state", { projectId: OTHER_PROJECT, ...heldTurn(SELF, tabId) });
    socket.fire("turn:state", { projectId: PROJECT, queue: [] });
    assert.equal(useWorkspaceStore.getState().turn.holder.userId, OTHER);

    socket.disconnect();
    socket.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, tabId) });
    assert.equal(useWorkspaceStore.getState().turn.holder.userId, OTHER);
    socket.connected = true;
    socket.id = "replaced-id";
    socket.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, tabId) });
    assert.equal(useWorkspaceStore.getState().turn.holder.userId, OTHER);

    reset();
    const synced = createSocket("synced");
    await join(synced, (payload) => ack({
      turn: heldTurn(SELF, payload.tabId),
      nodes: [node("n1")],
      version: 2,
    }));
    const syncGate = defer();
    synced.handler = (event) => (
      event === "canvas:sync"
        ? syncGate.promise
        : Promise.resolve({ ok: false, message: "unexpected" })
    );
    synced.fire("canvas:ops", {
      projectId: PROJECT,
      version: 8,
      ops: [{ type: "node.add", node: node("later") }],
      by: OTHER,
    });
    await settle();
    assert.equal(useWorkspaceStore.getState().syncStatus, "syncing");
    assert.equal(useWorkspaceStore.getState().turn.holder.userId, SELF);
    synced.fire("turn:state", {
      projectId: PROJECT,
      holder: { userId: SELF, tabId: tabOf(synced) },
      holderSince: 1,
      queue: [{ userId: OTHER, tabId: TAB_B }],
      idleDeadline: 30,
      graceUntil: null,
      serverNow: 6,
    });
    assert.equal(useWorkspaceStore.getState().turn.queue[0].userId, OTHER);
    assert.equal(useWorkspaceStore.getState().turn.holder.userId, SELF);
    syncGate.resolve({
      ok: true,
      canvas: { nodes: [node("n1"), node("from-sync")], edges: [], version: 8 },
    });
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().syncStatus, "idle");
    assert.equal(useWorkspaceStore.getState().canvas.version, 8);
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "from-sync"), true);
    assert.equal(useWorkspaceStore.getState().turn.holder.userId, SELF);
    assert.equal(useWorkspaceStore.getState().turn.queue[0].userId, OTHER);
    assert.equal(chimes.length, 0);
    assert.equal(successes.includes("It's your turn"), false);
    assert.equal(successes.includes("Canvas re-synced"), true);
  });

  it("emits a turn action only when that tab is allowed to", async () => {
    reset();
    const socket = createSocket("actions");
    await join(socket, ack({ role: "editor", turn: emptyTurn() }));
    const tabId = tabOf(socket);
    useWorkspaceStore.getState().requestTurn();
    assert.deepEqual(sent(socket, "turn:request"), [{ event: "turn:request", payload: { projectId: PROJECT } }]);
    assert.equal(useWorkspaceStore.getState().turn.holder, null);

    socket.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, tabId) });
    useWorkspaceStore.getState().requestTurn();
    useWorkspaceStore.getState().cancelTurnRequest();
    useWorkspaceStore.getState().reclaimTurn();
    assert.equal(sent(socket, "turn:request").length, 1);
    assert.equal(sent(socket, "turn:cancel").length, 0);
    assert.equal(sent(socket, "turn:reclaim").length, 0);
    useWorkspaceStore.getState().releaseTurn();
    assert.deepEqual(sent(socket, "turn:release"), [{ event: "turn:release", payload: { projectId: PROJECT } }]);

    socket.fire("turn:state", {
      projectId: PROJECT,
      holder: { userId: OTHER, tabId: TAB_B },
      holderSince: 1,
      queue: [{ userId: SELF, tabId }],
      idleDeadline: 20,
      graceUntil: null,
      serverNow: 2,
    });
    useWorkspaceStore.getState().requestTurn();
    useWorkspaceStore.getState().releaseTurn();
    useWorkspaceStore.getState().reclaimTurn();
    assert.equal(sent(socket, "turn:request").length, 1);
    assert.equal(sent(socket, "turn:release").length, 1);
    assert.equal(sent(socket, "turn:reclaim").length, 0);
    useWorkspaceStore.getState().cancelTurnRequest();
    assert.deepEqual(sent(socket, "turn:cancel"), [{ event: "turn:cancel", payload: { projectId: PROJECT } }]);

    reset();
    const owner = createSocket("owner");
    await join(owner, (payload) => ack({
      role: "owner",
      turn: heldTurn(SELF, TAB_B, {
        queue: [{ userId: OTHER, tabId: TAB_C }],
        idleDeadline: 12,
      }),
    }));
    assert.notEqual(tabOf(owner), TAB_B);
    useWorkspaceStore.getState().reclaimTurn();
    assert.deepEqual(sent(owner, "turn:reclaim"), [{ event: "turn:reclaim", payload: { projectId: PROJECT } }]);

    owner.fire("turn:state", {
      projectId: PROJECT,
      holder: { userId: OTHER, tabId: TAB_B },
      holderSince: 1,
      queue: [{ userId: SELF, tabId: tabOf(owner) }],
      idleDeadline: 15,
      graceUntil: null,
      serverNow: 3,
    });
    useWorkspaceStore.getState().requestTurn();
    useWorkspaceStore.getState().reclaimTurn();
    useWorkspaceStore.getState().cancelTurnRequest();
    assert.equal(sent(owner, "turn:request").length, 0);
    assert.equal(sent(owner, "turn:reclaim").length, 2);
    assert.equal(sent(owner, "turn:cancel").length, 1);

    reset();
    const viewer = createSocket("viewer-act");
    await join(viewer, ack({ role: "viewer", turn: emptyTurn() }));
    useWorkspaceStore.getState().requestTurn();
    useWorkspaceStore.getState().releaseTurn();
    useWorkspaceStore.getState().cancelTurnRequest();
    useWorkspaceStore.getState().reclaimTurn();
    assert.equal(viewer.sent.filter((item) => String(item.event).startsWith("turn:")).length, 0);

    reset();
    const recovering = createSocket("act-recover");
    await join(recovering, ack({ role: "owner", turn: emptyTurn(), nodes: [node("n1")], version: 1 }));
    recovering.fire("canvas:ops", {
      projectId: PROJECT,
      version: 5,
      ops: [{ type: "node.add", node: node("gap") }],
      by: OTHER,
    });
    await settle();
    assert.equal(useWorkspaceStore.getState().syncStatus, "syncing");
    useWorkspaceStore.getState().requestTurn();
    assert.equal(sent(recovering, "turn:request").length, 1);
    recovering.connected = false;
    useWorkspaceStore.getState().requestTurn();
    assert.equal(sent(recovering, "turn:request").length, 1);
  });

  it("lets only the holder dispatch or preview, and still shares cursors and remote ops", async () => {
    reset();
    const clock = createFakeClock();
    clock.install();
    try {
      const socket = createSocket("edit");
      await join(socket, (payload) => ack({
        turn: heldTurn(SELF, payload.tabId),
        nodes: [node("n1")],
        version: 3,
      }));
      assert.equal(useWorkspaceStore.getState().dispatch([{ type: "node.add", node: node("n2", 40) }]), true);
      assert.equal(socket.sent.filter((item) => item.event === "canvas:commit").length, 1);
      await settle();
      useWorkspaceStore.getState().onNodeDrag({}, node("n1", 70), [node("n1", 70)]);
      useWorkspaceStore.getState().onNodeDrag({}, node("n1", 71), [node("n1", 71)]);
      assert.equal(socket.sent.filter((item) => item.event === "canvas:preview").length, 1);

      const mine = tabOf(socket);
      socket.fire("turn:state", { projectId: PROJECT, ...heldTurn(OTHER, TAB_B) });
      socket.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, mine) });
      assert.equal(selectCanEdit(useWorkspaceStore.getState()), true);
      clock.advance(80);
      assert.equal(socket.sent.filter((item) => item.event === "canvas:preview").length, 1);
      socket.fire("turn:state", { projectId: PROJECT, ...heldTurn(OTHER, TAB_B) });
      assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
      useWorkspaceStore.getState().onNodeDrag({}, node("n1", 90), [node("n1", 90)]);
      assert.equal(useWorkspaceStore.getState().dispatch([{ type: "node.add", node: node("n3", 50) }]), false);
      assert.equal(socket.sent.filter((item) => item.event === "canvas:commit").length, 1);
      assert.equal(socket.sent.filter((item) => item.event === "canvas:preview").length, 1);

      useWorkspaceStore.getState().onNodesChange([{ type: "select", id: "n1", selected: true }]);
      assert.equal(useWorkspaceStore.getState().rfNodes.find((item) => item.id === "n1").selected, true);
      useWorkspaceStore.getState().moveCursor({ x: 12, y: 18 });
      assert.equal(socket.sent.some((item) => item.event === "cursor:move" && item.volatile), true);
      socket.fire("canvas:preview", {
        projectId: PROJECT,
        by: OTHER,
        nodes: [{ id: "n1", position: { x: 44, y: 20 } }],
      });
      assert.equal(useWorkspaceStore.getState().rfNodes.find((item) => item.id === "n1").position.x, 44);
      socket.fire("canvas:ops", {
        projectId: PROJECT,
        version: 5,
        ops: [{ type: "node.add", node: node("remote") }],
        by: OTHER,
      });
      assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "remote"), true);
    } finally {
      clock.restore();
    }
  });

  it("chimes once for a live grant to this tab and not for a restored snapshot", async () => {
    reset();
    const socket = createSocket("chime");
    await join(socket, (payload) => ack({ turn: heldTurn(SELF, payload.tabId) }));
    assert.equal(chimes.length, 0);
    assert.equal(successes.length, 0);

    socket.disconnect();
    socket.fire("disconnect");
    socket.connected = true;
    socket.id = "chime-2";
    const rejoin = defer();
    socket.handler = (event, payload) => (event === "workspace:join"
      ? rejoin.promise
      : Promise.resolve({ ok: false, message: "unexpected" }));
    socket.fire("connect");
    const tabId = tabOf(socket);
    socket.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, tabId) });
    rejoin.resolve(ack({ turn: emptyTurn() }));
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().turn.holder, null);
    assert.equal(chimes.length, 0);
    assert.equal(successes.filter((item) => item === "It's your turn").length, 0);

    const follow = defer();
    socket.handler = (event) => (event === "workspace:join"
      ? follow.promise
      : Promise.resolve({ ok: false, message: "unexpected" }));
    socket.disconnect();
    socket.fire("disconnect");
    socket.connected = true;
    socket.id = "chime-3";
    socket.fire("connect");
    const followTab = tabOf(socket);
    follow.resolve(ack({ turn: emptyTurn() }));
    socket.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, followTab) });
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().turn.holder.tabId, followTab);
    assert.equal(chimes.length, 1);
    assert.deepEqual(successes.filter((item) => item === "It's your turn"), ["It's your turn"]);

    reset();
    const live = createSocket("grant");
    await join(live, ack({ turn: emptyTurn() }));
    const mine = tabOf(live);
    live.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, mine) });
    live.fire("turn:state", {
      projectId: PROJECT,
      ...heldTurn(SELF, mine, {
        queue: [{ userId: OTHER, tabId: TAB_B }],
        idleDeadline: 50,
        serverNow: 9,
      }),
    });
    live.fire("turn:state", { projectId: OTHER_PROJECT, ...heldTurn(SELF, mine) });
    live.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, TAB_B) });
    assert.equal(chimes.length, 1);
    assert.deepEqual(successes, ["It's your turn"]);
    live.fire("turn:state", { projectId: PROJECT, ...emptyTurn(3) });
    live.fire("turn:state", { projectId: PROJECT, ...heldTurn(SELF, mine) });
    assert.equal(chimes.length, 2);
    assert.deepEqual(successes, ["It's your turn", "It's your turn"]);
  });

  it("synthesizes two notes and contains audio failures", () => {
    const previous = globalThis.window;
    const oscillators = [];
    let constructed = 0;
    let resumeRejected = false;
    class FakeAudio {
      constructor() {
        constructed += 1;
        if (FakeAudio.throwOnConstruct) throw new Error("no device");
        this.state = "suspended";
        this.currentTime = 3;
        this.destination = {};
      }

      resume() {
        resumeRejected = true;
        return Promise.reject(new Error("autoplay"));
      }

      createOscillator() {
        if (FakeAudio.throwOnSchedule) throw new Error("schedule");
        const oscillator = {
          type: "",
          frequency: { value: 0 },
          connect() {},
          start() { oscillator.started = true; },
          stop() { oscillator.stopped = true; },
        };
        oscillators.push(oscillator);
        return oscillator;
      }

      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
          connect() {},
        };
      }
    }
    FakeAudio.throwOnConstruct = true;
    FakeAudio.throwOnSchedule = false;
    globalThis.window = { AudioContext: FakeAudio };
    assert.doesNotThrow(() => realPlay());
    assert.equal(constructed, 1);
    assert.equal(oscillators.length, 0);

    FakeAudio.throwOnConstruct = false;
    assert.doesNotThrow(() => realPlay());
    assert.equal(resumeRejected, true);
    assert.equal(oscillators.length, 2);
    assert.deepEqual(oscillators.map((item) => item.frequency.value), [880, 1174.66]);
    assert.equal(oscillators.every((item) => item.type === "sine" && item.started && item.stopped), true);

    FakeAudio.throwOnSchedule = true;
    assert.doesNotThrow(() => realPlay());
    globalThis.window = previous;
  });

  it("renders every turn bar row", async () => {
    reset();
    const unknown = createSocket("bar-unknown");
    await join(unknown, ack({ turn: null }));
    let html = markup();
    assert.match(html, /Loading turn…/);
    assert.equal(html.includes("<button"), false);
    assert.match(html, /data-collab-chrome/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /max-w-\[calc\(100%-2rem\)\]/);
    assert.match(html, /flex-wrap/);

    reset();
    const viewer = createSocket("bar-viewer");
    await join(viewer, ack({
      role: "viewer",
      participants: [{ userId: OTHER, fullName: "Grace Hopper", img: "", role: "editor" }],
      turn: {
        holder: { userId: OTHER, tabId: TAB_B },
        holderSince: 1,
        queue: [{ userId: "64b0000000000000000000c3", tabId: TAB_C }],
        idleDeadline: 10,
        graceUntil: null,
        serverNow: 1,
      },
    }));
    html = markup();
    assert.match(html, /View only/);
    assert.match(html, /Grace Hopper is editing/);
    assert.match(html, /1 waiting/);
    assert.equal(html.includes("Your position:"), false);
    assert.equal(html.includes("<button"), false);
    assert.equal(html.includes("<img"), false);
    assert.match(html, />GH</);

    reset();
    const missing = createSocket("bar-missing");
    await join(missing, ack({
      role: "editor",
      turn: {
        holder: { userId: OTHER, tabId: TAB_B },
        holderSince: 1,
        queue: [],
        idleDeadline: null,
        graceUntil: 40,
        serverNow: 2,
      },
    }));
    html = markup();
    assert.match(html, /Unknown user is editing · Reconnecting/);
    assert.match(html, /Request turn/);
    assert.equal(html.includes('src=""'), false);

    reset();
    useSessionStore.setState({
      authUser: { _id: SELF, fullName: "Ada Lovelace", img: "https://cdn.example/ada.png" },
    });
    const selfGrace = createSocket("bar-self");
    await join(selfGrace, (payload) => ack({
      role: "editor",
      turn: {
        holder: { userId: SELF, tabId: payload.tabId },
        holderSince: 1,
        queue: [],
        idleDeadline: null,
        graceUntil: 8,
        serverNow: 2,
      },
    }));
    html = markup();
    assert.match(visible(html), /You're editing · Reconnecting/);
    assert.match(html, /alt=""/);
    assert.match(html, /https:\/\/cdn\.example\/ada\.png/);
    assert.match(html, />Release</);
    const liveEnd = html.indexOf("</p>");
    const buttonAt = html.indexOf("<button");
    assert.equal(liveEnd < buttonAt, true);
    assert.match(html, /focus-visible:outline/);

    reset();
    const nobody = createSocket("bar-nobody");
    await join(nobody, ack({ role: "editor", turn: emptyTurn() }));
    html = markup();
    assert.match(html, /Nobody is editing/);
    assert.match(html, /Request turn/);
    assert.equal(html.includes("Release"), false);

    reset();
    const otherTab = createSocket("bar-other-tab");
    await join(otherTab, (payload) => ack({
      role: "owner",
      turn: {
        holder: { userId: SELF, tabId: TAB_B },
        holderSince: 1,
        queue: [
          { userId: OTHER, tabId: TAB_C },
          { userId: SELF, tabId: payload.tabId },
        ],
        idleDeadline: 70,
        graceUntil: null,
        serverNow: 3,
      },
    }));
    html = markup();
    assert.match(html, /Your other tab is editing/);
    assert.match(html, /2 waiting/);
    assert.match(html, /Your position: 2/);
    assert.match(html, /Cancel request/);
    assert.match(html, /Take control/);
    assert.equal(html.includes("Request turn"), false);
    assert.equal(html.includes(">Release<"), false);

    reset();
    const holding = createSocket("bar-hold");
    await join(holding, (payload) => ack({
      role: "editor",
      participants: [{ userId: OTHER, fullName: "Grace Hopper", img: "", role: "editor" }],
      nodes: [node("n1")],
      version: 1,
      turn: {
        holder: { userId: SELF, tabId: payload.tabId },
        holderSince: 1,
        queue: [{ userId: OTHER, tabId: TAB_B }],
        idleDeadline: 15,
        graceUntil: null,
        serverNow: 1,
      },
    }));
    holding.fire("canvas:ops", {
      projectId: PROJECT,
      version: 6,
      ops: [{ type: "node.add", node: node("gap") }],
      by: OTHER,
    });
    await settle();
    assert.equal(useWorkspaceStore.getState().syncStatus, "syncing");
    html = markup();
    assert.match(visible(html), /You're editing/);
    assert.match(html, /1 waiting/);
    assert.match(html, />Release</);
    assert.match(html, /data-collab-chrome/);
    assert.equal(html.includes("Take control"), false);
  });
});
