import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "react-toastify";

import { axiosInstance } from "../lib/axios";
import { playNotificationSound } from "../lib/notificationSound";
import { useAuthStore } from "./useAuthStore";

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
          console.log("Error in get Users", error.message);
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
          console.log("Error in getConversations", error.message);
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

      // One subscription for the whole session, not one per open thread: a
      // message from someone you are not currently reading still has to reach
      // the sidebar as an unread badge and a chime. The handler reads the open
      // thread off the store at delivery time, so it stays correct as the
      // selection changes without ever being torn down and rebuilt.
      subscribeToMessages: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        socket.off("newMessage");
        socket.on("newMessage", (newMessage) => {
          const senderId = String(newMessage.senderId);
          const isOpenThread = senderId === String(get().activeConversationId);

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
