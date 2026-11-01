import { safeHandler } from "../lib/safeHandler.js";

// online users map = { userId: Set<socketId> }. One person can have several
// tabs open, so presence is a set of connections rather than a single socket.
// With one slot per user the newest tab overwrote the previous one, so closing
// that newest tab marked the user offline while an older tab was still
// connected — and real-time messages only ever reached one of the tabs.
const userSocketMap = {};

// Every socket also joins a room named for its user, so emitting to a user id
// fans out to all of their tabs. Rooms handle delivery; this map is kept only
// to broadcast who is online, which the room adapter can't report as cheaply.

export function registerChatHandlers(io, socket) {
  const userId = socket.data.userId;

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
}
