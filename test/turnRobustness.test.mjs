import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, afterEach, before, describe, it } from "node:test";
import { createServer } from "vite";
import { formatIdleCountdown, idleSecondsRemaining } from "../src/collaborate/lib/turnState.js";

const require = createRequire(import.meta.url);

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
const SAM = "64b0000000000000000000c3";
const BLANK = "64b0000000000000000000d4";
const TAB_B = "22222222-2222-4222-a222-222222222222";
const TAB_C = "33333333-3333-4333-8333-333333333333";

const LOSS = "Your turn ended before some edits could be sent";
const CONNECTION_LOSS = "Connection lost. Some edits may not have been saved";
const WAKING = "Waking the server…";
const RECONNECTING = "Reconnecting…";
const RESYNCED = "Canvas re-synced";
const GRANTED = "It's your turn";

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

function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(label));
        return;
      }
      setTimeout(poll, 15);
    };
    poll();
  });
}

function people() {
  return [
    { userId: SAM, fullName: "Sam", img: "", role: "editor" },
    { userId: OTHER, fullName: "Grace", img: "", role: "viewer" },
    { userId: BLANK, fullName: "   ", img: "", role: "editor" },
  ];
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
    holder: patch.holder === undefined ? { userId, tabId } : patch.holder,
    holderSince: 1,
    queue: [],
    idleDeadline: null,
    graceUntil: null,
    serverNow: 1,
    ...patch,
    holder: patch.holder === undefined ? { userId, tabId } : patch.holder,
  };
}

function turnPacket(userId, tabId, patch = {}) {
  return { projectId: PROJECT, ...heldTurn(userId, tabId, patch) };
}

function countdownTurn(tabId, queueUser, queueTab, { serverNow = 5000, idleMs = 45000 } = {}) {
  return turnPacket(SELF, tabId, {
    queue: [{ userId: queueUser, tabId: queueTab }],
    idleDeadline: serverNow + idleMs,
    graceUntil: null,
    serverNow,
  });
}

function joinBody(projectId, canvas, role, turn) {
  return {
    ok: true,
    project: { _id: projectId, name: "Design", description: "Notes" },
    role,
    canvas,
    participants: people(),
    turn,
    serverNow: 4,
  };
}

function tabOf(socket) {
  return [...socket.sent].reverse().find((item) => item.event === "workspace:join")?.payload?.tabId;
}

function editorBody(socket, projectId, canvas, role = "editor") {
  return joinBody(projectId, canvas, role, heldTurn(SELF, tabOf(socket)));
}

function ofEvent(socket, event, { ack = null } = {}) {
  return socket.sent.filter((item) => item.event === event && (ack === null || Boolean(item.ack) === ack));
}

function commits(socket) {
  return ofEvent(socket, "canvas:commit", { ack: true });
}

function syncs(socket) {
  return ofEvent(socket, "canvas:sync", { ack: true });
}

function previews(socket) {
  return ofEvent(socket, "canvas:preview");
}

function releases(socket) {
  return ofEvent(socket, "turn:release");
}

function visible(html) {
  return html.replaceAll("&#x27;", "'").replaceAll("&#x2014;", "—");
}

function politeText(html) {
  const match = html.match(/<p aria-live="polite"[\s\S]*?<\/p>/);
  return match ? visible(match[0]) : "";
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
      if (!saved) return;
      globalThis.setTimeout = saved.setTimeout;
      globalThis.clearTimeout = saved.clearTimeout;
      Date.now = saved.now;
      saved = null;
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

function createSocket(id = "sock-1") {
  const handlers = new Map();
  const socket = {
    id,
    connected: true,
    active: true,
    sent: [],
    sendBuffer: [],
    bufferVolatile: false,
    connectCalls: 0,
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
        if (socket.bufferVolatile) socket.sendBuffer.push({ data: [event, payload] });
      },
    },
    bufferCommits: false,
    timeout() {
      return {
        emitWithAck: (event, payload) => {
          socket.sent.push({ event, payload, ack: true });
          // The installed client queues here when the heartbeat has expired
          // even though connected is still true. Reconnect flushes that queue
          // before the connect listeners run.
          if (socket.bufferCommits && socket.connected && event === "canvas:commit") {
            socket.sendBuffer.push({ data: [event, payload] });
          }
          return socket.handler(event, payload);
        },
      };
    },
    fire(event, payload) {
      if (event === "connect") {
        const buffered = socket.sendBuffer.splice(0, socket.sendBuffer.length);
        for (const packet of buffered) {
          const data = packet?.data;
          if (Array.isArray(data)) socket.sent.push({ event: data[0], payload: data[1], flushed: true });
        }
      }
      for (const fn of [...(handlers.get(event) ?? [])]) fn(payload);
    },
    listenerCount(event) {
      return handlers.get(event)?.size ?? 0;
    },
    connect() {
      socket.connectCalls += 1;
      socket.active = true;
    },
    disconnect() {
      socket.connected = false;
    },
  };
  return socket;
}

function remoteOp(version, id = "remote") {
  return { projectId: PROJECT, version, ops: [addOp(id)], by: OTHER };
}

const idleTurn = {
  holder: { userId: SELF, tabId: TAB_B },
  holderSince: 1,
  queue: [{ userId: SAM, tabId: TAB_C }],
  idleDeadline: 50_000,
  graceUntil: null,
  serverNow: 5_000,
};

describe("idle countdown math", () => {
  it("rounds, clamps, and ignores the wall clock", () => {
    assert.equal(idleSecondsRemaining(idleTurn, 1_000, 1_000), 45);
    assert.equal(idleSecondsRemaining(idleTurn, 1_000, 1_001), 45);
    assert.equal(idleSecondsRemaining(idleTurn, 1_000, 2_000), 44);
    assert.equal(idleSecondsRemaining(idleTurn, 1_000, 1_000 + 44_999), 1);
    assert.equal(idleSecondsRemaining(idleTurn, 1_000, 1_000 + 45_000), 0);
    assert.equal(idleSecondsRemaining(idleTurn, 1_000, 1_000 + 90_000), 0);
    assert.equal(idleSecondsRemaining({ ...idleTurn, graceUntil: 9, idleDeadline: 50_000 }, 1_000, 1_000), null);
    assert.equal(idleSecondsRemaining({ ...idleTurn, idleDeadline: null }, 1_000, 1_000), null);
    assert.equal(idleSecondsRemaining(null, 1_000, 1_000), null);
    assert.equal(idleSecondsRemaining(idleTurn, Number.NaN, 1_000), null);
    const wall = Date.now;
    Date.now = () => 0;
    try {
      assert.equal(idleSecondsRemaining(idleTurn, 10, 2_010), 43);
    } finally {
      Date.now = wall;
    }
    assert.equal(formatIdleCountdown(45), "0:45");
    assert.equal(formatIdleCountdown(0), "0:00");
    assert.equal(formatIdleCountdown(125), "2:05");
    assert.equal(formatIdleCountdown(600), "10:00");
    assert.equal(formatIdleCountdown(9), "0:09");
    assert.equal(formatIdleCountdown(-4), "0:00");
    assert.equal(formatIdleCountdown(45.9), "0:45");
  });
});

describe("turn robustness", () => {
  let vite;
  let useWorkspaceStore;
  let useSessionStore;
  let selectCanEdit;
  let selectIsHolder;
  let TurnBar;
  let ConnectionBanner;
  let WorkspacePage;
  let createElement;
  let renderToStaticMarkup;
  let MemoryRouter;
  let Routes;
  let Route;
  let errors;
  let successes;
  let chimes;
  let toastMod;
  let originalError;
  let originalSuccess;
  let originalWindow;
  let originalNow;
  let pageWindow;
  let restoreReact;
  let clock;

  before(async () => {
    restoreReact = useClientSnapshotOnServer();
    vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: "custom",
      logLevel: "error",
    });
    const storeMod = await vite.ssrLoadModule("/src/collaborate/store/useWorkspaceStore.js");
    const sessionMod = await vite.ssrLoadModule("/src/collaborate/store/useSessionStore.js");
    const barMod = await vite.ssrLoadModule("/src/collaborate/components/workspace/TurnBar.jsx");
    const bannerMod = await vite.ssrLoadModule("/src/collaborate/components/workspace/ConnectionBanner.jsx");
    const pageMod = await vite.ssrLoadModule("/src/collaborate/routes/WorkspacePage.jsx");
    const renderMod = await vite.ssrLoadModule("/test/ssrRender.js");
    const routerMod = await vite.ssrLoadModule("react-router-dom");
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
    originalWindow = globalThis.window;
    originalNow = performance.now;
    pageWindow = {
      AudioContext: class {
        constructor() {
          chimes.push(1);
          throw new Error("chime counted");
        }
      },
      addEventListener(type, fn) {
        let set = this.listeners.get(type);
        if (!set) {
          set = new Set();
          this.listeners.set(type, set);
        }
        set.add(fn);
      },
      removeEventListener(type, fn) {
        this.listeners.get(type)?.delete(fn);
      },
      fire(type, event) {
        for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
      },
      listenerCount(type) {
        return this.listeners.get(type)?.size ?? 0;
      },
      listeners: new Map(),
    };
    globalThis.window = pageWindow;
    useWorkspaceStore = storeMod.useWorkspaceStore;
    useSessionStore = sessionMod.useSessionStore;
    selectCanEdit = storeMod.selectCanEdit;
    selectIsHolder = storeMod.selectIsHolder;
    TurnBar = barMod.default;
    ConnectionBanner = bannerMod.default;
    WorkspacePage = pageMod.default;
    createElement = renderMod.createElement;
    renderToStaticMarkup = renderMod.renderToStaticMarkup;
    MemoryRouter = routerMod.MemoryRouter;
    Routes = routerMod.Routes;
    Route = routerMod.Route;
  });

  after(async () => {
    performance.now = originalNow;
    clock?.restore();
    restoreReact?.();
    globalThis.window = originalWindow;
    if (toastMod) {
      toastMod.toast.error = originalError;
      toastMod.toast.success = originalSuccess;
    }
    useWorkspaceStore?.getState().resetWorkspace();
    await vite?.close();
  });

  afterEach(() => {
    clock?.restore();
    clock = null;
    performance.now = originalNow;
  });

  function reset() {
    errors.length = 0;
    successes.length = 0;
    chimes.length = 0;
    useWorkspaceStore.getState().resetWorkspace();
    useSessionStore.setState({ authUser: { _id: SELF, fullName: "Ada Lovelace", img: "" } });
  }

  function nodeIds() {
    return useWorkspaceStore.getState().canvas.nodes.map((item) => item.id);
  }

  function useClock() {
    clock?.restore();
    clock = createFakeClock();
    clock.install();
    return clock;
  }

  function useMono(start) {
    let value = start;
    performance.now = () => value;
    return {
      set(next) {
        value = next;
      },
    };
  }

  function markup() {
    return renderToStaticMarkup(createElement(TurnBar));
  }

  function renderPage() {
    return renderToStaticMarkup(createElement(
      MemoryRouter,
      { initialEntries: [`/collaborate/${PROJECT}`] },
      createElement(Routes, null, createElement(Route, {
        path: "/collaborate/:projectId",
        element: createElement(WorkspacePage),
      })),
    ));
  }

  async function join(socket, { canvas = graph(), role = "editor", projectId = PROJECT, turn } = {}) {
    const gate = defer();
    socket.handler = (event) => (
      event === "workspace:join" ? gate.promise : Promise.resolve({ ok: false, message: "unexpected" })
    );
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, projectId);
    const tabId = tabOf(socket);
    const bodyTurn = turn !== undefined ? turn : (role === "viewer" ? null : heldTurn(SELF, tabId));
    gate.resolve(joinBody(projectId, canvas, role, bodyTurn));
    await settle();
    await settle();
    return { dispose, tabId };
  }

  function holdCommit(socket) {
    const gate = defer();
    socket.handler = (event) => {
      if (event === "canvas:commit") return gate.promise;
      return Promise.resolve({ ok: false, message: "unexpected" });
    };
    return gate;
  }

  async function queueUnsent(socket) {
    const commitGate = holdCommit(socket);
    assert.equal(useWorkspaceStore.getState().dispatch([addOp("inflight")]), true);
    assert.equal(useWorkspaceStore.getState().dispatch([addOp("dropped")]), true);
    assert.equal(nodeIds().at(-2), "inflight");
    assert.equal(nodeIds().at(-1), "dropped");
    assert.equal(commits(socket).length, 1);
    assert.deepEqual(commits(socket)[0].payload.ops.map((op) => op.node.id), ["inflight"]);
    return commitGate;
  }

  function loseTurn(socket, userId = OTHER, tabId = TAB_B) {
    socket.fire("turn:state", turnPacket(userId, tabId, { serverNow: 8 }));
  }

  it("rolls unsent work back and restores only the accepted commit", async () => {
    reset();
    const socket = createSocket();
    const { dispose } = await join(socket);
    try {
      const commitGate = await queueUnsent(socket);
      const syncGate = defer();
      socket.handler = (event) => {
        if (event === "canvas:commit") return commitGate.promise;
        if (event === "canvas:sync") return syncGate.promise;
        return Promise.resolve({ ok: false, message: "unexpected" });
      };
      loseTurn(socket);
      const rolled = useWorkspaceStore.getState();
      assert.equal(rolled.turn.holder.userId, OTHER);
      assert.equal(rolled.status, "ready");
      assert.equal(rolled.syncStatus, "syncing");
      assert.equal(rolled.connectionNotice, null);
      assert.equal(selectCanEdit(rolled), false);
      assert.deepEqual(nodeIds(), []);
      assert.equal(rolled.canvas.version, 0);
      assert.deepEqual(errors, [LOSS]);
      assert.equal(syncs(socket).length, 1);
      assert.deepEqual(Object.keys(syncs(socket)[0].payload), ["projectId"]);
      assert.equal(commits(socket).length, 1);

      commitGate.resolve({ ok: true, version: 1 });
      await settle();
      await settle();
      assert.deepEqual(nodeIds(), []);
      assert.equal(useWorkspaceStore.getState().canvas.version, 0);
      assert.equal(syncs(socket).length, 1);
      assert.equal(commits(socket).length, 1);
      assert.deepEqual(errors, [LOSS]);

      syncGate.resolve({ ok: true, canvas: graph([node("inflight", "Kept")], 1) });
      await settle();
      await settle();
      const restored = useWorkspaceStore.getState();
      assert.equal(restored.syncStatus, "idle");
      assert.equal(restored.canvas.version, 1);
      assert.deepEqual(nodeIds(), ["inflight"]);
      assert.deepEqual(successes, [RESYNCED]);
      assert.equal(commits(socket).length, 1);
      assert.equal(selectCanEdit(restored), false);
    } finally {
      dispose();
    }
  });

  it("installs a snapshot that omitted the interrupted commit", async () => {
    reset();
    const socket = createSocket();
    const { dispose } = await join(socket, { canvas: graph([node("base")], 2) });
    try {
      const commitGate = await queueUnsent(socket);
      const syncGate = defer();
      socket.handler = (event) => {
        if (event === "canvas:commit") return commitGate.promise;
        if (event === "canvas:sync") return syncGate.promise;
        return Promise.resolve({ ok: false, message: "unexpected" });
      };
      loseTurn(socket);
      assert.deepEqual(nodeIds(), ["base"]);
      commitGate.resolve({ ok: true, version: 3 });
      syncGate.resolve({ ok: true, canvas: graph([node("base")], 2) });
      await settle();
      await settle();
      assert.deepEqual(nodeIds(), ["base"]);
      assert.equal(useWorkspaceStore.getState().canvas.version, 2);
      assert.deepEqual(successes, [RESYNCED]);
      assert.equal(errors.filter((item) => item === LOSS).length, 1);
      assert.equal(commits(socket).some((item) => item.payload.ops.some((op) => op.node.id === "dropped")), false);
    } finally {
      dispose();
    }
  });

  it("keeps a successful ack when only a commit is in flight", async () => {
    reset();
    const socket = createSocket();
    const { dispose } = await join(socket);
    try {
      const commitGate = holdCommit(socket);
      assert.equal(useWorkspaceStore.getState().dispatch([addOp("inflight")]), true);
      loseTurn(socket);
      assert.deepEqual(errors, []);
      assert.equal(syncs(socket).length, 0);
      assert.deepEqual(nodeIds(), ["inflight"]);
      assert.equal(useWorkspaceStore.getState().turn.holder.userId, OTHER);
      commitGate.resolve({ ok: true, version: 1 });
      await settle();
      await settle();
      const state = useWorkspaceStore.getState();
      assert.equal(state.canvas.version, 1);
      assert.deepEqual(nodeIds(), ["inflight"]);
      assert.equal(state.syncStatus, "idle");
      assert.equal(syncs(socket).length, 0);
      assert.equal(commits(socket).length, 1);
      assert.deepEqual(successes, []);
    } finally {
      dispose();
    }
  });

  it("still recovers when that in-flight ack fails", async () => {
    reset();
    const socket = createSocket();
    const { dispose } = await join(socket);
    try {
      const commitGate = holdCommit(socket);
      assert.equal(useWorkspaceStore.getState().dispatch([addOp("inflight")]), true);
      loseTurn(socket);
      assert.equal(syncs(socket).length, 0);
      const syncGate = defer();
      socket.handler = (event) => {
        if (event === "canvas:commit") return commitGate.promise;
        if (event === "canvas:sync") return syncGate.promise;
        return Promise.resolve({ ok: false, message: "unexpected" });
      };
      commitGate.resolve({ ok: false, message: "Canvas version mismatch" });
      await settle();
      assert.equal(syncs(socket).length, 1);
      assert.deepEqual(errors, ["Canvas version mismatch"]);
      syncGate.resolve({ ok: true, canvas: graph([node("server")], 4) });
      await settle();
      await settle();
      assert.deepEqual(nodeIds(), ["server"]);
      assert.deepEqual(successes, [RESYNCED]);
    } finally {
      dispose();
    }
  });

  it("sends no canvas traffic when an idle holder loses the turn", async () => {
    reset();
    const socket = createSocket();
    const { dispose } = await join(socket, { canvas: graph([node("base")]) });
    const ticking = useClock();
    try {
      const state = useWorkspaceStore.getState();
      state.onNodeDrag(null, null, [{ id: "base", position: { x: 40, y: 50 } }]);
      state.onNodeDrag(null, null, [{ id: "base", position: { x: 48, y: 52 } }]);
      assert.equal(previews(socket).length, 1);
      loseTurn(socket);
      ticking.advance(100);
      assert.equal(previews(socket).length, 1);
      assert.equal(commits(socket).length, 0);
      assert.equal(syncs(socket).length, 0);
      assert.deepEqual(errors, []);
      assert.equal(useWorkspaceStore.getState().turn.holder.userId, OTHER);
      assert.deepEqual(nodeIds(), ["base"]);
    } finally {
      dispose();
    }
  });

  it("gates edits through a regrant and commits from the recovered version", async () => {
    reset();
    const socket = createSocket();
    const { dispose, tabId } = await join(socket);
    try {
      const commitGate = await queueUnsent(socket);
      const syncGate = defer();
      socket.handler = (event) => {
        if (event === "canvas:commit") return commitGate.promise;
        if (event === "canvas:sync") return syncGate.promise;
        return Promise.resolve({ ok: false, message: "unexpected" });
      };
      loseTurn(socket);
      assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
      socket.fire("turn:state", turnPacket(SELF, tabId, { serverNow: 9 }));
      assert.deepEqual(successes, [GRANTED]);
      assert.equal(chimes.length, 1);
      assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
      assert.equal(selectIsHolder(useWorkspaceStore.getState()), true);
      assert.equal(useWorkspaceStore.getState().dispatch([addOp("during")]), false);
      assert.equal(nodeIds().includes("during"), false);
      assert.equal(commits(socket).length, 1);

      syncGate.resolve({ ok: true, canvas: graph([node("server")], 4) });
      await settle();
      await settle();
      assert.equal(useWorkspaceStore.getState().canvas.version, 4);
      assert.equal(selectCanEdit(useWorkspaceStore.getState()), true);
      assert.equal(useWorkspaceStore.getState().dispatch([addOp("next")]), true);
      assert.equal(commits(socket).length, 2);
      assert.equal(commits(socket)[1].payload.baseVersion, 4);
      assert.deepEqual(commits(socket)[1].payload.ops.map((op) => op.node.id), ["next"]);
      assert.equal(commits(socket).some((item) => item.payload.ops.some((op) => op.node.id === "dropped")), false);
    } finally {
      dispose();
    }
  });

  it("requests another sync when a remote edit overtakes recovery", async () => {
    reset();
    const socket = createSocket();
    const { dispose } = await join(socket);
    try {
      const commitGate = await queueUnsent(socket);
      const gates = [];
      socket.handler = (event) => {
        if (event === "canvas:commit") return commitGate.promise;
        if (event !== "canvas:sync") return Promise.resolve({ ok: false, message: "unexpected" });
        const gate = defer();
        gates.push(gate);
        return gate.promise;
      };
      loseTurn(socket);
      assert.equal(gates.length, 1);
      socket.fire("canvas:ops", remoteOp(6, "remote"));
      assert.equal(gates.length, 1);
      gates[0].resolve({ ok: true, canvas: graph([node("inflight")], 1) });
      await settle();
      await settle();
      assert.equal(gates.length, 2);
      assert.equal(useWorkspaceStore.getState().syncStatus, "syncing");
      gates[1].resolve({ ok: true, canvas: graph([node("inflight"), node("remote")], 6) });
      await settle();
      await settle();
      const state = useWorkspaceStore.getState();
      assert.equal(state.canvas.version, 6);
      assert.deepEqual(nodeIds(), ["inflight", "remote"]);
      assert.equal(nodeIds().includes("dropped"), false);
      assert.deepEqual(successes, [RESYNCED]);
      socket.fire("canvas:ops", remoteOp(6, "dup"));
      assert.equal(gates.length, 2);
      assert.equal(useWorkspaceStore.getState().canvas.version, 6);
    } finally {
      dispose();
    }
  });

  it("ignores a recovery snapshot after the binding is replaced", async () => {
    reset();
    const socket = createSocket("old");
    const { dispose } = await join(socket);
    try {
      const commitGate = await queueUnsent(socket);
      const syncGate = defer();
      socket.handler = (event) => {
        if (event === "canvas:commit") return commitGate.promise;
        if (event === "canvas:sync") return syncGate.promise;
        return Promise.resolve({ ok: false, message: "unexpected" });
      };
      loseTurn(socket);
      const other = createSocket("other");
      const joinGate = defer();
      other.handler = (event) => (
        event === "workspace:join" ? joinGate.promise : Promise.resolve({ ok: false, message: "unexpected" })
      );
      const disposeOther = useWorkspaceStore.getState().bindWorkspace(other, OTHER_PROJECT);
      syncGate.resolve({ ok: true, canvas: graph([node("secret")], 9) });
      await settle();
      assert.equal(useWorkspaceStore.getState().project, null);
      assert.equal(nodeIds().includes("secret"), false);
      joinGate.resolve(editorBody(other, OTHER_PROJECT, graph([node("kept")], 3), "owner"));
      await settle();
      await settle();
      const state = useWorkspaceStore.getState();
      assert.equal(state.project._id, OTHER_PROJECT);
      assert.deepEqual(nodeIds(), ["kept"]);
      assert.equal(commits(other).length, 0);
      disposeOther();
    } finally {
      dispose();
    }
  });

  it("routes a failed turn-loss sync through the existing error state", async () => {
    reset();
    const socket = createSocket();
    const { dispose } = await join(socket);
    try {
      const commitGate = await queueUnsent(socket);
      socket.handler = (event) => {
        if (event === "canvas:commit") return commitGate.promise;
        if (event === "canvas:sync") return Promise.reject(new Error("timeout"));
        return Promise.resolve({ ok: false, message: "unexpected" });
      };
      loseTurn(socket);
      await settle();
      await settle();
      const state = useWorkspaceStore.getState();
      assert.equal(state.status, "error");
      assert.equal(state.connectionNotice, null);
      assert.equal(nodeIds().includes("dropped"), false);
      assert.deepEqual(errors, [LOSS]);
      assert.equal(successes.includes(RESYNCED), false);
      const html = visible(renderPage());
      assert.equal(html.includes("Try again"), true);
      assert.equal(html.includes("role=\"status\""), false);
    } finally {
      dispose();
    }
  });

  it("warns once for a disconnect and rejoins from the snapshot", async () => {
    reset();
    const socket = createSocket();
    const { dispose } = await join(socket);
    try {
      const commitGate = await queueUnsent(socket);
      const sentCommits = commits(socket).length;
      socket.active = true;
      socket.disconnect();
      socket.fire("disconnect");
      assert.deepEqual(errors, [CONNECTION_LOSS]);
      assert.equal(useWorkspaceStore.getState().status, "loading");
      assert.equal(useWorkspaceStore.getState().connectionNotice, RECONNECTING);
      assert.equal(useWorkspaceStore.getState().turn, null);
      assert.equal(useWorkspaceStore.getState().project, null);
      assert.deepEqual(nodeIds(), []);
      assert.equal(releases(socket).length, 0);
      const html = visible(renderPage());
      assert.equal(html.includes(RECONNECTING), true);
      assert.equal(html.includes("Design"), false);
      assert.equal(html.includes("Request turn"), false);

      commitGate.resolve({ ok: true, version: 1 });
      await settle();
      assert.equal(commits(socket).length, sentCommits);
      assert.equal(syncs(socket).length, 0);
      assert.equal(useWorkspaceStore.getState().status, "loading");

      const joinGate = defer();
      socket.handler = (event) => (
        event === "workspace:join" ? joinGate.promise : Promise.resolve({ ok: false, message: "unexpected" })
      );
      socket.connected = true;
      socket.id = "sock-2";
      socket.fire("connect");
      joinGate.resolve(joinBody(PROJECT, graph([node("saved")], 5), "editor", heldTurn(OTHER, TAB_B, { serverNow: 6 })));
      await settle();
      await settle();
      const state = useWorkspaceStore.getState();
      assert.equal(state.status, "ready");
      assert.equal(state.connectionNotice, null);
      assert.equal(state.canvas.version, 5);
      assert.deepEqual(nodeIds(), ["saved"]);
      assert.equal(state.turn.holder.userId, OTHER);
      assert.equal(commits(socket).length, sentCommits);
      assert.deepEqual(errors, [CONNECTION_LOSS]);
      assert.equal(successes.includes(GRANTED), false);
      assert.equal(chimes.length, 0);
    } finally {
      dispose();
    }
  });

  it("stays silent when a clean reconnect keeps or loses the turn", async () => {
    reset();
    const socket = createSocket();
    const { dispose, tabId } = await join(socket);
    try {
      socket.disconnect();
      socket.fire("disconnect");
      assert.deepEqual(errors, []);
      assert.equal(useWorkspaceStore.getState().connectionNotice, RECONNECTING);
      const keep = defer();
      socket.handler = (event) => (event === "workspace:join" ? keep.promise : Promise.resolve({ ok: false, message: "unexpected" }));
      socket.connected = true;
      socket.fire("connect");
      keep.resolve(editorBody(socket, PROJECT, graph([node("base")], 1)));
      await settle();
      await settle();
      assert.equal(selectIsHolder(useWorkspaceStore.getState()), true);
      assert.equal(useWorkspaceStore.getState().turn.holder.tabId, tabId);
      assert.deepEqual(errors, []);
      assert.deepEqual(successes, []);
      assert.equal(chimes.length, 0);

      socket.disconnect();
      socket.fire("disconnect");
      assert.deepEqual(errors, []);
      const lose = defer();
      socket.handler = (event) => (event === "workspace:join" ? lose.promise : Promise.resolve({ ok: false, message: "unexpected" }));
      socket.connected = true;
      socket.id = "sock-3";
      socket.fire("connect");
      lose.resolve(joinBody(PROJECT, graph([node("base")], 1), "editor", heldTurn(OTHER, TAB_B)));
      await settle();
      await settle();
      assert.equal(selectIsHolder(useWorkspaceStore.getState()), false);
      assert.equal(useWorkspaceStore.getState().turn.holder.userId, OTHER);
      assert.deepEqual(errors, []);
      assert.deepEqual(successes, []);
      assert.equal(chimes.length, 0);
    } finally {
      dispose();
    }
  });

  it("shows the waking banner at 3 seconds and not one millisecond earlier", async () => {
    reset();
    const ticking = useClock();
    const socket = createSocket();
    socket.connected = false;
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
    try {
      assert.equal(useWorkspaceStore.getState().status, "loading");
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      const early = renderPage();
      assert.equal(early.includes("role=\"status\""), false);
      assert.equal(early.includes("min-h-[100dvh]"), true);
      assert.equal(early.includes("Projects"), false);
      ticking.advance(2999);
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      assert.equal(renderPage().includes("role=\"status\""), false);
      ticking.advance(1);
      assert.equal(useWorkspaceStore.getState().connectionNotice, WAKING);
      const html = visible(renderPage());
      const projects = html.indexOf("Projects");
      const status = html.indexOf("role=\"status\"");
      const spin = html.indexOf("animate-spin");
      assert.equal(projects > -1 && projects < status && status < spin, true);
      assert.equal(html.includes(WAKING), true);
      assert.equal(html.includes("h-[100dvh]"), true);
      assert.equal(html.includes("items-center"), true);
      assert.equal(html.includes("Design"), false);
      assert.equal(html.includes("Request turn"), false);
      assert.equal(html.includes("#ff990a"), false);
      assert.equal(html.includes("--collab-warning"), true);
      const banner = renderToStaticMarkup(createElement(ConnectionBanner));
      assert.equal(banner.includes("role=\"status\""), true);
      assert.equal(visible(banner).includes(WAKING), true);
      assert.equal(banner.includes("--collab-warning"), true);
    } finally {
      dispose();
    }
  });

  it("shares the first loading interval across connect and join", async () => {
    reset();
    const ticking = useClock();
    const socket = createSocket();
    socket.connected = false;
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
    try {
      ticking.advance(1000);
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      const gate = defer();
      socket.handler = (event) => (event === "workspace:join" ? gate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
      socket.connected = true;
      socket.fire("connect");
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      ticking.advance(1999);
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      ticking.advance(1);
      assert.equal(useWorkspaceStore.getState().connectionNotice, WAKING);
      gate.resolve(editorBody(socket, PROJECT, graph()));
      await settle();
      await settle();
      assert.equal(useWorkspaceStore.getState().status, "ready");
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
    } finally {
      dispose();
    }
  });

  it("keeps Reconnecting until the connected rejoin itself is slow", async () => {
    reset();
    const socket = createSocket();
    const { dispose } = await join(socket);
    const ticking = useClock();
    try {
      socket.disconnect();
      socket.fire("disconnect");
      assert.equal(useWorkspaceStore.getState().connectionNotice, RECONNECTING);
      ticking.advance(2999);
      assert.equal(useWorkspaceStore.getState().connectionNotice, RECONNECTING);
      const gate = defer();
      socket.handler = (event) => (event === "workspace:join" ? gate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
      socket.connected = true;
      socket.fire("connect");
      assert.equal(useWorkspaceStore.getState().connectionNotice, RECONNECTING);
      ticking.advance(2999);
      assert.equal(useWorkspaceStore.getState().connectionNotice, RECONNECTING);
      ticking.advance(1);
      assert.equal(useWorkspaceStore.getState().connectionNotice, WAKING);
      assert.equal(useWorkspaceStore.getState().status, "loading");
      gate.resolve(editorBody(socket, PROJECT, graph()));
      await settle();
      await settle();
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      assert.equal(useWorkspaceStore.getState().status, "ready");
    } finally {
      dispose();
    }
  });

  it("shows the error card when the socket stops retrying", async () => {
    reset();
    const ticking = useClock();
    const dropped = createSocket("dropped");
    dropped.connected = false;
    dropped.active = false;
    const disposeDropped = useWorkspaceStore.getState().bindWorkspace(dropped, PROJECT);
    try {
      assert.equal(useWorkspaceStore.getState().status, "error");
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      ticking.advance(4000);
      assert.equal(useWorkspaceStore.getState().status, "error");
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      assert.equal(dropped.connectCalls, 0);
    } finally {
      disposeDropped();
    }

    reset();
    const tickingAgain = useClock();
    const socket = createSocket("live-error");
    socket.connected = false;
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
    try {
      socket.active = false;
      socket.fire("disconnect");
      assert.equal(useWorkspaceStore.getState().status, "error");
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      const html = visible(renderPage());
      assert.equal(html.includes("Try again"), true);
      assert.equal(html.includes("role=\"status\""), false);
      tickingAgain.advance(5000);
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);

      useWorkspaceStore.getState().resetWorkspace();
      const errored = createSocket("connect-error");
      errored.connected = false;
      const disposeError = useWorkspaceStore.getState().bindWorkspace(errored, PROJECT);
      errored.active = false;
      errored.fire("connect_error", { message: "clerk-secret-token" });
      assert.equal(useWorkspaceStore.getState().status, "error");
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      assert.equal(visible(renderPage()).includes("clerk-secret-token"), false);
      disposeError();

      const transient = createSocket("transient");
      transient.connected = false;
      const disposeTransient = useWorkspaceStore.getState().bindWorkspace(transient, PROJECT);
      tickingAgain.advance(3000);
      assert.equal(useWorkspaceStore.getState().connectionNotice, WAKING);
      transient.fire("connect_error", { message: "temporary-blip" });
      assert.equal(useWorkspaceStore.getState().status, "loading");
      assert.equal(useWorkspaceStore.getState().connectionNotice, WAKING);
      assert.equal(visible(renderPage()).includes("temporary-blip"), false);
      disposeTransient();
    } finally {
      dispose();
    }
  });

  it("restarts an inactive socket once and leaves an active attempt alone", async () => {
    reset();
    const ticking = useClock();
    const socket = createSocket();
    socket.connected = false;
    socket.active = false;
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
    try {
      assert.equal(useWorkspaceStore.getState().status, "error");
      useWorkspaceStore.getState().retryWorkspace();
      assert.equal(socket.connectCalls, 1);
      assert.equal(socket.active, true);
      assert.equal(useWorkspaceStore.getState().status, "loading");
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      assert.equal(renderPage().includes("role=\"status\""), false);
      ticking.advance(2999);
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      ticking.advance(1);
      assert.equal(useWorkspaceStore.getState().connectionNotice, WAKING);
      useWorkspaceStore.getState().retryWorkspace();
      assert.equal(socket.connectCalls, 1);
      assert.equal(useWorkspaceStore.getState().status, "loading");
    } finally {
      dispose();
    }

    reset();
    const active = createSocket("active");
    active.connected = false;
    active.active = true;
    const disposeActive = useWorkspaceStore.getState().bindWorkspace(active, PROJECT);
    try {
      useWorkspaceStore.getState().retryWorkspace();
      assert.equal(active.connectCalls, 0);
      assert.equal(useWorkspaceStore.getState().status, "loading");
    } finally {
      disposeActive();
    }
  });

  it("starts a fresh join interval when retry is already connected", async () => {
    reset();
    const socket = createSocket();
    const { dispose } = await join(socket);
    const ticking = useClock();
    try {
      const gate = defer();
      socket.handler = (event) => (event === "workspace:join" ? gate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
      const before = ofEvent(socket, "workspace:join", { ack: true }).length;
      useWorkspaceStore.getState().retryWorkspace();
      assert.equal(ofEvent(socket, "workspace:join", { ack: true }).length, before + 1);
      assert.equal(useWorkspaceStore.getState().status, "loading");
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      ticking.advance(2999);
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      ticking.advance(1);
      assert.equal(useWorkspaceStore.getState().connectionNotice, WAKING);
      gate.resolve(editorBody(socket, PROJECT, graph()));
      await settle();
      await settle();
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
    } finally {
      dispose();
    }
  });

  it("drops timers, listeners, and obsolete acks when the route changes", async () => {
    reset();
    const ticking = useClock();
    const socket = createSocket();
    const gate = defer();
    socket.handler = (event) => (event === "workspace:join" ? gate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
    let decoys = 0;
    const onDecoy = () => {
      decoys += 1;
    };
    pageWindow.addEventListener("pagehide", onDecoy);
    try {
      assert.equal(pageWindow.listenerCount("pagehide"), 2);
      dispose();
      assert.equal(useWorkspaceStore.getState().status, "idle");
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      assert.equal(pageWindow.listenerCount("pagehide"), 1);
      ticking.advance(5000);
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      assert.equal(useWorkspaceStore.getState().status, "idle");
      gate.resolve(editorBody(socket, PROJECT, graph([node("secret")], 4)));
      await settle();
      await settle();
      assert.equal(useWorkspaceStore.getState().status, "idle");
      assert.equal(useWorkspaceStore.getState().project, null);
      pageWindow.fire("pagehide", { persisted: false });
      assert.equal(decoys, 1);
      assert.equal(releases(socket).length, 0);
    } finally {
      pageWindow.removeEventListener("pagehide", onDecoy);
      dispose();
    }
  });

  it("releases on pagehide only for this live holder", async () => {
    reset();
    const socket = createSocket();
    const { dispose, tabId } = await join(socket, { canvas: graph([node("base")]) });
    try {
      socket.bufferVolatile = true;
      socket.sendBuffer.push({ data: ["turn:release", { projectId: "decoy" }] });
      socket.sendBuffer.push({ data: ["cursor:move", { projectId: PROJECT, x: 1, y: 2 }] });
      pageWindow.fire("pagehide", { persisted: false });
      pageWindow.fire("pagehide", { persisted: true });
      const emitted = releases(socket);
      assert.equal(emitted.length, 2);
      assert.equal(emitted.every((item) => item.volatile === true), true);
      assert.deepEqual(emitted[0].payload, { projectId: PROJECT });
      assert.equal(socket.sendBuffer.some((packet) => packet.data?.[1] === emitted[0].payload), false);
      assert.equal(socket.sendBuffer.some((packet) => packet.data?.[1] === emitted[1].payload), false);
      assert.equal(socket.sendBuffer.some((packet) => packet.data?.[1]?.projectId === "decoy"), true);
      assert.equal(socket.sendBuffer.some((packet) => packet.data?.[0] === "cursor:move"), true);
      assert.equal(socket.connectCalls, 0);

      const syncGate = defer();
      socket.handler = (event) => (event === "canvas:sync" ? syncGate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
      socket.fire("canvas:ops", remoteOp(3, "gap"));
      assert.equal(selectIsHolder(useWorkspaceStore.getState()), true);
      assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      pageWindow.fire("pagehide", { persisted: false });
      assert.equal(releases(socket).length, 3);

      socket.fire("turn:state", turnPacket(SELF, TAB_B, { serverNow: 4 }));
      assert.notEqual(tabId, TAB_B);
      assert.equal(selectIsHolder(useWorkspaceStore.getState()), false);
      pageWindow.fire("pagehide", { persisted: false });
      assert.equal(releases(socket).length, 3);

      socket.fire("turn:state", turnPacket(SELF, tabId, { serverNow: 5 }));
      socket.connected = false;
      pageWindow.fire("pagehide", { persisted: true });
      assert.equal(releases(socket).length, 3);
      socket.connected = true;

      socket.volatile = null;
      socket.fire("turn:state", turnPacket(SELF, tabId, { serverNow: 6 }));
      assert.equal(selectIsHolder(useWorkspaceStore.getState()), true);
      pageWindow.fire("pagehide", { persisted: false });
      assert.equal(releases(socket).length, 3);

      useWorkspaceStore.getState().releaseTurn();
      const button = releases(socket).at(-1);
      assert.equal(button.volatile, undefined);
      assert.deepEqual(button.payload, { projectId: PROJECT });
      syncGate.resolve({ ok: true, canvas: graph([node("base"), node("gap")], 3) });
      await settle();
      await settle();
    } finally {
      dispose();
    }
  });

  it("does not release for a viewer or a disposed binding", async () => {
    reset();
    const viewerSocket = createSocket("viewer");
    const viewer = await join(viewerSocket, { role: "viewer", turn: null });
    try {
      assert.equal(selectIsHolder(useWorkspaceStore.getState()), false);
      pageWindow.fire("pagehide", { persisted: false });
      pageWindow.fire("pagehide", { persisted: true });
      assert.equal(releases(viewerSocket).length, 0);
    } finally {
      viewer.dispose();
    }

    reset();
    const socket = createSocket("gone");
    const { dispose } = await join(socket);
    assert.equal(pageWindow.listenerCount("pagehide"), 1);
    dispose();
    assert.equal(pageWindow.listenerCount("pagehide"), 0);
    pageWindow.fire("pagehide", { persisted: false });
    assert.equal(releases(socket).length, 0);
    assert.equal(socket.listenerCount("turn:state"), 0);
  });

  it("shows the holder countdown outside the polite region", async () => {
    reset();
    const socket = createSocket();
    const mono = useMono(10_000);
    const { dispose, tabId } = await join(socket);
    try {
      mono.set(10_000);
      socket.fire("turn:state", countdownTurn(tabId, SAM, TAB_B));
      assert.equal(useWorkspaceStore.getState().turnReceivedAt, 10_000);
      let html = markup();
      assert.equal(politeText(html).includes("passes in"), false);
      assert.equal(visible(html).includes("Sam is waiting — passes in 0:45 unless you edit"), true);
      assert.equal(html.includes("aria-live=\"polite\""), true);
      const countdown = html.slice(html.indexOf("</p>") + 4);
      assert.equal(visible(countdown).includes("passes in 0:45"), true);
      assert.equal(countdown.includes("aria-live"), false);
      assert.equal(countdown.includes("--collab-warning"), true);

      mono.set(20_000);
      html = markup();
      assert.equal(visible(html).includes("passes in 0:35"), true);

      mono.set(30_000);
      socket.fire("turn:state", countdownTurn(tabId, OTHER, TAB_C, { serverNow: 8000, idleMs: 60_000 }));
      assert.equal(useWorkspaceStore.getState().turnReceivedAt, 30_000);
      html = markup();
      assert.equal(visible(html).includes("Grace is waiting — passes in 1:00 unless you edit"), true);

      socket.fire("turn:state", countdownTurn(tabId, BLANK, TAB_B, { serverNow: 9000, idleMs: 5000 }));
      assert.equal(visible(markup()).includes("Someone is waiting — passes in 0:05 unless you edit"), true);

      const receipt = useWorkspaceStore.getState().turnReceivedAt;
      const syncGate = defer();
      socket.handler = (event) => (event === "canvas:sync" ? syncGate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
      socket.fire("canvas:ops", remoteOp(2, "elsewhere"));
      assert.equal(selectCanEdit(useWorkspaceStore.getState()), false);
      assert.equal(selectIsHolder(useWorkspaceStore.getState()), true);
      assert.equal(useWorkspaceStore.getState().turnReceivedAt, receipt);
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      assert.equal(visible(markup()).includes("passes in"), true);
      syncGate.resolve({ ok: true, canvas: graph([node("elsewhere")], 2) });
      await settle();
      await settle();
    } finally {
      dispose();
    }
  });

  it("hides the countdown for grace, an empty queue, and a non-holder", async () => {
    reset();
    const socket = createSocket();
    const { dispose, tabId } = await join(socket);
    try {
      socket.fire("turn:state", turnPacket(SELF, tabId, {
        queue: [{ userId: SAM, tabId: TAB_B }],
        idleDeadline: null,
        graceUntil: 50,
        serverNow: 6,
      }));
      assert.equal(visible(markup()).includes("passes in"), false);
      assert.equal(visible(markup()).includes("Reconnecting"), true);

      socket.fire("turn:state", turnPacket(SELF, tabId, { serverNow: 7 }));
      assert.equal(visible(markup()).includes("passes in"), false);

      socket.fire("turn:state", turnPacket(OTHER, TAB_B, {
        queue: [{ userId: SAM, tabId: TAB_C }],
        idleDeadline: 50_000,
        graceUntil: null,
        serverNow: 5_000,
      }));
      assert.equal(selectIsHolder(useWorkspaceStore.getState()), false);
      assert.equal(visible(markup()).includes("passes in"), false);
    } finally {
      dispose();
    }
  });

  it("clamps at 0:00 without releasing or passing the turn", async () => {
    reset();
    const socket = createSocket();
    const mono = useMono(1_000);
    const { dispose, tabId } = await join(socket);
    try {
      mono.set(1_000);
      socket.fire("turn:state", countdownTurn(tabId, SAM, TAB_B));
      mono.set(1_000 + 45_000);
      assert.equal(visible(markup()).includes("Sam is waiting — passes in 0:00 unless you edit"), true);
      mono.set(1_000 + 90_000);
      assert.equal(visible(markup()).includes("passes in 0:00"), true);
      assert.equal(releases(socket).length, 0);
      assert.equal(commits(socket).length, 0);
      assert.equal(syncs(socket).length, 0);
      assert.equal(selectCanEdit(useWorkspaceStore.getState()), true);
      assert.equal(useWorkspaceStore.getState().turn.holder.tabId, tabId);
    } finally {
      dispose();
    }
  });

  it("keeps a deferred packet's receipt from the moment it arrived", async () => {
    reset();
    const socket = createSocket();
    const mono = useMono(4_000);
    const gate = defer();
    socket.handler = (event) => (event === "workspace:join" ? gate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
    try {
      const tabId = tabOf(socket);
      gate.resolve(editorBody(socket, PROJECT, graph()));
      queueMicrotask(() => {
        mono.set(2_000);
        socket.fire("turn:state", countdownTurn(tabId, SAM, TAB_B, { serverNow: 5_000, idleMs: 45_000 }));
        mono.set(9_000);
      });
      await settle();
      await settle();
      assert.equal(useWorkspaceStore.getState().turn.queue[0].userId, SAM);
      assert.equal(useWorkspaceStore.getState().turnReceivedAt, 2_000);
      assert.equal(visible(markup()).includes("passes in 0:38"), true);
      assert.equal(chimes.length, 0);
    } finally {
      dispose();
    }
  });

  it("keeps the access-denied card free of the connection banner", async () => {
    reset();
    const socket = createSocket();
    const gate = defer();
    socket.handler = (event) => (event === "workspace:join" ? gate.promise : Promise.resolve({ ok: false, message: "unexpected" }));
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
    try {
      gate.resolve({ ok: false, message: "Project not found" });
      await settle();
      await settle();
      assert.equal(useWorkspaceStore.getState().status, "notFound");
      assert.equal(useWorkspaceStore.getState().connectionNotice, null);
      const html = visible(renderPage());
      assert.equal(html.includes("Project not found"), true);
      assert.equal(html.includes("Back to projects"), true);
      assert.equal(html.includes("role=\"status\""), false);
      assert.equal(html.includes("Request turn"), false);
    } finally {
      dispose();
    }
  });

  it("drops a buffered commit while the socket still looks connected", async () => {
    reset();
    const socket = createSocket();
    const { dispose } = await join(socket);
    try {
      const commitGate = holdCommit(socket);
      const unrelated = { data: ["cursor:move", { projectId: "decoy", x: 3, y: 4 }] };
      const otherCommit = {
        data: ["canvas:commit", { projectId: PROJECT, baseVersion: 0, ops: [addOp("other")] }],
      };
      socket.sendBuffer.push(unrelated, otherCommit);
      socket.bufferCommits = true;
      assert.equal(socket.connected, true);
      assert.equal(useWorkspaceStore.getState().dispatch([addOp("stale")]), true);
      assert.equal(socket.connected, true);
      const emitted = commits(socket)[0].payload;
      assert.equal(socket.sendBuffer.some((packet) => packet.data?.[1] === emitted), false);
      assert.equal(socket.sendBuffer.includes(unrelated), true);
      assert.equal(socket.sendBuffer.includes(otherCommit), true);

      socket.disconnect();
      socket.fire("disconnect");
      const joinGate = defer();
      socket.handler = (event) => (
        event === "workspace:join" ? joinGate.promise : Promise.resolve({ ok: false, message: "unexpected" })
      );
      socket.connected = true;
      socket.id = "sock-2";
      socket.fire("connect");
      assert.equal(socket.sent.some((item) => item.flushed && item.payload === emitted), false);
      assert.equal(socket.sent.some((item) => item.flushed && item.payload === unrelated.data[1]), true);
      assert.equal(socket.sent.some((item) => item.flushed && item.payload === otherCommit.data[1]), true);
      joinGate.resolve(joinBody(PROJECT, graph([node("saved")], 5), "editor", heldTurn(OTHER, TAB_B, { serverNow: 6 })));
      await settle();
      await settle();
      commitGate.resolve({ ok: true, version: 1 });
      await settle();
      const state = useWorkspaceStore.getState();
      assert.equal(state.status, "ready");
      assert.equal(state.canvas.version, 5);
      assert.deepEqual(nodeIds(), ["saved"]);
      assert.equal(commits(socket).length, 1);
      assert.equal(socket.sent.some((item) => item.flushed && item.payload === emitted), false);
    } finally {
      dispose();
    }
  });

  it("drops a heartbeat-expired commit before the next workspace join", async () => {
    reset();
    const { createServer } = await import("node:http");
    const { io } = await import("socket.io-client");
    const requireServer = createRequire(new URL("../server/package.json", import.meta.url));
    const { Server } = requireServer("socket.io");
    const seen = [];
    let joins = 0;
    const httpServer = createServer();
    const ioServer = new Server(httpServer);
    ioServer.on("connection", (serverSocket) => {
      let joined = false;
      serverSocket.on("workspace:join", (payload, ack) => {
        joins += 1;
        seen.push("join");
        joined = true;
        const first = joins === 1;
        ack(joinBody(
          PROJECT,
          graph([node(first ? "base" : "saved")], first ? 1 : 4),
          "editor",
          heldTurn(SELF, payload?.tabId, { serverNow: joins }),
        ));
      });
      serverSocket.on("canvas:commit", () => {
        seen.push(joined ? "commit" : "commit before join");
      });
    });
    await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const { port } = httpServer.address();
    const socket = io(`http://127.0.0.1:${port}`, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 20,
      reconnectionDelayMax: 20,
      timeout: 2000,
      transports: ["websocket"],
    });
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
    socket.connect();
    try {
      await waitFor(
        () => useWorkspaceStore.getState().status === "ready" && useWorkspaceStore.getState().canvas.version === 1,
        4000,
        "loopback join did not become ready",
      );
      assert.equal(socket.connected, true);
      assert.equal(selectCanEdit(useWorkspaceStore.getState()), true);
      // The installed client buffers when this check is true, even if connected stays true.
      socket.io.engine._hasPingExpired = () => true;
      assert.equal(useWorkspaceStore.getState().dispatch([addOp("stale")]), true);
      assert.equal(socket.connected, true);
      assert.equal(socket.sendBuffer.some((packet) => packet?.data?.[0] === "canvas:commit"), false);
      socket.io.engine.close();
      await waitFor(
        () => joins >= 2 && useWorkspaceStore.getState().status === "ready" && useWorkspaceStore.getState().canvas.version === 4,
        4000,
        `loopback reconnect sequence ${seen.join(", ")}`,
      );
      assert.deepEqual(seen, ["join", "join"]);
      assert.deepEqual(nodeIds(), ["saved"]);
    } finally {
      dispose();
      socket.disconnect();
      await new Promise((resolve) => ioServer.close(() => resolve()));
    }
  });
});
