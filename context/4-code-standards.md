# Code Standards

**Current checkpoint (2026-11-12):** S25/S26 are Approved/uncommitted; preserve their final review corrections and tests. The latest independent baseline is 542 passing tests plus build/diff check, with manual/live QA open (HANDOFF.md). No S27 planning or code work is requested today.

## General

- Keep modules small and single-purpose, and name files after their responsibility (`turns.js`, not `helpers.js`).
- Fix root causes. Don't layer workarounds over a bug in another slice.
- Don't mix unrelated concerns in one component, store, route, or socket module.
- Respect the boundaries and invariants in `2-architecture.md`.
- **Match the comment voice of the repo.** Existing comments explain *why* in full sentences: the constraint, the failure they prevent, the trade-off taken (see `server/src/lib/socket.js` and `src/chat/store/useAuthStore.js`). Don't write comments that narrate *what* the code does, don't leave commented-out code, and don't leave a `TODO` without a matching entry in `6-progress-tracker.md`.
- **No new dependencies** beyond `@xyflow/react` (S07). Use `crypto.randomUUID()` for ids, and small local helpers (`throttle.js`, `userColor.js`) instead of `lodash` or `nanoid`.

## JavaScript

- JavaScript, not TypeScript. ESM everywhere (`import`/`export`, `"type": "module"`).
- Validate unknown input at every boundary (REST body and params, socket payloads) before using it. Check types, ranges, lengths, and the id format. Treat `null`, arrays, and wrong types as invalid; don't let them throw.
- Use `mongoose.isValidObjectId` before any query that takes an id from outside, so a bad id is a `404`, never a `500` CastError.
- Pure modules (`shared/canvasOps.js`, `lib/turns.js`, `lib/projectAccess.js`'s `roleOf`/`can`, `lib/rateLimit.js`) take `now` as a parameter rather than reading the clock, never mutate their inputs, and have no I/O.

## React (client)

- Feature folder `src/collaborate/` mirrors `src/chat/`: `lib/`, `store/`, `routes/`, `components/`.
- Server state and socket wiring live in zustand stores. Components read selectors and call store actions; they never call `axios` or `socket` directly.
- Canvas: React Flow runs in controlled mode from `useWorkspaceStore`.
  - `nodeTypes` and `edgeTypes` are module-level constants.
  - Every canvas mutation goes through `dispatch(ops)`.
  - `onNodesChange`/`onEdgesChange` apply only `select`, `position`, and `dimensions` changes to the display arrays.
  - Commits come from explicit end events: `onNodeDragStop`, `NodeResizer`'s `onResizeEnd`, `onConnect`, `onDelete`, and the label and color handlers.
- Undo and redo go through the store's `undo()` / `redo()` actions only. Components never build inverse ops, and replay never calls the public `dispatch`. Anything that must keep working during a replay (the sync pump) uses the underlying holder gate; anything user-facing uses `selectCanEdit`. New code that clears or replaces the sync session must notify history through `session.hooks.invalidate`, not by editing the stacks.
- Keyboard shortcuts attach to the mounted surface element through `useCanvasShortcuts`, never to `document` or `window`, and they consume a key only when the action accepted it.
- Socket listeners are registered once per socket in the store, removed by reference, and keyed on the socket, not on mount (see `ChatPage`'s socket effect for why).
- Use `socket.timeout(ms).emitWithAck(...)` for acked events, and always handle the timeout.
- Errors reach the user as react-toastify toasts with the server's `message` when present.

## Express (server)

- Express 5: async controllers don't need try/catch, because rejections reach the central error handler. Catch only where you add specific handling.
- Routes are mounted in `server/src/index.js` after `clerkMiddleware()`. Every `/api/projects` route sits behind `protectRoute`.
- Controllers stay thin. Access rules live in `lib/projectAccess.js`, and canvas rules live in `shared/canvasOps.js`.
- Project authority is enforced inside the query (`findProjectForMember`, or `{ _id, owner: req.user._id }` for owner-only writes), never solely by reading first and checking in JS. S26's implemented invitation-recipient exception authorizes only offered metadata/accept/decline by the trusted caller's normalized email and, for an addressed offer, invite id in the same embedded element; it grants no normal project access. See `specs/26-invites-members-api.md` and its Approved review for mutation snapshot guards and accepted validation order.

## Sockets (server)

- One module per feature in `server/src/sockets/`, exposing `register<Feature>Handlers(io, socket)`, called from the `connection` handler in `lib/socket.js`.
- Every `socket.on` goes through `safeHandler(event, handler)`.
- Each handler, in order:
  1. Validates the payload shape.
  2. Checks the socket is joined to that `projectId`.
  3. Checks permission (`can` / `canWrite`).
  4. Acts.
- Identity always comes from `socket.data.userId`.
- High-frequency relays (cursor, preview) use `socket.to(room).volatile.emit`. Persisted changes go only through the room's serial commit queue.
- Room names are `project:<projectId>`. Never reuse the per-user rooms for workspace traffic.

## Styling

- Use the `--collab-*` tokens from `3-ui-context.md` via Tailwind arbitrary values. No raw hex or Tailwind palette colors in components.
- Follow the radius scale and typography table in `3-ui-context.md`.
- Tailwind 3 only, the same version as the rest of the app. CSS beyond utilities goes in `collaborate.css`, scoped under `.collab-root`.

## API Responses

- Success: return the resource or `{ <resource> }` objects, as specified per endpoint in the build plan.
- Errors: `{ message }` with the status codes in `server/readme.md` → Error Handling:
  - `400`: invalid input
  - `401`: no session
  - `403`: member without permission
  - `404`: not found or not a member
  - `503`: ImageKit not configured
- Socket acks: `{ ok: true, ... }` or `{ ok: false, message }`.

## Data and Storage

- Project metadata, membership, invites, canvas, and chat belong in MongoDB.
- Media files go to ImageKit (folder `/collaborate`); MongoDB stores only the URL.
- Presence, cursors, previews, typing, and turns live only in server memory.
- Never store a raw client object. Canvas content goes through `applyOps`/`normalizeCanvas`.

## Tests

- Pure server modules get `node:test` unit tests in `server/test/<module>.test.js`, run with `cd server && npm test`.
- REST routes that need the real router and `protectRoute` are tested over loopback HTTP with the production router and an in-memory model fake that evaluates the filters and updates the handlers send and throws on any operator it does not know (see `server/test/projectMember.api.test.js`). Clerk's request shape is faked with the branded `req.auth`; no production test hook exists. A stale read is staged with an explicit barrier. This is not a MongoDB concurrency test.
- A membership write must repeat its authority and the exact members/invites snapshot in the write filter (`snapshotGuard`); a miss is classified by one fresh scoped read and never retried.
- The accepted snapshot implementation uses `$size` plus `$all` of per-element `$elemMatch` guards for API-maintained unique member-user/invite-id entries. It preserves membership content without BSON subdocument field-order dependence. Cast checks preserve ObjectIds/dates; staged model races are not live MongoDB concurrency/index evidence.
- Pure-module tests import directly and need no database, network, or environment variables. REST/multipart tests may use an ephemeral loopback server with stubbed auth/models/uploads; they must not contact live MongoDB, Clerk, or ImageKit.
- Socket handlers and client stores have automated tests with fake sockets: `server/test/*.socket.test.js`, and `test/*.test.mjs` at the root, run as `node --test test/<suite>.test.mjs`, one suite per command because the Vite harnesses collide on port 24678.
- Rendering can be checked with the existing Vite SSR harness. React effects require mounted-hook/controller coverage; static markup alone does not execute them. Real browser layout and two-browser flows remain manual checklist evidence (see `5-ai-workflow-rules.md`).
- Current root suites: workspaceSync, canvasPreview, participants, cursorPresence, turnState, turnRobustness, projectChat, projectChatUi, canvasHistory, canvasShortcuts. Run each separately and sequentially; see HANDOFF.md for commands and the last verified baseline.

## Documentation

- New REST endpoints, socket events, and collections are documented in `server/readme.md` **in the same slice** that adds them, in the existing table style.
- The root `readme.md` is updated at S30.

## File Organization

- `server/src/shared/`: pure code imported by both the server and the client (`@shared` alias). Nothing else goes here.
- `server/src/lib/`: server-only helpers and in-memory registries.
- `server/src/sockets/`: socket event handlers, one file per feature.
- `server/src/models/`, `controllers/`, `routes/`: one file per resource, following the existing `*.model.js`, `*.controller.js`, and `*.route.js` naming.
- `server/test/`: unit tests for pure modules.
- `src/pages/Collaborate.jsx`: the lazy route root only (providers, theme scope, nested routes).
- `src/collaborate/`: everything else for the feature.
