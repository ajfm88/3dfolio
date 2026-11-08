import express from "express";
import http from "http";
import { Server } from "socket.io";
import { verifyToken } from "@clerk/express";

import User from "../models/user.model.js";
import { safeHandler } from "./safeHandler.js";
import { registerChatHandlers } from "../sockets/chat.socket.js";
import { registerWorkspaceHandlers } from "../sockets/workspace.socket.js";

// This file creates the shared http.Server and Socket.io layer, then dispatches
// each connection to per-feature handler modules in server/src/sockets/. The
// Express `app` is configured in index.js; both `app` and `server` are exported
// from here so index.js listens on the http server, not the app.
const app = express();
const server = http.createServer(app);

const CLIENT_URLS = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const io = new Server(server, { cors: { origin: CLIENT_URLS } });

// Sockets authenticate exactly like REST requests do: the client sends its
// Clerk session token, the server verifies it against Clerk and resolves it to
// the synced Mongo user itself. Previously the handshake carried a plain
// `userId` query parameter that was taken on faith, so anyone could connect
// claiming any user's id and receive that person's messages in real time — the
// REST side was never open this way (protectRoute has always verified), so this
// closes a gap specific to the socket layer.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));

    const session = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    const user = await User.findOne({ clerkId: session.sub });
    if (!user) return next(new Error("Unauthorized"));

    // The one place a socket's identity is set. Everything downstream reads
    // this rather than anything the client sent.
    socket.data.userId = user._id.toString();
    next();
  } catch (error) {
    // Expected on an expired token as much as on a forged one, so this is a
    // log line rather than an alarm — the client retries with a fresh token.
    console.error("Socket authentication failed:", error.message);
    next(new Error("Unauthorized"));
  }
});

io.on(
  "connection",
  safeHandler("connection", (socket) => {
    const userId = socket.data.userId;

    // Named for the user, not the socket, so all of their tabs receive alike.
    socket.join(userId);

    registerChatHandlers(io, socket);
    registerWorkspaceHandlers(io, socket);
  }),
);

export { app, server, io };
