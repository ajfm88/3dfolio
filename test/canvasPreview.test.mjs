import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { createServer } from "vite";

const PROJECT = "64b0000000000000000000aa";

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

process.env.VITE_API_URL ||= "http://127.0.0.1:3000/api";

describe("canvasPreview", () => {
  let vite;
  let throttleModule;
  let canvasPreviewModule;
  let canvasOpsModule;
  let workspaceStoreModule;

  before(async () => {
    vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: "custom",
      logLevel: "error",
    });
    throttleModule = await vite.ssrLoadModule("/src/collaborate/lib/throttle.js");
    canvasPreviewModule = await vite.ssrLoadModule("/src/collaborate/lib/canvasPreview.js");
    canvasOpsModule = await vite.ssrLoadModule("/server/src/shared/canvasOps.js");
    workspaceStoreModule = await vite.ssrLoadModule("/src/collaborate/store/useWorkspaceStore.js");
  });

  after(async () => {
    await vite?.close();
  });

  let throttle;
  let createPreviewOverlayController;
  let POSITION_MAX;
  let NODE_SIZE_MIN;
  let NODE_SIZE_MAX;
  let ID_PATTERN;

  before(async () => {
    ({ throttle } = throttleModule);
    ({ createPreviewOverlayController } = canvasPreviewModule);
    ({ ID_PATTERN, POSITION_MAX, NODE_SIZE_MIN, NODE_SIZE_MAX } = canvasOpsModule);
  });

  describe("throttle", () => {
    it("first call runs immediately", () => {
      let timerFn = null;
      const clock = {
        now: () => 1000,
        setTimeout: (fn) => { timerFn = fn; },
        clearTimeout: () => { timerFn = null; },
      };
      let calls = 0;
      const fn = throttle(() => { calls += 1; }, 50, clock);
      fn("a");
      assert.equal(calls, 1);
    });

    it("first call at clock 0 runs immediately", () => {
      let timerFn = null;
      let now = 0;
      const clock = {
        now: () => now,
        setTimeout: (fn) => { timerFn = fn; },
        clearTimeout: () => { timerFn = null; },
      };
      let calls = 0;
      const fn = throttle(() => { calls += 1; }, 50, clock);
      fn("a");
      assert.equal(calls, 1);
    });

    it("calls inside window collapse to newest args", () => {
      let timerFn = null;
      let now = 1000;
      const clock = {
        now: () => now,
        setTimeout: (fn) => { timerFn = fn; },
        clearTimeout: () => { timerFn = null; },
      };
      let lastArgs = null;
      let calls = 0;
      const fn = throttle((...args) => { calls += 1; lastArgs = args; }, 50, clock);
      fn("first");
      assert.equal(calls, 1);
      now = 1010;
      fn("second");
      fn("third");
      assert.equal(calls, 1);
      timerFn();
      assert.equal(calls, 2);
      assert.deepEqual(lastArgs, ["third"]);
    });

    it("trailing call runs once after window", () => {
      let now = 1000;
      let timerFn = null;
      const clock = {
        now: () => now,
        setTimeout: (fn) => { timerFn = fn; },
        clearTimeout: () => { timerFn = null; },
      };
      let calls = 0;
      const fn = throttle(() => { calls += 1; }, 50, clock);
      fn("a");
      assert.equal(calls, 1);
      now = 1025;
      fn("b");
      assert.equal(calls, 1);
      timerFn();
      assert.equal(calls, 2);
    });

    it("cancel prevents trailing call", () => {
      let now = 1000;
      let timerFn = null;
      const clock = {
        now: () => now,
        setTimeout: (fn) => { timerFn = fn; },
        clearTimeout: () => { timerFn = null; },
      };
      let calls = 0;
      const fn = throttle(() => { calls += 1; }, 50, clock);
      fn("a");
      // call again inside window so a timer exists
      fn("b");
      assert(timerFn !== null, "timer should be scheduled");
      fn.cancel();
      now = 1025;
      if (timerFn) timerFn();
      assert.equal(calls, 1);
    });
  });

  describe("canvasPreview sanitize", () => {
    let controller;

    beforeEach(() => {
      controller = createPreviewOverlayController({
        clock: { setTimeout: () => 0, clearTimeout: () => {} },
      });
    });

    it("accepts valid position-only nodes", () => {
      const nodes = [{ id: "n1", position: { x: 10, y: 20 } }];
      const result = controller.receivePreview({ nodes }, () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]);
      assert.equal(result.ok, true);
      assert.deepEqual(result.applied, ["n1"]);
    });

    it("accepts valid position+size nodes", () => {
      const nodes = [{ id: "n1", position: { x: 10, y: 20 }, width: 160, height: 80 }];
      const result = controller.receivePreview({ nodes }, () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]);
      assert.equal(result.ok, true);
    });

    it("ignores an empty list", () => {
      const result = controller.receivePreview({ nodes: [] }, () => []);
      assert.equal(result.ok, false);
      assert.equal(result.applied.length, 0);
    });

    it("rejects over 50 nodes", () => {
      const nodes = Array.from({ length: 51 }, (_, i) => ({ id: `n${i}`, position: { x: i, y: i } }));
      const result = controller.receivePreview({ nodes }, () => []);
      assert.equal(result.ok, false);
    });

    it("rejects duplicate ids", () => {
      const nodes = [{ id: "n1", position: { x: 0, y: 0 } }, { id: "n1", position: { x: 10, y: 10 } }];
      const result = controller.receivePreview({ nodes }, () => []);
      assert.equal(result.ok, false);
    });

    it("rejects non-finite position", () => {
      const nodes = [{ id: "n1", position: { x: NaN, y: 0 } }];
      const result = controller.receivePreview({ nodes }, () => []);
      assert.equal(result.ok, false);
    });

    it("rejects position out of bounds", () => {
      const nodes = [{ id: "n1", position: { x: POSITION_MAX + 1, y: 0 } }];
      const result = controller.receivePreview({ nodes }, () => []);
      assert.equal(result.ok, false);
    });

    it("rejects width without height", () => {
      const nodes = [{ id: "n1", position: { x: 0, y: 0 }, width: 100 }];
      const result = controller.receivePreview({ nodes }, () => []);
      assert.equal(result.ok, false);
    });

    it("rejects size out of bounds", () => {
      const nodes = [{ id: "n1", position: { x: 0, y: 0 }, width: NODE_SIZE_MIN - 1, height: 80 }];
      const result = controller.receivePreview({ nodes }, () => []);
      assert.equal(result.ok, false);
    });

    it("skips unknown ids", () => {
      const nodes = [{ id: "n1", position: { x: 10, y: 20 } }, { id: "unknown", position: { x: 0, y: 0 } }];
      const result = controller.receivePreview({ nodes }, () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]);
      assert.equal(result.ok, true);
      assert.deepEqual(result.applied, ["n1"]);
    });
  });

  describe("canvasPreview overlay lifecycle", () => {
    let controller;
    let clock;
    let timerFn;

    beforeEach(() => {
      timerFn = null;
      clock = {
        setTimeout: (fn) => { timerFn = fn; },
        clearTimeout: () => { timerFn = null; },
      };
      controller = createPreviewOverlayController({ clock });
    });

    it("applies overlay to display nodes", () => {
      controller.receivePreview(
        { nodes: [{ id: "n1", position: { x: 50, y: 60 } }] },
        () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]
      );
      const rfNodes = controller.applyOverlays([
        { id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100, data: {} }
      ]);
      assert.equal(rfNodes[0].position.x, 50);
      assert.equal(rfNodes[0].position.y, 60);
    });

    it("applies size overlay with measured", () => {
      controller.receivePreview(
        { nodes: [{ id: "n1", position: { x: 50, y: 60 }, width: 200, height: 150 }] },
        () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]
      );
      const rfNodes = controller.applyOverlays([
        { id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100, data: {} }
      ]);
      assert.equal(rfNodes[0].position.x, 50);
      assert.equal(rfNodes[0].width, 200);
      assert.equal(rfNodes[0].height, 150);
      assert.deepEqual(rfNodes[0].measured, { width: 200, height: 150 });
    });

    it("clears overlay on canonical position change", () => {
      controller.receivePreview(
        { nodes: [{ id: "n1", position: { x: 50, y: 60 } }] },
        () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]
      );
      const previous = [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }];
      const current = [{ id: "n1", position: { x: 100, y: 100 }, width: 100, height: 100 }];
      controller.onCanonicalNodesChange(previous, current);
      const overlays = controller.getOverlays();
      assert.equal(overlays.has("n1"), false);
    });

    it("clears overlay on canonical size change", () => {
      controller.receivePreview(
        { nodes: [{ id: "n1", position: { x: 50, y: 60 }, width: 200, height: 150 }] },
        () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]
      );
      const previous = [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }];
      const current = [{ id: "n1", position: { x: 0, y: 0 }, width: 150, height: 120 }];
      controller.onCanonicalNodesChange(previous, current);
      const overlays = controller.getOverlays();
      assert.equal(overlays.has("n1"), false);
    });

    it("keeps overlay on label-only change", () => {
      controller.receivePreview(
        { nodes: [{ id: "n1", position: { x: 50, y: 60 } }] },
        () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100, data: { label: "old" } }]
      );
      const previous = [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100, data: { label: "old" } }];
      const current = [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100, data: { label: "new" } }];
      controller.onCanonicalNodesChange(previous, current);
      const overlays = controller.getOverlays();
      assert.equal(overlays.has("n1"), true);
    });

    it("clears overlay on node removal", () => {
      controller.receivePreview(
        { nodes: [{ id: "n1", position: { x: 50, y: 60 } }] },
        () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]
      );
      const previous = [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }];
      const current = [];
      controller.onCanonicalNodesChange(previous, current);
      const overlays = controller.getOverlays();
      assert.equal(overlays.has("n1"), false);
    });

    it("clearAllOverlays removes everything", () => {
      controller.receivePreview(
        { nodes: [{ id: "n1", position: { x: 50, y: 60 } }] },
        () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]
      );
      controller.clearAllOverlays();
      const overlays = controller.getOverlays();
      assert.equal(overlays.size, 0);
    });
  });

  describe("store regressions", () => {
    const SELF = "64b0000000000000000000a1";
    const OTHER = "64b0000000000000000000a2";
    let useWorkspaceStore;
    let useSessionStore;

    before(async () => {
      ({ useWorkspaceStore } = workspaceStoreModule);
      ({ useSessionStore } = await vite.ssrLoadModule("/src/collaborate/store/useSessionStore.js"));
    });

    afterEach(() => {
      useWorkspaceStore.getState().resetWorkspace();
    });

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

    // The client's socket. Outgoing previews land in sent, flagged volatile.
    // fire delivers an event from the server to the store's listeners.
    function createSocket(id = "sock-1") {
      const handlers = new Map();
      const socket = {
        id,
        connected: true,
        sent: [],
        handler: () => new Promise(() => {}),
        on(event, fn) {
          if (!handlers.has(event)) handlers.set(event, new Set());
          handlers.get(event).add(fn);
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
      };
      return socket;
    }

    // Replaces the global timers because the store builds its own controllers.
    // Vite keeps real timers: this is installed only for the length of one test.
    function createFakeClock() {
      let now = 1000;
      let nextId = 0;
      const timers = new Map();
      let saved = null;
      return {
        install() {
          saved = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now };
          globalThis.setTimeout = (fn, delay = 0) => {
            const id = nextId;
            nextId += 1;
            timers.set(id, { fn, at: now + delay, delay });
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
        pending: () => [...timers.values()].filter((timer) => timer.delay === 3000).length,
      };
    }

    async function withClock(run) {
      const clock = createFakeClock();
      clock.install();
      try {
        await run(clock);
      } finally {
        clock.restore();
      }
    }

    // A real join through the store, so the sync session has a confirmed canvas.
    // Setting ready by hand leaves it empty and every remote op is then ignored.
    async function joined({ role = "editor", nodes = [node("n1"), node("n2", 300)] } = {}) {
      const socket = createSocket();
      socket.handler = async (event, payload) => {
        if (event === "workspace:join") {
          const turn = role === "viewer" ? null : {
            holder: { userId: SELF, tabId: payload.tabId },
            holderSince: 1,
            queue: [],
            idleDeadline: null,
            graceUntil: null,
            serverNow: 1,
          };
          return {
            ok: true,
            project: { _id: PROJECT, name: "Design", description: "" },
            role,
            canvas: { nodes, edges: [], version: 4 },
            participants: [],
            turn,
            serverNow: 1,
          };
        }
        return new Promise(() => {});
      };
      useSessionStore.setState({ authUser: { _id: SELF } });
      const dispose = useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
      await settle();
      await settle();
      assert.equal(useWorkspaceStore.getState().status, "ready");
      return { socket, dispose };
    }

    const x = (id) => useWorkspaceStore.getState().rfNodes.find((item) => item.id === id).position.x;
    const sentPreviews = (socket) => socket.sent.filter((item) => item.event === "canvas:preview");
    const drag = (id, at) => useWorkspaceStore.getState().onNodeDrag({ type: "mousemove" }, node(id, at), [node(id, at)]);
    const preview = (socket, id, at, by = OTHER) => socket.fire("canvas:preview", {
      projectId: PROJECT,
      by,
      nodes: [{ id, position: { x: at, y: 20 } }],
    });
    const remote = (socket, version, op) => socket.fire("canvas:ops", { projectId: PROJECT, version, ops: [op], by: OTHER });
    const startRecovery = (socket) => remote(socket, 9, { type: "node.add", node: node("gap") });

    it("1. a drag sample carries only id and position", async () => {
      const { socket } = await joined();
      useWorkspaceStore.getState().onNodeDrag({ type: "mousemove" }, node("n1"), [
        { ...node("n1", 77), selected: true, dragging: true, measured: { width: 160, height: 80 } },
      ]);
      assert.deepEqual(sentPreviews(socket), [{
        event: "canvas:preview",
        volatile: true,
        payload: { projectId: PROJECT, nodes: [{ id: "n1", position: { x: 77, y: 20 } }] },
      }]);
    });

    it("2. a gesture over 50 nodes sends nothing, and 50 sends", async () => {
      const nodes = Array.from({ length: 51 }, (_, index) => node(`n${index}`, index));
      const { socket } = await joined({ nodes });
      useWorkspaceStore.getState().onNodeDrag({}, nodes[0], nodes);
      assert.equal(sentPreviews(socket).length, 0);
      useWorkspaceStore.getState().onNodeDrag({}, nodes[0], nodes.slice(0, 50));
      assert.equal(sentPreviews(socket).length, 1);
    });

    it("3. a viewer sends nothing", async () => {
      const { socket } = await joined({ role: "viewer" });
      drag("n1", 70);
      assert.equal(sentPreviews(socket).length, 0);
    });

    it("4. a commit cancels the pending trailing sample", async () => {
      await withClock(async (clock) => {
        const { socket } = await joined();
        drag("n1", 70);
        drag("n1", 71);
        assert.equal(sentPreviews(socket).length, 1);
        useWorkspaceStore.getState().commitNodePositions([{ id: "n1", position: { x: 71, y: 20 } }]);
        clock.advance(60);
        assert.equal(sentPreviews(socket).length, 1);
        assert.equal(socket.sent.filter((item) => item.event === "canvas:commit").length, 1);
      });
    });

    it("5. a newer sample restarts the 3 second timer", async () => {
      await withClock(async (clock) => {
        const { socket } = await joined();
        preview(socket, "n1", 500);
        assert.equal(x("n1"), 500);
        clock.advance(2999);
        preview(socket, "n1", 600);
        clock.advance(2999);
        assert.equal(x("n1"), 600);
      });
    });

    it("6. an expired preview returns to canonical and changes no canvas state", async () => {
      await withClock(async (clock) => {
        const { socket } = await joined();
        preview(socket, "n1", 500);
        clock.advance(2999);
        assert.equal(x("n1"), 500);
        clock.advance(1);
        assert.equal(x("n1"), 10);
        const state = useWorkspaceStore.getState();
        assert.equal(state.canvas.version, 4);
        assert.equal(state.canvas.nodes[0].position.x, 10);
      });
    });

    it("7 and 8. a remote label keeps overlays, a remote move clears only its own", async () => {
      const { socket } = await joined();
      preview(socket, "n1", 500);
      preview(socket, "n2", 700);
      remote(socket, 5, { type: "node.update", id: "n1", patch: { data: { label: "New" } } });
      assert.equal(useWorkspaceStore.getState().rfNodes[0].data.label, "New");
      assert.equal(x("n1"), 500);
      assert.equal(x("n2"), 700);
      remote(socket, 6, { type: "node.update", id: "n1", patch: { position: { x: 42, y: 20 } } });
      assert.equal(x("n1"), 42);
      assert.equal(x("n2"), 700);
    });

    it("9. a local label edit keeps another node's overlay", async () => {
      const { socket } = await joined();
      preview(socket, "n2", 700);
      useWorkspaceStore.getState().setNodeLabel("n1", "New");
      assert.equal(x("n2"), 700);
    });

    it("10. a local move clears that node's overlay", async () => {
      const { socket } = await joined();
      preview(socket, "n2", 700);
      useWorkspaceStore.getState().commitNodePositions([{ id: "n2", position: { x: 11, y: 20 } }]);
      assert.equal(x("n2"), 11);
    });

    it("11. a refused resize keeps another node's overlay", async () => {
      const { socket } = await joined();
      preview(socket, "n2", 700);
      useWorkspaceStore.getState().commitNodeResize("missing", {});
      assert.equal(x("n2"), 700);
    });

    it("12. recovery clears overlays", async () => {
      const { socket } = await joined();
      preview(socket, "n2", 700);
      startRecovery(socket);
      assert.equal(useWorkspaceStore.getState().syncStatus, "syncing");
      assert.equal(x("n2"), 300);
    });

    it("13. recovery drops the pending trailing sample", async () => {
      await withClock(async (clock) => {
        const { socket } = await joined();
        drag("n1", 70);
        drag("n1", 71);
        startRecovery(socket);
        clock.advance(60);
        assert.equal(sentPreviews(socket).length, 1);
      });
    });

    it("14. a preview during recovery is ignored", async () => {
      const { socket } = await joined();
      startRecovery(socket);
      preview(socket, "n1", 500);
      assert.equal(x("n1"), 10);
    });

    it("15. a preview under an old connection id or on a dead socket is ignored", async () => {
      const { socket } = await joined();
      socket.id = "sock-replaced";
      preview(socket, "n1", 500);
      assert.equal(x("n1"), 10);
      socket.id = "sock-1";
      socket.connected = false;
      preview(socket, "n1", 500);
      assert.equal(x("n1"), 10);
    });

    it("16. a retry and fresh join drop the overlay", async () => {
      const { socket } = await joined();
      preview(socket, "n1", 500);
      assert.equal(x("n1"), 500);
      useWorkspaceStore.getState().retryWorkspace();
      await settle();
      await settle();
      assert.equal(useWorkspaceStore.getState().status, "ready");
      assert.equal(x("n1"), 10);
    });

    it("17. disconnect and dispose cancel the expiry timers", async () => {
      await withClock(async (clock) => {
        const first = await joined();
        preview(first.socket, "n1", 500);
        assert.equal(clock.pending(), 1);
        first.socket.connected = false;
        first.socket.fire("disconnect");
        assert.equal(clock.pending(), 0);
        assert.deepEqual(useWorkspaceStore.getState().rfNodes, []);
        first.dispose();

        const second = await joined();
        preview(second.socket, "n1", 500);
        assert.equal(clock.pending(), 1);
        second.dispose();
        assert.equal(clock.pending(), 0);
      });
    });

    it("18. a preview from the signed-in user still applies, for their other tab", async () => {
      const { socket } = await joined();
      preview(socket, "n1", 500, SELF);
      assert.equal(x("n1"), 500);
    });
  });
});