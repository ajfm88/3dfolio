import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { createServer } from "vite";

process.env.VITE_API_URL ||= "http://127.0.0.1:3000/api";

const PROJECT = "64b0000000000000000000aa";
const OTHER_PROJECT = "64b0000000000000000000bb";
const SELF = "64b0000000000000000000a1";
const ADA = "64b000000000000000000010";
const GRACE = "64b000000000000000000011";

function node(id) {
  return {
    id,
    type: "shape",
    position: { x: 10, y: 20 },
    width: 160,
    height: 80,
    data: { shape: "rectangle", label: "Saved", color: "#1F1F1F", textColor: "#EDEDED" },
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
  return new Promise((resolve) => setImmediate(resolve));
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
    volatile: {
      emit(event, payload) {
        socket.sent.push({ event, payload, volatile: true });
      },
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
    disconnect() {
      this.connected = false;
    },
  };
  return socket;
}

function joinBody(participants, projectId = PROJECT) {
  return {
    ok: true,
    project: { _id: projectId, name: "Design", description: "Notes" },
    role: "editor",
    canvas: { nodes: [node("n1")], edges: [], version: 4 },
    participants,
    turn: null,
    serverNow: 1,
  };
}

function person(userId, fullName, role, img = "") {
  return { userId, fullName, img, role };
}

const CURSOR = new Set(["cursor:move", "cursor:leave"]);
const cursorSends = (socket) => socket.sent.filter((s) => s.event === "cursor:move");

// Faithful fake clock: timer ids start at 0, clearTimeout really cancels, and
// callbacks only run when time is advanced.
function createFakeClock() {
  const timers = new Map();
  let nextId = 0;
  let now = 1000;
  let saved = null;
  const clock = {
    install() {
      saved = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now };
      globalThis.setTimeout = (fn, delay = 0) => {
        const id = nextId++;
        timers.set(id, { fn, at: now + delay, delay });
        return id;
      };
      globalThis.clearTimeout = (id) => { timers.delete(id); };
      Date.now = () => now;
    },
    uninstall() {
      if (!saved) return;
      globalThis.setTimeout = saved.setTimeout;
      globalThis.clearTimeout = saved.clearTimeout;
      Date.now = saved.now;
      saved = null;
      timers.clear();
    },
    pending: (delay) => [...timers.values()].filter((t) => delay === undefined || t.delay === delay).length,
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].fn();
      }
      now = end;
    },
  };
  return clock;
}

describe("cursorPresence", () => {
  const clock = createFakeClock();
  beforeEach(() => clock.install());
  afterEach(() => clock.uninstall());

  let vite;
  let useWorkspaceStore;
  let useSessionStore;
  let throttleModule;
  let cursorPresenceModule;
  let canvasOpsModule;
  let userColorModule;
  let PresenceCursorsView;
  let createElement;
  let renderToStaticMarkup;
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
    const sessionMod = await vite.ssrLoadModule("/src/collaborate/store/useSessionStore.js");
    throttleModule = await vite.ssrLoadModule("/src/collaborate/lib/throttle.js");
    cursorPresenceModule = await vite.ssrLoadModule("/src/collaborate/lib/cursorPresence.js");
    canvasOpsModule = await vite.ssrLoadModule("/server/src/shared/canvasOps.js");
    userColorModule = await vite.ssrLoadModule("/src/collaborate/lib/userColor.js");
    PresenceCursorsView = (await vite.ssrLoadModule("/src/collaborate/components/canvas/PresenceCursors.jsx")).PresenceCursorsView;
    const renderMod = await vite.ssrLoadModule("/test/ssrRender.js");
    createElement = renderMod.createElement;
    renderToStaticMarkup = renderMod.renderToStaticMarkup;
    toastMod = await import("react-toastify");
    errors = [];
    successes = [];
    originalError = toastMod.toast.error;
    originalSuccess = toastMod.toast.success;
    toastMod.toast.error = (message) => { errors.push(message); };
    toastMod.toast.success = (message) => { successes.push(message); };
    useWorkspaceStore = storeMod.useWorkspaceStore;
    useSessionStore = sessionMod.useSessionStore;
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
    useSessionStore.setState({ authUser: { _id: SELF } });
  }

  function beginJoin(socket, projectId = PROJECT) {
    const gate = defer();
    socket.handler = (event) => {
      if (event !== "workspace:join") return Promise.resolve({ ok: false, message: "unexpected" });
      return gate.promise;
    };
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, projectId);
    return { dispose, gate };
  }

  async function finishJoin(gate, participants, projectId = PROJECT) {
    gate.resolve(joinBody(participants, projectId));
    await settle();
    await settle();
  }

  describe("validateCursorMove", () => {
    it("accepts valid position", () => {
      const { validateCursorMove } = cursorPresenceModule;
      const { POSITION_MAX } = canvasOpsModule;
      const result = validateCursorMove({ projectId: PROJECT, x: 100, y: 200 });
      assert.ok(result);
      assert.equal(result.projectId, PROJECT);
      assert.equal(result.x, 100);
      assert.equal(result.y, 200);
    });

    it("canonicalizes project id", () => {
      const { validateCursorMove } = cursorPresenceModule;
      const result = validateCursorMove({ projectId: PROJECT.toUpperCase(), x: 10, y: 20 });
      assert.ok(result);
      assert.equal(result.projectId, PROJECT);
    });

    it("rejects invalid project id", () => {
      const { validateCursorMove } = cursorPresenceModule;
      assert.equal(validateCursorMove({ projectId: "not-an-id", x: 10, y: 20 }), null);
    });

    it("rejects non-finite x", () => {
      const { validateCursorMove } = cursorPresenceModule;
      assert.equal(validateCursorMove({ projectId: PROJECT, x: NaN, y: 20 }), null);
      assert.equal(validateCursorMove({ projectId: PROJECT, x: Infinity, y: 20 }), null);
      assert.equal(validateCursorMove({ projectId: PROJECT, x: -Infinity, y: 20 }), null);
    });

    it("rejects non-finite y", () => {
      const { validateCursorMove } = cursorPresenceModule;
      assert.equal(validateCursorMove({ projectId: PROJECT, x: 10, y: NaN }), null);
    });

    it("rejects out of bounds", () => {
      const { validateCursorMove } = cursorPresenceModule;
      const { POSITION_MAX } = canvasOpsModule;
      assert.equal(validateCursorMove({ projectId: PROJECT, x: POSITION_MAX + 1, y: 0 }), null);
      assert.equal(validateCursorMove({ projectId: PROJECT, x: -POSITION_MAX - 1, y: 0 }), null);
    });

    it("rejects non-numeric coordinates", () => {
      const { validateCursorMove } = cursorPresenceModule;
      assert.equal(validateCursorMove({ projectId: PROJECT, x: "100", y: 200 }), null);
      assert.equal(validateCursorMove({ projectId: PROJECT, x: null, y: 200 }), null);
      assert.equal(validateCursorMove({ projectId: PROJECT, x: [100], y: 200 }), null);
    });

    it("rejects null and non-record", () => {
      const { validateCursorMove } = cursorPresenceModule;
      assert.equal(validateCursorMove(null), null);
      assert.equal(validateCursorMove("string"), null);
      assert.equal(validateCursorMove(123), null);
    });
  });

  describe("validateCursorLeave", () => {
    it("accepts valid project id", () => {
      const { validateCursorLeave } = cursorPresenceModule;
      const result = validateCursorLeave({ projectId: PROJECT });
      assert.ok(result);
      assert.equal(result.projectId, PROJECT);
    });

    it("rejects invalid project id", () => {
      const { validateCursorLeave } = cursorPresenceModule;
      assert.equal(validateCursorLeave({ projectId: "bad" }), null);
    });

    it("rejects null", () => {
      const { validateCursorLeave } = cursorPresenceModule;
      assert.equal(validateCursorLeave(null), null);
    });
  });

  describe("overlay projection", () => {
    // React Flow's flowToScreenPosition returns flow * zoom + pan plus the flow
    // container's client rect. This models it so the helper is checked against
    // the library's real contract rather than a re-derived formula.
    const rfFlowToClient = (flow, viewport, flowRect) => ({
      x: flow.x * viewport.zoom + viewport.x + flowRect.left,
      y: flow.y * viewport.zoom + viewport.y + flowRect.top,
    });

    it("subtracts the overlay rect exactly once", () => {
      const { clientToOverlayPosition } = cursorPresenceModule;
      assert.deepEqual(
        clientToOverlayPosition({ x: 120, y: 156 }, { left: 20, top: 56 }),
        { x: 100, y: 100 },
      );
    });

    it("places flow (100,100) at local (100,100) below a navbar when the containers coincide", () => {
      const { clientToOverlayPosition } = cursorPresenceModule;
      const rect = { left: 20, top: 56 };
      const client = rfFlowToClient({ x: 100, y: 100 }, { x: 0, y: 0, zoom: 1 }, rect);
      assert.deepEqual(clientToOverlayPosition(client, rect), { x: 100, y: 100 });
    });

    it("holds at zoom 0.2, 1 and 2 with nonzero pan and offsets", () => {
      const { clientToOverlayPosition } = cursorPresenceModule;
      const rect = { left: 37, top: 64 };
      for (const zoom of [0.2, 1, 2]) {
        const viewport = { x: -45, y: 30, zoom };
        const flow = { x: 250, y: -120 };
        const local = clientToOverlayPosition(rfFlowToClient(flow, viewport, rect), rect);
        assert.ok(Math.abs(local.x - (flow.x * zoom + viewport.x)) < 1e-9);
        assert.ok(Math.abs(local.y - (flow.y * zoom + viewport.y)) < 1e-9);
      }
    });

    it("sender and receiver viewports project the same flow point to their own local points", () => {
      const { clientToOverlayPosition } = cursorPresenceModule;
      const flow = { x: 400, y: 300 };
      const senderRect = { left: 0, top: 56 };
      const receiverRect = { left: 80, top: 100 };
      const senderViewport = { x: 10, y: 20, zoom: 1 };
      const receiverViewport = { x: -200, y: 50, zoom: 0.5 };
      const senderLocal = clientToOverlayPosition(rfFlowToClient(flow, senderViewport, senderRect), senderRect);
      const receiverLocal = clientToOverlayPosition(rfFlowToClient(flow, receiverViewport, receiverRect), receiverRect);
      assert.deepEqual(senderLocal, { x: 410, y: 320 });
      assert.deepEqual(receiverLocal, { x: 0, y: 200 });
    });

    it("reprojects when the viewport changes with no new network event", () => {
      const { clientToOverlayPosition } = cursorPresenceModule;
      const rect = { left: 10, top: 10 };
      const flow = { x: 100, y: 100 };
      const before = clientToOverlayPosition(rfFlowToClient(flow, { x: 0, y: 0, zoom: 1 }, rect), rect);
      const after = clientToOverlayPosition(rfFlowToClient(flow, { x: 50, y: 0, zoom: 2 }, rect), rect);
      assert.notDeepEqual(before, after);
      assert.deepEqual(after, { x: 250, y: 200 });
    });

    it("rejects non-finite points and rects", () => {
      const { clientToOverlayPosition } = cursorPresenceModule;
      assert.equal(clientToOverlayPosition(null, { left: 0, top: 0 }), null);
      assert.equal(clientToOverlayPosition({ x: NaN, y: 0 }, { left: 0, top: 0 }), null);
      assert.equal(clientToOverlayPosition({ x: 0, y: 0 }, null), null);
    });
  });

  describe("pointer target filtering and wrapper callbacks", () => {
    function el(tag, parent = null, attrs = {}) {
      const node = {
        tag, parent, attrs, isContentEditable: attrs.contenteditable === "true",
        contains(other) {
          for (let n = other; n; n = n.parent) if (n === node) return true;
          return false;
        },
        closest(selector) {
          const parts = selector.split(",");
          for (let n = node; n; n = n.parent) {
            for (const part of parts) {
              const cls = /^\.([\w-]+)$/.exec(part);
              if (cls) {
                if ((n.attrs.class ?? "").split(/\s+/).includes(cls[1])) return n;
                continue;
              }
              const m = /^(\w+)?(?:\[([\w-]+)(?:='([^']*)')?\])?$/.exec(part);
              if (!m) continue;
              const [, t, attr, value] = m;
              if (t && n.tag !== t) continue;
              if (attr && !(attr in n.attrs)) continue;
              if (attr && value !== undefined && n.attrs[attr] !== value) continue;
              return n;
            }
          }
          return null;
        },
      };
      return node;
    }

    it("blocks nested icons in buttons, panel chrome, and editable descendants", () => {
      const { isCursorBlockedTarget } = cursorPresenceModule;
      const wrapper = el("div");
      const button = el("button", wrapper);
      assert.equal(isCursorBlockedTarget(el("path", el("svg", button))), true);
      const panel = el("div", wrapper, { "data-collab-chrome": "" });
      assert.equal(isCursorBlockedTarget(panel), true);
      assert.equal(isCursorBlockedTarget(el("span", el("div", wrapper, { role: "toolbar" }))), true);
      assert.equal(isCursorBlockedTarget(el("input", wrapper)), true);
      assert.equal(isCursorBlockedTarget(el("span", el("div", wrapper, { contenteditable: "true" }))), true);
      assert.equal(isCursorBlockedTarget(el("textarea", wrapper)), true);
    });

    it("blocks the color toolbar's padding and gaps, not only its buttons", () => {
      const { isCursorBlockedTarget } = cursorPresenceModule;
      const wrapper = el("div");
      const outer = el("div", wrapper, { class: "react-flow__node-toolbar nopan nodrag" });
      const group = el("div", outer, { role: "group", class: "collab-color-toolbar nopan flex gap-1 p-1" });
      assert.equal(isCursorBlockedTarget(group), true, "padding and gaps");
      assert.equal(isCursorBlockedTarget(outer), true, "outer toolbar wrapper");
      assert.equal(isCursorBlockedTarget(el("span", group)), true);
    });

    it("does not block pane, node or edge targets", () => {
      const { isCursorBlockedTarget } = cursorPresenceModule;
      const wrapper = el("div");
      assert.equal(isCursorBlockedTarget(el("div", wrapper, { class: "react-flow__pane" })), false);
      assert.equal(isCursorBlockedTarget(el("span", el("div", wrapper, { class: "react-flow__node" }))), false);
      assert.equal(isCursorBlockedTarget(el("path", el("svg", wrapper))), false);
      assert.equal(isCursorBlockedTarget(null), false);
    });

    function harness() {
      const wrapper = el("div");
      const log = [];
      const handlers = cursorPresenceModule.createCursorPointerHandlers({
        screenToFlowPosition: (point, options) => {
          log.push(["convert", point, options]);
          return { x: point.x + 1, y: point.y + 2 };
        },
        moveCursor: (point) => log.push(["move", point]),
        leaveCursor: () => log.push(["leave"]),
        getWrapper: () => wrapper,
      });
      return { wrapper, log, handlers };
    }

    it("pane, node and edge movement converts without snapping and publishes the converted point", () => {
      const { wrapper, log, handlers } = harness();
      for (const target of [
        el("div", wrapper, { class: "react-flow__pane" }),
        el("span", el("div", wrapper, { class: "react-flow__node" })),
        el("path", el("svg", wrapper, { class: "react-flow__edge" })),
      ]) {
        log.length = 0;
        handlers.onPointerMove({ pointerType: "mouse", target, clientX: 10, clientY: 20 });
        assert.deepEqual(log, [
          ["convert", { x: 10, y: 20 }, { snapToGrid: false }],
          ["move", { x: 11, y: 22 }],
        ]);
      }
    });

    it("movement over chrome, editable descendants or outside the wrapper clears the cursor", () => {
      const { wrapper, log, handlers } = harness();
      const icon = el("path", el("svg", el("button", wrapper)));
      handlers.onPointerMove({ pointerType: "mouse", target: icon, clientX: 1, clientY: 1 });
      handlers.onPointerMove({ pointerType: "mouse", target: el("input", wrapper), clientX: 1, clientY: 1 });
      handlers.onPointerMove({ pointerType: "mouse", target: el("div"), clientX: 1, clientY: 1 });
      assert.deepEqual(log, [["leave"], ["leave"], ["leave"]]);
    });

    it("ignores touch input entirely and leaves only on a real exit", () => {
      const { wrapper, log, handlers } = harness();
      const target = el("div", wrapper);
      handlers.onPointerMove({ pointerType: "touch", target, clientX: 1, clientY: 1 });
      handlers.onPointerLeave({ pointerType: "touch", relatedTarget: null });
      handlers.onPointerCancel({ pointerType: "touch" });
      assert.deepEqual(log, []);
      handlers.onPointerLeave({ pointerType: "mouse", relatedTarget: el("div", wrapper) });
      assert.deepEqual(log, []);
      handlers.onPointerLeave({ pointerType: "mouse", relatedTarget: el("div") });
      handlers.onPointerCancel({ pointerType: "mouse" });
      assert.deepEqual(log, [["leave"], ["leave"]]);
    });
  });

  describe("userColor", () => {
    it("matches fixed hash vectors", () => {
      const { userColor } = userColorModule;
      assert.equal(userColor("64b0000000000000000000aa"), "#FFEAA7");
      assert.equal(userColor("64b000000000000000000010"), "#96CEB4");
      assert.equal(userColor("64b000000000000000000011"), "#FFEAA7");
    });

    it("is case-insensitive for valid ids", () => {
      const { userColor } = userColorModule;
      assert.equal(userColor("64B0000000000000000000AA"), userColor("64b0000000000000000000aa"));
    });

    it("falls back to the first palette color for invalid input", () => {
      const { userColor } = userColorModule;
      for (const bad of ["not-an-id", "", "64b0", null, undefined, 5, {}]) {
        assert.equal(userColor(bad), "#FF6B6B");
      }
    });
  });

  describe("throttle", () => {
    // A queued clock whose clearTimeout really cancels, and whose callbacks
    // only run when time is advanced.
    function queuedClock(start = 0) {
      const timers = new Map();
      let nextId = 0;
      const clock = {
        t: start,
        now: () => clock.t,
        setTimeout: (fn, delay) => {
          const id = nextId++;
          timers.set(id, { fn, at: clock.t + delay });
          return id;
        },
        clearTimeout: (id) => { timers.delete(id); },
        pending: () => timers.size,
        advance(ms) {
          const end = clock.t + ms;
          for (;;) {
            const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!due) break;
            timers.delete(due[0]);
            clock.t = Math.max(clock.t, due[1].at);
            due[1].fn();
          }
          clock.t = end;
        },
      };
      return clock;
    }

    it("emits the first call immediately at clock 0 and schedules nothing", () => {
      const { throttle } = throttleModule;
      const clock = queuedClock(0);
      const calls = [];
      const fn = throttle((v) => calls.push(v), 50, clock);
      fn("a");
      assert.deepEqual(calls, ["a"]);
      assert.equal(clock.pending(), 0);
    });

    it("collapses calls inside the window to the latest and runs one trailing call", () => {
      const { throttle } = throttleModule;
      const clock = queuedClock(1000);
      const calls = [];
      const fn = throttle((v) => calls.push(v), 50, clock);
      fn("first");
      fn("second");
      fn("third");
      assert.deepEqual(calls, ["first"]);
      assert.equal(clock.pending(), 1);
      clock.advance(49);
      assert.deepEqual(calls, ["first"]);
      clock.advance(1);
      assert.deepEqual(calls, ["first", "third"]);
    });

    it("treats timer id 0 as a real timer and cancels it", () => {
      const { throttle } = throttleModule;
      const clock = queuedClock(1000);
      const calls = [];
      const fn = throttle((v) => calls.push(v), 50, clock);
      fn("a");
      fn("b");
      assert.equal(clock.pending(), 1);
      fn.cancel();
      assert.equal(clock.pending(), 0);
      clock.advance(500);
      assert.deepEqual(calls, ["a"]);
      fn("c");
      assert.deepEqual(calls, ["a", "c"]);
    });

    it("keeps at least 50ms between every emission, including after a trailing emit", () => {
      const { throttle } = throttleModule;
      const clock = queuedClock(1000);
      const times = [];
      const fn = throttle(() => times.push(clock.t), 50, clock);
      fn();
      clock.advance(20);
      fn();
      clock.advance(40);
      fn();
      clock.advance(10);
      fn();
      clock.advance(200);
      fn();
      for (let i = 1; i < times.length; i += 1) {
        assert.ok(times[i] - times[i - 1] >= 50, `gap ${times[i] - times[i - 1]} at ${i}`);
      }
      assert.ok(times.length >= 4);
    });
  });

  describe("cursorExpiryController", () => {
    function expiryClock() {
      const timers = new Map();
      let nextId = 0;
      return {
        timers,
        now: () => 0,
        setTimeout: (fn, delay) => {
          const id = nextId++;
          timers.set(id, { fn, delay });
          return id;
        },
        clearTimeout: (id) => { timers.delete(id); },
      };
    }

    it("expires after the scheduled delay of 10000ms", () => {
      const { createCursorExpiryController } = cursorPresenceModule;
      const clock = expiryClock();
      const expired = [];
      const controller = createCursorExpiryController((id) => expired.push(id), clock);
      controller.scheduleExpiry("u1");
      const [[, timer]] = [...clock.timers.entries()];
      assert.equal(timer.delay, 10000);
      timer.fn();
      assert.deepEqual(expired, ["u1"]);
      assert.equal(controller.pendingCount(), 0);
    });

    it("cancels a first timer with id 0 on refresh and on leave", () => {
      const { createCursorExpiryController } = cursorPresenceModule;
      const clock = expiryClock();
      const controller = createCursorExpiryController(() => {}, clock);
      controller.scheduleExpiry("u1");
      assert.ok(clock.timers.has(0));
      controller.scheduleExpiry("u1");
      assert.equal(clock.timers.has(0), false, "refresh cancels id 0");
      assert.equal(clock.timers.size, 1);
      controller.cancelExpiry("u1");
      assert.equal(clock.timers.size, 0, "leave cancels the refreshed timer");
    });

    it("ignores a superseded callback that is invoked after refresh", () => {
      const { createCursorExpiryController } = cursorPresenceModule;
      const clock = expiryClock();
      const expired = [];
      const controller = createCursorExpiryController((id) => expired.push(id), clock);
      controller.scheduleExpiry("u1");
      const oldCallback = clock.timers.get(0).fn;
      controller.scheduleExpiry("u1");
      oldCallback();
      assert.deepEqual(expired, [], "old callback must not expire the newer point");
      assert.equal(controller.has("u1"), true, "newer entry survives");
      const [[, current]] = [...clock.timers.entries()];
      current.fn();
      assert.deepEqual(expired, ["u1"]);
    });

    it("ignores a callback after cancel, clearAll or dispose", () => {
      const { createCursorExpiryController } = cursorPresenceModule;
      const clock = expiryClock();
      const expired = [];
      const controller = createCursorExpiryController((id) => expired.push(id), clock);
      controller.scheduleExpiry("a");
      const a = clock.timers.get(0).fn;
      controller.cancelExpiry("a");
      a();
      controller.scheduleExpiry("b");
      const b = [...clock.timers.values()][0].fn;
      controller.clearAll();
      assert.equal(clock.timers.size, 0);
      b();
      controller.scheduleExpiry("c");
      const c = [...clock.timers.values()][0].fn;
      controller.dispose();
      c();
      controller.scheduleExpiry("d");
      assert.equal(clock.timers.size, 0);
      assert.deepEqual(expired, []);
    });
  });

  describe("cursor rendering", () => {
    const project = (p) => ({ x: p.x + 100, y: p.y + 100 }); // stand-in for flowToScreenPosition
    const rect = { left: 20, top: 56 };
    const view = (cursors, participants, selfId = SELF) => renderToStaticMarkup(
      createElement(PresenceCursorsView, { cursors, participants, selfId, project, rect }),
    );

    it("renders names as text, falls back for blanks, ignores pointer events and hides self", () => {
      const html = view(
        {
          [GRACE]: { x: 10, y: 20, lastSeen: 1 },
          [ADA]: { x: 30, y: 40, lastSeen: 1 },
          [SELF]: { x: 50, y: 60, lastSeen: 1 },
        },
        [person(GRACE, "  <b>Grace</b>  ", "viewer"), person(ADA, "   ", "editor"), person(SELF, "Me", "owner")],
      );
      assert.ok(html.includes("aria-hidden=\"true\""));
      assert.ok(html.includes("pointer-events-none"));
      assert.ok(html.includes("&lt;b&gt;Grace&lt;/b&gt;"), "name escaped");
      assert.ok(!html.includes("<b>Grace</b>"));
      assert.ok(html.includes("Unknown user"));
      assert.ok(!html.includes(">Me<"), "self never renders");
      assert.ok(html.toLowerCase().includes(userColorModule.userColor(GRACE).toLowerCase()));
    });

    it("anchors the pointer tip at the projected local point and skips unknown users", () => {
      const html = view({ [GRACE]: { x: 10, y: 20, lastSeen: 1 }, "64b0000000000000000000ff": { x: 1, y: 1, lastSeen: 1 } }, [person(GRACE, "Grace", "viewer")]);
      // (10+100)-20 = 90, (20+100)-56 = 64: rect subtracted exactly once.
      assert.ok(html.includes("translate(90px, 64px)"), html);
      assert.equal((html.match(/translate\(/g) ?? []).length, 1);
    });

    it("keeps the overlay container with no cursors", () => {
      const html = view({}, []);
      assert.ok(html.includes("pointer-events-none"));
      assert.ok(html.includes("aria-hidden"));
    });
  });

  describe("actual store: sending", () => {
    async function ready(participants = [person(GRACE, "Grace", "viewer")], id = "sock-send") {
      reset();
      const socket = createSocket(id);
      const binding = beginJoin(socket);
      await finishJoin(binding.gate, participants);
      return { socket, ...binding };
    }

    it("viewer sends a leading point as a volatile event with only flow fields", async () => {
      const { socket, dispose } = await ready();
      useWorkspaceStore.getState().moveCursor({ x: 100.5, y: -20, extra: 1, width: 5 });
      const sent = cursorSends(socket);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].volatile, true);
      assert.deepEqual(sent[0].payload, { projectId: PROJECT, x: 100.5, y: -20 });
      dispose();
    });

    it("rejects NaN, Infinity, out-of-bounds and non-record points", async () => {
      const { socket, dispose } = await ready();
      const { POSITION_MAX } = canvasOpsModule;
      for (const point of [null, "x", { x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: POSITION_MAX + 1, y: 0 }, { x: "1", y: 1 }]) {
        useWorkspaceStore.getState().moveCursor(point);
      }
      assert.equal(cursorSends(socket).length, 0);
      assert.equal(clock.pending(50), 0);
      dispose();
    });

    it("collapses a window to the latest trailing point and spaces emissions by 50ms", async () => {
      const { socket, dispose } = await ready();
      const move = (x) => useWorkspaceStore.getState().moveCursor({ x, y: 0 });
      move(1);
      move(2);
      move(3);
      assert.deepEqual(cursorSends(socket).map((s) => s.payload.x), [1]);
      assert.equal(clock.pending(50), 1);
      clock.tick(50);
      assert.deepEqual(cursorSends(socket).map((s) => s.payload.x), [1, 3]);
      move(4);
      assert.equal(cursorSends(socket).length, 2, "new call right after a trailing emit waits");
      clock.tick(50);
      assert.deepEqual(cursorSends(socket).map((s) => s.payload.x), [1, 3, 4]);
      dispose();
    });

    it("leave cancels a scheduled trailing point before emitting and is not repeated", async () => {
      const { socket, dispose } = await ready();
      const state = useWorkspaceStore.getState();
      state.moveCursor({ x: 1, y: 1 });
      state.moveCursor({ x: 2, y: 2 });
      assert.equal(clock.pending(50), 1);
      state.leaveCursor();
      assert.equal(clock.pending(50), 0);
      clock.tick(500);
      assert.deepEqual(cursorSends(socket).map((s) => s.payload.x), [1]);
      const leaves = socket.sent.filter((s) => s.event === "cursor:leave");
      assert.equal(leaves.length, 1);
      assert.equal(leaves[0].volatile, true);
      assert.deepEqual(leaves[0].payload, { projectId: PROJECT });
      state.leaveCursor();
      assert.equal(socket.sent.filter((s) => s.event === "cursor:leave").length, 1);
      dispose();
    });

    it("loading blocks movement and leave", async () => {
      reset();
      const socket = createSocket("sock-loading");
      const { dispose, gate } = beginJoin(socket);
      useWorkspaceStore.getState().moveCursor({ x: 1, y: 1 });
      useWorkspaceStore.getState().leaveCursor();
      assert.equal(socket.sent.filter((s) => CURSOR.has(s.event)).length, 0);
      await finishJoin(gate, [person(GRACE, "Grace", "viewer")]);
      useWorkspaceStore.getState().moveCursor({ x: 1, y: 1 });
      assert.equal(cursorSends(socket).length, 1);
      dispose();
    });

    it("leave while a rejoin is loading emits nothing even after a published point", async () => {
      const { socket, dispose } = await ready();
      useWorkspaceStore.getState().moveCursor({ x: 1, y: 1 });
      const rejoin = defer();
      socket.handler = () => rejoin.promise;
      useWorkspaceStore.getState().retryWorkspace();
      assert.equal(useWorkspaceStore.getState().status, "loading");
      useWorkspaceStore.getState().leaveCursor();
      assert.equal(socket.sent.filter((s) => s.event === "cursor:leave").length, 0);
      dispose();
    });

    it("a trailing point is dropped when the workspace fails before the timer fires", async () => {
      const { socket, dispose } = await ready();
      const state = useWorkspaceStore.getState();
      state.moveCursor({ x: 1, y: 1 });
      state.moveCursor({ x: 2, y: 2 });
      useWorkspaceStore.setState({ status: "error" });
      clock.tick(500);
      assert.deepEqual(cursorSends(socket).map((s) => s.payload.x), [1]);
      dispose();
    });

    it("emission re-checks role and project when the timer fires", async () => {
      for (const patch of [{ role: null }, { project: { _id: OTHER_PROJECT, name: "x", description: "" } }]) {
        const { socket, dispose } = await ready(undefined, `sock-recheck-${Object.keys(patch)[0]}`);
        const state = useWorkspaceStore.getState();
        state.moveCursor({ x: 1, y: 1 });
        state.moveCursor({ x: 2, y: 2 });
        useWorkspaceStore.setState(patch);
        clock.tick(500);
        assert.deepEqual(cursorSends(socket).map((s) => s.payload.x), [1]);
        dispose();
      }
    });

    it("old binding work never reaches the replacement binding's socket", async () => {
      const { socket, dispose } = await ready(undefined, "sock-old");
      const state = useWorkspaceStore.getState();
      state.moveCursor({ x: 1, y: 1 });
      state.moveCursor({ x: 2, y: 2 });
      const socket2 = createSocket("sock-new");
      const second = beginJoin(socket2, OTHER_PROJECT);
      await finishJoin(second.gate, [person(GRACE, "Grace", "viewer")], OTHER_PROJECT);
      clock.tick(500);
      assert.deepEqual(cursorSends(socket).map((s) => s.payload.x), [1]);
      assert.equal(cursorSends(socket2).length, 0);
      dispose();
      second.dispose();
    });

    it("disconnect drops a queued point and reconnect does not replay it", async () => {
      const { socket, dispose } = await ready(undefined, "sock-reconnect");
      const state = useWorkspaceStore.getState();
      state.moveCursor({ x: 1, y: 1 });
      state.moveCursor({ x: 2, y: 2 });
      socket.disconnect();
      socket.fire("disconnect");
      assert.equal(clock.pending(50), 0);
      socket.connected = true;
      socket.id = "sock-reconnect-2";
      socket.fire("connect");
      await settle();
      await settle();
      clock.tick(500);
      assert.deepEqual(cursorSends(socket).map((s) => s.payload.x), [1]);
      dispose();
    });

    it("route disposal sends a volatile cursor:leave before workspace:leave when connected", async () => {
      const { socket, dispose } = await ready(undefined, "sock-dispose");
      dispose();
      const tail = socket.sent.filter((s) => s.event === "cursor:leave" || s.event === "workspace:leave");
      assert.deepEqual(tail.map((s) => s.event), ["cursor:leave", "workspace:leave"]);
      assert.equal(tail[0].volatile, true);
      assert.deepEqual(tail[0].payload, { projectId: PROJECT });
    });

    it("route disposal emits no cursor:leave when disconnected or still loading", async () => {
      const { socket, dispose } = await ready(undefined, "sock-dispose-dc");
      socket.disconnect();
      dispose();
      assert.equal(socket.sent.filter((s) => s.event === "cursor:leave").length, 0);

      reset();
      const loading = createSocket("sock-dispose-loading");
      const second = beginJoin(loading);
      second.dispose();
      assert.equal(loading.sent.filter((s) => s.event === "cursor:leave").length, 0);
    });

    it("recovery in a still-ready workspace keeps sending", async () => {
      const { socket, dispose } = await ready(undefined, "sock-recovery-send");
      const syncGate = defer();
      socket.handler = (event) => (event === "canvas:sync" ? syncGate.promise : Promise.resolve({ ok: false }));
      socket.fire("canvas:ops", { projectId: PROJECT, version: 9, ops: [{ type: "node.add", node: node("r") }], by: GRACE });
      await settle();
      assert.equal(useWorkspaceStore.getState().syncStatus, "syncing");
      useWorkspaceStore.getState().moveCursor({ x: 5, y: 5 });
      assert.equal(cursorSends(socket).length, 1);
      syncGate.resolve({ ok: true, canvas: { nodes: [node("kept")], edges: [], version: 9 } });
      await settle();
      dispose();
    });
  });

  describe("actual store: receiving", () => {
    async function ready(participants = [person(GRACE, "Grace", "viewer"), person(ADA, "Ada", "editor")], id = "sock-recv") {
      reset();
      const socket = createSocket(id);
      const binding = beginJoin(socket);
      await finishJoin(binding.gate, participants);
      return { socket, ...binding };
    }
    const move = (userId, x = 100, y = 200, projectId = PROJECT) => ({ projectId, userId, x, y });

    it("accepts a valid move and strips extras", async () => {
      const { socket, dispose } = await ready();
      socket.fire("cursor:move", { ...move(GRACE.toUpperCase()), extra: "x", name: "forged" });
      const entry = useWorkspaceStore.getState().cursors[GRACE];
      assert.deepEqual(Object.keys(entry).sort(), ["lastSeen", "x", "y"]);
      assert.equal(entry.x, 100);
      dispose();
    });

    it("rejects NaN, Infinity, out-of-bounds, strings, bad user ids and non-records", async () => {
      const { socket, dispose } = await ready();
      const { POSITION_MAX } = canvasOpsModule;
      const bad = [
        move(GRACE, NaN, 1), move(GRACE, 1, Infinity), move(GRACE, POSITION_MAX + 1, 1),
        move(GRACE, "1", 1), move("not-an-id", 1, 1), move(5, 1, 1), move("", 1, 1),
        null, [], "x", { projectId: PROJECT, x: 1, y: 1 },
      ];
      for (const payload of bad) socket.fire("cursor:move", payload);
      assert.deepEqual(useWorkspaceStore.getState().cursors, {});
      assert.equal(clock.pending(10000), 0);
      assert.deepEqual(errors, []);
      dispose();
    });

    it("suppresses the signed-in account, including from a second tab and in other case", async () => {
      const { socket, dispose } = await ready([person(SELF, "Me", "owner"), person(GRACE, "Grace", "viewer")]);
      socket.fire("cursor:move", move(SELF));
      socket.fire("cursor:move", move(SELF.toUpperCase()));
      assert.deepEqual(useWorkspaceStore.getState().cursors, {});
      assert.equal(clock.pending(10000), 0);
      socket.fire("cursor:move", move(GRACE));
      assert.ok(useWorkspaceStore.getState().cursors[GRACE]);
      dispose();
    });

    it("ignores unknown users, other projects, and wrong connections", async () => {
      const { socket, dispose } = await ready();
      socket.fire("cursor:move", move("64b0000000000000000000ff"));
      socket.fire("cursor:move", move(GRACE, 1, 1, OTHER_PROJECT));
      assert.deepEqual(useWorkspaceStore.getState().cursors, {});
      const realId = socket.id;
      socket.id = "some-other-connection";
      socket.fire("cursor:move", move(GRACE));
      assert.deepEqual(useWorkspaceStore.getState().cursors, {});
      socket.id = realId;
      socket.connected = false;
      socket.fire("cursor:move", move(GRACE));
      assert.deepEqual(useWorkspaceStore.getState().cursors, {});
      dispose();
    });

    it("ignores movement and leave before the join ack and during error", async () => {
      reset();
      const socket = createSocket("sock-preack");
      const { dispose, gate } = beginJoin(socket);
      socket.fire("cursor:move", move(GRACE));
      socket.fire("cursor:leave", { projectId: PROJECT, userId: GRACE });
      assert.deepEqual(useWorkspaceStore.getState().cursors, {});
      await finishJoin(gate, [person(GRACE, "Grace", "viewer")]);
      assert.deepEqual(useWorkspaceStore.getState().cursors, {});
      socket.fire("cursor:move", move(GRACE));
      assert.ok(useWorkspaceStore.getState().cursors[GRACE]);
      useWorkspaceStore.setState({ status: "loading" });
      useWorkspaceStore.setState({ cursors: { [GRACE]: { x: 1, y: 1, lastSeen: 1 } } });
      socket.fire("cursor:leave", { projectId: PROJECT, userId: GRACE });
      assert.ok(useWorkspaceStore.getState().cursors[GRACE], "leave ignored while not ready");
      dispose();
    });

    it("leave removes a cursor and its timer; malformed and foreign leaves do nothing", async () => {
      const { socket, dispose } = await ready();
      socket.fire("cursor:move", move(GRACE));
      assert.equal(clock.pending(10000), 1);
      socket.fire("cursor:leave", { projectId: OTHER_PROJECT, userId: GRACE });
      socket.fire("cursor:leave", { projectId: PROJECT, userId: "bad" });
      socket.fire("cursor:leave", null);
      assert.ok(useWorkspaceStore.getState().cursors[GRACE]);
      socket.fire("cursor:leave", { projectId: PROJECT, userId: GRACE.toUpperCase() });
      assert.deepEqual(useWorkspaceStore.getState().cursors, {});
      assert.equal(clock.pending(10000), 0);
      dispose();
    });

    it("has one listener per binding and removes the exact functions", async () => {
      const { socket, dispose } = await ready();
      assert.equal(socket.listenerCount("cursor:move"), 1);
      assert.equal(socket.listenerCount("cursor:leave"), 1);
      dispose();
      assert.equal(socket.listenerCount("cursor:move"), 0);
      assert.equal(socket.listenerCount("cursor:leave"), 0);
    });

    it("cursor traffic changes no graph, version, queue, sync, toast or write", async () => {
      const { socket, dispose } = await ready();
      const before = useWorkspaceStore.getState();
      const sentBefore = socket.sent.length;
      socket.fire("cursor:move", move(GRACE));
      socket.fire("cursor:leave", { projectId: PROJECT, userId: GRACE });
      const after = useWorkspaceStore.getState();
      assert.equal(after.canvas, before.canvas);
      assert.equal(after.canvas.version, before.canvas.version);
      assert.equal(socket.sent.length, sentBefore);
      assert.deepEqual(errors, []);
      assert.deepEqual(successes, []);
      dispose();
    });
  });

  describe("actual store: expiry and lifecycle", () => {
    async function ready(participants = [person(GRACE, "Grace", "viewer"), person(ADA, "Ada", "editor")], id = "sock-life") {
      reset();
      const socket = createSocket(id);
      const binding = beginJoin(socket);
      await finishJoin(binding.gate, participants);
      return { socket, ...binding };
    }
    const move = (userId, x = 100, y = 200) => ({ projectId: PROJECT, userId, x, y });
    const presence = (participants) => ({ projectId: PROJECT, participants });
    const cursors = () => useWorkspaceStore.getState().cursors;
    const idle = () => {
      assert.deepEqual(cursors(), {});
      assert.equal(clock.pending(10000), 0, "no expiry timers");
      assert.equal(clock.pending(50), 0, "no throttle timers");
    };

    it("survives 9999ms and disappears from rendered state at 10000ms", async () => {
      const { socket, dispose } = await ready();
      socket.fire("cursor:move", move(GRACE));
      clock.tick(9999);
      assert.ok(cursors()[GRACE]);
      clock.tick(1);
      assert.deepEqual(cursors(), {});
      dispose();
    });

    it("a second move replaces the point and restarts expiry; the old timeout cannot remove it", async () => {
      const { socket, dispose } = await ready();
      socket.fire("cursor:move", move(GRACE, 1, 1));
      clock.tick(6000);
      socket.fire("cursor:move", move(GRACE, 2, 2));
      assert.equal(clock.pending(10000), 1);
      clock.tick(6000);
      assert.equal(cursors()[GRACE].x, 2, "first timeout would have fired at 10000 from the first move");
      clock.tick(3999);
      assert.ok(cursors()[GRACE]);
      clock.tick(1);
      assert.deepEqual(cursors(), {});
      dispose();
    });

    it("presence departure removes the cursor and its timer; a user still present keeps both", async () => {
      const { socket, dispose } = await ready();
      socket.fire("cursor:move", move(GRACE));
      socket.fire("cursor:move", move(ADA, 5, 6));
      assert.equal(clock.pending(10000), 2);
      // Grace's duplicate tab closes: still present, point and timer kept; profile updated.
      socket.fire("presence:update", presence([person(GRACE, "Grace Renamed", "viewer"), person(ADA, "Ada", "editor")]));
      assert.ok(cursors()[GRACE]);
      assert.equal(useWorkspaceStore.getState().participants.find((p) => p.userId === GRACE).fullName, "Grace Renamed");
      assert.equal(clock.pending(10000), 2);
      // Grace's last tab leaves.
      socket.fire("presence:update", presence([person(ADA, "Ada", "editor")]));
      assert.equal(cursors()[GRACE], undefined);
      assert.ok(cursors()[ADA]);
      assert.equal(clock.pending(10000), 1);
      // Rapid rejoin must not redisplay the old point.
      socket.fire("presence:update", presence([person(GRACE, "Grace", "viewer"), person(ADA, "Ada", "editor")]));
      assert.equal(cursors()[GRACE], undefined);
      dispose();
    });

    it("a cursor:leave from one tab clears it even while presence still lists the user", async () => {
      const { socket, dispose } = await ready();
      socket.fire("cursor:move", move(GRACE));
      socket.fire("cursor:leave", { projectId: PROJECT, userId: GRACE });
      assert.equal(cursors()[GRACE], undefined);
      assert.ok(useWorkspaceStore.getState().participants.find((p) => p.userId === GRACE));
      dispose();
    });

    it("disposal and reset clear timers and state", async () => {
      const first = await ready();
      first.socket.fire("cursor:move", move(GRACE));
      useWorkspaceStore.getState().moveCursor({ x: 1, y: 1 });
      useWorkspaceStore.getState().moveCursor({ x: 2, y: 2 });
      first.dispose();
      idle();

      const second = await ready(undefined, "sock-reset");
      second.socket.fire("cursor:move", move(GRACE));
      useWorkspaceStore.getState().resetWorkspace();
      idle();
    });

    it("disconnect clears timers, state and a pending throttle", async () => {
      const { socket, dispose } = await ready();
      socket.fire("cursor:move", move(GRACE));
      useWorkspaceStore.getState().moveCursor({ x: 1, y: 1 });
      useWorkspaceStore.getState().moveCursor({ x: 2, y: 2 });
      socket.disconnect();
      socket.fire("disconnect");
      idle();
      dispose();
    });

    it("retry while disconnected clears timers, state and a pending throttle", async () => {
      const { socket, dispose } = await ready();
      socket.fire("cursor:move", move(GRACE));
      useWorkspaceStore.getState().moveCursor({ x: 1, y: 1 });
      useWorkspaceStore.getState().moveCursor({ x: 2, y: 2 });
      assert.equal(clock.pending(50), 1);
      socket.connected = false;
      useWorkspaceStore.getState().retryWorkspace();
      idle();
      dispose();
    });

    it("a failed join clears everything and a later rejoin starts clean", async () => {
      const { socket, dispose } = await ready();
      socket.fire("cursor:move", move(GRACE));
      useWorkspaceStore.getState().moveCursor({ x: 1, y: 1 });
      useWorkspaceStore.getState().moveCursor({ x: 2, y: 2 });
      socket.handler = () => Promise.resolve({ ok: false, message: "Nope" });
      useWorkspaceStore.getState().retryWorkspace();
      await settle();
      await settle();
      assert.equal(useWorkspaceStore.getState().status, "error");
      idle();
      socket.handler = () => Promise.resolve(joinBody([person(GRACE, "Grace", "viewer")]));
      useWorkspaceStore.getState().retryWorkspace();
      await settle();
      await settle();
      assert.equal(useWorkspaceStore.getState().status, "ready");
      clock.tick(20000);
      assert.deepEqual(cursors(), {});
      socket.fire("cursor:move", move(GRACE, 7, 8));
      assert.equal(cursors()[GRACE].x, 7);
      dispose();
    });

    async function failSync(body) {
      const { socket, dispose } = await ready();
      socket.fire("cursor:move", move(GRACE));
      useWorkspaceStore.getState().moveCursor({ x: 1, y: 1 });
      useWorkspaceStore.getState().moveCursor({ x: 2, y: 2 });
      assert.equal(clock.pending(10000), 1);
      assert.equal(clock.pending(50), 1);
      socket.handler = (event) => (event === "canvas:sync" ? Promise.resolve(body) : Promise.resolve({ ok: false }));
      socket.fire("canvas:ops", { projectId: PROJECT, version: 9, ops: [{ type: "node.add", node: node("r") }], by: GRACE });
      await settle();
      await settle();
      return { socket, dispose };
    }

    it("a sync failure (error) reached through the sync helper clears timers and state", async () => {
      const { socket, dispose } = await failSync({ ok: true, canvas: "malformed" });
      assert.equal(useWorkspaceStore.getState().status, "error");
      idle();
      clock.tick(20000);
      assert.equal(cursorSends(socket).filter((s) => s.payload.x === 2).length, 0);
      dispose();
    });

    it("a sync notFound clears timers and state", async () => {
      const { dispose } = await failSync({ ok: false, message: "Project not found" });
      assert.equal(useWorkspaceStore.getState().status, "notFound");
      idle();
      dispose();
    });

    it("canvas-only recovery preserves valid points and timers", async () => {
      const { socket, dispose } = await ready();
      socket.fire("cursor:move", move(GRACE));
      const syncGate = defer();
      socket.handler = (event) => (event === "canvas:sync" ? syncGate.promise : Promise.resolve({ ok: false }));
      socket.fire("canvas:ops", { projectId: PROJECT, version: 9, ops: [{ type: "node.add", node: node("r") }], by: GRACE });
      await settle();
      assert.ok(cursors()[GRACE]);
      socket.fire("cursor:move", move(GRACE, 9, 9));
      assert.equal(cursors()[GRACE].x, 9, "accepted during recovery");
      syncGate.resolve({ ok: true, canvas: { nodes: [node("kept")], edges: [], version: 9 } });
      await settle();
      await settle();
      assert.equal(useWorkspaceStore.getState().status, "ready");
      assert.ok(cursors()[GRACE]);
      assert.equal(clock.pending(10000), 1);
      dispose();
    });
  });
});
