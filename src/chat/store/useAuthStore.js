import { create } from "zustand";
import { io } from "socket.io-client";

import { axiosInstance } from "../lib/axios";

// The Socket.io server lives at the API origin, without the `/api` REST prefix
// (VITE_API_URL points at `<origin>/api`).
const SOCKET_URL = import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "");

// Auth + realtime store for chat. It mirrors the Clerk session into a Mongo
// user (via /auth/check) and owns the single Socket.io connection: the socket
// is keyed on the Mongo _id so the server can map presence and route
// newMessage events. The Chat route bootstraps this from Clerk's isSignedIn.
export const useAuthStore = create((set, get) => ({
  authUser: null,
  isCheckingAuth: true,
  onlineUsers: [],
  socket: null,

  checkAuth: async () => {
    set({ isCheckingAuth: true });

    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data });

      get().connectSocket(res.data);
    } catch (error) {
      console.error("Error in checkAuth:", error);
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  clearAuth: () => {
    set({ authUser: null, isCheckingAuth: false, onlineUsers: [] });
    get().disconnectSocket();
  },

  connectSocket: (user) => {
    if (!user || get().socket?.connected) return;

    const socket = io(SOCKET_URL, { query: { userId: user._id } });

    set({ socket });

    socket.on("getOnlineUsers", (userIds) => {
      set({ onlineUsers: userIds });
    });

    // Presence is only ever known from a server broadcast, so a dropped
    // connection has to reset it. Without this the last list stays on screen as
    // stale green dots — and on Render's free tier the server does spin down.
    // socket.io reconnects on its own, and the server re-broadcasts on connect.
    socket.on("disconnect", () => {
      set({ onlineUsers: [] });
    });
  },

  disconnectSocket: () => {
    const socket = get().socket;
    if (socket?.connected) socket.disconnect();
    set({ socket: null });
  },
}));
