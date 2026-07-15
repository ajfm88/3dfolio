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

  socket.on("disconnect", () => {
    if (userId) delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { app, server, io };
