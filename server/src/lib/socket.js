import express from "express";
import http from "http";
import { Server } from "socket.io";

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

// online users map = { userId: socketId }
const userSocketMap = {};

export function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId) userSocketMap[userId] = socket.id;

  // broadcast the current online set to everyone
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // Typing goes straight to the one recipient instead of being broadcast:
  // chat is 1:1, so looking up their socket is the entire routing decision.
  // Nothing is persisted — a typing flag only means anything while both sockets
  // are open — and it no-ops when the recipient isn't connected.
  socket.on("typing", (payload) => {
    // Destructured in the body, not the signature: a default parameter only
    // covers undefined, so a client emitting an explicit null would throw right
    // here — and socket.io does not catch handler errors, so that exception
    // takes the whole process down with it. Validate before touching it.
    if (!userId || !payload || typeof payload !== "object") return;

    const { receiverId, isTyping } = payload;
    if (!receiverId) return;

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (!receiverSocketId) return;

    // Coerced rather than passed through: this value is relayed to another
    // client, so it leaves here as a boolean and nothing else.
    io.to(receiverSocketId).emit("typing", { userId, isTyping: Boolean(isTyping) });
  });

  socket.on("disconnect", () => {
    if (userId) delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { app, server, io };
