# Architecture Context

## Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Frontend | React 19 + Vite 7 | SPA on Vercel. `/collaborate/*` is a lazy route chunk. |
| Routing | React Router 6 | `/collaborate` (dashboard) and `/collaborate/:projectId` (workspace) |
| State | zustand | Session/socket, projects, and workspace stores |
| Canvas | `@xyflow/react` (React Flow v12) | Rendering and interaction only. Never the source of truth. |
| Styling | Tailwind 3 + scoped CSS custom properties | `.collab-root` theme, see `3-ui-context.md` |
| Auth | Clerk (`@clerk/clerk-react`, `@clerk/express`) | Identity for REST (`protectRoute`) and sockets (verified handshake) |
| API | Express 5 on Render (`server/`) | Project, member, invite, and message REST routes |
| Realtime | Socket.io 4 on the same Render process | Rooms, presence, cursors, previews, commits, turns, typing |
| Database | MongoDB Atlas + Mongoose 9 | Projects, members, invites, canvases, project messages |
| Media | ImageKit (existing) | Project chat image and video attachments |
| Tests | `node:test` (built in) | Unit tests for pure server modules |

There are no third-party realtime or job services. Liveblocks, Trigger.dev, Yjs, and Redis are all excluded.

## System Boundaries

```text
server/src/
├── lib/
│   ├── safeHandler.js              S01  socket handler wrapper (extracted from socket.js)
│   ├── projectAccess.js            S02  roleOf, can, findProjectForMember, limits
│   ├── workspaceRooms.js           S13  in-memory room registry + serial write queue
│   ├── turns.js                    S19  pure turn state machine
│   └── rateLimit.js                S29  per-socket token bucket
├── shared/
│   └── canvasOps.js                S06  PURE canvas op semantics, imported by server AND client
├── models/
│   ├── project.model.js            S02
│   ├── canvas.model.js             S02
│   └── projectMessage.model.js     S23
├── controllers/  project.controller.js (S03) · projectMember.controller.js (S26) · projectMessage.controller.js (S23)
├── routes/       project.route.js  (S03, extended in S23, S26)
└── sockets/
    ├── chat.socket.js              S01  existing chat presence + typing, moved verbatim
    └── workspace.socket.js         S13+ join/leave, commits, previews, cursors, turns, typing

server/test/      projectAccess · canvasOps · workspaceRooms · turns · rateLimit (*.test.js)

src/pages/Collaborate.jsx           S04  lazy route root
src/collaborate/
├── collaborate.css                 S04  scoped theme under .collab-root
├── lib/        axios.js · projectLimits.js · tabId.js · throttle.js · userColor.js
├── store/      useSessionStore.js · useProjectsStore.js · useWorkspaceStore.js
├── routes/     CollaborateAuthGate.jsx · ProjectsPage.jsx · WorkspacePage.jsx
└── components/
    ├── ui/         Dialog (S05: portaled, focus-trapped shell, reused by ShareDialog)
    ├── projects/   ProjectCard · ProjectDialogs · InvitationsList
    ├── workspace/  WorkspaceNavbar · ParticipantStack · TurnBar · ShareDialog · ConnectionBanner
    ├── canvas/     WorkspaceCanvas · ShapeNode · LinkEdge · ShapePanel · ColorToolbar · CanvasControls · PresenceCursors
    └── chat/       ProjectChatPanel · ProjectMessageList · ProjectComposer
```

| Boundary | Owns | Must not |
| --- | --- | --- |
| `server/src/shared/` | Pure canvas op semantics: constants, sanitizers, `applyOps`, `normalizeCanvas`, `invertOps` | Import anything (no Node, no Mongoose), do I/O, use timers |
| `server/src/lib/` | Access rules, room registry, turn state machine, rate limiting | Hold durable data only in memory |
| `server/src/sockets/` | Socket event handlers, one module per feature | Persist without going through the commit pipeline |
| `server/src/controllers/` + `routes/` | REST: validation, membership-scoped queries, persistence | Run long-lived work, trust client ids |
| `src/collaborate/store/` | Client state, socket listeners, the commit loop | Be bypassed: components never mutate canvas state directly |
| `src/collaborate/components/` | UI only | Call `axios` or `socket` directly (go through the stores) |

**The shared module.** `server/src/shared/canvasOps.js` is the single implementation of canvas op semantics. The server validates with it and the client applies ops with it, so the two can't drift. The client imports it through the Vite alias `@shared` → `server/src/shared` (S07). Render builds only `server/` and never imports client code, so the dependency runs one way only.

## Storage Model

| Durable (MongoDB) | Ephemeral (server memory, per active room) |
| --- | --- |
| Projects, members, roles, invites | Connected tabs and participants |
| Canvas `{ nodes, edges, version }` | Turn holder, queue, grace and idle deadlines |
| Project chat messages; media URLs (files on ImageKit) | Cursors, drag/resize previews, typing flags |

- A server restart drops every socket, clears all turns, and loses nothing durable. Clients reconnect, rejoin, and reload the canvas from the join response.
- **Single-instance assumption.** Room and turn state live in one process's memory. That's correct for one Render instance. Scaling out would need the Socket.io Redis adapter and shared turn state, which is out of scope. `server/readme.md` documents this limitation.

### Collections

**Project** (`projects`)

```js
{
  name:        String, required, trim, 1–80
  description: String, default "", ≤ 500
  owner:       ObjectId → User, required, indexed
  members:     [{ user: ObjectId → User, role: "editor" | "viewer", addedAt: Date }]   // owner is NOT in members
  invites:     [{ email: String (lowercase), role: "editor" | "viewer", invitedBy: ObjectId → User, createdAt: Date }]
  timestamps
}
indexes: { owner: 1 }, { "members.user": 1 }, { "invites.email": 1 }
```

**Canvas** (`canvases`): one per project, created lazily by upsert on first join.

```js
{ project: ObjectId → Project (unique), nodes: [Mixed], edges: [Mixed], version: Number (default 0), updatedBy: ObjectId → User, timestamps }
```

**ProjectMessage** (`projectmessages`), added in S23

```js
{ project: ObjectId → Project, sender: ObjectId → User, text: String, image: String, video: String, timestamps }
index: { project: 1, createdAt: -1 }
```

### Canonical canvas shapes

These are the only fields ever stored:

```js
node = { id, type: "shape", position: { x, y }, width, height,
         data: { label, shape, color, textColor } }
edge = { id, source, target, sourceHandle, targetHandle, type: "link", data: { label } }
```

Display-only fields (`selected`, `measured`, `dragging`, `markerEnd`, styles) are added on the client and never sent or stored.

### Limits

These are exported from `canvasOps.js` or `projectAccess.js`, enforced on the server, and mirrored in UI inputs.

| Limit | Value |
| --- | --- |
| Owned projects per user | 20 |
| Members + pending invites per project (excluding owner) | 10 |
| Nodes / edges per canvas | 300 / 600 |
| Ops per commit | 50 |
| Node label / edge label | 200 / 100 chars |
| Project name / description | 80 / 500 chars |
| Chat message text | 2,000 chars; page size 50 |
| Node width/height | 40–2,000 px; position \|x\|,\|y\| ≤ 100,000 |
| Ids (node/edge) | `/^[A-Za-z0-9_-]{1,64}$/` |
| Handles | `"top" \| "right" \| "bottom" \| "left" \| null` |
| Shapes | `rectangle, diamond, circle, pill, cylinder, hexagon` |
| Colors | `#RRGGBB` (palette in `3-ui-context.md`, constants in `canvasOps.js`) |

## Auth and Access Model

- Every user signs in with Clerk. REST requests carry the session token as `Authorization: Bearer`, and `protectRoute` resolves it to the synced Mongo user on `req.user`. Sockets send the token in `handshake.auth.token`, and the handshake middleware sets `socket.data.userId`. The Clerk webhook is still the only writer of `User` documents.
- Every project has exactly one owner (`project.owner`). Members are editors or viewers.
- A non-member gets `404` for everything about a project, so its existence never leaks. A member lacking permission gets `403`.
- Workspace sockets join the room `project:<projectId>` only after a membership check. The member's role is cached in the room and updated live on role changes (S27).

`can(role, action)` in `projectAccess.js`:

| Action | owner | editor | viewer |
| --- | :-: | :-: | :-: |
| `view` — project, canvas, chat history, presence | ✓ | ✓ | ✓ |
| `chat` — send messages, typing, cursor | ✓ | ✓ | ✓ |
| `edit` — request a turn, change canvas while holding it | ✓ | ✓ | — |
| `reclaim` — take the turn from whoever holds it | ✓ | — | — |
| `manage` — rename, delete, invite, revoke, change roles, remove members | ✓ | — | — |
| `leave` | — (must delete) | ✓ | ✓ |

## Realtime and Sync Model

### Canvas ops (S06)

```js
{ type: "node.add",    node }
{ type: "node.update", id, patch: { position?, width?, height?, data?: { label?, shape?, color?, textColor? } } }
{ type: "node.remove", id }            // cascades: removes every edge touching the node
{ type: "edge.add",    edge }          // source and target must exist; id must be new
{ type: "edge.update", id, patch: { data: { label } } }
{ type: "edge.remove", id }
```

- `applyOps(canvas, ops)` → `{ ok: true, canvas, ops }` or `{ ok: false, error }`. It's pure, never mutates its input, and is **atomic**: one invalid op rejects the whole batch. The returned `ops` are the normalized versions, and those are what the server broadcasts. `version` is not touched; the caller owns it.
- `normalizeCanvas(raw)` rebuilds stored data into canonical shape. It drops invalid nodes, drops edges whose endpoints are missing, and truncates to the limits. It runs on every load.
- `invertOps(canvas, ops)` (S25) computes inverse ops against the pre-op canvas, for undo.

### Socket protocol

All workspace events carry `projectId`. Every tab sends a `tabId` (a UUID kept in `sessionStorage`) when it joins. Turns belong to a **tab**, `{ userId, tabId }`, so a user's second tab is read-only and a reconnecting tab keeps its turn.

**Client → Server**

| Event | Payload | Ack | Slice |
| --- | --- | --- | --- |
| `workspace:join` | `{ projectId, tabId }` | `{ ok, project, role, canvas, participants, turn, serverNow }` or `{ ok:false, message }` | S13 |
| `workspace:leave` | `{ projectId }` | — | S13 |
| `canvas:commit` | `{ projectId, baseVersion, ops }` | `{ ok:true, version }` or `{ ok:false, message, canvas }` | S14 |
| `canvas:sync` | `{ projectId }` | `{ ok, canvas }` | S14 |
| `canvas:preview` | `{ projectId, nodes: [{ id, position, width?, height? }] }` (volatile) | — | S16 |
| `cursor:move` / `cursor:leave` | `{ projectId, x, y }` / `{ projectId }` (volatile) | — | S18 |
| `turn:request` / `turn:release` / `turn:cancel` / `turn:reclaim` | `{ projectId }` | — | S20 |
| `project:typing` | `{ projectId, isTyping }` | — | S23 |

**Server → Client**

| Event | Payload | Slice |
| --- | --- | --- |
| `presence:update` | `{ projectId, participants: [{ userId, fullName, img, role }] }` | S17 |
| `canvas:ops` | `{ projectId, version, ops, by }`, sent to the room except the sender | S14 |
| `canvas:preview` | `{ projectId, by, nodes }` | S16 |
| `cursor:move` / `cursor:leave` | `{ projectId, userId, x, y }` / `{ projectId, userId }` | S18 |
| `turn:state` | `{ projectId, holder, holderSince, queue, idleDeadline, graceUntil, serverNow }` | S20 |
| `project:message` | `{ projectId, message }` | S23 |
| `project:typing` | `{ projectId, userId, isTyping }` | S23 |
| `workspace:role` | `{ projectId, role }` | S27 |
| `workspace:removed` | `{ projectId, reason: "removed" \| "deleted" }` | S27 |

### Workspace lifecycle foundation (S13)

The S13 spec is `specs/13-workspace-join-leave.md`. These details define that slice; they are not a claim that it has been implemented:

- A socket has one active workspace room at a time, separate from its existing per-user room. A different-project join replaces the previous workspace. Every join, even to a cached room, resolves membership from the database. The join response's project is the whitelisted summary `{ _id, name, description }`; participants are `[]` and turn is `null` until later slices.
- Registry connections are keyed by socket id, with `{ userId, tabId }`; members are keyed by userId with trusted role/fullName/img. Concurrent room loads are shared. Short-lived acquisition leases protect pending joins; rooms with neither connections nor pending joins are evicted. Initialization failures are retryable. Per-room serial write queues exist for S14 but do not save edits in S13.
- Per-socket lifecycle ordering and intent invalidation prevent late joins after leave, disconnect, or route replacement. Leave is project-scoped: stale leave A cannot cancel current project B. Client attempts also track route/binding, socket object, connection id, and request generation before accepting an ack.
- Missing/non-member/invalid-project joins return `{ ok: false, message: "Project not found" }` with no resource data. Malformed requests, superseded attempts, and operational failures use the other messages defined in the S13 spec without extending the wire shape. Project not found shows the access-denied card; operational failures/timeouts show retry. Obsolete requests never overwrite current state or show errors.
- Joins normalize the loaded snapshot in memory and preserve its stored version; they do not repair existing canvas content or save local edits. Reconnect reloads the snapshot and replaces local-only edits. Saving and broadcasting edits arrive in S14–S15. Before then, disconnect hides the canvas and clears role while automatic reconnect/rejoin runs. No presence broadcast, turn enforcement, or ConnectionBanner is added by S13.

### Commit pipeline, server

Each room has a serial queue, so commits apply strictly in order even though Socket.io runs handlers concurrently.

1. `canWrite(room, connection)` passes.
2. `baseVersion === room.canvas.version`.
3. Shared `applyOps` succeeds.
4. `Canvas.updateOne({ project, version: base }, { $set: { nodes, edges, updatedBy }, $inc: { version: 1 } })`.
5. If nothing matched, reload from the database and reject with that canvas.
6. Otherwise update the room cache, ack the sender `{ ok, version }`, and broadcast `canvas:ops` to the room except the sender.

### Commit pipeline, client

- The store keeps the canonical canvas and React Flow display arrays. Display arrays keep UI-only fields (`selected`, `measured`) when rebuilt from canonical.
- `dispatch(ops)` applies ops optimistically via shared `applyOps`, then queues them.
- Only **one commit is in flight at a time**. Ops dispatched in the meantime batch into the next commit.
- A reject or timeout replaces the canvas with the server's copy and drops queued ops.
- A remote `canvas:ops` applies only if `version === local + 1`. Otherwise the client calls `canvas:sync`.
- Drag and resize positions are display-only (sent as volatile previews) until drag or resize ends, which dispatches a single `node.update`.

### Turn rules (S19)

- **Request.** If nobody holds the turn, it's granted. If the requester already holds it or is queued, nothing happens. Otherwise the requester is appended to the queue. Viewers can't request.
- **Release.** The turn passes to the next *connected* queue entry.
- **Cancel.** Leaves the queue.
- **Reclaim (owner only).** The owner takes the turn, and the previous holder goes to the front of the queue.
- **Holder's tab disconnects.** `graceUntil = now + 20s`. Rejoining within the grace period keeps the turn; once it expires, the turn passes on.
- **Queued tab disconnects.** It's removed from the queue.
- **Idle.** While the queue is non-empty, `idleDeadline = max(lastActivity, queue[0].queuedAt) + 120s`. If the holder makes no commit or preview by then, the turn passes on. While nobody waits, a turn never expires.
- **Role change.** Losing edit rights removes the user from the holder slot and the queue.
- **Empty room.** All state is discarded.
- **Sweeper.** One `setInterval` every 5s applies `expire(now)` to every room.

## Invariants

1. **Identity comes from the server.** Use `req.user` from `protectRoute` or `socket.data.userId` from the handshake. Never trust a user id from a payload.
2. **Every project read or write is scoped to membership in the query itself**, e.g. `Project.findOne({ _id, $or: [{ owner: me }, { "members.user": me }] })`. Non-members get `404`; members lacking permission get `403`.
3. **Only the turn holder's tab may change the canvas** (from S20). Before S20, editor or owner role is enough. Every write check goes through one function, `canWrite(room, connection)`.
4. **Every canvas mutation is an op.** On the client, components call `dispatch(ops)`; nothing writes `nodes`/`edges` directly. On the server, ops go through shared `applyOps`. Each op is validated, persisted, then broadcast, in that order.
5. **Stored canvas data is whitelisted.** Never persist a raw client object. `applyOps` and `normalizeCanvas` rebuild every node and edge field by field.
6. **Ephemeral state is never persisted, and durable state is never memory-only.** See Storage Model.
7. **Every socket handler is registered through `safeHandler`** and validates its payload before use. Handlers with acks check `typeof ack === "function"`.
8. **Collaborate code stays inside its lazy chunk.** Nothing outside `src/pages/Collaborate.jsx` imports from `src/collaborate/`. React Flow and its CSS are imported inside the chunk only.
9. **Collaborate never imports from `src/chat/` or `src/blog/`.** Patterns are copied and adapted, which keeps `/chat` removable. `src/constants/brand.js` may be shared.
10. **`/blog` and `/chat` keep working** after every slice.
