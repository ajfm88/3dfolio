import { create } from "zustand";
import { io } from "socket.io-client";
import { toast } from "react-toastify";

import { axiosInstance } from "../lib/axios";

// Socket.io uses the API origin without the REST /api prefix.
const SOCKET_URL = import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "");

// A response from before sign-out or route exit must never restore the user
// or reopen their socket. New checks also supersede older overlapping checks.
let authRequest = 0;

export const useSessionStore = create((set, get) => ({
  authUser: null,
  isCheckingAuth: true,
  socket: null,
  isConnected: false,

  checkAuth: async () => {
    const request = ++authRequest;
    set({ isCheckingAuth: true });

    try {
      const res = await axiosInstance.get("/auth/check");
      if (request !== authRequest) return;
      set({ authUser: res.data });
      get().connectSocket(res.data);
    } catch (error) {
      if (request !== authRequest) return;
      toast.error(error.response?.data?.message || "Failed to verify your session");
      set({ authUser: null });
    } finally {
      if (request === authRequest) set({ isCheckingAuth: false });
    }
  },

  clearAuth: () => {
    authRequest++;
    set({ authUser: null, isCheckingAuth: false });
    get().disconnectSocket();
  },

  // The server registers chat presence for every authenticated socket, so this
  // connection also makes the user online in /chat. Q4 accepts that for now;
  // workspace presence arrives separately in S17.
  connectSocket: (user) => {
    // A connecting socket already exists before .connected becomes true.
    // Guarding existence prevents duplicate connections under StrictMode.
    if (!user || get().socket) return;

    const socket = io(SOCKET_URL, {
      // Socket.io calls this before every connection attempt. Clerk tokens
      // expire quickly, so reconnects after a Render restart need a fresh one.
      auth: async (cb) => {
        const token = await window.Clerk?.session?.getToken();
        cb({ token });
      },
    });

    set({ socket });
    socket.on("connect", () => set({ isConnected: true }));
    socket.on("disconnect", () => set({ isConnected: false }));
    // Transient connection failures belong in the console rather than a toast
    // on every retry while the server wakes up or the network returns.
    socket.on("connect_error", (error) => {
      console.error("Collaborate socket connection failed:", error.message);
    });
  },

  disconnectSocket: () => {
    // Route cleanup can run while /auth/check is still pending. Invalidate it
    // here too, so it cannot create a connection after the route has unmounted.
    authRequest++;
    const socket = get().socket;
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    set({ socket: null, isConnected: false });
  },

  resetSession: () => {
    authRequest++;
    get().disconnectSocket();
    set({ authUser: null, isCheckingAuth: true });
  },
}));
