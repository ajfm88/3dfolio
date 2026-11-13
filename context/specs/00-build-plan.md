# 00 — Build Plan: /collaborate in 30 Slices

This is the whole build, designed before the first prompt. Each slice is one scoped, verifiable unit. Before a slice starts, the assigned spec author expands its entry below into a full spec file, `specs/NN-<name>.md` (Goal · Design · Implementation · Dependencies · Verify when done). Implementers build from the spec file, not from this summary.

Context: `1-project-overview.md` (what), `2-architecture.md` (how it fits, and the invariants), `3-ui-context.md` (visuals), `4-code-standards.md` (conventions), `5-ai-workflow-rules.md` (process), `6-progress-tracker.md` (state).

**Ordering rules applied:**

- Dependencies come first.
- Access control comes before the features it protects (S02–S03 before any canvas sync).
- Each API is built before the UI wired to it.
- UI is built on local state before sync (S07–S12 dispatch ops locally, then S13–S15 route them through the server).
- Each dependency is installed in the slice that first uses it (`@xyflow/react` in S07).


## Slices

**Checkpoint (2026-11-12):** S01–S24 are committed through HEAD `9b47c77` (commit 68). S25/S26 are implemented and Approved by Codex, uncommitted; the user handles commits. Latest independent verification: 542 tests, production build and diff check pass. Four slices remain before launch (S27–S30); browser/two-account/manual/live-database QA is open, and S26 has no live socket revocation or UI. The user requested stopping after S26 review today. No S27 spec, new planning or implementation has been started; resume only on the user's instruction and read `../HANDOFF.md` first.

Each slice has a **lane** (`server`, `client`, `both`) and dependencies. Slices in different lanes with no dependency between them can run in parallel, one agent per lane, in separate git worktrees. Suggested parallel pairs: S04∥S02, S06∥S05, S19∥S17–S18, S23∥S21–S22, S26∥S24–S25.

**Every slice is done only when:** its checklist passes, `npm run build` passes at the root, `cd server && npm test` passes, the server boots, `/blog` and `/chat` still work, the relevant `server/readme.md` sections are updated, and `6-progress-tracker.md` is marked *Ready for review* with notes on what changed, how it was verified, and any deviations.

### Phase A — Server foundation

#### S01 · Split socket handlers by feature `server`
- Move `safeHandler` to `server/src/lib/safeHandler.js`.
- Move chat presence (`userSocketMap`, `getOnlineUsers`), `typing`, and chat's `disconnect` logic verbatim into `server/src/sockets/chat.socket.js` as `registerChatHandlers(io, socket)`. It receives `io` as a parameter and does not import `socket.js`.
- `socket.js` keeps the app, server, `io`, and auth middleware. Its `connection` handler joins the user room and calls `registerChatHandlers`. Exports stay `{ app, server, io }`.
- **Done when:** this is a pure refactor with no behavior change. DM send and receive, typing, multi-tab presence, and offline-on-last-tab-close all work exactly as before. The readme's Socket.io section names the new files.
- **Not here:** any workspace code.

#### S02 · Project and Canvas models, access helpers, test harness `server` · after S01
- `project.model.js` and `canvas.model.js` per `2-architecture.md`.
- `lib/projectAccess.js` exports:
  - `roleOf(project, userId)` → `"owner" | "editor" | "viewer" | null` (pure)
  - `can(role, action)` per `2-architecture.md` (pure)
  - `findProjectForMember(projectId, userId)`: `isValidObjectId` guard, then a membership-scoped query, returning a lean project or `null`
  - the limit constants
- `server/package.json`: `"test": "node --test"`. `server/test/projectAccess.test.js` covers every row and column of the permission table, plus `roleOf` edge cases (not a member, owner listed oddly, string vs ObjectId ids).
- Readme: Database Schema adds both collections.
- **Done when:** `npm test` passes and the server boots with the models registered.

#### S03 · Project REST API `server` · after S02
- `routes/project.route.js` mounted at `/api/projects`, all behind `protectRoute`.
  - `GET /`: `{ owned, shared }`, each item `{ _id, name, description, role, memberCount, owner: { fullName, img }, createdAt, updatedAt }`, newest first.
  - `POST /`: `{ name?, description? }`. Name defaults to `"Untitled project"`. Validates lengths and enforces the 20-owned cap (`400`).
  - `GET /:id`: member only. Returns `{ project, role }` with owner and members populated (`_id, fullName, img`). `invites` are included only when the caller is the owner.
  - `PATCH /:id`: owner only. Name and/or description, validated.
  - `DELETE /:id`: owner only. Deletes the project and its canvas.
- Non-member or invalid id → `404`. Member without permission → `403`. Never leak the existence of a project the caller isn't in.
- Readme: new "Project Routes" table plus request/response examples.
- **Done when:** with two accounts, A creates a project. A can list, get, rename, and delete it. B gets `404` on A's project. Invalid ids give `404`, not `500`.

### Phase B — Client shell

#### S04 · `/collaborate` route shell and session `client`
- `App.jsx`: lazy `/collaborate/*` route through `LazyRoute feature="Collaborate"`.
- `src/pages/Collaborate.jsx`: `ClerkProvider`, `ToastContainer`, `.collab-root` wrapper, a loader while Clerk resolves, and nested routes (index → `ProjectsPage`, `:projectId` → `WorkspacePage` placeholder, `*` → redirect to the index).
- `collaborate.css`: scoped theme. Copy chat's palette values under `--collab-*` names.
- `lib/axios.js`: its own instance with the Bearer interceptor, same pattern as chat.
- `store/useSessionStore.js`: `checkAuth` via `/auth/check`, plus socket connect and disconnect with an `auth` function for fresh tokens. Same pattern and comments as chat's `useAuthStore`. Exposes `socket`, `authUser`, `isConnected`.
- `CollaborateAuthGate.jsx`: signed-out card in the chat gate's style, copy adapted.
- **Done when:** a signed-out visitor sees the gate. A signed-in visitor sees a placeholder dashboard and the socket connects (server log). Build output shows Collaborate as its own chunk, and the entry chunk size is unchanged.

#### S05 · Projects dashboard `client` · after S03, S04
- `store/useProjectsStore.js`: fetch, create, rename, delete.
- `ProjectsPage`:
  - "My projects" and "Shared with me" sections, plus an empty state.
  - `ProjectCard` shows name, description, role badge, member count, and an updated time (timeago.js is already a dependency).
  - `ProjectDialogs`: create (name, description), rename, and delete confirm, owner only.
  - Clicking a card navigates to `/collaborate/:id`.
- **Done when:** create, rename, and delete all work and the list refreshes after each. Shared projects show no owner actions. API errors surface as toasts.

### Phase C — Canvas (local editing, every change is an op)

#### S06 · Shared canvas ops module `server` (pure) · after S02
- `server/src/shared/canvasOps.js` per `2-architecture.md` (Collections, Limits, Canvas ops): constants (shapes, the 8-pair color palette, default sizes per shape, limits), `sanitizeNode`, `sanitizeEdge`, `applyOps`, `normalizeCanvas`, `createNodeId()`, `createEdgeId()` (`crypto.randomUUID`-based, available in browsers and Node).
- `server/test/canvasOps.test.js`: every op type valid and invalid, atomic rejection, `node.remove` cascade, duplicate ids, missing edge endpoints, every limit, extra fields stripped, input not mutated, `normalizeCanvas` dropping dangling edges.
- **Done when:** tests pass and the module has zero imports.

#### S07 · Canvas foundation `client` · after S05, S06
- `npm i @xyflow/react`. `vite.config.js` gets an `@shared` alias (use `fileURLToPath(new URL(..., import.meta.url))`, since the config is ESM).
- `store/useWorkspaceStore.js`:
  - state: `project`, `role`, canonical `canvas`, `rfNodes`, `rfEdges`
  - `dispatch(ops)`, applied locally via shared `applyOps`; on `ok:false`, toast and ignore
  - `onNodesChange` and `onEdgesChange`, which apply only `select`, `position`, and `dimensions` changes to the display arrays
  - a display rebuild that keeps `selected` and `measured`
- `WorkspacePage`: loads `GET /api/projects/:id` for the name and role. `WorkspaceNavbar` has a back link, the project name, and a role badge. `WorkspaceCanvas` is a React Flow surface with a dot background, `CanvasControls` (zoom in, zoom out, fit), and no `fitView` on change. `nodeTypes` and `edgeTypes` are defined at module scope.
- Viewers get a read-only canvas: not draggable, not connectable, no delete key.
- **Done when:** the workspace renders with a full-height canvas and pan and zoom work. The canvas is local only: it starts empty on every load until S15, and that's expected. Note it in the progress file.

#### S08 · Shape panel and drop `client` · after S07
- `ShapePanel`: a floating pill at bottom center with 6 draggable shapes and a drag ghost preview. The drop handler uses `screenToFlowPosition` and centers the node on the cursor. It dispatches `node.add` with default size and the neutral color.
- Hidden for viewers.
- **Done when:** each shape drops exactly centered under the cursor at any zoom or pan, and the viewport doesn't move on drop.

#### S09 · Node rendering `client` · after S08
- `ShapeNode`: rectangle, pill, and circle via CSS; diamond, hexagon, and cylinder via inline SVG with `preserveAspectRatio="none"`. Fill, text color, and centered label come from `data`.
- Four handles with ids `top`, `right`, `bottom`, `left`, all `type="source"`, with `ConnectionMode.Loose`. Handles are hidden until hover and show a selected-state border.
- **Done when:** all 6 shapes render correctly at default and odd sizes, and handles appear on all four sides.

#### S10 · Move, resize, delete as ops `client` · after S09
- Drag: `onNodeDragStop` dispatches one `node.update` per dragged node (multi-select drag supported). In-drag positions stay display-only.
- Resize: `NodeResizer` (min 40) with `onResizeEnd` dispatches `node.update { position, width, height }`. Resizing from the top-left moves the position.
- Delete: React Flow's `onDelete({ nodes, edges })` dispatches `node.remove` and `edge.remove` ops. `remove` changes from `onNodesChange` are ignored, so nothing is applied twice.
- **Done when:** move, resize, and delete all go through `dispatch` (verify with a temporary log, removed before review). Measurement-driven `dimensions` changes never produce ops.

#### S11 · Labels and colors `client` · after S10
- Inline label edit: double-click opens a textarea overlay (`nodrag nopan`, maxLength 200). Enter or blur commits `node.update data.label`; Escape cancels; Shift+Enter inserts a newline.
- `ColorToolbar` (React Flow's `NodeToolbar`) on the selected node: 8 swatches that dispatch `data.color` and `data.textColor` together.
- Both are hidden or disabled for viewers.
- **Done when:** label and color changes are single ops, and typing in the label never triggers canvas shortcuts or delete.

#### S12 · Edges `client` · after S11
- `onConnect` dispatches `edge.add` with the handle ids. `LinkEdge` is a smooth-step path with an arrow marker (added at render, not stored), a wide invisible hit path, and the label as a pill at the midpoint. Double-click edits the label (`edge.update`, max 100 chars). Selected edges delete via S10's path.
- **Done when:** every handle can connect to every handle on another node, edge labels edit inline, and deleting a node removes its edges (cascade from `applyOps`).

### Phase D — Server-authoritative sync

#### S13 · Workspace join and leave `both` · after S01, S06, S12
- Server:
  - `lib/workspaceRooms.js`: a room registry keyed by `projectId` holding `{ canvas, members (role, fullName, img by userId), connections (socketId → { userId, tabId }), writeQueue }`, plus `createSerialQueue()`.
  - `sockets/workspace.socket.js`: `registerWorkspaceHandlers(io, socket)`, called from `socket.js`.
  - `workspace:join` validates the payload, runs `findProjectForMember`, lazily upserts the canvas, applies `normalizeCanvas`, caches the room, and acks per `2-architecture.md` → Socket protocol (participants empty for now, turn `null`).
  - `workspace:leave` and `disconnecting` remove the connection. An empty room is deleted.
- Client:
  - `lib/tabId.js` keeps a UUID in `sessionStorage`.
  - `WorkspacePage` joins on mount and again on every socket `connect` (reconnect), and leaves on unmount. It uses `socket.timeout(10000).emitWithAck`.
  - The ack's canvas loads the store. An `ok:false` ack shows an access-denied view.
- Tests: `workspaceRooms.test.js` covers the registry and that the serial queue keeps order under concurrent pushes.
- **Done when:** joining a non-member project gets an access-denied view. Restarting the server reconnects and rejoins automatically.

#### S14 · Commit handler `server` · after S13
- `canvas:commit` per the commit pipeline in `2-architecture.md`, routed through `canWrite(room, connection)`. For now that's: joined to this project, and role `can("edit")`.
- Payload checks: `ops` is an array, length 1–50, `baseVersion` is an integer. Broadcast `canvas:ops` to `project:<id>` excluding the sender. `canvas:sync` acks the current canvas.
- Readme: Socket.io section documents the workspace events added so far.
- **Done when:** a commit from a viewer is rejected, and a stale `baseVersion` is rejected with the canvas attached. A commit that fails validation leaves the database untouched. A tampered payload (extra fields, oversized label, 51 ops) is rejected or stripped as specified.

#### S15 · Client sync wiring `client` · after S14
- `dispatch` becomes: optimistic apply, then queue, then a single in-flight `canvas:commit` (`timeout(8000)`), batching ops dispatched in the meantime.
- On ack ok, set the version. On reject or timeout, replace from the server canvas, drop the queue, and toast "Canvas re-synced".
- Remote `canvas:ops` applies on `version === local + 1`, otherwise it triggers `canvas:sync`.
- A remote op arriving while local commits are pending forces a resync. This is only possible before turns exist.
- **Done when:** edits persist across reloads. Two browsers editing the same project see each other's committed changes within about a second. Killing the server mid-edit and restarting recovers to the persisted state.

#### S16 · Drag and resize previews `both` · after S15
- Client: `onNodeDrag` and NodeResizer `onResize` emit `canvas:preview`, throttled to 50ms with `lib/throttle.js`.
- Server: a `canWrite` check plus a shape check (≤ 50 entries, finite numbers, valid ids), then `socket.to(room).volatile.emit`.
- Receivers apply previews to display arrays only. A preview that has no follow-up commit within 3s is dropped (display rebuilt from canonical).
- **Done when:** watchers see nodes glide during another user's drag and resize, and land exactly on the committed position. Previews never touch the database.

### Phase E — Presence

#### S17 · Participants `both` · after S13
- Server: the room tracks participants per user (multiple tabs → one participant) with `fullName`, `img`, and `role` from the join lookup. It broadcasts `presence:update` on join and leave and includes participants in the join ack.
- Client: `ParticipantStack` in the navbar shows up to 5 avatars (initials fallback), a `+N` overflow, a tooltip with name and role, and excludes yourself.
- **Done when:** opening and closing tabs and accounts updates the stack correctly. A user goes offline only after their last tab closes.

#### S18 · Live cursors `both` · after S17
- Client: on mouse move over the canvas, emit `cursor:move` with flow coordinates (`screenToFlowPosition`), throttled to 50ms. Mouse leave emits `cursor:leave`.
- `PresenceCursors` renders others via `flowToScreenPosition` plus `useViewport`, so pan and zoom stay correct. Each cursor gets a deterministic color from `lib/userColor.js` and a name badge. A cursor disappears on leave, on presence departure, or after 10s without an update.
- Server: verifies the sender is joined, then relays volatile with `userId` from `socket.data`. Viewers have cursors too.
- **Done when:** cursors track accurately at any zoom and pan in both browsers, and none are left behind after a tab closes.

### Phase F — Turns

#### S19 · Turn state machine `server` (pure) · parallel with S17–S18
- `lib/turns.js`: pure functions of the form `(state, …, now) → state`: `createTurnState`, `requestTurn`, `releaseTurn`, `cancelRequest`, `reclaimTurn`, `tabLeft`, `tabRejoined`, `recordActivity`, `revokeEditRights`, `expire`, and `toPublic(state, now)`, which produces the `turn:state` payload. Constants `GRACE_MS = 20000`, `IDLE_MS = 120000`.
- `server/test/turns.test.js`: every turn rule in `2-architecture.md`, including skipping disconnected queue entries, an idle clock that starts at the first queue join, grace rejoin vs expiry, the reclaim ordering, and a viewer request being refused.
- **Done when:** tests pass and the module has no timers and no I/O.

#### S20 · Turn events and enforcement `server`, plus one client line · after S14, S16, S19
- Handles `turn:request`, `turn:release`, `turn:cancel`, and `turn:reclaim` (owner only), and broadcasts `turn:state` on every change.
- `canWrite` now also requires `holder.userId === connection.userId && holder.tabId === connection.tabId`. Commits and previews update `lastActivity`.
- On disconnect, call `tabLeft`. On join, call `tabRejoined`. One 5s sweeper runs `expire`.
- The join ack includes the turn state.
- Readme: documents turn events and rules.
- One client line lets `classifyJoin` accept the non-null turn. Between S20 and S21 the server refuses edits and no button can request a turn, so deploy the two together.
- **Done when:** with two accounts, commits from the non-holder are rejected, request and release hand over correctly, closing the holder's tab passes the turn after 20s, and a queued user gets the turn after 2 minutes of holder inactivity.

#### S21 · Turn UI and read-only mode `client` · after S20
- `TurnBar`, a floating pill at top center: holder avatar and name ("You're editing" or "Alex is editing"), queue length and your position, and buttons for Request, Cancel, Release, and Take control (owner).
- Viewers see a "View only" badge with no buttons.
- Not holding the turn means the canvas is read-only: no drag, connect, delete, drop, label edit, or toolbar, and the shape panel is hidden. `isHolder` compares userId **and** tabId.
- Gaining the turn shows a toast and plays a short chime (copy chat's Web Audio pattern).
- **Done when:** the UI exactly reflects `turn:state` in both browsers, and a second tab of the same user is read-only while the first holds the turn.

#### S22 · Turn robustness `client` · after S21
- `ConnectionBanner`: shows "Reconnecting…" (canvas read-only while disconnected) and "Waking the server…" when a join takes longer than 3s.
- On losing the turn, drop queued unsent ops and resync if any were dropped.
- `pagehide` emits a best-effort `turn:release`.
- The holder sees an idle countdown when someone is waiting ("Sam is waiting — passes in 0:45 unless you edit"), computed from `idleDeadline` and `serverNow` so client clock skew doesn't matter.
- **Done when:** briefly toggling network offline in DevTools keeps the turn (grace), closing the tab hands it over, and no edits are silently lost or duplicated across a reconnect.

### Phase G — Project chat

#### S23 · Project messages API and typing relay `server` · after S13
- `projectMessage.model.js`.
- `GET /api/projects/:id/messages?before=<ISO>&beforeId=<id>&limit=50`: member only, oldest-first page, sender populated. S23's full spec defines `{ messages, hasMore, nextCursor }`; optional `beforeId` breaks equal-timestamp ties using the `{ project: 1, createdAt: -1, _id: -1 }` index.
- `POST /api/projects/:id/messages`: `upload.single("media")`, any member role. Text ≤ 2,000 or media is required. Emits `project:message` to the room.
- `uploadChatMedia(file, folder = "/chat")` gains the folder parameter, and collaborate uses `/collaborate`. Existing chat calls are unchanged.
- `project:typing` is relayed to the room except the sender, joined members only.
- Project `DELETE` also deletes the project's messages.
- Readme: endpoints, events, and schema.
- **Done when:** history pages correctly, a non-member gets `404`, the media upload path works (or `503` when unconfigured), and `/chat` media still works.

#### S24 · Chat panel `client` · after S23
- `ProjectChatPanel` is a collapsible right-hand panel containing:
  - history with "Load earlier"
  - realtime append, de-duplicated by `_id` (your own other tabs also receive)
  - composer with text and media attach
  - "Sam is typing…" with a 5s expiry, copying chat's pattern
  - an unread badge on the toggle while collapsed
  - a sound preference persisted under `ajfm88-collaborate`
- Message bubbles are adapted copies of chat's, not imports.
- **Done when:** two browsers chat in real time inside a project, messages stay scoped to their project, and a reload shows full history.

### Phase H — Editing comfort

#### S25 · Undo and redo for the turn holder `both` · after S22
- Implementation contract: `25-undo-redo.md`. Implemented by Claude Sonnet and Approved after Codex's final review on 2026-11-12; uncommitted on `9b47c77`. See `25-undo-redo-review.md`; browser/shared-project QA remains open.
- Shared: `invertOps(canvas, ops)` in `canvasOps.js`, computing inverse ops against the pre-op canvas. A `node.remove` inverse restores the node and its cascaded edges. Tests cover round-trips (`apply(invert(x))` restores the canvas).
- Client: undo and redo stacks of this tab's own dispatched batches, cleared on turn loss and on resync. Undo dispatches the inverse as normal ops, so it's committed and broadcast like any edit.
- Large inverses replay in ordered commits of at most 50 ops using the existing protocol; a saved prefix can remain after interruption. Clear history and recover authoritatively rather than retrying or rolling back. Undo/redo waits for pending saves; replay temporarily blocks ordinary canvas edits while chat, presence and viewport controls remain usable. History retains at most 100 undo frames in this tab's memory.
- Shortcuts: Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, and Ctrl+Y, plus unmodified `+`/`=`/`-` canvas zoom. Scope to the focused canvas, skip editable fields/IME/repeat, and preserve Ctrl/Cmd browser zoom. Undo and redo buttons go in `CanvasControls`, disabled when unavailable.
- **Done when:** a sequence of add, move, recolor, delete, undo ×4, and redo ×4 produces identical canvases for the holder and watchers.

### Phase I — Membership

#### S26 · Invites and members API `server` · after S03
- Implementation contract: `26-invites-members-api.md`. Implemented by Claude Sonnet and Approved by Codex on 2026-11-12, uncommitted on `9b47c77` alongside Approved S25. See `26-invites-members-api-review.md` for accepted snapshot guards, validation order and runtime QA limitations. Stop for today; this does not start S27.
- `projectMember.controller.js`:
  - `POST /:id/invites { email, role }`: owner only. Lowercase, validate, not yourself, not already a member or invited, and under the cap.
  - `DELETE /:id/invites/:inviteId`: owner only.
  - `GET /api/projects/invites/mine`: matched on the caller's email, lowercased. Returns project name, role, and inviter name and avatar.
  - `POST /api/projects/invites/:inviteId/accept|decline`: accept is an atomic guarded update that pulls the invite and pushes the member, and fails cleanly on a double accept.
  - `PATCH /:id/members/:userId { role }`: owner only.
  - `DELETE /:id/members/:userId`: the owner removing anyone, or a member leaving themselves.
- There's no user directory or search: invites are by exact email only. Email delivery is out of scope; the invitee sees the invite when they next open `/collaborate`.
- Every mutation uses an atomic membership/invites snapshot guard plus current caller authorization, preserving the ten reserved seats under concurrent requests. Conflicting snapshots fail safely for explicit retry. Recipient operations match invite id and trusted normalized email in the same embedded invitation; new users may be invited before signup. Exact responses/privacy/errors are defined in the S26 spec.
- S26 changes REST only. Already joined socket permissions and live removal/demotion remain S27; sharing/invitations UI remains S28. No claim of complete live revocation until those slices land.
- Readme: endpoints.
- **Done when:** a full invite → accept → role change → remove cycle works with two accounts. Every guard returns the right status.

#### S27 · Live membership enforcement and cleanup `server` · after S20, S26
- `workspace.socket.js` exports `onMemberChanged(projectId, userId, roleOrNull)` and `onProjectDeleted(projectId)`, called from the controllers.
- **Removal:** emit `workspace:removed` to that user's sockets in the room, make them leave, drop their connections, call `revokeEditRights`, and broadcast presence and turn state.
- **Role change:** update the cached role, emit `workspace:role`, revoke edit rights on a downgrade, and broadcast.
- **Project delete:** emit `workspace:removed { reason: "deleted" }` to the room, make every socket leave, and discard the room.
- **Clerk `user.deleted` cascade:** delete owned projects, along with their canvases and messages, notifying their rooms. Pull the user from other projects' members. Pull pending invites to their email. Delete their project messages.
- **Done when:** removing or downgrading someone mid-session takes effect instantly in their browser. Deleting a project kicks everyone out. Existing chat and blog cascades are unchanged.

#### S28 · Share dialog and invitations UI `client` · after S24, S27
- `ShareDialog` opens from the navbar.
  - **Owner:** an invite form (email plus role select), pending invites with revoke, and members with a role select and remove.
  - **Others:** a read-only member list plus "Leave project".
- `InvitationsList` on the dashboard offers accept and decline.
- The client handles `workspace:removed` (navigate to `/collaborate` with a toast) and `workspace:role` (re-gate the UI live).
- **Done when:** the whole membership lifecycle is doable from the UI with two accounts, without a reload.

### Phase J — Ship

#### S29 · Hardening pass `both` · after S28
- `lib/rateLimit.js`: a per-socket token bucket, with tests. Limits per second: commit 20, preview 30, cursor 30, typing 5, turn 5, join 3. Excess is silently dropped (ack `ok:false` where an ack exists).
- Sweep every handler and route for id validation, payload checks, and membership scoping, against the invariants in `2-architecture.md`.
- UI states: access denied, not found, join timeout with retry, empty canvas hint.
- Mobile: the chat panel becomes a drawer below `lg`, the shape panel scrolls horizontally, and touch drag works for the holder.
- Accessibility: icon buttons get labels, dialogs trap focus.
- Confirm the build output keeps `@xyflow/react` and collaborate code out of the entry chunk.
- **Done when:** every invariant in `2-architecture.md` is confirmed in the progress file, line by line, with file references.

#### S30 · Launch `client` + docs · after S29
- `Navbar.jsx`: add Collaborate (desktop and mobile). Don't add a `/chat` link (Q1).
- Root `readme.md`: introduction, features, project structure tree, routes, and the Collaborate tech.
- `server/readme.md`: final consistency pass and the single-instance note.
- Run and record the full two-browser QA script (below) in the progress file.
- Reminder for the user: update the portfolio's About and project snippet in the admin panel.
- **Done when:** QA passes end to end on the deployed site.

### Phase K: Post-launch removal (planned, not yet sliced)

`/blog` and `/chat` are scheduled for deletion (Q1, Q5): neither sets this app apart. They keep working through S30. After launch, Claude writes removal slices, roughly:

- **Retire `/blog`:** the client (`src/blog/`, `src/pages/Blog.jsx`, its route and navbar link) and the server's post and comment routes, controllers, models, and Clerk webhook cascades.
- **Retire `/chat`:** the client (`src/chat/`, `src/pages/Chat.jsx`, its route) and the DM routes, controller, model, and `chat.socket.js` presence and typing, **except** any piece that proved useful to `/collaborate` (Q1's exception). Those get moved under collaborate ownership first.
- Shared pieces stay: Clerk auth, `protectRoute`, `/auth/check`, the `User` model and webhook, ImageKit, and multer.
- Afterward, drop invariant 10 and the "`/blog` and `/chat` still work" checks from the done rule, the workflow rules, and the QA script.

---

## Final QA script (S30)

Use two accounts, A (owner) and B, in separate browsers.

1. A creates a project, opens it, requests the turn, and adds 4 shapes, 3 edges, labels, and colors.
2. A invites B as viewer. B accepts from the dashboard and opens the project. B sees the canvas, A's cursor, and A's live drags, and can chat but can't request the turn.
3. A promotes B to editor. B's UI switches live, and B requests the turn and is queued.
4. A releases. B gets the turn with a toast and edits. A sees the edits live.
5. B goes idle for 2 minutes while A is queued. The turn passes to A.
6. A takes control while B holds the turn. B lands at the front of the queue.
7. B toggles offline for 10s while holding the turn and keeps it. B closes the tab, and after 20s the turn passes on.
8. Undo and redo a sequence, and both browsers match.
9. Reload both browsers. Canvas and chat history are intact.
10. A removes B, and B is kicked to the dashboard with a toast. A deletes the project, and the project disappears from both.
11. `/blog` and `/chat` still work.

---

