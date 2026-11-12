import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, beforeEach, describe, it } from "node:test";
import { createServer } from "vite";

const require = createRequire(import.meta.url);

function useClientSnapshotOnServer() {
  const React = require("react");
  const original = React.useSyncExternalStore;
  if (original.__clientSnapshot) return () => {};
  const patched = (subscribe, getSnapshot, _getServerSnapshot) => original(subscribe, getSnapshot, getSnapshot);
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
const THIRD = "64b0000000000000000000c3";
const M1 = "64b0000000000000000000d1";
const M2 = "64b0000000000000000000d2";
const M3 = "64b0000000000000000000d3";
const T0 = "2026-11-11T00:00:00.000Z";
const T1 = "2026-11-11T00:00:01.000Z";
const T2 = "2026-11-11T00:00:02.000Z";
const T3 = "2026-11-11T00:00:03.000Z";

function message(id, at, patch = {}) {
  return {
    _id: id,
    project: patch.project ?? PROJECT,
    sender: patch.sender === undefined ? { _id: OTHER, fullName: "Sam", img: "" } : patch.sender,
    text: patch.text ?? "Hello",
    image: patch.image ?? "",
    video: patch.video ?? "",
    createdAt: at,
    updatedAt: patch.updatedAt ?? at,
  };
}

function person(userId, fullName, role = "editor") {
  return { userId, fullName, img: "", role };
}

function historyPage(list, hasMore = false) {
  const sorted = [...list].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    if (a._id === b._id) return 0;
    return a._id < b._id ? -1 : 1;
  });
  const oldest = sorted[0];
  return {
    messages: sorted,
    hasMore,
    nextCursor: hasMore && oldest ? { before: oldest.createdAt, beforeId: oldest._id } : null,
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

function flush() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

async function drained() {
  for (let i = 0; i < 8; i += 1) await flush();
}

function httpError(status, text) {
  const error = new Error(text);
  error.response = { status, data: { message: text } };
  return error;
}

function httpOk(data, status = 200) {
  return { data, status, statusText: "OK", headers: {}, config: {} };
}

function createSocket(id = "sock-1") {
  const handlers = new Map();
  const socket = {
    id,
    connected: true,
    active: true,
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
  };
  return socket;
}

function createFakeClock() {
  let now = 0;
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
    pending() {
      return timers.size;
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

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe("project chat", () => {
  let vite;
  let restoreReact;
  let useProjectChatStore;
  let bindProjectChat;
  let useWorkspaceStore;
  let useSessionStore;
  let selectCanChat;
  let selectCanEdit;
  let selectIsHolder;
  let axiosInstance;
  let chat;
  let typing;
  let toastMod;
  let originalError;
  let originalWindow;
  let originalDocument;
  let originalLocalStorage;
  let storage;
  let requests;
  let handler;
  let errors;
  let chimes;
  let audioThrows;
  let docListeners;
  const clock = createFakeClock();

  before(async () => {
    restoreReact = useClientSnapshotOnServer();
    storage = memoryStorage();
    originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = storage;
    docListeners = new Map();
    originalDocument = globalThis.document;
    globalThis.document = {
      visibilityState: "visible",
      addEventListener(type, fn) {
        if (!docListeners.has(type)) docListeners.set(type, new Set());
        docListeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        docListeners.get(type)?.delete(fn);
      },
      getElementById() {
        return null;
      },
    };
    audioThrows = false;
    chimes = [];
    originalWindow = globalThis.window;
    globalThis.window = {
      document: globalThis.document,
      location: { href: "http://127.0.0.1:3000/" },
      localStorage: storage,
      visualViewport: null,
      matchMedia: () => ({ matches: false }),
      AudioContext: class {
        constructor() {
          if (audioThrows) throw new Error("AudioContext blocked");
          this.state = "running";
          this.currentTime = 0;
          this.destination = {};
        }
        resume() {
          return Promise.resolve();
        }
        createOscillator() {
          if (audioThrows) throw new Error("oscillator blocked");
          const node = {
            type: "sine",
            frequency: { value: 0 },
            connect() {},
            start() {
              chimes.push("start");
            },
            stop() {},
          };
          return node;
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
      },
    };

    vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: "custom",
      logLevel: "error",
    });
    const chatMod = await vite.ssrLoadModule("/src/collaborate/store/useProjectChatStore.js");
    const workspaceMod = await vite.ssrLoadModule("/src/collaborate/store/useWorkspaceStore.js");
    const sessionMod = await vite.ssrLoadModule("/src/collaborate/store/useSessionStore.js");
    const axiosMod = await vite.ssrLoadModule("/src/collaborate/lib/axios.js");
    chat = await vite.ssrLoadModule("/src/collaborate/lib/projectChat.js");
    typing = await vite.ssrLoadModule("/src/collaborate/lib/projectTyping.js");
    toastMod = await import("react-toastify");
    errors = [];
    originalError = toastMod.toast.error;
    toastMod.toast.error = (message) => {
      errors.push(message);
    };
    useProjectChatStore = chatMod.useProjectChatStore;
    bindProjectChat = chatMod.bindProjectChat;
    useWorkspaceStore = workspaceMod.useWorkspaceStore;
    useSessionStore = sessionMod.useSessionStore;
    selectCanChat = workspaceMod.selectCanChat;
    selectCanEdit = workspaceMod.selectCanEdit;
    selectIsHolder = workspaceMod.selectIsHolder;
    axiosInstance = axiosMod.axiosInstance;
    requests = [];
    handler = async () => httpOk(historyPage([]));
    axiosInstance.defaults.adapter = async (config) => {
      requests.push(config);
      return handler(config);
    };
  });

  after(async () => {
    clock.restore();
    useProjectChatStore?.getState().resetProjectChat();
    useWorkspaceStore?.getState().resetWorkspace();
    if (axiosInstance) axiosInstance.defaults.adapter = undefined;
    if (toastMod) toastMod.toast.error = originalError;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    restoreReact?.();
    await vite?.close();
  });

  beforeEach(() => {
    requests.length = 0;
    errors.length = 0;
    chimes.length = 0;
    audioThrows = false;
    globalThis.document.visibilityState = "visible";
    handler = async () => httpOk(historyPage([]));
    useProjectChatStore.getState().resetProjectChat();
    useWorkspaceStore.getState().resetWorkspace();
    useSessionStore.setState({
      authUser: { _id: SELF, fullName: "Ada Lovelace", img: "" },
      socket: null,
      isConnected: false,
    });
    useProjectChatStore.setState({ isSoundEnabled: true });
  });

  function emitVisibility() {
    for (const fn of [...(docListeners.get("visibilitychange") ?? [])]) fn();
  }

  function gets() {
    return requests.filter((config) => config.method === "get");
  }

  function posts() {
    return requests.filter((config) => config.method === "post");
  }

  function typingEmits(socket) {
    return socket.sent.filter((item) => item.event === "project:typing");
  }

  function parsedBody(config) {
    if (typeof config.data === "string") return JSON.parse(config.data);
    return config.data;
  }

  function ack({ role = "editor", turn = null, participants = [person(SELF, "Ada Lovelace", role), person(OTHER, "Sam")], projectId = PROJECT } = {}) {
    return {
      ok: true,
      project: { _id: projectId, name: "Design", description: "Notes" },
      role,
      canvas: { nodes: [], edges: [], version: 3 },
      participants,
      turn,
      serverNow: 4,
    };
  }

  async function connect(socket, options = {}) {
    useSessionStore.setState({
      authUser: { _id: SELF, fullName: "Ada Lovelace", img: "" },
      socket,
      isConnected: true,
    });
    socket.handler = (event) => (
      event === "workspace:join"
        ? Promise.resolve(ack(options))
        : Promise.resolve({ ok: false, message: "unexpected" })
    );
    const disposeChat = bindProjectChat(socket, options.projectId ?? PROJECT);
    const disposeWorkspace = useWorkspaceStore.getState().bindWorkspace(socket, options.projectId ?? PROJECT);
    await drained();
    return () => {
      disposeChat();
      disposeWorkspace();
    };
  }

  function live(id, at, patch) {
    return { projectId: PROJECT, message: message(id, at, patch) };
  }

  it("sorts equal timestamps by id and drops an unsafe page", () => {
    const merged = chat.mergeMessages(
      [message(M2, T0, { text: "new" })],
      [message(M2, T0, { text: "old" }), message(M1, T0)],
    );
    assert.deepEqual(merged.map((item) => item._id), [M1, M2]);
    assert.equal(merged[1].text, "old");
    assert.equal(chat.validateHistoryPage({ messages: [message(M1, T1)], hasMore: true, nextCursor: null }, PROJECT).ok, false);
    assert.equal(chat.validateHistoryPage({
      messages: [message(M1, T1, { image: "javascript:alert(1)" })],
      hasMore: false,
      nextCursor: null,
    }, PROJECT).ok, false);
    const page = chat.validateHistoryPage(historyPage([message(M2, T2), message(M1, T1)], true), PROJECT);
    assert.equal(page.ok, true);
    assert.deepEqual(page.nextCursor, { before: T1, beforeId: M1 });
    assert.equal(chat.cursorAdvances({ before: T2, beforeId: M2 }, page.nextCursor), true);
    assert.equal(chat.cursorAdvances(page.nextCursor, page.nextCursor), false);
  });

  it("refreshes a long typing burst and ignores a superseded expiry", () => {
    const sent = [];
    let time = 0;
    const timers = [];
    const outgoing = typing.createOutgoingTyping({
      emit: (isTyping) => sent.push(isTyping),
      canEmit: () => true,
      now: () => time,
      schedule: (fn, delay) => {
        const id = timers.length;
        timers.push({ fn, at: time + delay });
        return id;
      },
      cancel: (id) => {
        timers[id] = null;
      },
    });
    outgoing.note("a");
    time = 1000;
    outgoing.note("ab");
    time = 2000;
    outgoing.note("abc");
    time = 4000;
    outgoing.note("abcd");
    assert.deepEqual(sent, [true, true, true]);
    time = 6000;
    timers.filter(Boolean).filter((timer) => timer.at <= time).forEach((timer) => timer.fn());
    assert.equal(sent.at(-1), false);

    const flags = [];
    const queued = [];
    const incoming = typing.createIncomingTyping({
      schedule: (fn) => {
        queued.push(fn);
        return queued.length;
      },
      cancel: () => {},
      onChange: (ids) => flags.push(ids.join(",")),
      expiryMs: 5000,
    });
    incoming.setTyping(OTHER, true);
    incoming.setTyping(OTHER, true);
    queued[0]();
    assert.equal(flags.at(-1), OTHER);
    queued[1]();
    assert.equal(flags.at(-1), "");
  });

  it("keeps one listener set and does not remove another feature's listener", async () => {
    const socket = createSocket();
    const foreign = () => {};
    socket.on("project:message", foreign);
    socket.on("canvas:ops", foreign);
    const first = bindProjectChat(socket, PROJECT);
    first();
    const second = bindProjectChat(socket, PROJECT);
    assert.equal(socket.listenerCount("project:message"), 2);
    assert.equal(socket.listeners("project:message").filter((fn) => fn !== foreign).length, 1);
    second();
    assert.deepEqual(socket.listeners("project:message"), [foreign]);
    assert.deepEqual(socket.listeners("canvas:ops"), [foreign]);
    assert.equal(socket.sent.some((item) => item.event === "workspace:join"), false);
  });

  it("does not fetch before the workspace is ready and ignores turn, presence, and sync updates", async () => {
    const socket = createSocket();
    useSessionStore.setState({
      authUser: { _id: SELF, fullName: "Ada Lovelace", img: "" },
      socket,
      isConnected: true,
    });
    const disposeChat = bindProjectChat(socket, PROJECT);
    await drained();
    assert.equal(requests.length, 0);
    const dispose = await connect(socket, { role: "viewer", turn: null });
    assert.equal(gets().length, 1);
    assert.equal(gets()[0].params.limit, 50);
    assert.equal(gets()[0].params.before, undefined);
    const state = useWorkspaceStore.getState();
    assert.equal(selectCanChat(state), true);
    assert.equal(selectCanEdit(state), false);
    assert.equal(selectIsHolder(state), false);
    useWorkspaceStore.setState({ syncStatus: "syncing", turn: { holder: null, queue: [] } });
    socket.fire("presence:update", {
      projectId: PROJECT,
      participants: [person(SELF, "Ada Lovelace", "viewer"), person(OTHER, "Samuel")],
    });
    socket.fire("turn:state", { projectId: PROJECT, holder: null });
    await drained();
    assert.equal(gets().length, 1);
    assert.equal(useWorkspaceStore.getState().status, "ready");
    disposeChat();
    dispose();
  });

  it("lets every role send without a turn and refuses a disconnected binding", async () => {
    for (const role of ["owner", "editor", "viewer"]) {
      requests.length = 0;
      const socket = createSocket(`sock-${role}`);
      handler = async (config) => {
        if (config.method === "post") {
          return httpOk({ message: message(M1, T1, { text: parsedBody(config).text, sender: { _id: SELF, fullName: "Ada Lovelace", img: "" } }) }, 201);
        }
        return httpOk(historyPage([]));
      };
      const dispose = await connect(socket, { role, turn: null });
      assert.equal(selectCanChat(useWorkspaceStore.getState()), true);
      useProjectChatStore.getState().setComposerText("hello");
      const result = await useProjectChatStore.getState().sendMessage();
      assert.equal(result.ok, true);
      assert.equal(posts().length, 1);
      dispose();
    }

    requests.length = 0;
    const socket = createSocket("sock-down");
    const dispose = await connect(socket);
    requests.length = 0;
    socket.connected = false;
    socket.fire("disconnect");
    useProjectChatStore.getState().setComposerText("offline");
    const denied = await useProjectChatStore.getState().sendMessage();
    assert.equal(denied.ok, false);
    assert.equal(posts().length, 0);
    dispose();
  });

  it("pages with both cursor fields and keeps live rows that arrive while a page is in flight", async () => {
    const initial = defer();
    const earlier = defer();
    let phase = "initial";
    handler = async (config) => {
      if (phase === "initial") return initial.promise;
      assert.deepEqual(config.params, { limit: 50, before: T2, beforeId: M2 });
      return earlier.promise;
    };
    const socket = createSocket();
    const dispose = await connect(socket);
    assert.equal(gets().length, 1);
    socket.fire("project:message", live(M3, T3, { text: "live" }));
    phase = "earlier";
    initial.resolve(httpOk(historyPage([message(M2, T2, { text: "page" })], true)));
    await drained();
    assert.deepEqual(useProjectChatStore.getState().messages.map((item) => item._id), [M2, M3]);
    assert.deepEqual(useProjectChatStore.getState().nextCursor, { before: T2, beforeId: M2 });

    const pending = useProjectChatStore.getState().loadEarlier();
    socket.fire("project:message", live(M3, T3, { text: "again" }));
    earlier.resolve(httpOk(historyPage([message(M1, T1, { text: "older" })], true)));
    assert.equal((await pending).ok, true);
    await drained();
    assert.deepEqual(useProjectChatStore.getState().messages.map((item) => item._id), [M1, M2, M3]);
    assert.deepEqual(useProjectChatStore.getState().nextCursor, { before: T1, beforeId: M1 });
    assert.equal(useProjectChatStore.getState().unreadCount, 1);
    dispose();
  });

  it("replaces the history window on reconnect instead of replaying the gap", async () => {
    handler = async () => httpOk(historyPage([message(M1, T1)], true));
    const socket = createSocket();
    const dispose = await connect(socket);
    useProjectChatStore.getState().setOpen(true);
    useProjectChatStore.getState().setComposerText("draft");
    const file = { type: "image/png", size: 12, name: "a.png" };
    assert.equal(useProjectChatStore.getState().setAttachment(file).ok, true);
    assert.equal(useProjectChatStore.getState().messages.length, 1);

    requests.length = 0;
    handler = async (config) => {
      assert.equal(config.params.before, undefined);
      assert.equal(config.params.beforeId, undefined);
      return httpOk(historyPage([message(M2, T2, { text: "newest" })], true));
    };
    socket.connected = false;
    socket.fire("disconnect");
    assert.equal(useProjectChatStore.getState().messages.length, 0);
    assert.equal(useProjectChatStore.getState().composerText, "draft");
    assert.equal(useProjectChatStore.getState().attachment, file);
    assert.equal(useProjectChatStore.getState().isOpen, true);
    assert.equal(useWorkspaceStore.getState().status, "loading");

    socket.connected = true;
    socket.id = "sock-rejoin";
    socket.fire("connect");
    await drained();
    assert.deepEqual(useProjectChatStore.getState().messages.map((item) => item.text), ["newest"]);
    assert.deepEqual(useProjectChatStore.getState().nextCursor, { before: T2, beforeId: M2 });
    assert.equal(useProjectChatStore.getState().composerText, "draft");
    assert.equal(chimes.length, 0);
    assert.equal(useProjectChatStore.getState().unreadCount, 0);
    dispose();
  });

  it("sends JSON or multipart once, keeps the draft after failure, and ignores a stale completion", async () => {
    const sendGate = defer();
    handler = async (config) => {
      if (config.method === "post") return sendGate.promise;
      return httpOk(historyPage([]));
    };
    const socket = createSocket();
    const dispose = await connect(socket);
    const empty = await useProjectChatStore.getState().sendMessage();
    assert.equal(empty.reason, "empty");
    assert.equal(posts().length, 0);

    useProjectChatStore.getState().setComposerText("  ");
    assert.equal((await useProjectChatStore.getState().sendMessage()).reason, "empty");
    useProjectChatStore.setState({ composerText: "x".repeat(2001) });
    assert.equal((await useProjectChatStore.getState().sendMessage()).reason, "length");

    const pdf = { type: "application/pdf", size: 10, name: "a.pdf" };
    assert.equal(useProjectChatStore.getState().setAttachment(pdf).ok, false);
    assert.equal(errors.at(-1), "Only image and video uploads are allowed");
    assert.equal(useProjectChatStore.getState().attachment, null);
    const huge = { type: "video/mp4", size: (25 * 1024 * 1024) + 1, name: "big.mp4" };
    assert.equal(useProjectChatStore.getState().setAttachment(huge).ok, false);
    assert.match(errors.at(-1), /25 MB/);

    const file = new File([new Uint8Array([1, 2])], "clip.mp4", { type: "video/mp4" });
    useProjectChatStore.getState().setComposerText("caption");
    assert.equal(useProjectChatStore.getState().setAttachment(file).ok, true);
    const first = useProjectChatStore.getState().sendMessage();
    const second = await useProjectChatStore.getState().sendMessage();
    assert.equal(second.reason, "busy");
    await drained();
    assert.equal(posts().length, 1);
    const post = posts()[0];
    assert.equal(typeof post.data.get, "function");
    assert.equal(post.data.get("text"), "caption");
    assert.equal(post.data.get("media"), file);
    useProjectChatStore.getState().setComposerText("changed");
    assert.equal(useProjectChatStore.getState().composerText, "caption");

    sendGate.reject(httpError(503, "Media upload is not configured"));
    const failed = await first;
    assert.equal(failed.ok, false);
    assert.equal(failed.message, "Media upload is not configured");
    assert.deepEqual(errors, [
      "Only image and video uploads are allowed",
      "Attachment must be 25 MB or smaller",
      "Media upload is not configured",
    ]);
    assert.equal(useProjectChatStore.getState().composerText, "caption");
    assert.equal(useProjectChatStore.getState().attachment, file);
    assert.equal(useProjectChatStore.getState().isSending, false);
    assert.equal(useWorkspaceStore.getState().status, "ready");

    requests.length = 0;
    const late = defer();
    handler = async (config) => (config.method === "post" ? late.promise : httpOk(historyPage([])));
    useProjectChatStore.getState().setComposerText("hello");
    useProjectChatStore.getState().setAttachment(null);
    const pending = useProjectChatStore.getState().sendMessage();
    await flush();
    assert.deepEqual(parsedBody(posts()[0]), { text: "hello" });
    const next = createSocket("sock-b");
    const disposeNext = await connect(next, { projectId: OTHER_PROJECT });
    useProjectChatStore.getState().setComposerText("next");
    late.resolve(httpOk({
      message: message(M1, T1, { text: "hello", project: PROJECT, sender: { _id: SELF, fullName: "Ada Lovelace", img: "" } }),
    }, 201));
    assert.equal((await pending).reason, "stale");
    assert.equal(useProjectChatStore.getState().composerText, "next");
    assert.equal(useProjectChatStore.getState().messages.some((item) => item.project === PROJECT), false);
    dispose();
    disposeNext();
  });

  it("dedupes a socket echo, stays quiet for own messages, and counts a remote message once", async () => {
    const gate = defer();
    handler = async (config) => (config.method === "post" ? gate.promise : httpOk(historyPage([])));
    const socket = createSocket();
    const dispose = await connect(socket);
    useProjectChatStore.getState().setComposerText("hello");
    const pending = useProjectChatStore.getState().sendMessage();
    const own = message(M1, T1, { text: "hello", sender: { _id: SELF, fullName: "Ada Lovelace", img: "" } });
    socket.fire("project:message", { projectId: PROJECT, message: own });
    gate.resolve(httpOk({ message: own }, 201));
    assert.equal((await pending).ok, true);
    socket.fire("project:message", { projectId: PROJECT, message: own });
    assert.equal(useProjectChatStore.getState().messages.length, 1);
    assert.equal(useProjectChatStore.getState().unreadCount, 0);
    assert.equal(chimes.length, 0);
    assert.equal(useProjectChatStore.getState().composerText, "");

    useProjectChatStore.getState().setOpen(false);
    socket.fire("project:message", live(M2, T2, { text: "from sam" }));
    socket.fire("project:message", live(M2, T2, { text: "from sam" }));
    assert.equal(useProjectChatStore.getState().unreadCount, 1);
    assert.equal(chimes.length, 2);
    useProjectChatStore.getState().setOpen(true);
    assert.equal(useProjectChatStore.getState().unreadCount, 0);
    socket.fire("project:message", live(M3, T3));
    assert.equal(useProjectChatStore.getState().unreadCount, 0);
    assert.ok(chimes.length > 2);

    globalThis.document.visibilityState = "hidden";
    useProjectChatStore.getState().setOpen(true);
    socket.fire("project:message", live("64b0000000000000000000d4", "2026-11-11T00:00:04.000Z"));
    assert.equal(useProjectChatStore.getState().unreadCount, 1);
    useProjectChatStore.getState().setOpen(true);
    assert.equal(useProjectChatStore.getState().unreadCount, 1);
    globalThis.document.visibilityState = "visible";
    emitVisibility();
    assert.equal(useProjectChatStore.getState().unreadCount, 0);

    audioThrows = true;
    socket.fire("project:message", live("64b0000000000000000000d5", "2026-11-11T00:00:05.000Z", { text: "still here" }));
    assert.equal(useProjectChatStore.getState().messages.at(-1).text, "still here");
    socket.fire("project:message", { projectId: OTHER_PROJECT, message: message(M1, T1, { project: OTHER_PROJECT }) });
    socket.fire("project:message", { projectId: PROJECT, message: message(M1, "not-a-date") });
    assert.equal(useProjectChatStore.getState().messages.some((item) => item.project === OTHER_PROJECT), false);
    dispose();
  });

  it("persists only the sound boolean and survives bad storage", async () => {
    useProjectChatStore.getState().setSoundEnabled(false);
    useProjectChatStore.setState({ composerText: "secret", unreadCount: 4, isOpen: true });
    const raw = storage.getItem("ajfm88-collaborate");
    assert.deepEqual(JSON.parse(raw).state, { isSoundEnabled: false });
    storage.setItem("ajfm88-collaborate", JSON.stringify({
      state: { isSoundEnabled: false, composerText: "leak", messages: [{ _id: "nope" }] },
      version: 0,
    }));
    await useProjectChatStore.persist.rehydrate();
    assert.equal(useProjectChatStore.getState().isSoundEnabled, false);
    assert.equal(useProjectChatStore.getState().composerText, "secret");
    storage.setItem("ajfm88-collaborate", "{");
    await useProjectChatStore.persist.rehydrate();
    assert.equal(useProjectChatStore.getState().composerText, "secret");
    const blow = storage.setItem;
    storage.setItem = () => {
      throw new Error("storage blocked");
    };
    useProjectChatStore.getState().setSoundEnabled(true);
    assert.equal(useProjectChatStore.getState().isSoundEnabled, true);
    storage.setItem = blow;
  });

  it("types for every role, expires per user, and drops flags when authority or presence ends", async () => {
    handler = async () => httpOk(historyPage([]));
    const socket = createSocket();
    const dispose = await connect(socket, { role: "viewer", turn: null });
    clock.install();
    try {
      useProjectChatStore.getState().setAttachment({ type: "image/png", size: 4, name: "a.png" });
      assert.equal(typingEmits(socket).length, 0);
      useProjectChatStore.getState().setComposerText("a");
      useProjectChatStore.getState().setComposerText("ab");
      assert.deepEqual(typingEmits(socket).map((item) => item.payload), [
        { projectId: PROJECT, isTyping: true },
      ]);
      clock.advance(2000);
      useProjectChatStore.getState().setComposerText("abc");
      assert.equal(typingEmits(socket).at(-1).payload.isTyping, true);
      useProjectChatStore.getState().stopTyping();
      assert.equal(typingEmits(socket).at(-1).payload.isTyping, false);
      useProjectChatStore.getState().setComposerText("again");
      useProjectChatStore.getState().setOpen(false);
      assert.equal(typingEmits(socket).at(-1).payload.isTyping, false);

      socket.fire("project:typing", { projectId: PROJECT, userId: OTHER, isTyping: true });
      socket.fire("project:typing", { projectId: PROJECT, userId: SELF, isTyping: true });
      socket.fire("project:typing", { projectId: PROJECT, userId: THIRD, isTyping: true });
      socket.fire("project:typing", { projectId: OTHER_PROJECT, userId: OTHER, isTyping: true });
      socket.fire("project:typing", { projectId: PROJECT, userId: OTHER, isTyping: "yes" });
      assert.deepEqual(useProjectChatStore.getState().typingUserIds, [OTHER]);
      clock.advance(4999);
      assert.deepEqual(useProjectChatStore.getState().typingUserIds, [OTHER]);
      socket.fire("project:typing", { projectId: PROJECT, userId: OTHER, isTyping: true });
      clock.advance(1000);
      assert.deepEqual(useProjectChatStore.getState().typingUserIds, [OTHER]);
      useWorkspaceStore.setState({
        participants: [person(SELF, "Ada Lovelace", "viewer"), person(OTHER, "Samantha")],
      });
      assert.deepEqual(useProjectChatStore.getState().typingUserIds, [OTHER]);
      socket.fire("project:message", live(M2, T2));
      assert.deepEqual(useProjectChatStore.getState().typingUserIds, []);
      socket.fire("project:typing", { projectId: PROJECT, userId: OTHER, isTyping: true });
      useWorkspaceStore.setState({ participants: [person(SELF, "Ada Lovelace", "viewer")] });
      assert.deepEqual(useProjectChatStore.getState().typingUserIds, []);

      const pending = clock.pending();
      socket.connected = false;
      socket.fire("disconnect");
      socket.fire("project:typing", { projectId: PROJECT, userId: OTHER, isTyping: true });
      assert.deepEqual(useProjectChatStore.getState().typingUserIds, []);
      clock.advance(10000);
      assert.equal(clock.pending(), 0);
      assert.ok(pending >= 0);
      assert.equal(useProjectChatStore.getState().composerText, "again");
    } finally {
      clock.restore();
    }
    dispose();
  });

  it("drops an old page, send, and timer when the same socket retries or the route changes", async () => {
    const initial = defer();
    handler = async () => initial.promise;
    const socket = createSocket();
    const dispose = await connect(socket);
    useProjectChatStore.getState().setComposerText("keep");
    socket.active = false;
    socket.connected = false;
    socket.fire("disconnect");
    initial.resolve(httpOk(historyPage([message(M1, T1, { text: "stale" })])));
    await drained();
    assert.equal(useProjectChatStore.getState().messages.length, 0);
    assert.equal(useProjectChatStore.getState().composerText, "");
    assert.equal(useWorkspaceStore.getState().status, "error");

    requests.length = 0;
    handler = async () => httpOk(historyPage([message(M2, T2, { text: "fresh" })]));
    socket.active = true;
    socket.connected = true;
    useWorkspaceStore.getState().retryWorkspace();
    await drained();
    assert.deepEqual(useProjectChatStore.getState().messages.map((item) => item.text), ["fresh"]);
    assert.equal(gets().every((config) => config.params.before === undefined), true);
    assert.equal(useWorkspaceStore.getState().turn, null);
    dispose();
  });

  it("drops old callbacks when the account or session socket changes", async () => {
    handler = async () => httpOk(historyPage([message(M1, T1, { text: "kept" })]));
    const socket = createSocket("sock-account");
    const dispose = await connect(socket);
    useProjectChatStore.getState().setComposerText("old draft");
    assert.equal(selectCanChat(useWorkspaceStore.getState()), true);
    useSessionStore.setState({
      authUser: { _id: THIRD, fullName: "Third", img: "" },
    });
    assert.equal(selectCanChat(useWorkspaceStore.getState()), false);
    assert.equal(useProjectChatStore.getState().messages.length, 0);
    assert.equal(useProjectChatStore.getState().composerText, "");
    socket.fire("project:message", live(M2, T2, { text: "packet on old account socket" }));
    assert.equal(
      useProjectChatStore.getState().messages.some((item) => item.text === "packet on old account socket"),
      false,
    );
    dispose();

    const sendGate = defer();
    handler = async (config) => (
      config.method === "post"
        ? sendGate.promise
        : httpOk(historyPage([]))
    );
    const sendSocket = createSocket("sock-send");
    const disposeSend = await connect(sendSocket);
    useProjectChatStore.getState().setComposerText("retain this draft");
    const pending = useProjectChatStore.getState().sendMessage();
    await drained();
    useSessionStore.setState({ socket: null, isConnected: false });
    sendGate.resolve(httpOk({
      message: message(M1, T1, {
        text: "retain this draft",
        sender: { _id: SELF, fullName: "Ada Lovelace", img: "" },
      }),
    }, 201));
    assert.equal((await pending).reason, "stale");
    assert.equal(useProjectChatStore.getState().composerText, "retain this draft");
    assert.equal(useProjectChatStore.getState().messages.length, 0);
    disposeSend();

    const initial = defer();
    handler = async () => initial.promise;
    const getSocket = createSocket("sock-get");
    const disposeGet = await connect(getSocket);
    useSessionStore.setState({ socket: null, isConnected: false });
    initial.resolve(httpOk(historyPage([message(M3, T3, { text: "stale page" })])));
    await drained();
    assert.equal(useProjectChatStore.getState().messages.length, 0);
    assert.notEqual(useProjectChatStore.getState().historyStatus, "ready");
    disposeGet();

    handler = async () => httpOk(historyPage([message(M2, T2, { text: "fresh page" })]));
    const next = createSocket("sock-new");
    const disposeNext = await connect(next);
    assert.equal(selectCanChat(useWorkspaceStore.getState()), true);
    assert.deepEqual(useProjectChatStore.getState().messages.map((item) => item.text), ["fresh page"]);
    next.fire("project:message", live(M3, T3, { text: "live after rebind" }));
    assert.equal(
      useProjectChatStore.getState().messages.some((item) => item.text === "live after rebind"),
      true,
    );
    disposeNext();
  });

  it("keeps a retried connection pinned to the account that authenticated it", async () => {
    handler = async () => httpOk(historyPage([message(M1, T1, { text: "kept" })]));
    const socket = createSocket("sock-pinned");
    const dispose = await connect(socket);
    assert.equal(selectCanChat(useWorkspaceStore.getState()), true);
    useSessionStore.setState({
      authUser: { _id: THIRD, fullName: "Third", img: "" },
    });
    assert.equal(selectCanChat(useWorkspaceStore.getState()), false);

    handler = async () => httpOk(historyPage([message(M2, T2, { text: "should not load" })]));
    useWorkspaceStore.getState().retryWorkspace();
    await drained();
    assert.equal(useWorkspaceStore.getState().status, "ready");
    assert.equal(selectCanChat(useWorkspaceStore.getState()), false);
    socket.fire("project:message", live(M3, T3, { text: "old account traffic after retry" }));
    assert.equal(
      useProjectChatStore.getState().messages.some((item) => item.text === "old account traffic after retry"),
      false,
    );
    dispose();

    handler = async () => httpOk(historyPage([message(M1, T1, { text: "third page" })]));
    const fresh = createSocket("sock-third");
    useSessionStore.setState({
      authUser: { _id: THIRD, fullName: "Third", img: "" },
      socket: fresh,
      isConnected: true,
    });
    fresh.handler = (event) => (
      event === "workspace:join"
        ? Promise.resolve(ack())
        : Promise.resolve({ ok: false, message: "unexpected" })
    );
    const disposeChat = bindProjectChat(fresh, PROJECT);
    const disposeWorkspace = useWorkspaceStore.getState().bindWorkspace(fresh, PROJECT);
    await drained();
    assert.equal(selectCanChat(useWorkspaceStore.getState()), true);
    assert.deepEqual(useProjectChatStore.getState().messages.map((item) => item.text), ["third page"]);
    fresh.fire("project:message", live(M2, T2, { text: "live on the new connection" }));
    assert.equal(
      useProjectChatStore.getState().messages.some((item) => item.text === "live on the new connection"),
      true,
    );
    disposeChat();
    disposeWorkspace();
  });
});
