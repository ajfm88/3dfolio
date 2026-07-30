import { create } from "zustand";
import { io } from "socket.io-client";
import { toast } from "react-toastify";

import { axiosInstance } from "../lib/axios";

// The Socket.io server lives at the API origin, without the `/api` REST prefix
// (VITE_API_URL points at `<origin>/api`).
const SOCKET_URL = import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "");

// Auth + realtime store for chat. It mirrors the Clerk session into a Mongo
// user (via /auth/check) and owns the single Socket.io connection. The socket
// authenticates with the Clerk token, the same credential the axios
// interceptor sends on REST calls; the server verifies it and derives the Mongo
// _id it keys presence and newMessage routing on, so identity is never
// something this client asserts. The Chat route bootstraps it from isSignedIn.
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
      toast.error(error.response?.data?.message || "Failed to verify your session");
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

    const socket = io(SOCKET_URL, {
      // `auth` as a function rather than a plain object: socket.io calls it
      // before every connection attempt, so a reconnect sends a freshly minted
      // Clerk token instead of replaying the one from the first connect. That
      // matters here because Clerk's session tokens are short-lived while this
      // socket is meant to stay open, and Render's free tier drops it on spin
      // down — a fixed token would make the reconnect fail permanently.
      auth: async (cb) => {
        const token = await window.Clerk?.session?.getToken();
        cb({ token });
      },
    });

    set({ socket });

    // The server rejects unauthenticated handshakes, so a failure here is
    // usually a token that expired between attempts. socket.io retries on its
    // own with a new one, which is why this logs rather than notifies: on a
    // working site a transient spin down would otherwise raise a toast.
    socket.on("connect_error", (error) => {
      console.error("Chat socket connection failed:", error.message);
    });

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
