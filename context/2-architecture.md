# Architecture Context

**Current checkpoint (2026-11-12):** implemented through S26; S25/S26 are code-approved and uncommitted on `9b47c77`. The existing S27–S30 roadmap remains future work; no S27 spec has been written. Runtime/manual QA and live membership revocation are not established. Stop after today's documentation reconciliation; see HANDOFF.md and the final S25/S26 reviews.

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
│   ├── projectMessages.js          S23  history cursor, text rules, message whitelist
│   ├── projectMembership.js        S26  invite/member validation, resources, snapshot guards
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

server/test/      projectAccess · canvasOps · workspaceRooms · turns · workspace.socket · canvas.socket · cursor.socket · turn.socket · projectMessages · projectMessage.api · projectTyping.socket · imagekit · projectMembership · projectMember.api (*.test.js); rateLimit remains S29

src/pages/Collaborate.jsx           S04  lazy route root
src/collaborate/
├── collaborate.css                 S04  scoped theme under .collab-root
├── lib/        axios.js · projectLimits.js · tabId.js · throttle.js · userColor.js · workspaceSync.js · canvasHistory.js · canvasShortcuts.js (plus presence/chat helpers)
├── store/      useSessionStore.js · useProjectsStore.js · useWorkspaceStore.js · useProjectChatStore.js
├── routes/     CollaborateAuthGate.jsx · ProjectsPage.jsx · WorkspacePage.jsx
└── components/
    ├── ui/         Dialog (S05: portaled, focus-trapped shell, reused by ShareDialog)
    ├── projects/   ProjectCard · ProjectDialogs · InvitationsList
    ├── workspace/  WorkspaceNavbar · ParticipantStack · TurnBar · ShareDialog · ConnectionBanner
    ├── canvas/     WorkspaceCanvas · ShapeNode · LinkEdge · ShapePanel · ColorToolbar · CanvasControls · PresenceCursors
    └── chat/       ProjectChatPanel · ProjectMessageList · ProjectComposer
```

The tree includes planned InvitationsList/ShareDialog (S28) and rateLimit (S29) to show their intended boundaries; these files are not implemented. S26 added REST membership only.

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

**ProjectMessage** (`projectmessages`), implemented in S23

```js
{ project: ObjectId → Project, sender: ObjectId → User, text: String ≤ 2000, image: String, video: String, timestamps }
index: { project: 1, createdAt: -1, _id: -1 }
```

One saved row has nonblank text or exactly one media URL. The wire resource whitelists `_id`, `project`, `sender: { _id, fullName, img } | null`, `text`, `image`, `video`, `createdAt`, and `updatedAt`.

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
- `invertOps(canvas, ops)` (S25) computes the inverse of a batch for undo; see the S25 history contract below.

### S25 history contract (implemented, Approved)

Approved after second correction on 2026-11-12; see `specs/25-undo-redo-review.md`. It remains uncommitted. The later independent S26 regression run includes all S25 suites; browser/touch-hardware QA remains open.

`invertOps(canvas, ops)` in `shared/canvasOps.js` validates the whole forward batch with `applyOps` and returns `{ ok: true, ops }` or `{ ok: false, error, index }` with the same message and index. It reads each op's immediate pre-state and emits the inverse groups in reverse order: `node.add` becomes `node.remove`; `node.update` restores exactly the patched fields; `node.remove` becomes `node.add` followed by `edge.add` for each edge that removal actually cascaded (an edge dropped by an earlier removal belongs to that earlier group); `edge.add`, `edge.update` and `edge.remove` invert the obvious way. The output can exceed 50 ops (a node with 600 edges inverts to 601), so `applyOps` and `MAX_OPS_PER_COMMIT` are unchanged. Round trips are equal by id and fields, not by array order or version.

The client keeps history in memory on the binding (`lib/canvasHistory.js`), mirrored into the store as `history: { undo, redo, busy, replay, gesture }`; every workspace reset puts it back to idle.

- **Frames.** One graph-changing public `dispatch` records one `{ forward, inverse }` frame, installed before enqueue. At most 100 undo frames; the oldest is evicted. A new graph-changing edit clears redo. Refused, invalid, no-net-change dispatches, remote ops, hydration, selection and previews record nothing and leave redo alone. The server still receives a no-net-change batch.
- **Availability.** `selectCanUndo` / `selectCanRedo` and the `undo()` / `redo()` actions require: the holder gate (`selectCanEdit`, which now also refuses while a replay runs), the session socket and account that authenticated the joined connection (checked again inside the action), a fully drained queue (no pending, no in-flight commit, no recovery), no replay, no active drag/resize/connection gesture, and a non-empty stack.
- **Two gates.** `holderCanEdit` is the underlying holder/connection permission the sync pump uses, so a replay can keep sending its own chunks. `selectCanEdit` is that plus `!history.replay`; the UI, every public store action and the preview throttle use it, so ordinary edits and previews are refused during a replay while chat, cursors, selection, pan, zoom and turn controls keep working. The pump also now checks `ownsConnection(binding)` (the account that authenticated the connection), so an old account's queued write is not sent after a session change.
- **Replay.** The selected sequence (the top frame's inverse for undo, its normalized forward ops for redo) is split into contiguous chunks of at most 50 ops and every chunk is dry-run in order with `applyOps` before anything is published. If any chunk fails nothing is sent, history is cleared and a toast says so. Otherwise the fully optimistic graph is published once at the last confirmed version and all chunks are queued together (`enqueueMany`) before the first emit. The existing single-in-flight pump sends them in order, each on the previous confirmed version. Replay never goes through the public `dispatch`, so it records no history. The frame moves between stacks only when the queue is fully drained after the final successful ack, in the same generation and sync epoch.
- **Interruption.** A multi-commit replay is not server-atomic. A reject, timeout, throw, turn loss or disconnect leaves any saved prefix in place, discards unsent chunks, clears both stacks and goes through the existing authoritative recovery. Nothing is rolled back or retransmitted. One notice, `Undo interrupted. Some changes may have been saved.` (or `Redo ...`), shows only when a replay was interrupted by recovery or turn loss while the workspace is still on screen.
- **Invalidation.** `session.hooks.invalidate` (called from `invalidateSession`, every `beginRecovery`, and an accepted non-duplicate remote update) and `invalidateHistory` clear frames, bump a history generation, drop the replay and gestures. Also cleared on turn loss with an empty queue, `revokeJoinedAccount`, and a session-store change that stops owning the binding (the binding subscribes to the session store). Late acks, drains and timers compare binding, sync epoch and generation, so they cannot restore history or finish a retired replay. `session.hooks.queue` runs after enqueue, after each accepted commit and after a recovery completes, to refresh `busy` and complete a drained replay.
- **Ownership loss (review correction).** When the session socket or account stops owning the joined connection (`sessionOwnsBinding` false), the binding's session subscription calls `retireUnownedWork`: if a commit is in flight, chunks are queued or a replay is active, the sync session is invalidated (epoch moves, queue and callbacks retired, `joinedConnectionId` cleared) and the workspace returns to `loading`, as on a disconnect. A late ack therefore pumps nothing and republishes nothing, and restoring the old socket or account does not resurrect the work; only a fresh join does. With no pending work only history is cleared.
- **Gesture cancellation (review correction).** Drag, resize and connect gestures are cleared by their end events, by the store's `cancelGestures`, by `invalidateHistory`, and on disposal. React Flow aborts a drag on a second touch without `onNodeDragStop`, so while a gesture is active the canvas attaches window listeners (`attachGestureCancel`): touchend/touchcancel once no finger remains, mouse or pen release, `pointercancel` and window blur. The listeners are registered in the **capture** phase because d3-drag, which React Flow's node drag uses, calls `stopImmediatePropagation` on the touchend/touchcancel of a touch it tracks, so a bubbling window listener never sees the event that ends an aborted multitouch drag. They only read events and never stop them, ignore a release while another finger is down, and treat blur as the window's own (a field blurring mid-drag does not end it). A `ShapeNode` that unmounts mid-resize ends its own resize only.
- No new socket event, payload, collection, backend handler or limit. No server entrypoint, handler, controller or model changed; only the shared pure `canvasOps.js` module (also run by the server) gained `invertOps`.

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

- A socket has one active workspace room at a time, separate from its existing per-user room. A different-project join replaces the previous workspace. Every join, even to a cached room, resolves membership from the database. The join response's project is the whitelisted summary `{ _id, name, description }`. S13 acked `participants: []` and `turn: null`. Since S20 the ack carries the public turn state.
- Registry connections are keyed by socket id, with `{ userId, tabId }`; members are keyed by userId with trusted role/fullName/img. Concurrent room loads are shared. Short-lived acquisition leases protect pending joins; rooms with neither connections nor pending joins are evicted. Initialization failures are retryable. Per-room serial write queues exist for S14 but do not save edits in S13.
- Per-socket lifecycle ordering and intent invalidation prevent late joins after leave, disconnect, or route replacement. Leave is project-scoped: stale leave A cannot cancel current project B. Client attempts also track route/binding, socket object, connection id, and request generation before accepting an ack.
- Missing/non-member/invalid-project joins return `{ ok: false, message: "Project not found" }` with no resource data. Malformed requests, superseded attempts, and operational failures use the other messages defined in the S13 spec without extending the wire shape. Project not found shows the access-denied card; operational failures/timeouts show retry. Obsolete requests never overwrite current state or show errors.
- Joins normalize the loaded snapshot in memory and preserve its stored version; they do not repair existing canvas content or save local edits. Reconnect reloads the snapshot and replaces local-only edits. Saving and broadcasting edits arrive in S14–S15. Before then, disconnect hides the canvas and clears role while automatic reconnect/rejoin runs. No presence broadcast, turn enforcement, or ConnectionBanner is added by S13.

### Participants (S17)

`specs/17-participants.md` is implemented and approved; see `specs/17-participants-review.md`. The registry builds a fresh roster from connected sockets only, one entry per user, sorted by Mongo user id, with the cached role, fullName, and img. The join ack includes that roster, including the joiner. Each successful attach and each actual removal then emits a non-volatile `presence:update` to `project:<projectId>` through `io.to`. An evicted room broadcasts an empty roster. Another tab does not add a second row, and the user disappears only when their last tab leaves or disconnects. The client keeps the full list, including itself, and the navbar stack hides the current user. A presence event that arrives before the join ack is kept and wins over that ack. Previews, turns, and live membership checks are unchanged.

### Live cursors (S18)

Approved by Codex on 2026-11-08 after the corrections, including color-toolbar padding/gap filtering; see `specs/18-live-cursors-review.md`. Client cursor tests 69/69 and server cursor tests 7/7 pass; browser/two-account/live-server checks remain unverified. S16 and S17 were approved on 2026-11-09. Behavior backed by automated tests: the relay uses `socket.to(room).volatile.emit`, so the sender never receives its own cursor. The first movement on a quiet throttle emits immediately and emissions are at least 50ms apart. Inbound events are validated (finite, within `POSITION_MAX`, canonical ids) and self is suppressed by the session store's Mongo `authUser._id`. Accepted rosters prune departed users' cursors and expiry timers; error, notFound, retry, disconnect and disposal clear timers and the pending throttle, while canvas-only recovery keeps them. Emission rechecks the owning binding, join attempt, connection, ready status, role and project. Route disposal sends a volatile `cursor:leave` before `workspace:leave` when still joined and connected. Placement uses React Flow's `flowToScreenPosition` (client coordinates) minus the overlay rect once, against an always-mounted measurement target; the pointer tip is anchored at the projected point.

**Server events:** `cursor:move` and `cursor:leave` are registered through `safeHandler`. Both are volatile and have no ack. The server validates a plain-record payload and a 24-character hex project id; canonicalizes project ids. Movement requires finite numeric x and y with absolute values at most `POSITION_MAX`. Invalid input is silently ignored. Both handlers synchronously require the existing completed-join authority (`joinedConnection`): current generation, active project, connected socket, adapter-room membership, and matching registered connection. Permission uses `can(member.role, "chat")` — owners, editors, and viewers may send. No database access, room creation, serial queue, or canvas/presence broadcast occurs. Leave/rejoin/disconnect invalidate cursor-send authority exactly as they invalidate commit authority. A leave for another project does not invalidate the current one.

**Client coordinates:** Pointer movement is tracked over the canvas wrapper (including nodes and edges) using wrapper pointer handlers; touch is ignored. `event.clientX/clientY` are converted with `screenToFlowPosition({ x, y }, { snapToGrid: false })` inside the ReactFlowProvider. Movement originating in inputs, textareas, buttons, or floating controls clears the cursor; moving back over the canvas publishes again. Wrapper pointer leave/cancel calls `leaveCursor()` and cancels any pending throttle.

**Store send/receive:** Cursors are stored in `cursors: { [userId]: { x, y, lastSeen } }`. Receive time is local; names and roles come from the S17 participants array. Sending is allowed for every project role while status is ready and the binding has a live matching joined socket; canvas-only recovery does not block cursors. One throttle per binding (50ms, injectable clock) is separate from the preview throttle; it runs immediately on a quiet fresh throttle, collapses calls inside the window to the latest arguments, and guarantees minimum 50ms spacing across leading/trailing/subsequent emissions. One listener each for `cursor:move` and `cursor:leave` per binding, removed by reference on disposal. Incoming events require the active, non-disposed, connected, joined socket and matching project, plus ready status. Valid move replaces the user's entry and restarts its 10s expiry. Valid leave removes it immediately. Presence snapshots remove cursors for users no longer present. Profile/role updates for still-present users preserve their point.

**Expiry:** Timers live in a binding-owned controller outside serialized state. Per-user timeouts fire `onChange(userId)` to publish the changed cursor map. A superseded callback cannot expire a newer point. New join/retry, disconnect, reset, disposal, binding replacement, and transitions to error/notFound clear cursor state, timers, and trailing sends. Recovery preserves valid cursors. A connected route exit emits a final volatile `cursor:leave` before `workspace:leave`.

**Overlay and colors:** `PresenceCursors` renders as a sibling overlay over ReactFlow inside the provider and a known positioned wrapper. It subscribes with `useViewport()` so remote points reproject on local viewport changes. Projection uses `flowToScreenPosition` (converts flow → screen, subtracts overlay container rect once). A `ResizeObserver` tracks container moves/resizes. The overlay is clipped to the canvas, absolutely positioned, and `pointer-events: none`. It uses a small code-native SVG pointer and a compact text-sm name badge; names use trimmed fullName or "Unknown user", truncated. The layer is `aria-hidden` since the participant stack already identifies users. `userColor(userId)` uses a deterministic hash (start 0, for each char: hash = (hash * 31 + charCode) >>> 0, then hash % 8) against the eight palette colors from `3-ui-context.md`. The same color marks the user's avatar ring in `ParticipantStack`. The protocol is per user, not per tab: one latest cursor per other user; either tab's movement replaces it; leave from either tab clears it; closing one tab while another remains does not produce a presence departure — the point persists until 10s expiry.

### Commit pipeline, server

Each room has a serial queue, so commits apply strictly in order even though Socket.io runs handlers concurrently.

1. `canWrite(room, connection)` passes.
2. `baseVersion === room.canvas.version`.
3. Shared `applyOps` succeeds.
4. `Canvas.updateOne({ project, version: base }, { $set: { nodes, edges, updatedBy }, $inc: { version: 1 } })`.
5. If nothing matched, reload from the database and reject with that canvas.
6. Otherwise update the room cache, ack the sender `{ ok, version }`, and broadcast `canvas:ops` to the room except the sender.

The S14 implementation contract is `specs/14-commit-handler.md` (implemented and approved, 2026-11-07). `by` in `canvas:ops` is the authenticated Mongo userId string. `canWrite(room, connection)` lives in `workspace.socket.js`, accepts only a current registry connection, and checks its trusted member role and, since S20, that the connection's tab holds the turn. This keeps the registry independent of projectAccess's Mongoose dependency. Commit and sync refresh project membership with `findProjectForMember` inside the room queue before canvas I/O. A viewer can sync but cannot commit. Request acceptance also requires the completed join's `joinedGeneration` to match the current join intent; rejoin, relevant leave, and disconnect invalidate that authority synchronously before queued registry cleanup, preventing new requests from adopting an old connection under a newer generation.

Commit and sync use the same room write queue. Accepted pending/in-flight requests retain a room lease so departure of the last socket cannot create a second queue/cache while a save runs. Leave, disconnect, or a replacement join invalidates queued requests before persistence starts. An already-started successful save still installs its cache and broadcasts to remaining subscribers; obsolete callers receive no success ack. S13 join cancellation and snapshot-before-future-ops ordering remain intact.

Only version conflicts and shared op-validation failures return a canvas to a still-authorized writer; malformed, unauthorized, and operational failures return only `{ ok: false, message }`. A compare-and-set miss reloads and normalizes the existing durable snapshot, never upserts. A failed conflict reload or ambiguous write outcome requires a read-only database refresh before later commit/sync success; failures stay closed rather than exposing a known-stale cache. Sync normally returns the queued accepted cache, with recovery reads only when needed, and never saves or broadcasts. The S14 spec defines the exact failure messages and verification cases. Client commit/remote-op wiring is the approved S15 contract.

### Commit pipeline, client

- The store keeps the canonical canvas and React Flow display arrays. Display arrays keep UI-only fields (`selected`, `measured`) when rebuilt from canonical.
- `dispatch(ops)` applies ops optimistically via shared `applyOps`, then queues them.
- Only **one commit is in flight at a time**. Ops dispatched in the meantime batch into the next commit.
- A reject or timeout replaces the canvas with the server's copy and drops queued ops.
- A remote `canvas:ops` applies only if `version === local + 1`. Otherwise the client calls `canvas:sync`.
- Drag and resize positions are display-only (sent as volatile previews) until drag or resize ends, which dispatches a single `node.update`.

The detailed S15 contract is `specs/15-client-sync-wiring.md` (implemented and approved, 2026-11-07). The graph is optimistic, but its version remains the last confirmed server version. Submitted and unsent work belong to one binding/join/connection epoch. Waiting dispatches batch in order up to 50 ops without splitting one dispatch's atomic boundary. Success advances the confirmed version without erasing later optimistic edits. The client uses 8-second commit and sync acks; join remains 10 seconds.

Rejects, uncertain timeouts, remote version gaps, and new remote edits during pending local work discard unsent work and recover from an authoritative snapshot. A usable rejection canvas may supply it; otherwise the client reads `canvas:sync` without first leaving the workspace. No uncertain commit is replayed. Recovery temporarily gates editing, invalidates old commit callbacks, coalesces sync requests, and accounts for remote versions observed while joining/syncing so a late snapshot cannot erase a newer change. Failed recovery uses the existing error/access-denied route states and retry rejoins. Edit denial requires a fresh join to refresh role; sync does not return a role. A successful recovery toasts `Canvas re-synced` once. Ordinary joins/reconnects do not.

Valid contiguous remote ops update confirmed/canonical/display state without dispatching an echo; old/duplicate versions are ignored, and same-user events from other tabs are still remote edits. Socket disconnect, rejoin/retry, disposal, and binding replacement invalidate queue/recovery state; reconnect loads durable state and never replays unsent edits. The client content gate also checks the live connected binding, covering sign-out before route cleanup even if its disconnect listener was removed. Server write authorization remains decisive. Drag and resize previews are specified in `specs/16-drag-resize-previews.md` (approved 2026-11-09 after `specs/16-drag-resize-previews-corrections.md`). The sender emits volatile `canvas:preview` at most every 50ms and cancels a pending sample when the gesture commits. The server shape-checks the payload, relays it with `socket.to(room).volatile.emit`, and does not ack it, enqueue it on the room write queue, or write the canvas. `by` is the authenticated Mongo userId. Receivers apply the sample to display nodes only. Each node overlay expires 3 seconds after its last preview, and a canonical position or size update for that node removes the overlay immediately. Since S20 only the holder's tab may send previews.

### Turn rules (S19)

- **Request.** If nobody holds the turn, it's granted. If the requester already holds it or is queued, nothing happens. Otherwise the requester is appended to the queue. Viewers can't request.
- **Release.** The turn passes to the next *connected* queue entry.
- **Cancel.** Leaves the queue.
- **Reclaim (owner only).** The owner takes the turn, and the previous holder goes to the front of the queue. A previous holder in its grace period is dropped instead, because the queue holds only connected tabs.
- **Holder's tab disconnects.** `graceUntil = now + 20s`. Rejoining within the grace period keeps the turn and counts as activity; once it expires, the turn passes on.
- **Queued tab disconnects.** It's removed from the queue.
- **Idle.** While the queue is non-empty, `idleDeadline = max(lastActivity, queue[0].queuedAt) + 120s`. If the holder makes no commit or preview by then, the turn passes on, and the idle holder is not re-queued. While nobody waits, a turn never expires. Idle never fires during a holder's grace period, so a brief network loss cannot cost the turn.
- **Role change.** Losing edit rights removes the user from the holder slot and the queue.
- **Empty room.** All state is discarded.
- **Sweeper.** One `setInterval` every 5s applies `expire(now)` to every room.

### Turn events (S20)

Implemented and approved; see `specs/20-turn-events-enforcement.md` and `specs/20-turn-events-review.md`. Each room holds its turn state. `canWrite` also requires the connection's `userId` and `tabId` to match the holder. Every turn change goes through one setter, which broadcasts only real changes as a non-volatile `turn:state`. Activity from commits and previews resets the idle clock on every call and is broadcast at most every 5 seconds, and only while someone waits. A `workspace:leave` counts as a disconnect. `tabLeft` runs only when no other connection in the room has the same `userId` and `tabId`, because a duplicated browser tab can copy its id. A holder alone in a project loses the turn on any drop, because an empty room is discarded; grace matters only when someone else is present. The role used for turn events is the room's cached role until S27 keeps it live. S20 left the client gating edits by role alone. It did not read the turn, so a browser edit was refused by the server and the workspace rejoined until S21.

### Turn UI (S21)

The client stores the normalized public turn from the join acknowledgement and from later `turn:state` packets. The server samples the turn immediately before the ack, so an earlier packet is discarded even when `serverNow` matches. A packet that arrives after the ack applies after that snapshot, in arrival order. `selectCanEdit` keeps the ready, role, connection, and recovery gates, and it also requires this tab to be the holder. Losing the turn cancels a queued preview, so that sample cannot send if the same tab is granted the turn again inside the throttle window. Request, release, cancel, and reclaim are ordinary socket emits. The Release button stays on that ordinary channel.

### Turn robustness (S22)

A live turn update that takes this tab's turn publishes the new holder before any canvas recovery. Unsent batches are dropped, the client toasts `Your turn ended before some edits could be sent`, and the existing `canvas:sync` recovery installs the server snapshot. An in-flight commit with an empty queue still settles on its own ack. The commit pump rechecks `selectCanEdit` and leaves a blocked queue untouched. Disconnect with unsent or uncertain work toasts `Connection lost. Some edits may not have been saved` once, then rejoins from the server snapshot and does not resubmit those edits. A clean disconnect stays silent.

The connection banner is a full-width warning strip under the navbar. Loading shows a spinner first and `Waking the server…` after 3 seconds. A drop after the workspace was ready shows `Reconnecting…` immediately, switching to the waking copy only if the connected rejoin itself takes 3 seconds. Join success and canvas-only recovery clear the connection notice. A socket that has stopped retrying shows the existing error card. `pagehide` emits volatile `turn:release` for the live holder, including during canvas recovery, and removes that packet if the client buffered it. The server grace period remains the fallback. A `canvas:commit` that Socket.IO queues while the socket still reports connected is removed by that payload's identity, so the queue cannot flush it ahead of the next join. A commit the transport already sent stays uncertain until its acknowledgement or a snapshot.

The holder sees `Name is waiting — passes in m:ss unless you edit` while a queue head and an idle deadline exist outside grace. The receipt is `performance.now()` at packet acceptance, including before a join defers the packet. Each render and timer tick recomputes the remainder. The text sits outside the polite live region. At zero the client keeps the turn until the server says otherwise.

### Project chat backend (S23)

Implemented under `specs/23-project-messages-api.md` and approved by Codex. The client panel is also implemented and approved in S24. All project roles can read and send messages without a turn. REST authorizes membership before validating the query and before parsing uploads. A slow upload reads membership again before insertion. That second check does not make project deletion and message insertion one transaction: a delete that commits after the insert starts can leave the row, and a failed later check can leave the uploaded file. S27 owns live deletion coordination and Clerk cleanup. No ImageKit cleanup service was added.

History uses `GET /api/projects/:id/messages?before=<ISO>&beforeId=<id>&limit=50`. The optional `beforeId` pairs with `before` to order equal timestamps by `_id`; a timestamp-only cursor still means strictly older timestamps. The compound index above supports newest-first selection, and each page is returned oldest first as `{ messages, hasMore, nextCursor }`, where nextCursor is `{ before, beforeId }` or null. This refines the original timestamp-only outline to avoid skipped messages. POST returns `{ message }`; the non-volatile `project:message` broadcast includes every socket in the project room, including the sender's tabs. Both use the same whitelisted resource and sender projection (`_id fullName img`). A member who cannot chat receives `403` with `You cannot chat in this project`.

Media uses the existing 25 MB image/video parser and `uploadChatMedia(file, folder = "/chat")`, passing `/collaborate` for projects. Direct messages still default to `/chat`. Project-only middleware maps upload input errors to 400 without changing DM behavior. Typing reuses the completed-join authority and cached chat permission, relays volatile to other sockets, and never records turn activity. After an owner delete removes the project, canvas cleanup and `ProjectMessage.deleteMany({ project })` run in that order. A cleanup throw does not return success. Room eviction remains S27.

### Project chat client (S24)

Implemented under `specs/24-project-chat-panel.md` and approved after two correction rounds; see its final review and HANDOFF.md for verification limits. `useProjectChatStore` owns history, REST sends, realtime merge, typing timers, unread, and the sound preference. It reads the workspace and session stores. The workspace store does not import it. `selectCanChat` allows an owner, editor, or viewer without a turn and does not read canvas sync or recovery. It requires a ready workspace, the live joined socket, the matching project, and the session account that authenticated that connection. The connection keeps that account for its socket id. A workspace retry or route rebind on the same id cannot give it to a different account. A new socket id can. A missing or replaced session socket still clears chat until a join for that account. A same-account retry still loads chat. A same-account transport disconnect still keeps the draft and file. Sending and typing use that selector. `selectCanEdit` and `selectIsHolder` are unchanged. Chat never emits `workspace:join` or `workspace:leave` and never enters the canvas commit loop.

History is `GET /projects/:id/messages` with limit 50. Load earlier sends both `before` and `beforeId`. Pages, POST results, and `project:message` events merge by `_id`, oldest first by `createdAt` then `_id`. A page that arrives after a live message keeps that message. The cursor follows the history response. A reconnect replaces the displayed window with a new newest page. It does not replay sends, chime, or claim that the offline gap was fully loaded. Older rows stay reachable through Load earlier. There is no optimistic row and no automatic resend. A failed send keeps the draft and file. S23 has no idempotency key, so a manual retry after an uncertain send can create a second row.

Unread counts a live message from another user only while the panel is closed or the document is hidden. Own messages and fetched history stay silent. The message chime uses its own AudioContext and does not replace the turn chime. Only `isSoundEnabled` persists, under `ajfm88-collaborate`. Typing emits volatile `project:typing` as `{ projectId, isTyping }`, refreshes `true` at most every 2 seconds, sends `false` after 2 seconds idle, and expires each incoming user after 5 seconds. Self, unknown users, and other projects are ignored.

## S26 invitation and membership contract (implemented, Approved)

Implemented in `server/src/controllers/projectMember.controller.js` and `server/src/lib/projectMembership.js`, routed in `project.route.js`; Approved by Codex on 2026-11-12, uncommitted. The full contract is `specs/26-invites-members-api.md`, the accepted choices/evidence are in `specs/26-invites-members-api-review.md`, and the endpoint reference is `server/readme.md`. No schema, model, middleware, webhook, socket, client or dependency change.

- Seven REST endpoints behind `protectRoute`: owner create and revoke invitation; recipient list, accept and decline; owner change member role; owner remove member or member leave. `/invites/mine` and both `/invites/:inviteId/...` POSTs are registered before the generic `/:id` routes.
- **Recipient authority** (the narrow exception to invariant 2): an invitee is not a member, so reads and writes are scoped in the query to ONE `invites` element containing both the invite id and the trusted caller's normalized email (`$elemMatch`). Never the id in one element and the email in another. Offers expose only project id and name, role, a minimal inviter and the date.
- **Email:** primitive strings only, trimmed and lowercased, at most 254 characters, a bounded pattern and no control characters; plus tags and dots kept, no alias folding. Existing-member comparison reads only the `_id` and `email` of this project's own member users and compares normalized values in code, because `User.email` is case-sensitive storage. The email lookup never touches Clerk, a directory or a regex.
- **Seats:** members plus pending invites, excluding the owner, may not exceed 10. A pending invitation reserves a seat. Accept swaps the invitation for the member and succeeds at ten.
- **Atomic writes:** every mutation is one Project update whose filter repeats the authority used (owner, member, or the invitation element) and an exact snapshot of the unpopulated `members` and `invites` arrays (`$size` plus an `$elemMatch` per element; empty arrays are `$size: 0`; ObjectIds and Dates stay values). Accept pulls the invitation and pushes the member in one update. A role change uses a positional `arrayFilters` `$set` on the one member. A miss is never retried: a fresh scoped read yields the specific `404`/`403`/`400`, else `400 Project membership changed. Please try again.` No version field, lock or transaction. Renames and description edits do not conflict with membership changes.
- Evidence is an in-memory model that evaluates the real filters and updates plus a no-I/O Mongoose cast check; there is no live MongoDB race test.
- **Not live:** REST changes do not remove or demote anyone already joined to a workspace room, or clear cached cursor, typing, turn or broadcast state. That is S27, together with Clerk deletion cleanup. The UI is S28.

## Invariants

1. **Identity comes from the server.** Use `req.user` from `protectRoute` or `socket.data.userId` from the handshake. Never trust a user id from a payload.
2. **Every project read or write is scoped to the caller's authority in the query itself.** Normal project resources require membership, e.g. `Project.findOne({ _id, $or: [{ owner: me }, { "members.user": me }] })`. Non-members get `404`; members lacking permission get `403`. The implemented S26 invitation-recipient routes instead match the trusted caller's normalized invite email and, for an addressed offer, invite id in the same element; this permits only offered metadata and accept/decline, never ordinary project access.
3. **Only the turn holder's tab may change the canvas.** Every write check goes through one function, `canWrite(room, connection)`.
4. **Every canvas mutation is an op.** Client components call store actions: ordinary edits use `dispatch(ops)`, while undo/redo replays preflighted ops through the same canonical apply/publish and serial commit pipeline without creating new history frames. Components never write `nodes`/`edges` directly. On the server, ops go through shared `applyOps`. Each commit is validated, persisted, then broadcast, in that order.
5. **Stored canvas data is whitelisted.** Never persist a raw client object. `applyOps` and `normalizeCanvas` rebuild every node and edge field by field.
6. **Ephemeral state is never persisted, and durable state is never memory-only.** See Storage Model.
7. **Every socket handler is registered through `safeHandler`** and validates its payload before use. Handlers with acks check `typeof ack === "function"`.
8. **Collaborate code stays inside its lazy chunk.** Nothing outside `src/pages/Collaborate.jsx` imports from `src/collaborate/`. React Flow and its CSS are imported inside the chunk only.
9. **Collaborate never imports from `src/chat/` or `src/blog/`.** Patterns are copied and adapted, which keeps `/chat` removable. `src/constants/brand.js` may be shared.
10. **`/blog` and `/chat` keep working** after every slice.
