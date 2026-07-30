import express from "express";
import http from "http";
import { Server } from "socket.io";
import { verifyToken } from "@clerk/express";

import User from "../models/user.model.js";

// The shared server is built around an http.Server (not app.listen) so the
// Socket.io layer can ride along. /blog doesn't use sockets, but /chat does
// (presence + real-time message delivery, wired in chat-plan Phase A). The
// Express `app` is configured in index.js; both `app` and `server` are exported
// from here so index.js listens on the http server, not the app.
const app = express();
const server = http.createServer(app);

const CLIENT_URLS = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const io = new Server(server, { cors: { origin: CLIENT_URLS } });

// online users map = { userId: Set<socketId> }. One person can have several
// tabs open, so presence is a set of connections rather than a single socket.
// With one slot per user the newest tab overwrote the previous one, so closing
// that newest tab marked the user offline while an older tab was still
// connected — and real-time messages only ever reached one of the tabs.
const userSocketMap = {};

// Every socket also joins a room named for its user, so emitting to a user id
// fans out to all of their tabs. Rooms handle delivery; this map is kept only
// to broadcast who is online, which the room adapter can't report as cheaply.

// socket.io does not catch exceptions thrown inside event handlers: one that
// escapes takes down the whole Node process, and this process also serves
// /blog. Every handler is registered through here so a malformed payload can
// only kill its own event. Declared async so a rejected promise is caught too,
// not just a synchronous throw — no handler uses an acknowledgement callback,
// so always returning a promise costs nothing.
function safeHandler(event, handler) {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      console.error(`Error in socket handler (${event}):`, error.message);
    }
  };
}

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

    userSocketMap[userId] = userSocketMap[userId] || new Set();
    userSocketMap[userId].add(socket.id);

    // broadcast the current online set to everyone
    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    // Typing goes straight to the one recipient instead of being broadcast:
    // chat is 1:1, so looking up their socket is the entire routing decision.
    // Nothing is persisted — a typing flag only means anything while both
    // sockets are open — and it no-ops when the recipient isn't connected.
    socket.on(
      "typing",
      safeHandler("typing", (payload) => {
        // Destructured in the body, not the signature: a default parameter only
        // covers undefined, so a client emitting an explicit null would throw
        // right here. safeHandler now contains that, but validating first keeps
        // a bad payload from being a logged error in the first place.
        if (!payload || typeof payload !== "object") return;

        const { receiverId, isTyping } = payload;
        if (!receiverId) return;

        // Addressed to the recipient's room, so it reaches every tab they have
        // open. Emitting to an empty room is already a no-op, which covers the
        // offline case without a lookup.
        //
        // Coerced rather than passed through: this value is relayed to another
        // client, so it leaves here as a boolean and nothing else. The sender
        // id comes from the verified handshake, never from the payload.
        io.to(receiverId).emit("typing", {
          userId,
          isTyping: Boolean(isTyping),
        });
      }),
    );

    socket.on(
      "disconnect",
      safeHandler("disconnect", () => {
        const sockets = userSocketMap[userId];
        if (!sockets) return;

        sockets.delete(socket.id);

        // Offline only once the last tab is gone, whichever order they close in.
        if (sockets.size === 0) {
          delete userSocketMap[userId];
          io.emit("getOnlineUsers", Object.keys(userSocketMap));
        }
      }),
    );
  }),
);

export { app, server, io };
