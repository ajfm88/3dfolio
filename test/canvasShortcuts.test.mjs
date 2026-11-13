import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { act, createElement, StrictMode, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

import { applyOps } from "../server/src/shared/canvasOps.js";

const require = createRequire(import.meta.url);

// The store and controls use useSyncExternalStore. Server rendering needs the
// client snapshot, as the other UI suites do.
function useClientSnapshotOnServer() {
  const React = require("react");
  const original = React.useSyncExternalStore;
  if (original.__clientSnapshot) return () => {};
  const patched = (subscribe, getSnapshot) => original(subscribe, getSnapshot, getSnapshot);
  patched.__clientSnapshot = true;
  React.useSyncExternalStore = patched;
  return () => {
    if (React.useSyncExternalStore === patched) React.useSyncExternalStore = original;
  };
}

process.env.VITE_API_URL ||= "http://127.0.0.1:3000/api";

const PROJECT = "64b0000000000000000000aa";
const USER_A = "64b0000000000000000000a1";

// A fake element tree. closest() understands exactly the selectors the
// production code passes. It is not a CSS engine: the limitation is that real
// selector matching and real focus are only exercised in a browser.
function matchesEditable(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  const editable = el.attrs.contenteditable;
  if (editable !== undefined && editable !== "false") return true;
  return el.attrs.role === "textbox";
}

function element(tag, { parent = null, attrs = {} } = {}) {
  const sets = new Map();
  const el = {
    nodeType: 1,
    nodeName: tag.toUpperCase(),
    tagName: tag.toUpperCase(),
    style: {},
    attrs: { ...attrs },
    childNodes: [],
    parentNode: null,
    ownerDocument: null,
    namespaceURI: "http://www.w3.org/1999/xhtml",
    focused: false,
    setAttribute(name, value) { el.attrs[name] = String(value); },
    getAttribute(name) { return Object.hasOwn(el.attrs, name) ? el.attrs[name] : null; },
    removeAttribute(name) { delete el.attrs[name]; },
    focus() { el.focused = true; },
    appendChild(child) { child.parentNode = el; el.childNodes.push(child); return child; },
    removeChild(child) { el.childNodes = el.childNodes.filter((c) => c !== child); child.parentNode = null; return child; },
    insertBefore(child, before) {
      child.parentNode = el;
      const index = el.childNodes.indexOf(before);
      if (index < 0) el.childNodes.push(child); else el.childNodes.splice(index, 0, child);
      return child;
    },
    contains(other) {
      for (let at = other; at; at = at.parentNode) if (at === el) return true;
      return false;
    },
    closest(selector) {
      for (let at = el; at && at.nodeType === 1; at = at.parentNode) {
        if (selector.includes("[role='textbox']") && matchesEditable(at)) return at;
        if (selector === ".react-flow__pane" && String(at.attrs.class ?? "").split(" ").includes("react-flow__pane")) return at;
        if (selector.startsWith("button") && (at.tagName === "BUTTON" || at.tagName === "A" || "data-collab-chrome" in at.attrs)) return at;
      }
      return null;
    },
    addEventListener(type, fn) {
      if (!sets.has(type)) sets.set(type, new Set());
      sets.get(type).add(fn);
    },
    removeEventListener(type, fn) { sets.get(type)?.delete(fn); },
    dispatchEvent(event) {
      for (const fn of [...(sets.get(event.type) ?? [])]) fn(event);
      return true;
    },
    listenerCount(type) { return sets.get(type)?.size ?? 0; },
  };
  if (parent) parent.appendChild(el);
  return el;
}

function keyEvent(target, key, init = {}) {
  const event = {
    type: "keydown",
    key,
    target,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
    keyCode: 0,
    defaultPrevented: false,
    stopped: false,
    composedPath: () => {
      const path = [];
      for (let at = target; at; at = at.parentNode) path.push(at);
      return path;
    },
    preventDefault() { event.defaultPrevented = true; },
    stopPropagation() { event.stopped = true; },
    ...init,
  };
  return event;
}

function defer() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function settleAll() {
  for (let index = 0; index < 4; index += 1) await settle();
}

describe("canvas shortcuts", () => {
  let vite;
  let shortcuts;
  let CanvasControls;
  let ReactFlowProvider;
  let renderToStaticMarkup;
  let useWorkspaceStore;
  let useSessionStore;
  let restoreReact;

  before(async () => {
    restoreReact = useClientSnapshotOnServer();
    vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: "custom",
      logLevel: "error",
    });
    shortcuts = await vite.ssrLoadModule("/src/collaborate/lib/canvasShortcuts.js");
    CanvasControls = (await vite.ssrLoadModule("/src/collaborate/components/canvas/CanvasControls.jsx")).default;
    ({ ReactFlowProvider } = await import("@xyflow/react"));
    ({ renderToStaticMarkup } = await vite.ssrLoadModule("/test/ssrRender.js"));
    useWorkspaceStore = (await vite.ssrLoadModule("/src/collaborate/store/useWorkspaceStore.js")).useWorkspaceStore;
    useSessionStore = (await vite.ssrLoadModule("/src/collaborate/store/useSessionStore.js")).useSessionStore;
  });

  after(async () => {
    useWorkspaceStore?.getState().resetWorkspace();
    restoreReact?.();
    await vite?.close();
  });

  describe("classifyShortcut", () => {
    const cases = [
      [{ key: "z", ctrlKey: true }, "undo"],
      [{ key: "Z", metaKey: true }, "undo"],
      [{ key: "z", ctrlKey: true, shiftKey: true }, "redo"],
      [{ key: "Z", metaKey: true, shiftKey: true }, "redo"],
      [{ key: "y", ctrlKey: true }, "redo"],
      [{ key: "y", metaKey: true }, null],
      [{ key: "y", ctrlKey: true, shiftKey: true }, null],
      [{ key: "z" }, null],
      [{ key: "z", ctrlKey: true, altKey: true }, null],
      [{ key: "z", ctrlKey: true, metaKey: true }, null],
      [{ key: "z", ctrlKey: true, repeat: true }, null],
      [{ key: "z", ctrlKey: true, isComposing: true }, null],
      [{ key: "z", ctrlKey: true, keyCode: 229 }, null],
      [{ key: "z", ctrlKey: true, defaultPrevented: true }, null],
      [{ key: "+" }, "zoomIn"],
      [{ key: "+", shiftKey: true }, "zoomIn"],
      [{ key: "=" }, "zoomIn"],
      [{ key: "-" }, "zoomOut"],
      [{ key: "+", ctrlKey: true }, null],
      [{ key: "=", metaKey: true }, null],
      [{ key: "-", ctrlKey: true }, null],
      [{ key: "-", altKey: true }, null],
      [{ key: "a" }, null],
      [{ key: "Backspace" }, null],
    ];
    for (const [init, expected] of cases) {
      it(`${JSON.stringify(init)} -> ${expected}`, () => {
        assert.equal(shortcuts.classifyShortcut(keyEvent(null, init.key, init)), expected);
      });
    }
  });

  describe("handleCanvasKey", () => {
    function setup() {
      const doc = { activeElement: null };
      const surface = element("div", { attrs: { tabindex: "0" } });
      surface.ownerDocument = doc;
      const calls = [];
      const accept = { undo: true, redo: true };
      const actions = {
        undo: () => { calls.push("undo"); return accept.undo; },
        redo: () => { calls.push("redo"); return accept.redo; },
        zoomIn: () => { calls.push("zoomIn"); return true; },
        zoomOut: () => { calls.push("zoomOut"); return true; },
      };
      return { doc, surface, calls, accept, actions };
    }
    const run = (ctx, event) => shortcuts.handleCanvasKey(event, { surface: ctx.surface, doc: ctx.doc, actions: ctx.actions });

    it("consumes an accepted history command and nothing else", () => {
      const ctx = setup();
      const event = keyEvent(ctx.surface, "z", { ctrlKey: true });
      assert.equal(run(ctx, event), "undo");
      assert.equal(event.defaultPrevented, true);
      assert.equal(event.stopped, true);
    });

    it("does nothing, and leaves the browser default, when the command is unavailable", () => {
      const ctx = setup();
      ctx.accept.undo = false;
      const event = keyEvent(ctx.surface, "z", { ctrlKey: true });
      assert.equal(run(ctx, event), null);
      assert.deepEqual(ctx.calls, ["undo"]);
      assert.equal(event.defaultPrevented, false);
      assert.equal(event.stopped, false);
    });

    it("never calls an action for native browser zoom", () => {
      const ctx = setup();
      for (const key of ["+", "=", "-"]) {
        const event = keyEvent(ctx.surface, key, { ctrlKey: true });
        assert.equal(run(ctx, event), null);
        assert.equal(event.defaultPrevented, false);
        const meta = keyEvent(ctx.surface, key, { metaKey: true });
        assert.equal(run(ctx, meta), null);
      }
      assert.deepEqual(ctx.calls, []);
    });

    it("zooms for any role because zoom does not depend on edit rights", () => {
      const ctx = setup();
      assert.equal(run(ctx, keyEvent(ctx.surface, "+", { shiftKey: true })), "zoomIn");
      assert.equal(run(ctx, keyEvent(ctx.surface, "-")), "zoomOut");
      assert.deepEqual(ctx.calls, ["zoomIn", "zoomOut"]);
    });

    it("skips every kind of editable target and its descendants", () => {
      const ctx = setup();
      const targets = [
        element("input", { parent: ctx.surface, attrs: { type: "text" } }),
        element("input", { parent: ctx.surface, attrs: { type: "number" } }),
        element("textarea", { parent: ctx.surface }),
        element("select", { parent: ctx.surface }),
        element("div", { parent: ctx.surface, attrs: { contenteditable: "" } }),
        element("div", { parent: ctx.surface, attrs: { contenteditable: "true" } }),
        element("div", { parent: ctx.surface, attrs: { role: "textbox" } }),
      ];
      const nested = element("span", { parent: targets[4] });
      for (const target of [...targets, nested]) {
        for (const init of [{ key: "z", ctrlKey: true }, { key: "+" }, { key: "-" }]) {
          const event = keyEvent(target, init.key, init);
          assert.equal(run(ctx, event), null);
          assert.equal(event.defaultPrevented, false);
        }
      }
      assert.deepEqual(ctx.calls, []);
      const plain = element("div", { parent: ctx.surface, attrs: { contenteditable: "false" } });
      assert.equal(run(ctx, keyEvent(plain, "z", { ctrlKey: true })), "undo");
    });

    it("skips when a field holds focus even though the event is retargeted", () => {
      const ctx = setup();
      ctx.doc.activeElement = element("textarea");
      assert.equal(run(ctx, keyEvent(ctx.surface, "z", { ctrlKey: true })), null);
      assert.deepEqual(ctx.calls, []);
    });

    it("ignores events from outside the focused canvas, including portals", () => {
      const ctx = setup();
      const portal = element("div");
      const portaled = element("button", { parent: portal });
      assert.equal(run(ctx, keyEvent(portaled, "z", { ctrlKey: true })), null);
      assert.equal(run(ctx, keyEvent(null, "z", { ctrlKey: true })), null);
      assert.deepEqual(ctx.calls, []);
    });

    it("ignores composition, repeat, Alt, already handled and conflicting chords", () => {
      const ctx = setup();
      const inits = [
        { key: "z", ctrlKey: true, isComposing: true },
        { key: "z", ctrlKey: true, keyCode: 229 },
        { key: "z", ctrlKey: true, repeat: true },
        { key: "z", ctrlKey: true, altKey: true },
        { key: "z", ctrlKey: true, defaultPrevented: true },
        { key: "z", ctrlKey: true, metaKey: true },
      ];
      for (const init of inits) assert.equal(run(ctx, keyEvent(ctx.surface, init.key, init)), null);
      assert.deepEqual(ctx.calls, []);
    });
  });

  describe("shouldFocusCanvas", () => {
    it("focuses on a pane click but never steals from a field or toolbar", () => {
      const doc = { activeElement: null };
      const surface = element("div");
      const pane = element("div", { parent: surface, attrs: { class: "react-flow__pane" } });
      const button = element("button", { parent: surface });
      assert.equal(shortcuts.shouldFocusCanvas({ target: pane }, doc), true);
      assert.equal(shortcuts.shouldFocusCanvas({ target: button }, doc), false);
      assert.equal(shortcuts.shouldFocusCanvas({ target: surface }, doc), false);
      assert.equal(shortcuts.shouldFocusCanvas({ target: pane }, { activeElement: element("textarea") }), false);
      assert.equal(shortcuts.shouldFocusCanvas(null, doc), false);
    });
  });

  describe("attachCanvasShortcuts", () => {
    it("attaches one bubbling keydown listener and removes exactly it", () => {
      const doc = { activeElement: null };
      const surface = element("div");
      surface.ownerDocument = doc;
      let undone = 0;
      const dispose = shortcuts.attachCanvasShortcuts(surface, {
        undo: () => { undone += 1; return true; },
        redo: () => false,
        zoomIn: () => true,
        zoomOut: () => true,
      });
      assert.equal(surface.listenerCount("keydown"), 1);
      surface.dispatchEvent(keyEvent(surface, "z", { ctrlKey: true }));
      assert.equal(undone, 1);
      dispose();
      assert.equal(surface.listenerCount("keydown"), 0);
      surface.dispatchEvent(keyEvent(surface, "z", { ctrlKey: true }));
      assert.equal(undone, 1);
    });
  });

  describe("controls rendering", () => {
    const render = () => renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(CanvasControls)));

    it("renders labelled Undo and Redo as disabled when unavailable", () => {
      useWorkspaceStore.getState().resetWorkspace();
      const html = render();
      assert.match(html, /<button[^>]*aria-label="Undo"[^>]*? disabled=""/);
      assert.match(html, /<button[^>]*aria-label="Redo"[^>]*? disabled=""/);
      assert.match(html, /aria-label="Zoom in"/);
      assert.match(html, /aria-label="Fit to screen"/);
      assert.match(html, /title="Undo/);
      assert.match(html, /role="status"/);
      assert.equal(html.includes("Undoing"), false);
    });

    it("shows the replay status politely", () => {
      useWorkspaceStore.setState({ history: { undo: 1, redo: 0, busy: false, replay: "undo", gesture: false } });
      assert.match(render(), /aria-live="polite"[^>]*>Undoing…</);
      useWorkspaceStore.setState({ history: { undo: 0, redo: 1, busy: false, replay: "redo", gesture: false } });
      assert.match(render(), /Redoing…/);
      useWorkspaceStore.getState().resetWorkspace();
    });
  });

  describe("gesture cancellation", () => {
    function fakeWindow() {
      const sets = new Map();
      return {
        addEventListener(type, fn) { if (!sets.has(type)) sets.set(type, new Set()); sets.get(type).add(fn); },
        removeEventListener(type, fn) { sets.get(type)?.delete(fn); },
        fire(type, event = {}) { for (const fn of [...(sets.get(type) ?? [])]) fn({ type, ...event }); },
        count() { let n = 0; for (const set of sets.values()) n += set.size; return n; },
      };
    }

    it("ends a drag that React Flow aborted on a second touch, without onNodeDragStop", () => {
      const win = fakeWindow();
      let cancels = 0;
      const dispose = shortcuts.attachGestureCancel(win, () => { cancels += 1; });
      // XYDrag aborts when a second finger joins and never reports a stop.
      win.fire("touchend", { touches: [{ id: 1 }] });
      assert.equal(cancels, 0, "a finger is still down, so the interaction is still active");
      win.fire("pointerup", { pointerType: "touch" });
      assert.equal(cancels, 0, "touch pointerup defers to touchend");
      win.fire("touchend", { touches: [] });
      assert.equal(cancels, 1);
      dispose();
      assert.equal(win.count(), 0, "every listener is removed");
    });

    it("ends on pointer cancellation, mouse release, touch cancel and lost focus", () => {
      for (const [type, event] of [
        ["pointercancel", {}],
        ["mouseup", {}],
        ["pointerup", { pointerType: "mouse" }],
        ["touchcancel", { touches: [] }],
        ["blur", {}],
      ]) {
        const win = fakeWindow();
        let cancels = 0;
        shortcuts.attachGestureCancel(win, () => { cancels += 1; });
        win.fire(type, event);
        assert.equal(cancels, 1, type);
      }
    });

    it("wired to the store, re-enables undo only once the interaction is over", async () => {
      const handlers = new Map();
      const sock = {
        id: "g-1",
        connected: true,
        sent: [],
        sendBuffer: [],
        handler: () => Promise.resolve({ ok: false }),
        on(e, f) { if (!handlers.has(e)) handlers.set(e, new Set()); handlers.get(e).add(f); },
        off(e, f) { handlers.get(e)?.delete(f); },
        emit(e, p) { sock.sent.push({ event: e, payload: p }); },
        timeout() {
          return { emitWithAck: (e, p) => { sock.sent.push({ event: e, payload: p, ack: true }); return sock.handler(e, p); } };
        },
      };
      const gate = defer();
      let server = { nodes: [], edges: [], version: 0 };
      useSessionStore.setState({ authUser: { _id: USER_A, fullName: "Ada", img: "" }, socket: sock });
      sock.handler = (event) => (event === "workspace:join" ? gate.promise : Promise.resolve({ ok: false }));
      const dispose = useWorkspaceStore.getState().bindWorkspace(sock, PROJECT);
      const tabId = sock.sent.find((item) => item.event === "workspace:join").payload.tabId;
      gate.resolve({
        ok: true,
        project: { _id: PROJECT, name: "D", description: "" },
        role: "editor",
        canvas: server,
        participants: [],
        turn: { holder: { userId: USER_A, tabId }, holderSince: 1, queue: [], idleDeadline: null, graceUntil: null, serverNow: 1 },
        serverNow: 1,
      });
      await settleAll();
      sock.handler = (event, payload) => {
        const result = applyOps(server, payload.ops);
        server = { nodes: result.canvas.nodes, edges: result.canvas.edges, version: server.version + 1 };
        return Promise.resolve({ ok: true, version: server.version });
      };
      const store = useWorkspaceStore;
      const { selectCanUndo } = await vite.ssrLoadModule("/src/collaborate/store/useWorkspaceStore.js");
      try {
        store.getState().dispatch([{
          type: "node.add",
          node: { id: "a", type: "shape", position: { x: 1, y: 2 }, width: 160, height: 80, data: { shape: "rectangle", label: "A", color: "#1F1F1F", textColor: "#EDEDED" } },
        }]);
        await settleAll();
        const win = fakeWindow();
        const stop = shortcuts.attachGestureCancel(win, () => store.getState().cancelGestures());

        store.getState().beginGesture("drag");
        assert.equal(selectCanUndo(store.getState()), false);
        win.fire("touchend", { touches: [{ id: 2 }] });
        assert.equal(selectCanUndo(store.getState()), false, "still active while a finger is down");
        win.fire("touchend", { touches: [] });
        assert.equal(store.getState().history.gesture, false);
        assert.equal(selectCanUndo(store.getState()), true);
        assert.equal(server.nodes.length, 1, "a cancelled drag dispatches nothing");
        assert.equal(server.version, 1);

        // The normal path is unchanged: stop ends the gesture, then commits.
        store.getState().beginGesture("drag");
        store.getState().endGesture("drag");
        assert.equal(store.getState().commitNodePositions([{ id: "a", position: { x: 50, y: 60 } }]), true);
        await settleAll();
        assert.equal(server.nodes[0].position.x, 50);
        assert.equal(selectCanUndo(store.getState()), true);

        // Disposal clears whatever is still active.
        store.getState().beginGesture("connect");
        assert.equal(store.getState().history.gesture, true);
        dispose();
        assert.equal(store.getState().history.gesture, false);
        stop();
      } finally {
        dispose();
      }
    });
  });

  // The installed XYDrag (and the d3-drag under it) drives these tests. Only the
  // DOM is fake: a target that honours capture, bubble and stopImmediatePropagation
  // in the order a browser uses. A synthetic fire() straight at a fake window
  // bypasses propagation, which is exactly how the first correction missed that
  // d3-drag stops the touchend of a tracked touch before it can bubble.
  describe("gesture cancellation through the installed XYDrag", () => {
    function createTarget() {
      const listeners = [];
      const capturing = (options) => options === true || options?.capture === true;
      return {
        listeners,
        addEventListener(type, fn, options) {
          const capture = capturing(options);
          if (listeners.some((l) => l.type === type && l.fn === fn && l.capture === capture)) return;
          listeners.push({ type, fn, capture });
        },
        removeEventListener(type, fn, options) {
          const capture = capturing(options);
          const index = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture);
          if (index >= 0) listeners.splice(index, 1);
        },
      };
    }

    function createTouchEnv() {
      const win = createTarget();
      const el = createTarget();
      el.parentNode = { getBoundingClientRect: () => ({ left: 0, top: 0 }), clientLeft: 0, clientTop: 0 };
      el.getBoundingClientRect = () => ({ left: 0, top: 0 });
      el.clientLeft = 0;
      el.clientTop = 0;
      el.style = { setProperty() {} };
      el.ontouchstart = null;
      el.hasAttribute = () => false;
      el.closest = () => null;
      const run = (target, event, capture) => {
        for (const l of [...target.listeners]) {
          if (event.immediateStopped) return;
          if (l.type !== event.type || l.capture !== capture) continue;
          event.currentTarget = target;
          l.fn.call(target, event);
        }
      };
      return {
        win,
        el,
        // window capture, then the target (its listeners, in registration
        // order), then window bubble only if nothing stopped propagation.
        dispatch(type, init) {
          const event = {
            type,
            target: el,
            stopped: false,
            immediateStopped: false,
            defaultPrevented: false,
            preventDefault() { event.defaultPrevented = true; },
            stopPropagation() { event.stopped = true; },
            stopImmediatePropagation() { event.stopped = true; event.immediateStopped = true; },
            ...init,
          };
          run(win, event, true);
          if (!event.stopped) run(el, event, false);
          event.immediateStopped = false;
          if (!event.stopped) run(win, event, false);
          return event;
        },
      };
    }

    const finger = (identifier, x = 10, y = 10) => ({ identifier, clientX: x, clientY: y, pageX: x, pageY: y });

    async function openHolder() {
      const handlers = new Map();
      const sock = {
        id: "x-1",
        connected: true,
        sent: [],
        sendBuffer: [],
        handler: () => Promise.resolve({ ok: false }),
        on(e, f) { if (!handlers.has(e)) handlers.set(e, new Set()); handlers.get(e).add(f); },
        off(e, f) { handlers.get(e)?.delete(f); },
        emit(e, p) { sock.sent.push({ event: e, payload: p }); },
        timeout() {
          return { emitWithAck: (e, p) => { sock.sent.push({ event: e, payload: p, ack: true }); return sock.handler(e, p); } };
        },
      };
      const gate = defer();
      const server = { nodes: [], edges: [], version: 0, commits: [] };
      useSessionStore.setState({ authUser: { _id: USER_A, fullName: "Ada", img: "" }, socket: sock });
      sock.handler = (event) => (event === "workspace:join" ? gate.promise : Promise.resolve({ ok: false }));
      const dispose = useWorkspaceStore.getState().bindWorkspace(sock, PROJECT);
      const tabId = sock.sent.find((item) => item.event === "workspace:join").payload.tabId;
      gate.resolve({
        ok: true,
        project: { _id: PROJECT, name: "D", description: "" },
        role: "editor",
        canvas: { nodes: [], edges: [], version: 0 },
        participants: [],
        turn: { holder: { userId: USER_A, tabId }, holderSince: 1, queue: [], idleDeadline: null, graceUntil: null, serverNow: 1 },
        serverNow: 1,
      });
      await settleAll();
      sock.handler = (event, payload) => {
        const result = applyOps(server, payload.ops);
        server.nodes = result.canvas.nodes;
        server.edges = result.canvas.edges;
        server.version += 1;
        server.commits.push(payload.ops);
        return Promise.resolve({ ok: true, version: server.version });
      };
      useWorkspaceStore.getState().dispatch([{
        type: "node.add",
        node: { id: "a", type: "shape", position: { x: 1, y: 2 }, width: 160, height: 80, data: { shape: "rectangle", label: "A", color: "#1F1F1F", textColor: "#EDEDED" } },
      }]);
      await settleAll();
      return { dispose, server };
    }

    // Production wiring: drag start and stop reach the store the way
    // WorkspaceCanvas routes them, and the window listener is the real adapter.
    async function mountDrag({ capture = true } = {}) {
      const { XYDrag } = await import("@xyflow/system");
      const { selectCanUndo } = await vite.ssrLoadModule("/src/collaborate/store/useWorkspaceStore.js");
      // XYDrag cancels its auto-pan frame when a drag ends; Node has no such global.
      globalThis.cancelAnimationFrame ??= () => {};
      globalThis.requestAnimationFrame ??= () => 0;
      const env = createTouchEnv();
      const store = useWorkspaceStore;
      const log = { starts: 0, stops: 0, order: [] };
      const node = {
        id: "a",
        selected: false,
        position: { x: 1, y: 2 },
        measured: { width: 160, height: 80 },
        internals: { positionAbsolute: { x: 1, y: 2 }, userNode: { id: "a", position: { x: 1, y: 2 } } },
      };
      const nodeLookup = new Map([["a", node]]);
      const items = {
        nodeLookup,
        nodesDraggable: true,
        multiSelectionActive: false,
        transform: [0, 0, 1],
        snapGrid: [15, 15],
        snapToGrid: false,
        selectNodesOnDrag: true,
        nodeDragThreshold: 0,
        autoPanOnNodeDrag: false,
        nodeExtent: null,
        nodeOrigin: [0, 0],
        domNode: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
        unselectNodesAndEdges() {},
        updateNodePositions() {},
        onNodeDragStart() {
          log.starts += 1;
          store.getState().beginGesture("drag");
        },
        onNodeDrag() {},
        onNodeDragStop(_event, _node, nodes) {
          log.stops += 1;
          // WorkspaceCanvas: end the gesture first, then commit.
          store.getState().endGesture("drag");
          log.order.push(["stop", store.getState().history.gesture]);
          store.getState().commitNodePositions(nodes.map((n) => ({ id: n.id, position: { x: 90, y: 91 } })));
        },
      };
      const drag = XYDrag({ getStoreItems: () => items, onNodeMouseDown() {} });
      drag.update({ domNode: env.el, isSelectable: true, nodeId: "a" });
      // WorkspaceCanvas attaches this only while a gesture is active.
      let detach = null;
      const unsubscribe = store.subscribe((state, previous) => {
        if (state.history.gesture && !previous.history.gesture) {
          detach = capture
            ? shortcuts.attachGestureCancel(env.win, () => store.getState().cancelGestures())
            : attachBubbleOnly(env.win, () => store.getState().cancelGestures());
        } else if (!state.history.gesture && previous.history.gesture) {
          detach?.();
          detach = null;
        }
      });
      return { env, log, selectCanUndo, store, close: () => { unsubscribe(); detach?.(); drag.destroy(); } };
    }

    // What the first correction shipped: the same events, bubble phase only.
    function attachBubbleOnly(win, cancel) {
      const onTouchEnd = (event) => {
        if (event.touches?.length > 0) return;
        cancel();
      };
      win.addEventListener("touchend", onTouchEnd);
      win.addEventListener("touchcancel", onTouchEnd);
      return () => {
        win.removeEventListener("touchend", onTouchEnd);
        win.removeEventListener("touchcancel", onTouchEnd);
      };
    }

    async function multitouchAbort(env) {
      const one = finger(1);
      const two = finger(2, 40, 40);
      env.dispatch("touchstart", { touches: [one], changedTouches: [one] });
      env.dispatch("touchstart", { touches: [one, two], changedTouches: [two] });
      env.dispatch("touchmove", { touches: [one, two], changedTouches: [one, two] });
      return { one, two };
    }

    it("clears an aborted multitouch drag whose touchend is stopped by d3-drag", async () => {
      const { dispose, server } = await openHolder();
      const mounted = await mountDrag();
      try {
        const { one, two } = await multitouchAbort(mounted.env);
        assert.equal(mounted.log.starts >= 1, true, "XYDrag reported the drag start");
        assert.equal(mounted.store.getState().history.gesture, true);
        assert.equal(mounted.selectCanUndo(mounted.store.getState()), false);

        // The first finger lifts while the second is still down: still active.
        const firstUp = mounted.env.dispatch("touchend", { touches: [two], changedTouches: [one] });
        assert.equal(firstUp.stopped, true, "d3-drag stopped this touchend, so a bubbling window listener cannot see it");
        assert.equal(mounted.store.getState().history.gesture, true, "no early replay while a finger is down");
        assert.equal(mounted.selectCanUndo(mounted.store.getState()), false);

        // The last finger lifts. XYDrag never calls onNodeDragStop for an aborted drag.
        const lastUp = mounted.env.dispatch("touchend", { touches: [], changedTouches: [two] });
        assert.equal(lastUp.stopped, true);
        assert.equal(mounted.log.stops, 0, "an aborted drag reports no stop");
        assert.equal(mounted.store.getState().history.gesture, false);
        assert.equal(mounted.selectCanUndo(mounted.store.getState()), true);
        assert.equal(server.version, 1, "the cancelled drag dispatched nothing");
        assert.equal(mounted.env.win.listeners.length, 0, "the listeners were removed with the gesture");
      } finally {
        mounted.close();
        dispose();
      }
    });

    it("proves the harness: a bubble-phase listener leaves the same sequence stuck", async () => {
      const { dispose } = await openHolder();
      const mounted = await mountDrag({ capture: false });
      try {
        const { one, two } = await multitouchAbort(mounted.env);
        mounted.env.dispatch("touchend", { touches: [two], changedTouches: [one] });
        mounted.env.dispatch("touchend", { touches: [], changedTouches: [two] });
        assert.equal(mounted.store.getState().history.gesture, true, "the bubble-only adapter never sees the touchend");
        assert.equal(mounted.selectCanUndo(mounted.store.getState()), false);
      } finally {
        mounted.close();
        dispose();
      }
    });

    it("keeps the normal end-then-commit order for a completed single-touch drag", async () => {
      const { dispose, server } = await openHolder();
      const mounted = await mountDrag();
      try {
        const one = finger(1);
        mounted.env.dispatch("touchstart", { touches: [one], changedTouches: [one] });
        const moved = finger(1, 80, 80);
        mounted.env.dispatch("touchmove", { touches: [moved], changedTouches: [moved] });
        assert.equal(mounted.store.getState().history.gesture, true);
        mounted.env.dispatch("touchend", { touches: [], changedTouches: [moved] });
        await settleAll();
        assert.equal(mounted.log.stops, 1, "a completed drag still reports its stop");
        assert.equal(mounted.log.order[0][1], false, "the gesture was over before the commit was dispatched");
        assert.equal(server.nodes[0].position.x, 90, "the commit went through");
        assert.equal(mounted.store.getState().history.gesture, false);
        assert.equal(mounted.selectCanUndo(mounted.store.getState()), true);
      } finally {
        mounted.close();
        dispose();
      }
    });

    it("does not clear a newer gesture or end a drag on another element's blur", () => {
      const win = createTarget();
      let cancels = 0;
      const detach = shortcuts.attachGestureCancel(win, () => { cancels += 1; });
      const fire = (type, event) => {
        for (const l of [...win.listeners]) if (l.type === type && l.capture) l.fn({ type, ...event });
      };
      fire("blur", { target: { nodeName: "TEXTAREA" } });
      assert.equal(cancels, 0, "a field losing focus mid-drag is not the end of the drag");
      fire("blur", { target: win });
      assert.equal(cancels, 1);
      detach();
      assert.equal(win.listeners.length, 0);
    });
  });

  describe("mounted wiring", () => {
    function createSocket() {
      const handlers = new Map();
      const socket = {
        id: "sock-1",
        connected: true,
        sent: [],
        sendBuffer: [],
        handler: () => Promise.resolve({ ok: false }),
        on(event, fn) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(fn); },
        off(event, fn) { handlers.get(event)?.delete(fn); },
        emit(event, payload) { socket.sent.push({ event, payload }); },
        timeout() {
          return {
            emitWithAck: (event, payload) => {
              socket.sent.push({ event, payload, ack: true });
              return socket.handler(event, payload);
            },
          };
        },
      };
      return socket;
    }

    async function openEditable() {
      const socket = createSocket();
      const gate = defer();
      let server = { nodes: [], edges: [], version: 0 };
      useSessionStore.setState({ authUser: { _id: USER_A, fullName: "Ada", img: "" }, socket });
      socket.handler = (event) => (event === "workspace:join" ? gate.promise : Promise.resolve({ ok: false }));
      const dispose = useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
      const tabId = socket.sent.find((item) => item.event === "workspace:join").payload.tabId;
      gate.resolve({
        ok: true,
        project: { _id: PROJECT, name: "D", description: "" },
        role: "editor",
        canvas: server,
        participants: [],
        turn: { holder: { userId: USER_A, tabId }, holderSince: 1, queue: [], idleDeadline: null, graceUntil: null, serverNow: 1 },
        serverNow: 1,
      });
      await settleAll();
      socket.handler = (event, payload) => {
        if (event !== "canvas:commit") return Promise.resolve({ ok: false });
        const result = applyOps(server, payload.ops);
        server = { nodes: result.canvas.nodes, edges: result.canvas.edges, version: server.version + 1 };
        return Promise.resolve({ ok: true, version: server.version });
      };
      return { dispose, server: () => server };
    }

    it("routes real key events on a mounted surface to the store and cleans up under StrictMode", async () => {
      const previous = {
        window: globalThis.window,
        document: globalThis.document,
        Node: globalThis.Node,
        HTMLElement: globalThis.HTMLElement,
        act: globalThis.IS_REACT_ACT_ENVIRONMENT,
      };
      globalThis.IS_REACT_ACT_ENVIRONMENT = true;
      const doc = {
        nodeType: 9,
        activeElement: null,
        documentElement: null,
        body: null,
        createElement: (name) => Object.assign(element(name), { ownerDocument: doc }),
        createElementNS: (_ns, name) => Object.assign(element(name), { ownerDocument: doc }),
        createTextNode: (text) => ({ nodeType: 3, nodeValue: String(text), textContent: String(text), parentNode: null }),
        addEventListener() {},
        removeEventListener() {},
      };
      const Ctor = (name) => { const fn = function ctor() {}; Object.defineProperty(fn, "name", { value: name }); return fn; };
      const view = {
        document: doc,
        event: undefined,
        addEventListener() {},
        removeEventListener() {},
        getSelection() { return null; },
        HTMLElement: Ctor("HTMLElement"),
        HTMLIFrameElement: Ctor("HTMLIFrameElement"),
        Element: Ctor("Element"),
        Node: { ELEMENT_NODE: 1 },
      };
      doc.defaultView = view;
      doc.HTMLIFrameElement = view.HTMLIFrameElement;
      globalThis.document = doc;
      globalThis.window = view;
      globalThis.Node = { ELEMENT_NODE: 1, DOCUMENT_NODE: 9, TEXT_NODE: 3, DOCUMENT_FRAGMENT_NODE: 11, COMMENT_NODE: 8 };
      globalThis.HTMLElement = view.HTMLElement;

      const workspace = await openEditable();
      const container = doc.createElement("div");
      doc.documentElement = container;
      doc.body = container;
      const root = createRoot(container);
      const zooms = [];
      const surfaceRef = { current: null };
      function Host() {
        const ref = useRef(null);
        surfaceRef.current = ref;
        const actionsRef = useRef(null);
        actionsRef.current = {
          undo: () => useWorkspaceStore.getState().undo(),
          redo: () => useWorkspaceStore.getState().redo(),
          zoomIn: () => { zooms.push("in"); return true; },
          zoomOut: () => { zooms.push("out"); return true; },
        };
        shortcuts.useCanvasShortcuts(ref, actionsRef);
        return createElement("div", { ref, tabIndex: 0 });
      }
      try {
        await act(async () => {
          root.render(createElement(StrictMode, null, createElement(Host)));
        });
        const surface = surfaceRef.current.current;
        assert.ok(surface, "the surface mounted");
        surface.ownerDocument = doc;
        assert.equal(surface.listenerCount("keydown"), 1, "StrictMode double-effect leaves a single listener");

        assert.equal(useWorkspaceStore.getState().dispatch([{
          type: "node.add",
          node: { id: "a", type: "shape", position: { x: 1, y: 2 }, width: 160, height: 80, data: { shape: "rectangle", label: "A", color: "#1F1F1F", textColor: "#EDEDED" } },
        }]), true);
        await settleAll();
        assert.equal(useWorkspaceStore.getState().canvas.nodes.length, 1);
        const enabled = renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(CanvasControls)));
        assert.equal(/<button[^>]*aria-label="Undo"[^>]*? disabled=""/.test(enabled), false, "Undo is enabled once saved");
        assert.match(enabled, /<button[^>]*aria-label="Redo"[^>]*? disabled=""/);

        const undo = keyEvent(surface, "z", { ctrlKey: true });
        surface.dispatchEvent(undo);
        assert.equal(undo.defaultPrevented, true);
        await settleAll();
        assert.equal(workspace.server().nodes.length, 0, "the key reached the real store action and the server");

        const redo = keyEvent(surface, "y", { ctrlKey: true });
        surface.dispatchEvent(redo);
        assert.equal(redo.defaultPrevented, true);
        await settleAll();
        assert.equal(workspace.server().nodes.length, 1);

        const none = keyEvent(surface, "z", { ctrlKey: true, shiftKey: true });
        surface.dispatchEvent(none);
        assert.equal(none.defaultPrevented, false, "nothing to redo, so the key is left alone");

        surface.dispatchEvent(keyEvent(surface, "+", { shiftKey: true }));
        surface.dispatchEvent(keyEvent(surface, "-"));
        assert.deepEqual(zooms, ["in", "out"]);

        const field = element("textarea", { parent: surface });
        const typed = keyEvent(field, "z", { ctrlKey: true });
        surface.dispatchEvent(typed);
        assert.equal(typed.defaultPrevented, false, "native text undo keeps working in a label editor");
        assert.equal(workspace.server().nodes.length, 1);

        await act(async () => {
          root.unmount();
        });
        assert.equal(surface.listenerCount("keydown"), 0, "unmount removes the listener");
      } finally {
        workspace.dispose();
        globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
        globalThis.document = previous.document;
        globalThis.window = previous.window;
        globalThis.Node = previous.Node;
        globalThis.HTMLElement = previous.HTMLElement;
      }
    });
  });
});
