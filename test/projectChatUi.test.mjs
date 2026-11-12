import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { createElement as reactCreateElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
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
const SELF = "64b0000000000000000000a1";
const OTHER = "64b0000000000000000000b2";
const T1 = "2026-11-11T00:00:01.000Z";

function message(patch = {}) {
  return {
    _id: patch._id ?? "64b0000000000000000000d1",
    project: PROJECT,
    sender: patch.sender === undefined ? { _id: OTHER, fullName: "Sam", img: "" } : patch.sender,
    text: patch.text ?? "Hello",
    image: patch.image ?? "",
    video: patch.video ?? "",
    createdAt: patch.createdAt ?? T1,
    updatedAt: patch.updatedAt ?? patch.createdAt ?? T1,
  };
}

describe("project chat ui", () => {
  let vite;
  let restoreReact;
  let createElement;
  let renderToStaticMarkup;
  let MemoryRouter;
  let useProjectChatStore;
  let useWorkspaceStore;
  let useSessionStore;
  let ProjectChatPanel;
  let ProjectMessageList;
  let ProjectComposer;
  let WorkspaceNavbar;
  let chat;
  let scroll;
  let originalWindow;

  before(async () => {
    restoreReact = useClientSnapshotOnServer();
    originalWindow = globalThis.window;
    globalThis.window = {
      document: globalThis.document,
      location: { href: "http://127.0.0.1:3000/" },
      visualViewport: { height: 640, addEventListener() {}, removeEventListener() {} },
      matchMedia: () => ({ matches: true }),
      AudioContext: class {
        constructor() {
          throw new Error("no audio in markup");
        }
      },
    };
    vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: "custom",
      logLevel: "error",
    });
    const renderMod = await vite.ssrLoadModule("/test/ssrRender.js");
    const chatMod = await vite.ssrLoadModule("/src/collaborate/store/useProjectChatStore.js");
    const workspaceMod = await vite.ssrLoadModule("/src/collaborate/store/useWorkspaceStore.js");
    const sessionMod = await vite.ssrLoadModule("/src/collaborate/store/useSessionStore.js");
    const panelMod = await vite.ssrLoadModule("/src/collaborate/components/chat/ProjectChatPanel.jsx");
    const listMod = await vite.ssrLoadModule("/src/collaborate/components/chat/ProjectMessageList.jsx");
    const composerMod = await vite.ssrLoadModule("/src/collaborate/components/chat/ProjectComposer.jsx");
    const navMod = await vite.ssrLoadModule("/src/collaborate/components/workspace/WorkspaceNavbar.jsx");
    chat = await vite.ssrLoadModule("/src/collaborate/lib/projectChat.js");
    scroll = await vite.ssrLoadModule("/src/collaborate/hooks/useProjectChatScroll.js");
    createElement = renderMod.createElement;
    renderToStaticMarkup = renderMod.renderToStaticMarkup;
    MemoryRouter = renderMod.MemoryRouter;
    useProjectChatStore = chatMod.useProjectChatStore;
    useWorkspaceStore = workspaceMod.useWorkspaceStore;
    useSessionStore = sessionMod.useSessionStore;
    ProjectChatPanel = panelMod.default;
    ProjectMessageList = listMod.default;
    ProjectComposer = composerMod.default;
    WorkspaceNavbar = navMod.default;
  });

  after(async () => {
    useProjectChatStore?.getState().resetProjectChat();
    useWorkspaceStore?.getState().resetWorkspace();
    globalThis.window = originalWindow;
    restoreReact?.();
    await vite?.close();
  });

  function render(node) {
    return renderToStaticMarkup(node);
  }

  function panel() {
    return render(createElement(ProjectChatPanel));
  }

  function list() {
    return render(createElement(ProjectMessageList));
  }

  function composer() {
    return render(createElement(ProjectComposer));
  }

  function navbar() {
    return render(createElement(MemoryRouter, null, createElement(WorkspaceNavbar)));
  }

  it("decides keyboard, escape, unread, and typing copy without rendering effects", () => {
    assert.deepEqual(chat.composerKeyDecision({ key: "Enter", shiftKey: false }), { send: true, newline: false });
    assert.deepEqual(chat.composerKeyDecision({ key: "Enter", shiftKey: true }), { send: false, newline: true });
    assert.deepEqual(chat.composerKeyDecision({ key: "Enter", isComposing: true }), { send: false, newline: false });
    assert.deepEqual(chat.composerKeyDecision({ key: "Enter", keyCode: 229 }), { send: false, newline: false });
    assert.equal(chat.composerKeyDecision({ key: "a" }).send, false);
    assert.equal(chat.shouldCloseChatOnEscape({ key: "Escape" }, true), true);
    assert.equal(chat.shouldCloseChatOnEscape({ key: "Escape" }, false), false);
    assert.equal(chat.shouldCloseChatOnEscape({ key: "Escape", isComposing: true }, true), false);
    assert.equal(chat.unreadBadge(0), "");
    assert.equal(chat.unreadBadge(100), "99+");
    assert.equal(chat.unreadLabel(1), "Chat, 1 unread message");
    assert.equal(chat.unreadLabel(100), "Chat, 99+ unread messages");
    assert.equal(chat.typingLabel(["Sam"]), "Sam is typing…");
    assert.equal(chat.typingLabel(["Sam", "Ada"]), "Sam and Ada are typing…");
    assert.equal(chat.typingLabel(["Sam", "Ada", "Jo"]), "Several people are typing…");
  });

  it("anchors a prepend by message id when a live row is also appended", () => {
    const before = [
      { id: "a", offsetTop: 0, offsetHeight: 40 },
      { id: "b", offsetTop: 40, offsetHeight: 40 },
    ];
    const anchor = scroll.anchorFromBoxes(before, 20);
    assert.deepEqual(anchor, { id: "a", offset: -20 });
    const after = [
      { id: "old", offsetTop: 0, offsetHeight: 30 },
      { id: "a", offsetTop: 80, offsetHeight: 40 },
      { id: "b", offsetTop: 120, offsetHeight: 40 },
      { id: "live", offsetTop: 500, offsetHeight: 80 },
    ];
    assert.equal(scroll.scrollTopForAnchor(after.find((box) => box.id === "a"), anchor), 100);
    assert.deepEqual(scroll.planScrollAction({ reason: "initial" }), { type: "bottom" });
    assert.deepEqual(scroll.planScrollAction({ reason: "own-send", distance: 400 }), { type: "bottom" });
    assert.deepEqual(scroll.planScrollAction({ reason: "live", distance: 64 }), { type: "bottom" });
    assert.deepEqual(scroll.planScrollAction({ reason: "live", distance: 65 }), { type: "stay" });
    assert.deepEqual(scroll.planScrollAction({ reason: "hold", anchor }), { type: "anchor", anchor });
    assert.equal(scroll.nextScrollTop(10, 10.2), 10);
    assert.equal(scroll.nextScrollTop(10, 40), 40);

    const created = [];
    const revoked = [];
    const api = {
      createObjectURL: (file) => {
        created.push(file);
        return "blob:preview";
      },
      revokeObjectURL: (url) => revoked.push(url),
    };
    const next = chat.syncPreviewUrl("blob:old", { name: "a.png" }, api);
    assert.equal(next, "blob:preview");
    assert.deepEqual(revoked, ["blob:old"]);
    assert.equal(chat.syncPreviewUrl(next, null, api), null);
    assert.deepEqual(revoked, ["blob:old", "blob:preview"]);
    assert.equal(chat.syncPreviewUrl(null, { name: "a.png" }, null), null);
    assert.equal(created.length, 1);
  });

  it("renders loading, empty, error, history, and escaped bubbles", () => {
    useSessionStore.setState({ authUser: { _id: SELF, fullName: "Ada Lovelace", img: "" } });
    useWorkspaceStore.setState({
      status: "ready",
      role: "viewer",
      project: { _id: PROJECT, name: "A very long project title that must shrink", description: "" },
      participants: [
        { userId: SELF, fullName: "Ada Lovelace", img: "", role: "viewer" },
        { userId: OTHER, fullName: "Sam", img: "", role: "editor" },
        { userId: "64b0000000000000000000c3", fullName: "Jo", img: "", role: "editor" },
      ],
    });
    useProjectChatStore.setState({
      historyStatus: "loading",
      messages: [],
      isOpen: true,
      typingUserIds: [],
    });
    assert.match(list(), /Loading messages/);

    useProjectChatStore.setState({ historyStatus: "error", historyError: "Project not found" });
    const errorHtml = list();
    assert.match(errorHtml, /Couldn(?:'|&#x27;)t load messages/);
    assert.match(errorHtml, /Project not found/);
    assert.match(errorHtml, /Retry/);

    useProjectChatStore.setState({ historyStatus: "ready", historyError: "", messages: [], hasMore: false });
    assert.match(list(), /No messages yet\. Say hello!/);

    useProjectChatStore.setState({
      historyStatus: "ready",
      hasMore: true,
      earlierStatus: "idle",
      messages: [
        message({ text: "line\n<script>alert(1)</script>" }),
        message({
          _id: "64b0000000000000000000d2",
          createdAt: "2026-11-11T00:00:02.000Z",
          sender: { _id: SELF, fullName: "Ada Lovelace", img: "" },
          text: "mine",
          image: "https://cdn.example/a.png",
        }),
        message({
          _id: "64b0000000000000000000d3",
          createdAt: "2026-11-11T00:00:03.000Z",
          sender: null,
          text: "",
          video: "https://cdn.example/a.mp4",
        }),
      ],
    });
    const html = list();
    assert.match(html, /Load earlier/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;|script&gt;alert/);
    assert.match(html, /You/);
    assert.match(html, /Deleted user/);
    assert.match(html, /Open image/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /https:\/\/cdn\.example\/a\.png/);
    assert.match(html, /Open video/);
    assert.match(html, /preload="metadata"/);
    assert.equal(html.includes("autoplay"), false);
    assert.match(html, /dateTime="2026-11-11T00:00:01.000Z"/);

    useProjectChatStore.setState({ earlierStatus: "error", earlierError: "Couldn't load earlier messages" });
    const earlier = list();
    assert.match(earlier, /Couldn(?:'|&#x27;)t load earlier messages/);
    assert.match(earlier, /Retry/);
    assert.equal(earlier.includes("Load earlier"), false);
    assert.match(earlier, /line/);
  });

  it("keeps the composer available for a viewer and labels the navbar badge", () => {
    useWorkspaceStore.setState({
      status: "ready",
      role: "viewer",
      project: { _id: PROJECT, name: "A very long project title that must shrink", description: "" },
      participants: [],
    });
    useProjectChatStore.setState({
      historyStatus: "error",
      isSending: false,
      composerText: "draft",
      isOpen: false,
      unreadCount: 100,
      isSoundEnabled: true,
      typingUserIds: [OTHER, SELF, "64b0000000000000000000c3"],
    });
    const fields = composer();
    assert.match(fields, /Message the project/);
    assert.match(fields, /Attach image or video/);
    assert.match(fields, /disabled=""/);
    assert.match(fields, /<textarea/);
    assert.equal(fields.includes("disabled=\"\"></textarea>") || fields.includes("<textarea"), true);
    const textarea = fields.match(/<textarea\b[^>]*>/)?.[0] ?? "";
    assert.equal(/(?:^|\s)disabled(?:=|\s|>)/.test(textarea), false);

    useProjectChatStore.setState({
      isOpen: true,
      historyStatus: "ready",
      typingUserIds: [OTHER, "64b0000000000000000000c3", SELF],
    });
    useWorkspaceStore.setState({
      participants: [
        { userId: OTHER, fullName: "Sam", img: "", role: "editor" },
        { userId: "64b0000000000000000000c3", fullName: "Jo", img: "", role: "editor" },
        { userId: SELF, fullName: "Ada", img: "", role: "viewer" },
      ],
    });
    const open = panel();
    assert.match(open, /aria-label="Project chat"/);
    assert.equal(open.includes("aria-modal"), false);
    assert.match(open, /Close chat/);
    assert.match(open, /aria-pressed="true"/);
    assert.match(open, /Mute message sound/);
    assert.match(open, /lg:w-80/);
    assert.match(open, /max-h-\[70%\]/);
    assert.match(open, /Sam and Jo are typing…/);

    const bar = navbar();
    assert.match(bar, /aria-expanded="true"/);
    assert.match(bar, /aria-controls="project-chat-panel"/);
    assert.match(bar, /Chat, 99\+ unread messages/);
    assert.match(bar, /99\+/);
    assert.match(bar, /min-w-0 truncate/);
    assert.match(bar, /A very long project title that must shrink/);

    const focused = { focused: false, focus() { this.focused = true; } };
    const doc = { getElementById: () => focused };
    assert.equal(chat.focusChatToggle(doc), focused);
    assert.equal(focused.focused, true);
  });

  it("keeps the earlier-page anchor across retry and follows content resize", async () => {
    const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const previous = {
      window: globalThis.window,
      document: globalThis.document,
      ResizeObserver: globalThis.ResizeObserver,
      Node: globalThis.Node,
      HTMLElement: globalThis.HTMLElement,
    };
    const metrics = new Map();
    const observed = [];
    const observers = [];
    function listen(target) {
      const sets = new Map();
      target.addEventListener = (type, fn) => {
        if (!sets.has(type)) sets.set(type, new Set());
        sets.get(type).add(fn);
      };
      target.removeEventListener = (type, fn) => {
        sets.get(type)?.delete(fn);
      };
      target.dispatchEvent = (event) => {
        for (const fn of [...(sets.get(event?.type) ?? [])]) fn(event);
        return true;
      };
    }
    function node(name, ownerDocument) {
      const el = {
        nodeType: 1,
        nodeName: String(name).toUpperCase(),
        tagName: String(name).toUpperCase(),
        style: {},
        attrs: {},
        childNodes: [],
        parentNode: null,
        ownerDocument,
        namespaceURI: "http://www.w3.org/1999/xhtml",
        textContent: "",
        scrollTop: 0,
        scrollHeight: 0,
        clientHeight: 0,
        setAttribute(attr, value) {
          el.attrs[attr] = String(value);
        },
        getAttribute(attr) {
          return Object.prototype.hasOwnProperty.call(el.attrs, attr) ? el.attrs[attr] : null;
        },
        removeAttribute(attr) {
          delete el.attrs[attr];
        },
        focus() {},
        appendChild(child) {
          child.parentNode = el;
          el.childNodes.push(child);
          return child;
        },
        removeChild(child) {
          el.childNodes = el.childNodes.filter((item) => item !== child);
          child.parentNode = null;
          return child;
        },
        insertBefore(child, before) {
          child.parentNode = el;
          const index = el.childNodes.indexOf(before);
          if (index < 0) el.childNodes.push(child);
          else el.childNodes.splice(index, 0, child);
          return child;
        },
        querySelector(selector) {
          return el.querySelectorAll(selector)[0] ?? null;
        },
        querySelectorAll(selector) {
          const found = [];
          const visit = (item) => {
            for (const child of item.childNodes) {
              if (child.nodeType !== 1) continue;
              const present = child.attrs && Object.prototype.hasOwnProperty.call(child.attrs, selector.slice(1, -1));
              if (selector.startsWith("[") && selector.endsWith("]") && present) found.push(child);
              visit(child);
            }
          };
          visit(el);
          return found;
        },
      };
      Object.defineProperty(el, "offsetTop", {
        get() {
          return metrics.get(el.attrs["data-message-id"])?.offsetTop ?? 0;
        },
      });
      Object.defineProperty(el, "offsetHeight", {
        get() {
          return metrics.get(el.attrs["data-message-id"])?.offsetHeight ?? 0;
        },
      });
      listen(el);
      return el;
    }
    const document = {
      nodeType: 9,
      documentElement: null,
      body: null,
      createElement: (name) => node(name, document),
      createElementNS: (_ns, name) => node(name, document),
      createTextNode: (text) => ({ nodeType: 3, nodeValue: String(text), textContent: String(text), parentNode: null }),
    };
    listen(document);
    function Ctor(name) {
      const fn = function ctor() {};
      Object.defineProperty(fn, "name", { value: name });
      return fn;
    }
    const view = {
      document,
      event: undefined,
      addEventListener() {},
      removeEventListener() {},
      getSelection() { return null; },
      HTMLElement: Ctor("HTMLElement"),
      HTMLIFrameElement: Ctor("HTMLIFrameElement"),
      Element: Ctor("Element"),
      Node: { ELEMENT_NODE: 1 },
    };
    document.defaultView = view;
    document.HTMLIFrameElement = view.HTMLIFrameElement;
    globalThis.document = document;
    globalThis.window = view;
    globalThis.Node = { ELEMENT_NODE: 1, DOCUMENT_NODE: 9, TEXT_NODE: 3, DOCUMENT_FRAGMENT_NODE: 11, COMMENT_NODE: 8 };
    globalThis.HTMLElement = view.HTMLElement;
    globalThis.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.target = null;
        this.dead = false;
        observers.push(this);
      }
      observe(target) {
        this.target = target;
        observed.push(target);
      }
      disconnect() {
        this.dead = true;
      }
      fire() {
        if (!this.dead) this.callback();
      }
    };
    const container = document.createElement("div");
    document.documentElement = container;
    document.body = container;
    const root = createRoot(container);
    const model = {
      messages: ["a"],
      earlierStatus: "idle",
      holdRef: null,
      listRef: null,
    };
    function Host() {
      const holdRef = useRef(null);
      const listRef = scroll.useProjectChatScroll({
        messages: model.messages,
        historyStatus: "ready",
        earlierStatus: model.earlierStatus,
        ownSendTick: 0,
        holdRef,
      });
      model.holdRef = holdRef;
      model.listRef = listRef;
      return reactCreateElement(
        "div",
        { ref: listRef },
        reactCreateElement(
          "div",
          { "data-project-chat-content": "true" },
          model.messages.map((id) => reactCreateElement("div", { key: id, "data-message-id": id })),
        ),
      );
    }
    try {
      await act(async () => {
        root.render(reactCreateElement(Host));
      });
      const scroller = model.listRef.current;
      assert.ok(scroller);
      assert.equal(observed.some((target) => target === scroller), false);
      assert.equal(observed.some((target) => target.getAttribute("data-project-chat-content") === "true"), true);

      scroller.scrollTop = 400;
      scroller.scrollHeight = 1000;
      scroller.clientHeight = 200;
      metrics.set("a", { offsetTop: 400, offsetHeight: 40 });
      let ran = 0;
      scroll.requestEarlier(scroller, model.holdRef, () => {
        ran += 1;
        model.earlierStatus = "loading";
      });
      assert.equal(ran, 1);
      assert.equal(model.holdRef.current.id, "a");
      await act(async () => {
        root.render(reactCreateElement(Host));
      });
      model.earlierStatus = "error";
      await act(async () => {
        root.render(reactCreateElement(Host));
      });
      assert.equal(model.holdRef.current?.id, "a");
      assert.equal(model.holdRef.current.offset, 0);

      model.messages = ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "a"];
      model.earlierStatus = "idle";
      for (let index = 0; index < 10; index += 1) {
        metrics.set(`p${index}`, { offsetTop: index * 40, offsetHeight: 40 });
      }
      metrics.set("a", { offsetTop: 800, offsetHeight: 40 });
      await act(async () => {
        root.render(reactCreateElement(Host));
      });
      assert.equal(scroller.scrollTop, 800);
      assert.equal(scroller.clientHeight, 200);

      scroller.scrollTop = 400;
      scroller.scrollHeight = 500;
      scroller.clientHeight = 100;
      model.messages = ["a"];
      model.earlierStatus = "idle";
      metrics.set("a", { offsetTop: 0, offsetHeight: 40 });
      await act(async () => {
        root.render(reactCreateElement(Host));
      });
      scroller.scrollHeight = 700;
      observers.at(-1).fire();
      assert.equal(scroller.clientHeight, 100);
      assert.equal(scroller.scrollTop, 700);

      model.messages = ["a", "b"];
      metrics.set("a", { offsetTop: 0, offsetHeight: 40 });
      metrics.set("b", { offsetTop: 200, offsetHeight: 40 });
      scroller.scrollTop = 200;
      scroller.scrollHeight = 1000;
      scroller.clientHeight = 100;
      await act(async () => {
        root.render(reactCreateElement(Host));
      });
      // That commit followed the bottom because a row arrived there. The reader
      // then scrolls up; the scroll listener, not another render, stores the row.
      scroller.scrollTop = 200;
      scroller.scrollHeight = 1000;
      scroller.clientHeight = 100;
      scroller.dispatchEvent({ type: "scroll" });
      metrics.set("b", { offsetTop: 360, offsetHeight: 40 });
      scroller.scrollHeight = 1160;
      observers.at(-1).fire();
      assert.equal(scroller.scrollTop, 360);
      assert.notEqual(scroller.scrollTop, scroller.scrollHeight);
      assert.equal(scroller.clientHeight, 100);

      model.messages = ["row10", "row30"];
      model.earlierStatus = "idle";
      metrics.set("row10", { offsetTop: 400, offsetHeight: 40 });
      metrics.set("row30", { offsetTop: 800, offsetHeight: 40 });
      scroller.scrollTop = 400;
      scroller.scrollHeight = 2000;
      scroller.clientHeight = 200;
      await act(async () => {
        root.render(reactCreateElement(Host));
      });
      scroll.requestEarlier(scroller, model.holdRef, () => {
        model.earlierStatus = "loading";
      });
      await act(async () => {
        root.render(reactCreateElement(Host));
      });
      model.earlierStatus = "error";
      await act(async () => {
        root.render(reactCreateElement(Host));
      });
      assert.equal(model.holdRef.current?.id, "row10");
      assert.equal(model.holdRef.current.offset, 0);

      scroller.scrollTop = 800;
      scroller.dispatchEvent({ type: "scroll" });
      assert.equal(model.holdRef.current, null);
      model.messages = ["row10", "row30", "live"];
      metrics.set("live", { offsetTop: 1680, offsetHeight: 40 });
      await act(async () => {
        root.render(reactCreateElement(Host));
      });
      assert.equal(scroller.scrollTop, 800);

      metrics.set("row30", { offsetTop: 960, offsetHeight: 40 });
      scroller.scrollHeight = 2200;
      observers.at(-1).fire();
      assert.equal(scroller.scrollTop, 960);
      assert.notEqual(scroller.scrollTop, 400);
      assert.equal(scroller.clientHeight, 200);
    } finally {
      await act(async () => {
        root.unmount();
      });
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.Node = previous.Node;
      globalThis.HTMLElement = previous.HTMLElement;
      if (previous.ResizeObserver === undefined) delete globalThis.ResizeObserver;
      else globalThis.ResizeObserver = previous.ResizeObserver;
    }
  });
});
