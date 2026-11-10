import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { createServer } from "vite";

const require = createRequire(import.meta.url);

// Zustand's server snapshot stays at store creation. React DOM's server
// renderer reads that snapshot, so setState would not show up in markup.
// The browser reads the client snapshot. Use that one in these assertions.
function useClientSnapshotOnServer() {
  const React = require("react");
  if (React.useSyncExternalStore.__clientSnapshot) return;
  const useSyncExternalStore = React.useSyncExternalStore;
  const patched = (subscribe, getSnapshot, _getServerSnapshot) =>
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  patched.__clientSnapshot = true;
  React.useSyncExternalStore = patched;
}

process.env.VITE_API_URL ||= "http://127.0.0.1:3000/api";

const PROJECT = "64b0000000000000000000aa";
const OTHER_PROJECT = "64b0000000000000000000bb";
const SELF = "64b0000000000000000000a1";
const ADA = "64b000000000000000000010";
const GRACE = "64b000000000000000000011";
const KATHERINE = "64b000000000000000000012";
const MARGARET = "64b000000000000000000013";
const DOROTHY = "64b000000000000000000014";
const HEDY = "64b000000000000000000015";
const EXTRA = "64b000000000000000000016";

function person(userId, fullName, role, img = "") {
  return { userId, fullName, img, role };
}

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

describe("participants", () => {
  let vite;
  let useWorkspaceStore;
  let useSessionStore;
  let ParticipantStack;
  let WorkspaceNavbar;
  let MemoryRouter;
  let createElement;
  let renderToStaticMarkup;
  let errors;
  let successes;
  let toastMod;
  let originalError;
  let originalSuccess;

  before(async () => {
    useClientSnapshotOnServer();
    vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: "custom",
      logLevel: "error",
    });
    const storeMod = await vite.ssrLoadModule("/src/collaborate/store/useWorkspaceStore.js");
    const sessionMod = await vite.ssrLoadModule("/src/collaborate/store/useSessionStore.js");
    const stackMod = await vite.ssrLoadModule("/src/collaborate/components/workspace/ParticipantStack.jsx");
    const navbarMod = await vite.ssrLoadModule("/src/collaborate/components/workspace/WorkspaceNavbar.jsx");
    const renderMod = await vite.ssrLoadModule("/test/ssrRender.js");
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
    useSessionStore = sessionMod.useSessionStore;
    ParticipantStack = stackMod.default;
    WorkspaceNavbar = navbarMod.default;
    createElement = renderMod.createElement;
    renderToStaticMarkup = renderMod.renderToStaticMarkup;
    MemoryRouter = renderMod.MemoryRouter;
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

  function markup(element) {
    return renderToStaticMarkup(element);
  }

  it("installs a normalized roster and rejects a bad list whole", async () => {
    reset();
    const socket = createSocket();
    const { dispose, gate } = beginJoin(socket);
    assert.equal(socket.listenerCount("presence:update"), 1);
    assert.deepEqual(useWorkspaceStore.getState().participants, []);
    await finishJoin(gate, [
      { userId: GRACE.toUpperCase(), fullName: "Grace", img: "", role: "viewer", email: "hidden@example.com" },
      person(SELF, "Ada", "owner", ""),
    ]);
    assert.deepEqual(useWorkspaceStore.getState().participants, [
      person(GRACE, "Grace", "viewer", ""),
      person(SELF, "Ada", "owner", ""),
    ]);
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(useWorkspaceStore.getState().canvas.version, 4);
    assert.equal(errors.length, 0);
    dispose();

    reset();
    const bad = createSocket("sock-bad");
    const failed = beginJoin(bad);
    failed.gate.resolve(joinBody([{ userId: "not-an-id", fullName: "Ada", img: "", role: "owner" }]));
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().status, "error");
    assert.deepEqual(useWorkspaceStore.getState().participants, []);
    assert.equal(useWorkspaceStore.getState().canvas.version, 0);
    assert.deepEqual(errors, []);
    failed.dispose();

    reset();
    const duplicate = createSocket("sock-dup");
    const dupJoin = beginJoin(duplicate);
    dupJoin.gate.resolve(joinBody([
      person(ADA, "Ada", "editor", ""),
      person(ADA.toUpperCase(), "Ada Again", "viewer", ""),
    ]));
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().status, "error");
    assert.deepEqual(useWorkspaceStore.getState().participants, []);
    dupJoin.dispose();

    reset();
    const live = createSocket("sock-live-dup");
    const ready = beginJoin(live);
    await finishJoin(ready.gate, [person(GRACE, "Grace", "viewer", "")]);
    const roster = useWorkspaceStore.getState().participants;
    live.fire("presence:update", {
      projectId: PROJECT,
      participants: [
        person(ADA, "Ada", "editor", ""),
        person(ADA.toUpperCase(), "Ada Again", "viewer", ""),
      ],
    });
    assert.equal(useWorkspaceStore.getState().participants, roster);
    ready.dispose();
  });

  it("keeps the latest pre-ack snapshot and ignores a stale ack", async () => {
    reset();
    const socket = createSocket();
    const pending = beginJoin(socket);
    socket.fire("presence:update", {
      projectId: PROJECT,
      participants: [person(ADA, "First", "editor", "")],
    });
    socket.fire("presence:update", {
      projectId: PROJECT,
      participants: [person(GRACE, "Second", "viewer", ""), { userId: ADA, fullName: "Ada", img: "", role: "editor", clerkId: "nope" }],
    });
    assert.deepEqual(useWorkspaceStore.getState().participants, []);
    await finishJoin(pending.gate, [person(ADA, "Ack", "editor", "")]);
    assert.deepEqual(useWorkspaceStore.getState().participants, [
      person(ADA, "Ada", "editor", ""),
      person(GRACE, "Second", "viewer", ""),
    ]);

    socket.fire("presence:update", {
      projectId: PROJECT,
      participants: [person(KATHERINE, "Katherine", "owner", "")],
    });
    assert.deepEqual(useWorkspaceStore.getState().participants, [
      person(KATHERINE, "Katherine", "owner", ""),
    ]);
    const before = useWorkspaceStore.getState().participants;
    socket.fire("presence:update", { projectId: PROJECT, participants: [{ userId: ADA, fullName: 4, img: "", role: "editor" }] });
    socket.fire("presence:update", { projectId: OTHER_PROJECT, participants: [person(ADA, "Other", "editor", "")] });
    socket.fire("presence:update", null);
    assert.deepEqual(useWorkspaceStore.getState().participants, before);
    assert.deepEqual(errors, []);
    assert.deepEqual(successes, []);

    const replacement = createSocket("sock-2");
    const next = beginJoin(replacement, OTHER_PROJECT);
    assert.equal(socket.listenerCount("presence:update"), 0);
    assert.equal(replacement.listenerCount("presence:update"), 1);
    assert.deepEqual(useWorkspaceStore.getState().participants, []);
    socket.fire("presence:update", {
      projectId: OTHER_PROJECT,
      participants: [person(ADA, "Stale", "editor", "")],
    });
    await finishJoin(next.gate, [person(GRACE, "Grace", "viewer", "")], OTHER_PROJECT);
    pending.gate.resolve(joinBody([person(ADA, "Late", "editor", "")]));
    await settle();
    assert.deepEqual(useWorkspaceStore.getState().participants, [
      person(GRACE, "Grace", "viewer", ""),
    ]);
    assert.equal(useWorkspaceStore.getState().project._id, OTHER_PROJECT);
    next.dispose();
    assert.equal(replacement.listenerCount("presence:update"), 0);
    assert.deepEqual(useWorkspaceStore.getState().participants, []);
  });

  it("drops the roster on disconnect, retry, failure, and project switch", async () => {
    reset();
    const socket = createSocket();
    const joined = beginJoin(socket);
    socket.fire("presence:update", {
      projectId: PROJECT,
      participants: [person(ADA, "Buffered", "editor", "")],
    });
    joined.gate.resolve({ ok: false, message: "Project not found" });
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().status, "notFound");
    assert.deepEqual(useWorkspaceStore.getState().participants, []);
    assert.deepEqual(errors, ["Project not found"]);
    joined.dispose();

    reset();
    const live = createSocket("sock-live");
    const ready = beginJoin(live);
    await finishJoin(ready.gate, [person(ADA, "Ada", "editor", "")]);
    live.disconnect();
    live.fire("disconnect");
    assert.deepEqual(useWorkspaceStore.getState().participants, []);
    live.connected = false;
    live.fire("presence:update", {
      projectId: PROJECT,
      participants: [person(GRACE, "Grace", "viewer", "")],
    });
    assert.deepEqual(useWorkspaceStore.getState().participants, []);

    live.connected = true;
    live.id = "sock-live";
    const retryGate = defer();
    live.handler = () => retryGate.promise;
    useWorkspaceStore.getState().retryWorkspace();
    assert.equal(useWorkspaceStore.getState().status, "loading");
    assert.deepEqual(useWorkspaceStore.getState().participants, []);
    await finishJoin(retryGate, [person(GRACE, "Grace", "viewer", "")]);
    assert.equal(useWorkspaceStore.getState().participants[0].userId, GRACE);

    const switched = beginJoin(live, OTHER_PROJECT);
    assert.deepEqual(useWorkspaceStore.getState().participants, []);
    await finishJoin(switched.gate, [], OTHER_PROJECT);
    assert.deepEqual(useWorkspaceStore.getState().participants, []);
    useWorkspaceStore.getState().resetWorkspace();
    assert.deepEqual(useWorkspaceStore.getState().participants, []);
    assert.equal(useWorkspaceStore.getState().status, "idle");
    switched.dispose();
  });

  it("accepts presence during canvas recovery and keeps it after the snapshot", async () => {
    reset();
    const socket = createSocket();
    const joined = beginJoin(socket);
    await finishJoin(joined.gate, [person(ADA, "Ada", "editor", "")]);
    const syncGate = defer();
    socket.handler = (event) => {
      if (event === "canvas:sync") return syncGate.promise;
      return Promise.resolve({ ok: false, message: "unexpected" });
    };
    const versionBefore = useWorkspaceStore.getState().canvas.version;
    socket.fire("canvas:ops", {
      projectId: PROJECT,
      version: 9,
      ops: [{ type: "node.add", node: node("remote") }],
      by: ADA,
    });
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(useWorkspaceStore.getState().syncStatus, "syncing");
    const syncsBefore = socket.sent.filter((item) => item.event === "canvas:sync").length;
    socket.fire("presence:update", {
      projectId: PROJECT,
      participants: [person(GRACE, "Grace", "viewer", "")],
    });
    assert.deepEqual(useWorkspaceStore.getState().participants, [person(GRACE, "Grace", "viewer", "")]);
    assert.equal(useWorkspaceStore.getState().canvas.version, versionBefore);
    assert.equal(useWorkspaceStore.getState().canvas.nodes.some((item) => item.id === "remote"), false);
    assert.equal(socket.sent.filter((item) => item.event === "canvas:sync").length, syncsBefore);
    assert.equal(socket.sent.some((item) => item.event === "canvas:commit"), false);
    assert.deepEqual(successes, []);
    assert.deepEqual(errors, []);

    syncGate.resolve({
      ok: true,
      canvas: { nodes: [node("kept")], edges: [], version: 9 },
    });
    await settle();
    await settle();
    assert.equal(useWorkspaceStore.getState().canvas.version, 9);
    assert.equal(useWorkspaceStore.getState().canvas.nodes[0].id, "kept");
    assert.deepEqual(useWorkspaceStore.getState().participants, [person(GRACE, "Grace", "viewer", "")]);
    joined.dispose();
  });

  it("ignores a presence update under an old connection id", async () => {
    reset();
    const socket = createSocket();
    const joined = beginJoin(socket);
    await finishJoin(joined.gate, [person(ADA, "Ada", "editor", "")]);
    const participants = useWorkspaceStore.getState().participants;
    socket.id = "sock-new";
    socket.fire("presence:update", {
      projectId: PROJECT,
      participants: [person(GRACE, "Grace", "viewer", "")],
    });
    assert.equal(useWorkspaceStore.getState().participants, participants);
    joined.dispose();
  });

  it("renders the other people in store order with overflow and initials", () => {
    reset();
    useSessionStore.setState({ authUser: null });
    useWorkspaceStore.setState({
      participants: [person(ADA, "Ada Lovelace", "editor", "")],
    });
    assert.equal(markup(createElement(ParticipantStack)), "");

    useSessionStore.setState({ authUser: { _id: SELF.toUpperCase() } });
    useWorkspaceStore.setState({
      participants: [person(SELF, "Ada Lovelace", "owner", ""), person(SELF, "Ada Again", "editor", "")],
    });
    assert.equal(markup(createElement(ParticipantStack)), "");

    const others = [
      person(HEDY, "Hedy", "editor", ""),
      person(ADA, "Ada Lovelace", "editor", ""),
      person(GRACE, "", "viewer", ""),
      person(KATHERINE, "Katherine Johnson", "owner", "https://cdn.example/k.png"),
      person(MARGARET, "Margaret", "viewer", ""),
      person(DOROTHY, "Dorothy", "editor", ""),
      person(EXTRA, "Extra Person", "viewer", ""),
    ];
    useWorkspaceStore.setState({
      project: { _id: PROJECT, name: "Design", description: "" },
      role: "owner",
      status: "ready",
      participants: [person(SELF, "Myself", "owner", ""), ...others],
    });
    const html = markup(createElement(
      MemoryRouter,
      null,
      createElement(WorkspaceNavbar),
    ));
    assert.equal(html.includes('role="group"'), true, html);
    assert.equal(html.includes('role="img"'), true, html);
    assert.equal(html.includes("People in this project"), true, html);
    assert.equal(html.includes("Myself"), false);
    const visible = ["Hedy — editor", "Ada Lovelace — editor", "Unknown user — viewer", "Katherine Johnson — owner", "Margaret — viewer"];
    let cursor = -1;
    for (const label of visible) {
      const at = html.indexOf(label);
      assert.equal(at > cursor, true, label);
      cursor = at;
    }
    const overflowAt = html.indexOf("Dorothy — editor, Extra Person — viewer");
    assert.equal(overflowAt > cursor, true);
    assert.equal(html.includes("+2"), true);
    assert.equal(html.includes(">AL<"), true);
    assert.equal(html.includes(">H<"), true);
    assert.equal(html.includes(">?<"), true);
    assert.equal(html.includes('alt="Katherine Johnson"'), true);
    assert.equal(html.includes('tabindex="0"'), true);
    const stackAt = html.indexOf("People in this project");
    const badgeAt = html.lastIndexOf(">owner<");
    assert.equal(stackAt < badgeAt, true);
    assert.equal(html.includes("h-14"), true);
  });
});
