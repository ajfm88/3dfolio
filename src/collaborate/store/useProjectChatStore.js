import { toast } from "react-toastify";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { axiosInstance } from "../lib/axios.js";
import { canonicalUserId } from "../lib/cursorPresence.js";
import {
  PROJECT_CHAT_PAGE_LIMIT,
  PROJECT_CHAT_TEXT_MAX,
  SOUND_STORAGE_KEY,
  canonicalObjectId,
  createSoundStorage,
  cursorAdvances,
  mergeMessages,
  messageHasContent,
  normalizeMessage,
  normalizeMessageEvent,
  normalizeTypingEvent,
  validateAttachment,
  validateHistoryPage,
} from "../lib/projectChat.js";
import { playProjectMessageSound } from "../lib/projectMessageSound.js";
import { createIncomingTyping, createOutgoingTyping } from "../lib/projectTyping.js";
import { useSessionStore } from "./useSessionStore.js";
import { revokeJoinedAccount, selectCanChat, useWorkspaceStore } from "./useWorkspaceStore.js";

// Network state for one workspace binding. The workspace store does not import
// this module. A callback keeps the generation it captured and does nothing
// once the route, account, socket epoch, or retry has moved on.

let chatBinding = null;

function contentDefaults() {
  return {
    messages: [],
    historyStatus: "idle",
    historyError: "",
    earlierStatus: "idle",
    earlierError: "",
    hasMore: false,
    nextCursor: null,
    isOpen: false,
    unreadCount: 0,
    composerText: "",
    attachment: null,
    isSending: false,
    typingUserIds: [],
    ownSendTick: 0,
  };
}

function currentAccountId() {
  return canonicalUserId(useSessionStore.getState().authUser?._id);
}

function documentHidden() {
  const doc = globalThis.document;
  if (!doc || typeof doc.visibilityState !== "string") return false;
  return doc.visibilityState === "hidden";
}

function errorText(error, fallback) {
  const message = error?.response?.data?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function keptSound(state) {
  return {
    ...contentDefaults(),
    ownSendTick: state.ownSendTick,
    isSoundEnabled: state.isSoundEnabled,
  };
}

export const useProjectChatStore = create(
  persist(
    (set, get) => {
      function capture(binding) {
        return {
          binding,
          generation: binding.generation,
          epoch: binding.epoch,
          projectId: binding.projectId,
          accountId: binding.accountId,
          socketId: binding.socket?.id ?? "",
        };
      }

      function sessionOwns(binding) {
        if (!binding || chatBinding !== binding || binding.disposed) return false;
        const session = useSessionStore.getState();
        if (!session.socket || session.socket !== binding.socket) return false;
        if (!binding.accountId || currentAccountId() !== binding.accountId) return false;
        return true;
      }

      // The snap's own socket and join, not whichever workspace happens to be
      // ready now. A missing session socket or a different account fails closed.
      function same(snap) {
        const binding = snap.binding;
        if (!sessionOwns(binding)) return false;
        if (binding.generation !== snap.generation || binding.epoch !== snap.epoch) return false;
        if (binding.projectId !== snap.projectId || binding.accountId !== snap.accountId) return false;
        if ((binding.socket?.id ?? "") !== snap.socketId) return false;
        return selectCanChat(useWorkspaceStore.getState());
      }

      function canEmit(binding) {
        if (!sessionOwns(binding)) return false;
        if (!binding.socket?.connected) return false;
        if (get().isSending) return false;
        return selectCanChat(useWorkspaceStore.getState());
      }

      function emitTyping(binding, isTyping) {
        const socket = binding.socket;
        if (!socket?.connected || typeof socket.volatile?.emit !== "function") return;
        socket.volatile.emit("project:typing", {
          projectId: binding.projectId,
          isTyping: Boolean(isTyping),
        });
      }

      function suspend(binding) {
        if (chatBinding !== binding || binding.disposed) return;
        const state = get();
        const active = binding.armed
          || state.isSending
          || state.messages.length > 0
          || state.typingUserIds.length > 0
          || state.historyStatus !== "idle"
          || state.earlierStatus !== "idle"
          || state.unreadCount > 0;
        binding.outgoing.stop();
        binding.incoming.clearAll();
        binding.armed = false;
        if (!active) return;
        binding.generation += 1;
        binding.epoch += 1;
        binding.initialFlight = null;
        binding.earlierFlight = null;
        binding.sendOp = null;
        set({
          messages: [],
          historyStatus: "idle",
          historyError: "",
          earlierStatus: "idle",
          earlierError: "",
          hasMore: false,
          nextCursor: null,
          unreadCount: 0,
          isSending: false,
          typingUserIds: [],
        });
      }

      function invalidate(binding, { keepDraft }) {
        if (chatBinding !== binding || binding.disposed) return;
        binding.armed = false;
        binding.generation += 1;
        binding.epoch += 1;
        binding.initialFlight = null;
        binding.earlierFlight = null;
        binding.sendOp = null;
        binding.observedLiveIds.clear();
        binding.outgoing.stop();
        binding.incoming.clearAll();
        if (keepDraft) {
          set({
            messages: [],
            historyStatus: "idle",
            historyError: "",
            earlierStatus: "idle",
            earlierError: "",
            hasMore: false,
            nextCursor: null,
            unreadCount: 0,
            isSending: false,
            typingUserIds: [],
          });
          return;
        }
        set((state) => ({
          ...contentDefaults(),
          ownSendTick: state.ownSendTick,
          isSoundEnabled: state.isSoundEnabled,
        }));
      }

      function wipe(binding) {
        invalidate(binding, { keepDraft: false });
      }

      function release(binding) {
        if (!binding || binding.disposed) return;
        const owns = chatBinding === binding;
        if (owns) binding.outgoing?.dispose();
        binding.disposed = true;
        binding.generation += 1;
        binding.unsubWorkspace?.();
        binding.unsubSession?.();
        binding.removeVisibility?.();
        binding.unlisten?.();
        binding.incoming?.dispose();
        if (!owns) return;
        chatBinding = null;
        set((state) => keptSound(state));
      }

      function pruneTyping(binding, participants) {
        const present = new Set((participants ?? []).map((person) => person.userId));
        for (const userId of [...get().typingUserIds]) {
          if (!present.has(userId)) binding.incoming.clearUser(userId);
        }
      }

      function publishLive(binding, message) {
        if (!same(capture(binding))) return;
        const known = binding.observedLiveIds.has(message._id)
          || get().messages.some((item) => item._id === message._id);
        binding.observedLiveIds.add(message._id);
        if (message.sender?._id) binding.incoming.clearUser(message.sender._id);
        set((state) => ({ messages: mergeMessages(state.messages, [message]) }));
        if (known) return;
        if (message.sender?._id && message.sender._id === currentAccountId()) return;
        if (!get().isOpen || documentHidden()) {
          set((state) => ({ unreadCount: state.unreadCount + 1 }));
        }
        if (get().isSoundEnabled) playProjectMessageSound();
      }

      function hasProjectContent() {
        const state = get();
        return state.messages.length > 0
          || state.historyStatus !== "idle"
          || state.earlierStatus !== "idle"
          || state.isOpen
          || state.unreadCount > 0
          || state.composerText !== ""
          || state.attachment != null
          || state.isSending
          || state.typingUserIds.length > 0;
      }

      async function loadInitial(binding) {
        if (chatBinding !== binding || binding.disposed || binding.initialFlight) return { ok: false, reason: "busy" };
        if (!sessionOwns(binding) || !selectCanChat(useWorkspaceStore.getState())) return { ok: false, reason: "stale" };
        if (!canonicalObjectId(binding.projectId)) return { ok: false, reason: "stale" };
        const snap = capture(binding);
        binding.initialFlight = snap;
        set({ historyStatus: "loading", historyError: "", earlierStatus: "idle", earlierError: "" });
        try {
          const res = await axiosInstance.get(`/projects/${binding.projectId}/messages`, {
            params: { limit: PROJECT_CHAT_PAGE_LIMIT },
          });
          if (!same(snap)) return { ok: false, reason: "stale" };
          const page = validateHistoryPage(res.data, snap.projectId);
          if (!page.ok) {
            set({ historyStatus: "error", historyError: "Couldn't load messages" });
            return { ok: false, reason: "malformed" };
          }
          set((state) => ({
            messages: mergeMessages(state.messages, page.messages),
            hasMore: page.hasMore,
            nextCursor: page.nextCursor,
            historyStatus: "ready",
            historyError: "",
            earlierStatus: "idle",
            earlierError: "",
          }));
          return { ok: true };
        } catch (error) {
          if (!same(snap)) return { ok: false, reason: "stale" };
          set({
            historyStatus: "error",
            historyError: errorText(error, "Couldn't load messages"),
          });
          return { ok: false, reason: "error" };
        } finally {
          if (binding.initialFlight === snap) binding.initialFlight = null;
        }
      }

      async function loadEarlier(binding) {
        if (!binding || chatBinding !== binding || binding.disposed) return { ok: false, reason: "stale" };
        if (!sessionOwns(binding) || !selectCanChat(useWorkspaceStore.getState())) return { ok: false, reason: "stale" };
        if (!binding.armed || get().historyStatus !== "ready") return { ok: false, reason: "history" };
        if (binding.earlierFlight) return { ok: false, reason: "busy" };
        const cursor = get().nextCursor;
        if (!get().hasMore || !cursor?.before || !cursor?.beforeId) return { ok: false, reason: "end" };
        const snap = capture(binding);
        binding.earlierFlight = snap;
        set({ earlierStatus: "loading", earlierError: "" });
        try {
          const res = await axiosInstance.get(`/projects/${binding.projectId}/messages`, {
            params: {
              limit: PROJECT_CHAT_PAGE_LIMIT,
              before: cursor.before,
              beforeId: cursor.beforeId,
            },
          });
          if (!same(snap)) return { ok: false, reason: "stale" };
          const page = validateHistoryPage(res.data, snap.projectId);
          if (!page.ok || (page.hasMore && !cursorAdvances(cursor, page.nextCursor))) {
            set({ earlierStatus: "error", earlierError: "Couldn't load earlier messages" });
            return { ok: false, reason: "malformed" };
          }
          set((state) => ({
            messages: mergeMessages(state.messages, page.messages),
            hasMore: page.hasMore,
            nextCursor: page.hasMore ? page.nextCursor : null,
            earlierStatus: "idle",
            earlierError: "",
          }));
          return { ok: true };
        } catch (error) {
          if (!same(snap)) return { ok: false, reason: "stale" };
          set({
            earlierStatus: "error",
            earlierError: errorText(error, "Couldn't load earlier messages"),
          });
          return { ok: false, reason: "error", message: errorText(error, "Couldn't load earlier messages") };
        } finally {
          if (binding.earlierFlight === snap) binding.earlierFlight = null;
        }
      }

      async function sendCurrent() {
        const binding = chatBinding;
        if (!binding || binding.disposed) return { ok: false, reason: "stale" };
        if (get().isSending || binding.sendOp) return { ok: false, reason: "busy" };
        if (!sessionOwns(binding) || !selectCanChat(useWorkspaceStore.getState())) return { ok: false, reason: "forbidden" };
        if (get().historyStatus !== "ready") return { ok: false, reason: "history" };
        const submittedText = get().composerText;
        const submittedFile = get().attachment;
        if (typeof submittedText !== "string" || submittedText.length > PROJECT_CHAT_TEXT_MAX) {
          return { ok: false, reason: "length" };
        }
        if (!messageHasContent(submittedText, submittedFile)) return { ok: false, reason: "empty" };
        const fileCheck = validateAttachment(submittedFile);
        if (!fileCheck.ok) {
          toast.error(fileCheck.message);
          return { ok: false, reason: "file", message: fileCheck.message };
        }
        const snap = capture(binding);
        binding.sendOp = snap;
        binding.outgoing.stop();
        set({ isSending: true });
        try {
          let res;
          if (submittedFile) {
            const body = new FormData();
            body.append("text", submittedText);
            body.append("media", submittedFile);
            res = await axiosInstance.post(`/projects/${binding.projectId}/messages`, body);
          } else {
            res = await axiosInstance.post(`/projects/${binding.projectId}/messages`, { text: submittedText });
          }
          if (!same(snap)) return { ok: false, reason: "stale" };
          const message = normalizeMessage(res?.data?.message, snap.projectId);
          if (!message) {
            toast.error("Couldn't send message");
            return { ok: false, reason: "malformed" };
          }
          // S23 has no idempotency key. A manual retry after an uncertain send
          // can persist a second row; this only folds the echo we can see.
          binding.observedLiveIds.add(message._id);
          if (message.sender?._id) binding.incoming.clearUser(message.sender._id);
          set((state) => ({
            messages: mergeMessages(state.messages, [message]),
            isSending: false,
            composerText: state.composerText === submittedText ? "" : state.composerText,
            attachment: state.attachment === submittedFile ? null : state.attachment,
            ownSendTick: state.ownSendTick + 1,
          }));
          return { ok: true };
        } catch (error) {
          if (!same(snap)) return { ok: false, reason: "stale" };
          const message = errorText(error, "Couldn't send message");
          toast.error(message);
          return { ok: false, reason: "error", message };
        } finally {
          if (chatBinding === binding && binding.sendOp === snap) {
            binding.sendOp = null;
            if (get().isSending && same(snap)) set({ isSending: false });
          }
        }
      }

      function onWorkspace(binding, state) {
        if (chatBinding !== binding || binding.disposed) return;
        const ready = state.status === "ready" && state.project?._id === binding.projectId;
        if (ready) {
          // A previous account's ready workspace cannot arm this binding.
          // selectCanChat requires the account and socket that started the join.
          if (!binding.armed && sessionOwns(binding) && selectCanChat(state)) {
            binding.armed = true;
            void loadInitial(binding);
          }
          if (binding.armed) pruneTyping(binding, state.participants);
          return;
        }
        if (state.status === "ready") return;
        if (state.status === "loading") {
          suspend(binding);
          return;
        }
        if (state.status === "error" || state.status === "notFound" || (state.status === "idle" && binding.armed)) {
          if (binding.armed || hasProjectContent()) wipe(binding);
        }
      }

      function attach(binding, socket) {
        if (!socket || typeof socket.on !== "function") {
          binding.unlisten = () => {};
          return;
        }
        const onMessage = (payload) => {
          if (chatBinding !== binding || binding.disposed) return;
          const message = normalizeMessageEvent(payload, binding.projectId);
          if (!message) return;
          publishLive(binding, message);
        };
        const onTyping = (payload) => {
          if (!sessionOwns(binding) || !selectCanChat(useWorkspaceStore.getState())) return;
          const event = normalizeTypingEvent(payload, binding.projectId);
          if (!event || event.userId === currentAccountId()) return;
          const participants = useWorkspaceStore.getState().participants ?? [];
          if (!participants.some((person) => person.userId === event.userId)) return;
          binding.incoming.setTyping(event.userId, event.isTyping);
        };
        const onDisconnect = () => {
          if (chatBinding !== binding || binding.disposed) return;
          suspend(binding);
        };
        socket.on("project:message", onMessage);
        socket.on("project:typing", onTyping);
        socket.on("disconnect", onDisconnect);
        binding.unlisten = () => {
          socket.off("project:message", onMessage);
          socket.off("project:typing", onTyping);
          socket.off("disconnect", onDisconnect);
        };
      }

      return {
        ...contentDefaults(),
        isSoundEnabled: true,

        bindProjectChat: (socket, projectId) => {
          if (chatBinding) release(chatBinding);
          const binding = {
            socket: socket ?? null,
            projectId: canonicalObjectId(projectId),
            accountId: currentAccountId(),
            generation: 0,
            epoch: 0,
            disposed: false,
            armed: false,
            initialFlight: null,
            earlierFlight: null,
            sendOp: null,
            observedLiveIds: new Set(),
            outgoing: null,
            incoming: null,
            unlisten: null,
            unsubWorkspace: null,
            unsubSession: null,
            removeVisibility: null,
          };
          binding.outgoing = createOutgoingTyping({
            emit: (isTyping) => emitTyping(binding, isTyping),
            canEmit: () => canEmit(binding),
            schedule: (fn, delay) => setTimeout(fn, delay),
            cancel: (id) => clearTimeout(id),
          });
          binding.incoming = createIncomingTyping({
            schedule: (fn, delay) => setTimeout(fn, delay),
            cancel: (id) => clearTimeout(id),
            onChange: (ids) => {
              if (chatBinding !== binding || binding.disposed) return;
              set({ typingUserIds: ids });
            },
          });
          chatBinding = binding;
          attach(binding, socket);

          const onVisibility = () => {
            if (chatBinding !== binding || binding.disposed) return;
            if (!documentHidden() && get().isOpen) set({ unreadCount: 0 });
          };
          const doc = globalThis.document;
          if (doc && typeof doc.addEventListener === "function") {
            doc.addEventListener("visibilitychange", onVisibility);
            binding.removeVisibility = () => doc.removeEventListener("visibilitychange", onVisibility);
          }

          binding.unsubSession = useSessionStore.subscribe((state) => {
            if (chatBinding !== binding || binding.disposed) return;
            const nextAccount = canonicalUserId(state.authUser?._id);
            const accountChanged = nextAccount !== binding.accountId;
            const socketChanged = state.socket !== binding.socket;
            if (!accountChanged && !socketChanged) return;
            // The ready workspace stays for canvas recovery. Chat cannot use it
            // again until a join records the account that owns this socket.
            revokeJoinedAccount(binding.socket);
            if (accountChanged) {
              invalidate(binding, { keepDraft: false });
              binding.accountId = nextAccount;
              return;
            }
            invalidate(binding, { keepDraft: true });
          });
          binding.unsubWorkspace = useWorkspaceStore.subscribe((state) => onWorkspace(binding, state));
          onWorkspace(binding, useWorkspaceStore.getState());
          return () => release(binding);
        },

        setOpen: (open) => {
          const next = Boolean(open);
          const unreadCount = next && !documentHidden() ? 0 : get().unreadCount;
          set({ isOpen: next, unreadCount });
          if (!next) chatBinding?.outgoing?.stop();
        },

        toggleOpen: () => {
          get().setOpen(!get().isOpen);
        },

        setSoundEnabled: (value) => {
          if (typeof value !== "boolean") return;
          set({ isSoundEnabled: value });
        },

        setComposerText: (text) => {
          if (get().isSending) return;
          if (typeof text !== "string" || text.length > PROJECT_CHAT_TEXT_MAX) return;
          set({ composerText: text });
          const binding = chatBinding;
          if (!binding || binding.disposed) return;
          if (canEmit(binding)) binding.outgoing.note(text);
          else binding.outgoing.stop();
        },

        setAttachment: (file) => {
          if (get().isSending) return { ok: false, reason: "busy" };
          if (!file) {
            set({ attachment: null });
            return { ok: true };
          }
          const check = validateAttachment(file);
          if (!check.ok) {
            toast.error(check.message);
            return { ok: false, reason: "file", message: check.message };
          }
          set({ attachment: file });
          return { ok: true };
        },

        stopTyping: () => {
          chatBinding?.outgoing?.stop();
        },

        retryInitial: () => {
          const binding = chatBinding;
          if (!binding || binding.disposed || !binding.armed) return { ok: false, reason: "stale" };
          if (get().historyStatus !== "error") return { ok: false, reason: "history" };
          return loadInitial(binding);
        },

        loadEarlier: () => loadEarlier(chatBinding),

        retryEarlier: () => {
          if (get().earlierStatus !== "error") return { ok: false, reason: "history" };
          return loadEarlier(chatBinding);
        },

        sendMessage: () => sendCurrent(),

        resetProjectChat: () => {
          if (chatBinding) release(chatBinding);
          else set((state) => keptSound(state));
        },
      };
    },
    {
      name: SOUND_STORAGE_KEY,
      storage: createSoundStorage(),
      partialize: (state) => ({ isSoundEnabled: state.isSoundEnabled }),
      merge: (persisted, current) => ({
        ...current,
        isSoundEnabled: typeof persisted?.isSoundEnabled === "boolean"
          ? persisted.isSoundEnabled
          : current.isSoundEnabled,
      }),
    },
  ),
);

export function bindProjectChat(socket, projectId) {
  return useProjectChatStore.getState().bindProjectChat(socket, projectId);
}
