import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "react-toastify";

import { axiosInstance } from "../lib/axios";
import { playNotificationSound } from "../lib/notificationSound";
import { useAuthStore } from "./useAuthStore";

// How long a lull counts as still typing on the receiving end. A sender whose
// tab dies mid-word never sends the matching `false`, so every `true` also arms
// a timer that retracts the flag on its own — presence gets the same treatment
// on disconnect for the same reason.
const TYPING_EXPIRY_MS = 5000;

// Timer handles per sender. Deliberately outside the store: they are plumbing,
// not state, and nothing re-renders when one is armed or cleared.
const typingExpiryTimers = new Map();

// Held at module scope so it can be removed by reference. A bare
// socket.off("disconnect") would also strip useAuthStore's presence reset,
// which listens to the same event on the same shared socket.
function handleSocketDisconnect() {
  useChatStore.getState().resetTyping();
}

// The chat data store: contacts, conversations, and the open thread, plus the
// UI bits that need to survive a route change (selected user, search, composer
// text). Only the sound preference is persisted to localStorage; everything
// else is refetched from the API on mount. Realtime delivery is layered on via
// subscribeToMessages, which listens on the socket owned by useAuthStore.
export const useChatStore = create(
  persist(
    (set, get) => ({
      users: [],
      conversations: [],
      messages: [],
      selectedUser: null,
      isConversationsLoading: false,
      isUsersLoading: false,
      isMessagesLoading: false,
      activeConversationId: null,
      unreadByUser: {},
      // Ids of people currently typing to me. Sits here beside unreadByUser as
      // per-conversation UI state rather than in useAuthStore next to
      // onlineUsers, because clearing it is part of handling an incoming
      // message and both handlers belong on the same subscription. No key by
      // conversation: in a 1:1 chat, whoever is typing is typing to you.
      typingUsers: [],
      searchQuery: "",
      sidebarTab: "chats",
      composerText: "",
      isSoundEnabled: true,
      isSendingMedia: false,

      getUsers: async () => {
        set({ isUsersLoading: true });
        try {
          const res = await axiosInstance.get("/messages/users");
          set((state) => ({
            users: res.data,
            selectedUser:
              state.selectedUser && res.data.some((user) => user._id === state.selectedUser._id)
                ? state.selectedUser
                : null,
          }));
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to load users");
        } finally {
          set({ isUsersLoading: false });
        }
      },

      getConversations: async () => {
        set({ isConversationsLoading: true });
        try {
          const res = await axiosInstance.get("/messages/conversations");
          set({ conversations: res.data });
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to load conversations");
        } finally {
          set({ isConversationsLoading: false });
        }
      },

      getMessages: async (userId) => {
        if (!userId) return;
        set({ isMessagesLoading: true });
        try {
          const res = await axiosInstance.get(`/messages/${userId}`);
          set({ messages: res.data });
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to load messages");
        } finally {
          set({ isMessagesLoading: false });
        }
      },

      sendMessage: async (messageData) => {
        const { selectedUser, messages } = get();
        if (!selectedUser) return false;

        try {
          const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
          set({ messages: [...messages, res.data], composerText: "" });
          get().getConversations();
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to send message");
          return false;
        }
      },

      // Announce that I am typing to someone. The recipient is named, but the
      // sender is not: the server stamps that from the verified handshake.
      setTyping: (receiverId, isTyping) => {
        if (!receiverId) return;

        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        socket.emit("typing", { receiverId, isTyping });
      },

      // Drop one person's typing flag and disarm their expiry timer. Called
      // from the socket listener, and again when a message from them lands.
      clearTypingFor: (userId) => {
        const timer = typingExpiryTimers.get(userId);
        if (timer) {
          clearTimeout(timer);
          typingExpiryTimers.delete(userId);
        }

        set((state) =>
          state.typingUsers.includes(userId)
            ? { typingUsers: state.typingUsers.filter((id) => id !== userId) }
            : state,
        );
      },

      // A dropped socket means every flag is now unverifiable, so none of them
      // survive it — the same reasoning that resets onlineUsers on disconnect.
      resetTyping: () => {
        typingExpiryTimers.forEach((timer) => clearTimeout(timer));
        typingExpiryTimers.clear();
        set({ typingUsers: [] });
      },

      // One subscription for the whole session, not one per open thread: a
      // message from someone you are not currently reading still has to reach
      // the sidebar as an unread badge and a chime. The handler reads the open
      // thread off the store at delivery time, so it stays correct as the
      // selection changes without ever being torn down and rebuilt.
      subscribeToMessages: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        socket.off("typing");
        socket.on("typing", (payload) => {
          if (!payload || typeof payload !== "object") return;

          const userId = payload.userId ? String(payload.userId) : null;
          if (!userId) return;

          if (!payload.isTyping) {
            get().clearTypingFor(userId);
            return;
          }

          set((state) =>
            state.typingUsers.includes(userId)
              ? state
              : { typingUsers: [...state.typingUsers, userId] },
          );

          // Re-armed on every `true`, so a continuing burst keeps pushing the
          // deadline back and only a real silence lets it fire.
          clearTimeout(typingExpiryTimers.get(userId));
          typingExpiryTimers.set(
            userId,
            setTimeout(() => get().clearTypingFor(userId), TYPING_EXPIRY_MS),
          );
        });

        socket.off("disconnect", handleSocketDisconnect);
        socket.on("disconnect", handleSocketDisconnect);

        socket.off("newMessage");
        socket.on("newMessage", (newMessage) => {
          const senderId = String(newMessage.senderId);
          const isOpenThread = senderId === String(get().activeConversationId);

          // Their message arrived, so whatever they were typing is sent. The
          // sender clears its own flag too, but this covers the case where that
          // emit is lost and would otherwise leave `typing…` under a message
          // that is already on screen.
          get().clearTypingFor(senderId);

          if (isOpenThread) {
            set({ messages: [...get().messages, newMessage] });
          } else {
            set((state) => ({
              unreadByUser: {
                ...state.unreadByUser,
                [senderId]: (state.unreadByUser[senderId] || 0) + 1,
              },
            }));
          }

          if (get().isSoundEnabled) playNotificationSound();

          // Refreshed either way: a first message from a new contact has to
          // appear in the Chats tab, and an existing thread has to re-sort.
          get().getConversations();
        });
      },

      unsubscribeFromMessages: () => {
        const socket = useAuthStore.getState().socket;
        socket?.off("newMessage");
        socket?.off("typing");
        // By reference, so useAuthStore's presence reset keeps its listener.
        socket?.off("disconnect", handleSocketDisconnect);
        get().resetTyping();
      },

      setSelectedUser: (selectedUser) => set({ selectedUser }),

      setActiveConversationId: (activeConversationId) => {
        set((state) => {
          // Opening a thread reads it, so its badge clears.
          const unreadByUser = { ...state.unreadByUser };
          delete unreadByUser[activeConversationId];

          return {
            activeConversationId,
            unreadByUser,
            selectedUser:
              state.users.find((user) => user._id === activeConversationId) ||
              state.conversations.find((user) => user._id === activeConversationId) ||
              null,
            messages: activeConversationId ? state.messages : [],
          };
        });
      },

      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSidebarTab: (sidebarTab) => set({ sidebarTab }),
      setComposerText: (composerText) => set({ composerText }),
      setSoundEnabled: (isSoundEnabled) => set({ isSoundEnabled }),

      sendTextMessage: async (conversationId) => {
        const messageText = get().composerText.trim();
        if (!conversationId || !messageText) return false;

        return get().sendMessage({ text: messageText });
      },

      sendMediaMessage: async ({ conversationId, file }) => {
        if (!conversationId || !file) return false;

        const formData = new FormData();
        const caption = get().composerText.trim();
        if (caption) formData.append("text", caption);
        formData.append("media", file);

        set({ isSendingMedia: true });
        try {
          return await get().sendMessage(formData);
        } finally {
          set({ isSendingMedia: false });
        }
      },
    }),
    {
      name: "ajfm88-chat",
      partialize: (state) => ({ isSoundEnabled: state.isSoundEnabled }),
    },
  ),
);
