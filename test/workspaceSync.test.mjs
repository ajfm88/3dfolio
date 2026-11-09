import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "vite";

// Vite externalizes react-toastify, so the store and a Node import share one
// module instance. Patch that instance; patching Vite's loader copy does not.

const PROJECT = "64b0000000000000000000aa";
const OTHER = "64b0000000000000000000bb";
const USER_A = "64b0000000000000000000a1";
const USER_B = "64b0000000000000000000b2";

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

function addOp(id, label = "New", x = 12, y = 24) {
  return { type: "node.add", node: node(id, label, x, y) };
}

function adds(prefix, count) {
  return Array.from({ length: count }, (_, index) => addOp(`${prefix}${index}`));
}

function graph(nodes = [], version = 0) {
  return { nodes, edges: [], version };
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

function createSocket(id = "sock-1") {
  const handlers = new Map();
  const socket = {
    id,
    connected: true,
    sent: [],
    timeouts: [],
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
    timeout(ms) {
      socket.timeouts.push(ms);
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
    removeAllListeners() {
      handlers.clear();
    },
    disconnect() {
      this.connected = false;
    },
  };
  return socket;
}

function joinBody(projectId, canvas, role = "editor") {
  return {
    ok: true,
    project: { _id: projectId, name: "Design", description: "Notes" },
    role,
    canvas,
    participants: [],
    turn: null,
    serverNow: 1,
  };
}

function commitsOf(socket) {
  return socket.sent.filter((item) => item.ack && item.event === "canvas:commit");
}

function syncsOf(socket) {
  return socket.sent.filter((item) => item.ack && item.event === "canvas:sync");
}

describe("workspace sync", () => {
  let vite;
  let useWorkspaceStore;
  let selectCanEdit;
  let errors;
  let successes;
  let toastMod;
  let originalError;
  let originalSuccess;

  before(async () => {
    vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: "custom",
      logLevel: "error",
    });
    const storeMod = await vite.ssrLoadModule("/src/collaborate/store/useWorkspaceStore.js");
    toastMod = await import("react-toastify");
    errors = [];
    successes = [];
    originalError = toastMod.toast.error;
    originalSuccess = toastMod.toast.success;
    toastMod.toast.error = (message) => {
      errors.push(message);
    };
    toastMod.toast.success = (message) => {
      successes.push(message);
    };
    useWorkspaceStore = storeMod.useWorkspaceStore;
    selectCanEdit = storeMod.selectCanEdit;
  });

  after(async () => {
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
    useWorkspaceStore.getState().resetWorkspace();
  }

  async function join(socket, canvas = graph(), role = "editor", projectId = PROJECT) {
    const gate = defer();
    socket.handler = (event) => {
      if (event !== "workspace:join") return Promise.resolve({ ok: false, message: "unexpected" });
      return gate.promise;
    };
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, projectId);
    gate.resolve(joinBody(projectId, canvas, role));
    await settle();
    await settle();
    return dispose;
  }

  it("applies optimistic edits once and pumps the next base", async () => {
    reset();
    const socket = createSocket();
    const dispose = await join(socket);
    const state = useWorkspaceStore.getState();
    assert.equal(state.status, "ready");
    assert.equal(state.syncStatus, "idle");
    assert.equal(state.canvas.version, 0);
    assert.equal(selectCanEdit(state), true);
    assert.equal(socket.timeouts.includes(10000), true);
    const joinAck = socket.sent.find((item) => item.event === "workspace:join");
    assert.deepEqual(Object.keys(joinAck.payload).sort(), ["projectId", "tabId"]);

    state.onNodesChange([{ type: "select", id: "missing", selected: true }]);
    state.onNodesChange([{ type: "dimensions", id: "missing", resizing: true, dimensions: { width: 10, height: 10 } }]);
    state.onNodesChange([{ type: "position", id: "missing", position: { x: 1, y: 2 }, dragging: true }]);
    assert.equal(commitsOf(socket).length, 0);

    const held = defer();
    const commits = [];
    socket.handler = (event, payload) => {
      if (event !== "canvas:commit") return Promise.resolve({ ok: false, message: "unexpected" });
      commits.push(payload);
      return commits.length === 1 ? held.promise : Promise.resolve({ ok: true, version: payload.baseVersion + 1 });
    };

    const bad = state.dispatch([{
      type: "node.add",
      node: {
        id: "bad",
        position: { x: 0, y: 0 },
        width: 160,
        height: 80,
        data: { label: "x", color: "#1F1F1F", textColor: "#EDEDED" },
      },
    }]);
    assert.equal(bad, false);
    assert.equal(errors.at(-1), "Node shape must be rectangle, diamond, circle, pill, cylinder, or hexagon");
    assert.equal(state.dispatch(adds("too", 51)), false);
    assert.equal(errors.at(-1), "Too many changes at once");
    assert.equal(commits.length, 0);

    assert.equal(state.dispatch([addOp("n1", "First")]), true);
    assert.equal(useWorkspaceStore.getState().canvas.nodes[0].data.label, "First");
    assert.equal(useWorkspaceStore.getState().canvas.version, 0);
    assert.equal(useWorkspaceStore.getState().rfNodes[0].selected, false);
    assert.equal(commits.length, 1);
    assert.equal(socket.timeouts.at(-1), 8000);
    assert.deepEqual(Object.keys(commits[0]).sort(), ["baseVersion", "ops", "projectId"]);
    assert.equal(commits[0].baseVersion, 0);
    assert.equal(JSON.stringify(commits[0].ops).includes("markerEnd"), false);
    assert.equal(JSON.stringify(commits[0].ops).includes("selected"), false);

    useWorkspaceStore.getState().onNodesChange([{ type: "select", id: "n1", selected: true }]);
    assert.equal(useWorkspaceStore.getState().setNodeLabel("n1", "First"), true);
    assert.equal(useWorkspaceStore.getState().setNodeLabel("n1", "Renamed"), true);
    assert.equal(useWorkspaceStore.getState().commitNodePositions([{ id: "n1", position: { x: 40, y: 50 } }]), true);
    assert.equal(useWorkspaceStore.getState().canvas.nodes.length, 1);
    assert.equal(useWorkspaceStore.getState().canvas.nodes[0].data.label, "Renamed");
    assert.equal(useWorkspaceStore.getState().canvas.nodes[0].position.x, 40);
    assert.equal(commits.length, 1);

    held.resolve({ ok: true, version: 1, ignored: true });
    await settle();
    await settle();
    const saved = useWorkspaceStore.getState();
    assert.equal(saved.canvas.version, 2);
    assert.equal(saved.syncStatus, "idle");
    assert.equal(saved.canvas.nodes.length, 1);
    assert.equal(saved.canvas.nodes[0].id, "n1");
    assert.equal(saved.canvas.nodes[0].data.label, "Renamed");
    assert.equal(saved.rfNodes[0].selected, true);
    assert.equal(Object.hasOwn(saved.canvas.nodes[0], "selected"), false);
    assert.equal(Object.hasOwn(saved.canvas.nodes[0], "measured"), false);
    assert.equal(commits.length, 2);
    assert.equal(commits[1].baseVersion, 1);
    assert.deepEqual(commits[1].ops.map((op) => op.type), ["node.update", "node.update"]);
    assert.equal(successes.length, 0);
    dispose();
  });

  it("keeps dispatch batches inside the 50-op cap", async () => {
    reset();
    const socket = createSocket();
    const dispose = await join(socket, graph([node("base")]));
    const first = defer();
    const commits = [];
    socket.handler = (event, payload) => {
      if (event !== "canvas:commit") return Promise.resolve({ ok: false, message: "unexpected" });
      commits.push(payload);
      if (commits.length === 1) return first.promise;
      if (commits.length === 2) return Promise.resolve({ ok: true, version: payload.baseVersion + 1 });
      return Promise.resolve({
        ok: false,
        message: "Canvas version mismatch",
        canvas: graph([node("base"), node("server")], 9),
      });
    };

    assert.equal(useWorkspaceStore.getState().dispatch([addOp("hold")]), true);
    assert.equal(useWorkspaceStore.getState().dispatch(adds("a", 20)), true);
    assert.equal(useWorkspaceStore.getState().dispatch(adds("d", 20)), true);
    assert.equal(useWorkspaceStore.getState().dispatch(adds("b", 30)), true);
    assert.equal(useWorkspaceStore.getState().dispatch(adds("c", 30)), true);
    assert.equal(commits.length, 1);
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "b0"), true);

    first.resolve({ ok: true, version: 1 });
    await settle();
    await settle();
    assert.equal(commits.length, 3);
    assert.equal(commits[1].ops.length, 40);
    assert.equal(commits[1].baseVersion, 1);
    assert.equal(commits[1].ops[0].node.id, "a0");
    assert.equal(commits[1].ops[20].node.id, "d0");
    assert.equal(commits[2].ops.length, 30);
    assert.equal(commits[2].baseVersion, 2);
    assert.equal(commits[2].ops[0].node.id, "b0");
    assert.equal(commits.some((item) => item.ops.length > 50), false);
    assert.equal(syncsOf(socket).length, 0);

    const recovered = useWorkspaceStore.getState();
    assert.equal(recovered.status, "ready");
    assert.equal(recovered.syncStatus, "idle");
    assert.equal(recovered.canvas.version, 9);
    assert.deepEqual(recovered.canvas.nodes.map((item) => item.id), ["base", "server"]);
    assert.equal(selectCanEdit(recovered), true);
    assert.deepEqual(successes, ["Canvas re-synced"]);
    assert.deepEqual(errors, ["Canvas version mismatch"]);
    dispose();
  });

  it("resyncs uncertain commits without replay", async () => {
    reset();
    const socket = createSocket();
    const dispose = await join(socket);
    const commits = [];
    let commitGate = defer();
    let syncResult = { ok: true, canvas: graph([node("from-server", "Server")], 3) };
    socket.handler = (event, payload) => {
      if (event === "canvas:commit") {
        commits.push(payload);
        return commitGate.promise;
      }
      if (event === "canvas:sync") return Promise.resolve(syncResult);
      return Promise.resolve({ ok: false, message: "unexpected" });
    };

    assert.equal(useWorkspaceStore.getState().dispatch([addOp("local")]), true);
    assert.equal(commits.length, 1);
    const beforeSync = syncsOf(socket).length;
    commitGate.reject(new Error("timeout"));
    await settle();
    await settle();
    assert.equal(syncsOf(socket).length, beforeSync + 1);
    assert.equal(syncsOf(socket).at(-1).payload.projectId, PROJECT);
    assert.deepEqual(Object.keys(syncsOf(socket).at(-1).payload), ["projectId"]);
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(useWorkspaceStore.getState().syncStatus, "idle");
    assert.equal(useWorkspaceStore.getState().canvas.nodes[0].id, "from-server");
    assert.equal(useWorkspaceStore.getState().canvas.version, 3);
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "local"), false);
    assert.deepEqual(successes, ["Canvas re-synced"]);
    assert.equal(socket.sent.some((item) => item.event === "workspace:leave"), false);

    successes.length = 0;
    errors.length = 0;
    commitGate = defer();
    syncResult = { ok: true, canvas: graph([node("from-server", "Server")], 4) };
    assert.equal(useWorkspaceStore.getState().dispatch([addOp("again")]), true);
    commitGate.resolve({ ok: true, version: 99 });
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().canvas.version, 4);
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "again"), false);
    assert.deepEqual(successes, ["Canvas re-synced"]);

    successes.length = 0;
    commitGate = defer();
    const late = commitGate;
    const syncGates = [];
    socket.handler = (event) => {
      if (event === "canvas:commit") return late.promise;
      if (event !== "canvas:sync") return Promise.resolve({ ok: false, message: "unexpected" });
      const gate = defer();
      syncGates.push(gate);
      return gate.promise;
    };
    assert.equal(useWorkspaceStore.getState().dispatch([addOp("late-local")]), true);
    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: 6,
      ops: [addOp("remote-win")],
      by: USER_B,
    });
    assert.equal(syncGates.length, 1);
    assert.equal(useWorkspaceStore.getState().syncStatus, "syncing");
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
    assert.equal(useWorkspaceStore.getState().setNodeLabel("from-server", "blurred"), false);
    assert.equal(useWorkspaceStore.getState().canvas.nodes[0].data.label, "Server");
    syncGates[0].resolve({ ok: true, canvas: graph([node("kept", "Kept")], 5) });
    await settle();
    assert.equal(syncGates.length, 2);
    syncGates[1].resolve({ ok: true, canvas: graph([node("kept", "Kept"), node("remote-win")], 6) });
    await settle();
    await settle();
    late.resolve({ ok: true, version: 5 });
    await settle();
    const afterLate = useWorkspaceStore.getState();
    assert.equal(afterLate.canvas.version, 6);
    assert.equal(afterLate.canvas.nodes.some((item) => item.id === "late-local"), false);
    assert.equal(afterLate.canvas.nodes.some((item) => item.id === "remote-win"), true);
    assert.equal(successes.filter((item) => item === "Canvas re-synced").length, 1);
    dispose();
  });

  it("refreshes a denied role and clears a missing project", async () => {
    reset();
    const socket = createSocket();
    const dispose = await join(socket, graph([node("n1")], 2));
    const commits = [];
    let commitGate = defer();
    let joinGate = defer();
    socket.handler = (event, payload) => {
      if (event === "canvas:commit") {
        commits.push(payload);
        return commitGate.promise;
      }
      if (event === "workspace:join") return joinGate.promise;
      return Promise.resolve({ ok: false, message: "unexpected" });
    };

    assert.equal(useWorkspaceStore.getState().dispatch([addOp("edited")]), true);
    commitGate.resolve({ ok: false, message: "You cannot edit this canvas" });
    await settle();
    assert.equal(useWorkspaceStore.getState().status, "loading");
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "edited"), false);
    joinGate.resolve(joinBody(PROJECT, graph([node("kept")], 3), "viewer"));
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().role, "viewer");
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(useWorkspaceStore.getState().canvas.nodes[0].id, "kept");
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
    assert.equal(useWorkspaceStore.getState().dispatch([addOp("nope")]), false);
    assert.deepEqual(successes, ["Canvas re-synced"]);
    assert.deepEqual(errors, ["You cannot edit this canvas"]);

    successes.length = 0;
    errors.length = 0;
    commitGate = defer();
    joinGate = defer();
    socket.handler = (event) => {
      if (event === "canvas:commit") return commitGate.promise;
      if (event === "workspace:join") return joinGate.promise;
      return Promise.resolve({ ok: false, message: "unexpected" });
    };
    useWorkspaceStore.getState().retryWorkspace();
    await settle();
    joinGate.resolve(joinBody(PROJECT, graph([node("kept")], 3), "editor"));
    await settle();
    await settle();
    assert.equal(successes.length, 0);
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), true);

    const leavesBefore = socket.sent.filter((item) => item.event === "workspace:leave").length;
    assert.equal(useWorkspaceStore.getState().dispatch([addOp("gone")]), true);
    commitGate.resolve({ ok: false, message: "Project not found" });
    await settle();
    await settle();
    const missing = useWorkspaceStore.getState();
    assert.equal(missing.status, "notFound");
    assert.equal(missing.project, null);
    assert.equal(missing.role, null);
    assert.equal(missing.canvas.nodes.length, 0);
    assert.equal(socket.sent.filter((item) => item.event === "workspace:leave").length, leavesBefore + 1);
    assert.equal(successes.length, 0);
    assert.deepEqual(errors, ["Project not found"]);
    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: 4,
      ops: [addOp("secret")],
      by: USER_A,
    });
    assert.equal(useWorkspaceStore.getState().status, "notFound");
    assert.equal(useWorkspaceStore.getState().canvas.nodes.length, 0);
    dispose();
  });

  it("applies contiguous remote ops and recovers on gaps or collisions", async () => {
    reset();
    const socket = createSocket();
    const dispose = await join(socket, graph([node("n1")], 2));
    socket.sent.length = 0;
    successes.length = 0;

    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: 3,
      ops: [{ type: "node.update", id: "n1", patch: { data: { label: "Remote" } } }],
      by: USER_B,
    });
    assert.equal(useWorkspaceStore.getState().canvas.nodes[0].data.label, "Remote");
    assert.equal(useWorkspaceStore.getState().canvas.version, 3);
    assert.equal(commitsOf(socket).length, 0);

    useWorkspaceStore.getState().onNodesChange([{ type: "select", id: "n1", selected: true }]);
    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: 4,
      ops: [{ type: "node.update", id: "n1", patch: { data: { label: "Mine" } } }],
      by: USER_A,
    });
    assert.equal(useWorkspaceStore.getState().canvas.nodes[0].data.label, "Mine");
    assert.equal(useWorkspaceStore.getState().canvas.version, 4);
    assert.equal(useWorkspaceStore.getState().rfNodes[0].selected, true);

    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: 4,
      ops: [{ type: "node.update", id: "n1", patch: { data: { label: "Old" } } }],
      by: USER_A,
    });
    socket.fire("canvas:ops", { projectId: OTHER, version: 9, ops: [addOp("x")], by: USER_B });
    socket.fire("canvas:ops", null);
    assert.equal(useWorkspaceStore.getState().canvas.version, 4);
    assert.equal(useWorkspaceStore.getState().canvas.nodes[0].data.label, "Mine");
    assert.equal(syncsOf(socket).length, 0);

    let syncCount = 0;
    socket.handler = (event) => {
      if (event !== "canvas:sync") return Promise.resolve({ ok: false, message: "unexpected" });
      syncCount += 1;
      const version = syncCount === 1 ? 4 : 6;
      const nodes = version === 6 ? [node("n1", "Mine"), node("gap")] : [node("n1", "Mine")];
      return Promise.resolve({ ok: true, canvas: graph(nodes, version) });
    };
    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: 6,
      ops: [addOp("gap")],
      by: USER_A,
    });
    await settle();
    await settle();
    assert.equal(syncCount, 2);
    assert.equal(useWorkspaceStore.getState().canvas.version, 6);
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "gap"), true);
    assert.equal(successes.filter((item) => item === "Canvas re-synced").length, 1);

    const held = defer();
    const seen = [];
    socket.handler = (event) => {
      if (event === "canvas:commit") return held.promise;
      if (event !== "canvas:sync") return Promise.resolve({ ok: false, message: "unexpected" });
      const gate = defer();
      seen.push(gate);
      return gate.promise;
    };
    successes.length = 0;
    assert.equal(useWorkspaceStore.getState().dispatch([addOp("local-2")]), true);
    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: 7,
      ops: [addOp("other")],
      by: USER_B,
    });
    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: 8,
      ops: [addOp("later")],
      by: USER_B,
    });
    socket.fire("canvas:ops", { projectId: PROJECT, version: 9, ops: "bad", by: USER_B });
    assert.equal(seen.length, 1);
    assert.equal(useWorkspaceStore.getState().syncStatus, "syncing");
    assert.equal(useWorkspaceStore.getState().status, "ready");
    seen[0].resolve({ ok: true, canvas: graph([node("n1", "Mine")], 7) });
    await settle();
    assert.equal(seen.length, 2);
    seen[1].resolve({
      ok: true,
      canvas: graph([node("n1", "Mine"), node("other"), node("later")], 8),
    });
    await settle();
    await settle();
    held.resolve({ ok: true, version: 7 });
    await settle();
    assert.equal(useWorkspaceStore.getState().canvas.version, 8);
    assert.equal(useWorkspaceStore.getState().syncStatus, "idle");
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "local-2"), false);
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "later"), true);
    assert.equal(successes.filter((item) => item === "Canvas re-synced").length, 1);
    dispose();
  });

  it("does not let an older sync ack erase a newer join event", async () => {
    reset();
    const socket = createSocket();
    const joinGate = defer();
    const syncs = [];
    socket.handler = (event) => {
      if (event === "workspace:join") return joinGate.promise;
      if (event === "canvas:sync") {
        const gate = defer();
        syncs.push(gate);
        return gate.promise;
      }
      return Promise.resolve({ ok: false, message: "unexpected" });
    };
    useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
    assert.equal(useWorkspaceStore.getState().status, "loading");
    assert.equal(useWorkspaceStore.getState().dispatch([addOp("during-join")]), false);
    assert.equal(commitsOf(socket).length, 0);
    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: 4,
      ops: [addOp("live")],
      by: USER_B,
    });
    socket.fire("canvas:ops", { projectId: PROJECT, ops: [], by: "not-an-id" });
    joinGate.resolve(joinBody(PROJECT, graph([node("old")], 1)));
    await settle();
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(useWorkspaceStore.getState().syncStatus, "syncing");
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
    assert.equal(syncs.length, 1);
    syncs[0].resolve({ ok: true, canvas: graph([node("old")], 1) });
    await settle();
    assert.equal(syncs.length, 2);
    syncs[1].resolve({ ok: true, canvas: graph([node("old"), node("live")], 4) });
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().canvas.version, 4);
    assert.equal(useWorkspaceStore.getState().syncStatus, "idle");
    assert.equal(useWorkspaceStore.getState().rfNodes.every((item) => item.selected === false), true);
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), true);
    assert.equal(successes.length, 0);
    useWorkspaceStore.getState().resetWorkspace();
  });

  it("fails closed when a follow-up sync is still behind", async () => {
    reset();
    const socket = createSocket();
    const dispose = await join(socket, graph([node("n1")], 2));
    let syncCount = 0;
    socket.handler = (event) => {
      if (event !== "canvas:sync") return Promise.resolve({ ok: false, message: "unexpected" });
      syncCount += 1;
      return Promise.resolve({ ok: true, canvas: graph([node("n1")], syncCount === 1 ? 3 : 4) });
    };
    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: 9,
      ops: [addOp("ahead")],
      by: USER_B,
    });
    await settle();
    await settle();
    await settle();
    assert.equal(syncCount, 2);
    assert.equal(useWorkspaceStore.getState().status, "error");
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
    assert.equal(successes.length, 0);
    assert.equal(socket.sent.some((item) => item.event === "workspace:leave"), true);
    dispose();
  });

  it("keeps reading when newer remote edits overtake each snapshot", async () => {
    reset();
    const socket = createSocket();
    const dispose = await join(socket, graph([node("n1")], 0));
    socket.sent.length = 0;
    const syncs = [];
    socket.handler = (event) => {
      if (event !== "canvas:sync") return Promise.resolve({ ok: false, message: "unexpected" });
      const gate = defer();
      syncs.push(gate);
      return gate.promise;
    };

    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: 2,
      ops: [addOp("v2")],
      by: USER_B,
    });
    assert.equal(syncs.length, 1);
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(useWorkspaceStore.getState().syncStatus, "syncing");
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
    assert.equal(useWorkspaceStore.getState().dispatch([addOp("during")]), false);

    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: 3,
      ops: [addOp("v3")],
      by: USER_B,
    });
    assert.equal(syncs.length, 1);
    syncs[0].resolve({ ok: true, canvas: graph([node("n1"), node("v2")], 2) });
    await settle();
    await settle();
    assert.equal(syncs.length, 2);
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(useWorkspaceStore.getState().syncStatus, "syncing");

    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: 4,
      ops: [addOp("v4")],
      by: USER_B,
    });
    assert.equal(syncs.length, 2);
    syncs[1].resolve({ ok: true, canvas: graph([node("n1"), node("v2"), node("v3")], 3) });
    await settle();
    await settle();
    assert.equal(syncs.length, 3);
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(socket.connected, true);

    syncs[2].resolve({
      ok: true,
      canvas: graph([node("n1"), node("v2"), node("v3"), node("v4")], 4),
    });
    await settle();
    await settle();
    const state = useWorkspaceStore.getState();
    assert.equal(state.status, "ready");
    assert.equal(state.syncStatus, "idle");
    assert.equal(state.canvas.version, 4);
    assert.deepEqual(state.canvas.nodes.map((item) => item.id), ["n1", "v2", "v3", "v4"]);
    assert.equal(selectCanEdit(state), true);
    assert.equal(successes.filter((item) => item === "Canvas re-synced").length, 1);
    assert.equal(commitsOf(socket).length, 0);
    assert.equal(socket.sent.some((item) => item.event === "workspace:leave"), false);
    assert.equal(syncs.length, 3);
    dispose();
  });

  it("rejects a commit that has no usable canvas and a failed sync", async () => {
    reset();
    const socket = createSocket();
    const dispose = await join(socket, graph([node("n1")], 2));
    const gate = defer();
    let syncs = 0;
    socket.handler = (event) => {
      if (event === "canvas:commit") return gate.promise;
      if (event === "canvas:sync") {
        syncs += 1;
        return Promise.reject(new Error("timeout"));
      }
      return Promise.resolve({ ok: false, message: "unexpected" });
    };
    assert.equal(useWorkspaceStore.getState().dispatch([addOp("maybe")]), true);
    gate.resolve({ ok: false, message: "Unable to save canvas" });
    await settle();
    await settle();
    assert.equal(syncs, 1);
    assert.equal(useWorkspaceStore.getState().status, "error");
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "maybe"), false);
    assert.equal(successes.length, 0);
    assert.deepEqual(errors, ["Unable to save canvas"]);
    const leaveAt = socket.sent.findIndex((item) => item.event === "workspace:leave");
    const syncAt = socket.sent.findIndex((item) => item.ack && item.event === "canvas:sync");
    assert.equal(syncAt < leaveAt, true);
    dispose();
  });

  it("retires stale callbacks when the binding changes", async () => {
    reset();
    const socket = createSocket("same");
    const dispose = await join(socket, graph([node("n1")], 1));
    socket.removeAllListeners();
    assert.equal(useWorkspaceStore.getState().status, "ready");
    socket.disconnect();
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(useWorkspaceStore.getState().dispatch([addOp("signed-out")]), false);
    assert.equal(commitsOf(socket).length, 0);

    socket.connected = true;
    socket.id = "same-2";
    const rejoin = defer();
    socket.handler = (event) => (event === "workspace:join" ? rejoin.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    socket.sent.length = 0;
    useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
    rejoin.resolve(joinBody(PROJECT, graph([node("n1", "Saved")], 4)));
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().canvas.version, 4);
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "signed-out"), false);
    assert.equal(commitsOf(socket).length, 0);
    assert.equal(socket.listenerCount("canvas:ops"), 1);

    dispose();
    const next = createSocket("rejoined");
    const gate = defer();
    next.handler = (event) => (event === "workspace:join" ? gate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    const disposeNext = useWorkspaceStore.getState().bindWorkspace(next, PROJECT);
    gate.resolve(joinBody(PROJECT, graph([node("n1", "Saved")], 4)));
    await settle();
    await settle();
    assert.equal(next.listenerCount("canvas:ops"), 1);
    assert.equal(next.listenerCount("connect"), 1);
    assert.equal(next.listenerCount("disconnect"), 1);

    const other = createSocket("b");
    const moved = defer();
    other.handler = (event) => (event === "workspace:join" ? moved.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    const disposeOther = useWorkspaceStore.getState().bindWorkspace(other, OTHER);
    assert.equal(next.sent.some((item) => item.event === "workspace:leave"), true);
    assert.equal(next.listenerCount("canvas:ops"), 0);
    moved.resolve(joinBody(OTHER, graph(), "owner"));
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().project._id, OTHER);
    assert.equal(selectCanEdit(useWorkspaceStore.getState()), true);
    assert.equal(other.listenerCount("canvas:ops"), 1);
    let chats = 0;
    other.on("chat:typing", () => {
      chats += 1;
    });
    disposeNext();
    assert.equal(other.listenerCount("canvas:ops"), 1);
    disposeOther();
    disposeOther();
    assert.equal(other.listenerCount("canvas:ops"), 0);
    assert.equal(other.listenerCount("connect"), 0);
    assert.equal(other.listenerCount("chat:typing"), 1);
    other.fire("chat:typing");
    assert.equal(chats, 1);
    assert.equal(useWorkspaceStore.getState().status, "idle");
  });

  it("drops unsent work on remount, retry, and disconnect", async () => {
    reset();
    const socket = createSocket("again");
    const held = defer();
    const dispose = await join(socket, graph([node("n1")], 1));
    socket.handler = (event) => (event === "canvas:commit" ? held.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    assert.equal(useWorkspaceStore.getState().dispatch([addOp("unsent")]), true);
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "unsent"), true);

    const second = defer();
    socket.handler = (event) => (event === "workspace:join" ? second.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    const disposeAgain = useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
    held.resolve({ ok: true, version: 2 });
    second.resolve(joinBody(PROJECT, graph([node("n1", "Saved")], 5)));
    await settle();
    await settle();
    assert.equal(socket.listenerCount("canvas:ops"), 1);
    assert.equal(useWorkspaceStore.getState().canvas.version, 5);
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "unsent"), false);
    assert.equal(successes.length, 0);
    dispose();
    assert.equal(socket.listenerCount("canvas:ops"), 1);

    socket.connected = false;
    socket.fire("disconnect");
    socket.sent.length = 0;
    useWorkspaceStore.getState().retryWorkspace();
    assert.equal(useWorkspaceStore.getState().status, "loading");
    assert.equal(socket.sent.length, 0);
    assert.equal(useWorkspaceStore.getState().dispatch([addOp("offline")]), false);

    socket.connected = true;
    socket.id = "again-2";
    const third = defer();
    socket.handler = (event) => (event === "workspace:join" ? third.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    socket.fire("connect");
    third.resolve(joinBody(PROJECT, graph([node("n1")], 5)));
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "offline"), false);

    const replacement = createSocket("replacement");
    const replaced = defer();
    replacement.handler = (event) => (event === "workspace:join" ? replaced.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    const disposeReplacement = useWorkspaceStore.getState().bindWorkspace(replacement, PROJECT);
    assert.equal(socket.listenerCount("canvas:ops"), 0);
    replaced.resolve(joinBody(PROJECT, graph([node("fresh")], 7)));
    await settle();
    await settle();
    disposeAgain();
    assert.equal(replacement.listenerCount("canvas:ops"), 1);
    assert.equal(useWorkspaceStore.getState().canvas.nodes[0].id, "fresh");

    const strict = createSocket("strict");
    const firstPass = defer();
    const secondPass = defer();
    let joins = 0;
    strict.handler = (event) => {
      if (event !== "workspace:join") return Promise.resolve({ ok: false, message: "unexpected" });
      joins += 1;
      return joins === 1 ? firstPass.promise : secondPass.promise;
    };
    const firstDispose = useWorkspaceStore.getState().bindWorkspace(strict, PROJECT);
    firstDispose();
    const secondDispose = useWorkspaceStore.getState().bindWorkspace(strict, PROJECT);
    assert.equal(strict.listenerCount("canvas:ops"), 1);
    secondPass.resolve(joinBody(PROJECT, graph(), "editor"));
    firstPass.resolve(joinBody(PROJECT, graph([node("stale")], 3)));
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "stale"), false);
    assert.equal(strict.listenerCount("canvas:ops"), 1);
    secondDispose();
    assert.equal(strict.listenerCount("canvas:ops"), 0);
    disposeReplacement();
  });

  it("keeps display gestures local until the gesture commits", async () => {
    reset();
    const socket = createSocket();
    const dispose = await join(socket, graph([node("n1", "Saved"), node("n2", "Other")], 1));
    const commits = [];
    socket.handler = (event, payload) => {
      if (event !== "canvas:commit") return Promise.resolve({ ok: false, message: "unexpected" });
      commits.push(payload);
      return Promise.resolve({ ok: true, version: payload.baseVersion + 1 });
    };
    const store = () => useWorkspaceStore.getState();

    store().onNodesChange([{ type: "select", id: "n1", selected: true }]);
    store().onNodesChange([{ type: "position", id: "n1", position: { x: 80, y: 90 }, dragging: true }]);
    store().onNodesChange([{ type: "dimensions", id: "n1", resizing: true, dimensions: { width: 50, height: 50 } }]);
    assert.equal(commits.length, 0);
    assert.equal(store().canvas.nodes[0].position.x, 10);
    assert.equal(store().rfNodes[0].position.x, 80);

    assert.equal(store().commitNodePositions([
      { id: "n1", position: { x: 80, y: 90 } },
      { id: "n2", position: { x: 30, y: 40 } },
    ]), true);
    assert.equal(commits.at(-1).ops.length, 2);
    await settle();

    store().onNodesChange([{
      type: "dimensions",
      id: "n1",
      resizing: false,
      dimensions: { width: 12, height: 12 },
    }]);
    assert.equal(commits.length, 1);
    assert.equal(store().canvas.nodes[0].width, 160);
    assert.notEqual(store().rfNodes[0].width, 12);

    store().onNodesChange([{ type: "dimensions", id: "n1", dimensions: { width: 160, height: 80 } }]);
    assert.equal(store().commitNodeResize("n1", { x: 80, y: 90, width: 180, height: 90 }), true);
    await settle();
    assert.equal(store().commitNodeResize("n1", { x: 80, y: 90, width: 10, height: 90 }), false);
    assert.equal(errors.at(-1), "Node width must be between 40 and 2000");
    assert.equal(store().canvas.nodes[0].width, 180);

    assert.equal(store().setNodeLabel("n1", "Saved"), true);
    assert.equal(store().setNodeLabel("n1", "Renamed"), true);
    await settle();
    assert.equal(store().setNodeColor("n1", "Blue"), true);
    await settle();
    assert.equal(store().setNodeColor("n1", "Blue"), true);
    assert.equal(store().canvas.nodes[0].data.color, "#10233D");
    assert.equal(store().canvas.nodes[0].data.textColor, "#52A8FF");

    assert.equal(store().connectNodes({
      source: "n1",
      target: "n1",
      sourceHandle: "right",
      targetHandle: "left",
    }), true);
    await settle();
    assert.equal(store().connectNodes({
      source: "n1",
      target: "n2",
      sourceHandle: "bottom",
      targetHandle: "top",
    }), true);
    await settle();
    assert.equal(store().connectNodes({
      source: "n1",
      target: "n2",
      sourceHandle: "bottom",
      targetHandle: "top",
    }), true);
    await settle();
    const parallel = store().canvas.edges.filter((edge) => edge.source === "n1" && edge.target === "n2");
    assert.equal(parallel.length, 2);
    assert.equal(new Set(parallel.map((edge) => edge.id)).size, 2);
    assert.equal(store().canvas.edges.some((edge) => edge.source === "n1" && edge.target === "n1"), true);
    assert.equal(store().rfEdges[0].markerEnd.color, "var(--collab-edge)");
    assert.equal(Object.hasOwn(store().canvas.edges[0], "markerEnd"), false);
    assert.equal(store().setEdgeLabel(parallel[0].id, "Link"), true);
    await settle();
    assert.equal(store().canvas.edges.find((edge) => edge.id === parallel[0].id).data.label, "Link");

    const beforeDelete = commits.length;
    assert.equal(store().deleteElements({
      nodes: [{ id: "n1" }],
      edges: store().canvas.edges.map((edge) => ({ id: edge.id })),
    }), true);
    assert.equal(commits.length, beforeDelete + 1);
    assert.deepEqual(commits.at(-1).ops, [{ type: "node.remove", id: "n1" }]);
    await settle();
    assert.equal(store().canvas.nodes.some((item) => item.id === "n1"), false);
    assert.equal(store().canvas.edges.length, 0);
    assert.equal(store().canvas.nodes[0].id, "n2");

    store().onNodesChange([{ type: "select", id: "n2", selected: true }]);
    store().onNodesChange([{ type: "dimensions", id: "n2", dimensions: { width: 160, height: 80 } }]);
    const measuredN2 = store().rfNodes.find((item) => item.id === "n2").measured;
    assert.equal(measuredN2.width, 160);
    assert.equal(measuredN2.height, 80);
    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: store().canvas.version + 1,
      ops: [{ type: "node.update", id: "n2", patch: { data: { label: "Remote" } } }],
      by: USER_B,
    });
    const remoteNode = store().rfNodes.find((item) => item.id === "n2");
    assert.equal(store().canvas.nodes.find((item) => item.id === "n2").data.label, "Remote");
    assert.equal(remoteNode.selected, true);
    assert.equal(remoteNode.measured.width, 160);
    assert.equal(remoteNode.position.x, 30);
    assert.equal(commits.length, beforeDelete + 1);
    dispose();
  });
});
