import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { createServer } from "vite";

const require = createRequire(import.meta.url);

function useClientSnapshotOnServer() {
  const React = require("react");
  if (React.useSyncExternalStore.__clientSnapshot) return () => {};
  const useSyncExternalStore = React.useSyncExternalStore;
  const patched = (subscribe, getSnapshot, _getServerSnapshot) =>
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  patched.__clientSnapshot = true;
  React.useSyncExternalStore = patched;
  return () => { React.useSyncExternalStore = useSyncExternalStore; };
}

process.env.VITE_API_URL ||= "http://127.0.0.1:3000/api";

const PROJECT = "64b0000000000000000000aa";
const USER = "64b0000000000000000000a1";

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

function createSocket() {
  const socket = {
    id: "holder-socket",
    connected: true,
    sent: [],
    handler: () => Promise.resolve({ ok: false }),
    on() {},
    off() {},
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

function classesOf(tag) {
  const match = tag.match(/class="([^"]*)"/);
  return match ? match[1].split(/\s+/) : [];
}

describe("mobile accessibility", () => {
  let vite;
  let shapeDrag;
  let dialogFocus;
  let EmptyCanvasHint;
  let ShapePanel;
  let CanvasControls;
  let WorkspaceNavbar;
  let ParticipantStack;
  let ReactFlowProvider;
  let createElement;
  let renderToStaticMarkup;
  let MemoryRouter;
  let useWorkspaceStore;
  let useSessionStore;
  let restoreReact;

  before(async () => {
    restoreReact = useClientSnapshotOnServer();
    vite = await createServer({
      server: { middlewareMode: true, hmr: false, port: 24929 },
      appType: "custom",
      logLevel: "error",
    });
    shapeDrag = await vite.ssrLoadModule("/src/collaborate/lib/shapeDrag.js");
    dialogFocus = await vite.ssrLoadModule("/src/collaborate/lib/dialogFocus.js");
    EmptyCanvasHint = (await vite.ssrLoadModule("/src/collaborate/components/canvas/EmptyCanvasHint.jsx")).default;
    ShapePanel = (await vite.ssrLoadModule("/src/collaborate/components/canvas/ShapePanel.jsx")).default;
    CanvasControls = (await vite.ssrLoadModule("/src/collaborate/components/canvas/CanvasControls.jsx")).default;
    WorkspaceNavbar = (await vite.ssrLoadModule("/src/collaborate/components/workspace/WorkspaceNavbar.jsx")).default;
    ParticipantStack = (await vite.ssrLoadModule("/src/collaborate/components/workspace/ParticipantStack.jsx")).default;
    ({ ReactFlowProvider } = await import("@xyflow/react"));
    ({ createElement, renderToStaticMarkup, MemoryRouter } = await vite.ssrLoadModule("/test/ssrRender.js"));
    useWorkspaceStore = (await vite.ssrLoadModule("/src/collaborate/store/useWorkspaceStore.js")).useWorkspaceStore;
    useSessionStore = (await vite.ssrLoadModule("/src/collaborate/store/useSessionStore.js")).useSessionStore;
  });

  after(async () => {
    useWorkspaceStore?.getState().resetWorkspace();
    restoreReact?.();
    await vite?.close();
  });

  it("offsets activations by 24 and wraps after eight", () => {
    assert.equal(shapeDrag.activationOffset(0), 0);
    assert.equal(shapeDrag.activationOffset(1), 24);
    assert.equal(shapeDrag.activationOffset(7), 168);
    assert.equal(shapeDrag.activationOffset(8), 0);
    assert.equal(shapeDrag.activationOffset(9), 24);
    for (const index of [-1, 1.5, Number.NaN, "2", undefined]) {
      assert.equal(shapeDrag.activationOffset(index), 0);
    }
  });

  it("places a rectangle at the canvas center plus the activation offset", () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };
    const identity = (point) => point;
    const centered = shapeDrag.shapeAtCenter("rectangle", rect, identity, 0);
    assert.deepEqual(centered.position, { x: 220, y: 110 });
    const shifted = shapeDrag.shapeAtCenter("rectangle", rect, identity, 2);
    assert.deepEqual(shifted.position, { x: 268, y: 158 });
  });

  it("returns null when the shape, rect, or flow point cannot be used", () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };
    const identity = (point) => point;
    assert.equal(shapeDrag.shapeAtCenter("star", rect, identity, 0), null);
    assert.equal(shapeDrag.shapeAtCenter("rectangle", null, identity, 0), null);
    assert.equal(shapeDrag.shapeAtCenter("rectangle", { ...rect, width: Number.NaN }, identity, 0), null);
    assert.equal(shapeDrag.shapeAtCenter("rectangle", rect, () => ({ x: Number.NaN, y: 1 }), 0), null);
  });

  it("accepts Enter and Space only as plain activation keys", () => {
    assert.equal(shapeDrag.isActivationKey({ key: "Enter" }), true);
    assert.equal(shapeDrag.isActivationKey({ key: " " }), true);
    assert.equal(shapeDrag.isActivationKey({ key: "Enter", ctrlKey: true }), false);
    assert.equal(shapeDrag.isActivationKey({ key: " ", metaKey: true }), false);
    assert.equal(shapeDrag.isActivationKey({ key: "Enter", altKey: true }), false);
    assert.equal(shapeDrag.isActivationKey({ key: " ", repeat: true }), false);
    assert.equal(shapeDrag.isActivationKey({ key: "a" }), false);
    assert.equal(shapeDrag.isActivationKey({ key: "Delete" }), false);
  });

  it("returns the last focused control when it can still take focus", () => {
    const last = { isConnected: true, matches: () => false, tabIndex: 0 };
    const panel = {
      contains: (element) => element === last,
      matches: () => false,
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    assert.equal(dialogFocus.restoreTarget(panel, last), last);
  });

  it("skips a last focus that cannot be used and returns the autofocus element", () => {
    const autofocus = { isConnected: true, matches: () => false, tabIndex: 0 };
    const panel = {
      contains: (element) => element !== outside,
      matches: () => false,
      querySelector: () => null,
      querySelectorAll: (selector) => (selector.includes("autofocus") ? [autofocus] : []),
    };
    const outside = { isConnected: true, matches: () => false, tabIndex: 0 };
    const disabled = { isConnected: true, matches: (selector) => selector === ":disabled", tabIndex: 0 };
    const disconnected = { isConnected: false, matches: () => false, tabIndex: 0 };
    assert.equal(dialogFocus.restoreTarget(panel, disabled), autofocus);
    assert.equal(dialogFocus.restoreTarget(panel, disconnected), autofocus);
    assert.equal(dialogFocus.restoreTarget(panel, outside), autofocus);
    assert.equal(dialogFocus.restoreTarget(panel, panel), autofocus);
  });

  it("falls back to the first enabled focusable control, then the panel", () => {
    const focusable = { isConnected: true, matches: () => false, tabIndex: 0 };
    const panel = {
      contains: () => false,
      matches: () => false,
      querySelector: () => null,
      querySelectorAll: (selector) => (selector.includes("autofocus") ? [] : [focusable]),
    };
    assert.equal(dialogFocus.restoreTarget(panel, null), focusable);

    const blocked = { isConnected: true, matches: (selector) => selector === ":disabled", tabIndex: 0 };
    const disabledPanel = {
      contains: () => false,
      matches: () => false,
      querySelector: () => null,
      querySelectorAll: () => [blocked],
    };
    assert.equal(dialogFocus.restoreTarget(disabledPanel, null), disabledPanel);

    const empty = {
      contains: () => false,
      matches: () => false,
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    assert.equal(dialogFocus.restoreTarget(empty, null), empty);
  });

  it("shows the empty hint only on a ready canvas with no nodes", () => {
    useWorkspaceStore.getState().resetWorkspace();
    const hint = () => renderToStaticMarkup(createElement(EmptyCanvasHint));

    useWorkspaceStore.setState({
      status: "ready",
      role: "viewer",
      canvas: { nodes: [], edges: [], version: 0 },
    });
    const viewer = hint();
    assert.match(viewer, /This canvas is empty\./);
    assert.equal(viewer.includes("Request the turn"), false);
    assert.equal(viewer.includes("aria-live"), false);

    useWorkspaceStore.setState({ role: "editor" });
    const waiting = hint();
    assert.match(waiting, /This canvas is empty\. Request the turn to start drawing\./);
    assert.equal(waiting.includes("aria-live"), false);

    useWorkspaceStore.setState({
      canvas: { nodes: [{ id: "n1" }], edges: [], version: 1 },
    });
    assert.equal(hint(), "");

    useWorkspaceStore.setState({
      status: "loading",
      canvas: { nodes: [], edges: [], version: 0 },
    });
    assert.equal(hint(), "");
  });

  it("shows the holder hint when this tab can edit", async () => {
    const dispose = await holdTurn();
    try {
      const html = renderToStaticMarkup(createElement(EmptyCanvasHint));
      assert.match(html, /Click a shape below to add it, drag one onto the canvas, or start from a template\./);
      assert.equal(html.includes("aria-live"), false);
    } finally {
      dispose();
      useWorkspaceStore.getState().resetWorkspace();
    }
  });

  it("renders six activatable shapes in palette order", () => {
    const html = renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(ShapePanel)));
    assert.match(html, /role="toolbar"[^>]*class="[^"]*\bnokey\b/);
    const labels = ["Add rectangle", "Add diamond", "Add circle", "Add pill", "Add cylinder", "Add hexagon"];
    let cursor = -1;
    for (const label of labels) {
      const tag = html.slice(html.indexOf(`aria-label="${label}"`) - 80);
      assert.equal(html.includes(`aria-label="${label}"`), true, label);
      const at = html.indexOf(`aria-label="${label}"`);
      assert.equal(at > cursor, true, label);
      cursor = at;
      assert.match(tag, /role="button"/);
      assert.match(tag, /tabindex="0"/);
      assert.match(tag, /draggable="true"/);
    }
  });

  it("hides Delete selected until this tab can edit, then follows the selection", async () => {
    useWorkspaceStore.getState().resetWorkspace();
    const watcher = renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(CanvasControls)));
    assert.equal(watcher.includes("Delete selected"), false);

    const dispose = await holdTurn();
    try {
      const idle = renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(CanvasControls)));
      assert.match(idle, /aria-label="Delete selected"[^>]*disabled=""/);

      useWorkspaceStore.setState({
        rfNodes: [{ id: "n1", selected: true }],
      });
      const selected = renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(CanvasControls)));
      assert.match(selected, /aria-label="Delete selected"/);
      assert.equal(/aria-label="Delete selected"[^>]*disabled=""/.test(selected), false);
    } finally {
      dispose();
      useWorkspaceStore.getState().resetWorkspace();
    }
  });

  it("hides the projects word, the chat word, and the role below sm", () => {
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.setState({
      status: "ready",
      role: "owner",
      project: { _id: PROJECT, name: "Design" },
    });
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(WorkspaceNavbar)));
    assert.match(html, /aria-label="Back to projects"/);
    assert.match(html, /<span class="hidden sm:inline">Projects<\/span>/);
    assert.match(html, /<span class="hidden truncate sm:inline">Chat<\/span>/);
    assert.match(html, /<span class="hidden shrink-0 sm:inline-flex"><span[^>]*>owner<\/span><\/span>/);
  });

  it("collapses the participant stack below sm and keeps the wide overflow", () => {
    useSessionStore.setState({ authUser: { _id: USER } });
    const people = ["a", "b", "c", "d", "e", "f", "g"].map((name, index) => ({
      userId: `64b00000000000000000001${index}`,
      fullName: name,
      img: "",
      role: "editor",
    }));
    useWorkspaceStore.setState({ participants: [{ userId: USER, fullName: "Me", img: "", role: "owner" }, ...people] });
    const html = renderToStaticMarkup(createElement(ParticipantStack));
    const tags = [...html.matchAll(/<span[^>]*role="img"[^>]*>[\s\S]*?<\/span>/g)].map((match) => match[0]);
    assert.equal(tags.length, 7);
    assert.equal(classesOf(tags[0]).includes("hidden"), false);
    assert.equal(classesOf(tags[1]).includes("hidden"), false);
    for (const tag of tags.slice(2, 5)) {
      const names = classesOf(tag);
      assert.equal(names.includes("hidden"), true);
      assert.equal(names.includes("sm:flex"), true);
    }
    assert.equal(classesOf(tags[5]).includes("sm:inline-flex"), true);
    assert.match(tags[5], />\s*\+2\s*</);
    assert.equal(classesOf(tags[6]).includes("sm:hidden"), true);
    assert.match(tags[6], />\s*\+5\s*</);
    assert.match(tags[6], /aria-label="5 more people"/);

    useWorkspaceStore.setState({
      participants: [{ userId: USER, fullName: "Me", img: "", role: "owner" }, ...people.slice(0, 3)],
    });
    const three = renderToStaticMarkup(createElement(ParticipantStack));
    assert.match(three, /aria-label="1 more person"/);
    assert.match(three, />\s*\+1\s*</);

    useWorkspaceStore.setState({
      participants: [{ userId: USER, fullName: "Me", img: "", role: "owner" }, ...people.slice(0, 2)],
    });
    const two = renderToStaticMarkup(createElement(ParticipantStack));
    assert.equal(two.includes("more person"), false);
    assert.equal(two.includes("sm:hidden"), false);
  });

  async function holdTurn() {
    const socket = createSocket();
    const gate = defer();
    useSessionStore.setState({ authUser: { _id: USER, fullName: "Ada", img: "" }, socket });
    socket.handler = (event) => (event === "workspace:join" ? gate.promise : Promise.resolve({ ok: false }));
    const dispose = useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
    const tabId = socket.sent.find((item) => item.event === "workspace:join").payload.tabId;
    gate.resolve({
      ok: true,
      project: { _id: PROJECT, name: "Design", description: "" },
      role: "editor",
      canvas: { nodes: [], edges: [], version: 0 },
      participants: [],
      turn: { holder: { userId: USER, tabId }, holderSince: 1, queue: [], idleDeadline: null, graceUntil: null, serverNow: 1 },
      serverNow: 1,
    });
    await settleAll();
    return dispose;
  }
});
