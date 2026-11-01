# Slice 01: Split Socket Handlers by Feature

**Lane:** server · **Depends on:** — · **Unblocks:** S02, S13

## Goal

Restructure `server/src/lib/socket.js` so each feature registers its own socket handlers from its own module, starting by moving the existing chat presence and typing logic, verbatim, into `server/src/sockets/chat.socket.js`. This is a pure refactor: `/chat` behaves exactly as before, and S13 can later add `workspace.socket.js` next to it without touching chat code.

## Design

No UI changes. The resulting server layout:

```text
server/src/
├── lib/
│   ├── safeHandler.js      ← new: safeHandler, moved out of socket.js
│   └── socket.js           ← app, http server, io, handshake auth, connection dispatcher
└── sockets/
    └── chat.socket.js      ← new: registerChatHandlers(io, socket)
```

## Implementation

### `server/src/lib/safeHandler.js` (new)

- Move the `safeHandler(event, handler)` function out of `socket.js` unchanged, with its full explanatory comment, and export it as a named export.
- Write the comment so it reads correctly from its new location: it should say why every handler in every socket module is wrapped (an escaped exception kills the process that also serves `/blog`).

### `server/src/sockets/chat.socket.js` (new)

- Export `registerChatHandlers(io, socket)`.
- Move into this module, behavior and comments unchanged:
  - the `userSocketMap` declaration and its comments (module scope, so it's shared across connections exactly as now)
  - adding `socket.id` to the user's set and broadcasting `getOnlineUsers`
  - the `typing` handler (registered through `safeHandler`)
  - the `disconnect` handler that removes the socket and re-broadcasts presence when the last tab closes (registered through `safeHandler`)
- Read the user id from `socket.data.userId`, as now.
- `io` arrives as a parameter. **Don't import `../lib/socket.js`** from this file; that would create a circular import, since `socket.js` imports this module.
- Imports: `safeHandler` from `../lib/safeHandler.js` only.

### `server/src/lib/socket.js` (edit)

- Keep:
  - the Express `app`, the `http` server, and the `Server` with the same CORS config
  - the `io.use` Clerk handshake middleware, unchanged
  - the exports `{ app, server, io }`, unchanged (`message.controller.js` and `index.js` depend on them)
- The `connection` handler (still wrapped in `safeHandler`) now does only two things:
  1. `socket.join(userId)`: the per-user room stays here, because it's general delivery used by `message.controller.js`, not presence. Keep its comment.
  2. `registerChatHandlers(io, socket)`.
- Import `safeHandler` from `./safeHandler.js` and `registerChatHandlers` from `../sockets/chat.socket.js`.
- Update the file's top comment so it no longer describes chat internals that moved. It should say the file creates the shared server and dispatches each connection to per-feature handler modules in `server/src/sockets/`.

### `server/readme.md` (edit)

- **Project Structure:** add `src/lib/safeHandler.js` and `src/sockets/chat.socket.js` with one-line descriptions, in the existing tree style.
- **Socket.io Events:** add one sentence saying handlers live in per-feature modules under `src/sockets/`, registered from `src/lib/socket.js`. Event tables are unchanged.

### Out of scope

- No workspace or collaborate code, no new events, no renamed events or payloads.
- No changes to `message.controller.js`, `index.js`, any client file, or `package.json`.
- No test harness yet (that's S02).

## Dependencies

- None.

## Verify when done

- [ ] `server/src/lib/socket.js` contains no chat-specific logic (`userSocketMap`, `typing`, `getOnlineUsers` all live in `chat.socket.js`).
- [ ] `chat.socket.js` doesn't import `lib/socket.js`, and all its handlers go through `safeHandler`.
- [ ] Exports of `lib/socket.js` are still exactly `{ app, server, io }`, and `message.controller.js` is unchanged.
- [ ] `cd server && npm install && npm run dev` boots with `Server is up and running` and `MongoDB connected` and no errors.
- [ ] Two accounts in two browsers on `/chat` (frontend `.env` pointing `VITE_API_URL` at `http://localhost:3000/api`):
  - [ ] A sends a DM to B, and it arrives instantly, with a chime and an unread badge when B has a different thread open.
  - [ ] A typing shows `typing…` for B and clears on send or after the pause.
  - [ ] B's green dot shows for A. Opening a second B tab, then closing one, leaves B online. Closing the last B tab marks B offline.
  - [ ] Media send still works (or returns `503` when ImageKit is unconfigured, as before).
- [ ] An unauthenticated socket connection is still refused (open `/chat` signed out: no socket connects).
- [ ] `/blog` loads posts.
- [ ] `npm run build` at the repo root passes.
- [ ] `server/readme.md` updated as described.
- [ ] `context/6-progress-tracker.md`: S01 marked **Ready for review** with a slice note.
