# Slice 13: Workspace join and leave

**Lane:** both · **Depends on:** S01, S06, S12 (Approved or Committed) · **Unblocks:** S14, S17

**Implementer:** Grok · **Reviewer:** Codex

## Goal, baseline, and stopping point

A workspace opens from an authenticated Socket.io join response containing project metadata, the caller's role, and the saved canvas snapshot. Reconnecting rejoins the active project and reloads that snapshot. Leaving, route changes, and disconnects remove the connection without leaving stale registry entries.

Read `AGENTS.md`, all six context files, and this spec. Codex takes the spec/review roles named Claude's in the older workflow. S12 was approved on 2026-11-06 and is still uncommitted when this spec is authored; HEAD is `050c1a8`. Preserve the approved S12 working-tree implementation and the supplied planning changes. Capture the starting file inventory/diff so the S13 handoff describes changes relative to that baseline, not just HEAD. If the user commits S12 before you begin, use that committed baseline instead; do not require a commit to start.

**This is today's final implementation slice.** Implement S13 only, mark it Ready for review, and stop for Codex. Do not start or plan S14, commit, push, or create branches.

S13 loads snapshots; editing is still local. Do not implement `canvas:commit`, `canvas:sync`, remote ops, previews, participants UI/broadcasts, turn state, chat, or durable edit saves. A reconnect replaces local-only edits with the server snapshot. This is the staged behavior until S15; document it plainly in the handoff rather than claiming editing now persists.

## Allowed files

| File | Work |
| --- | --- |
| `server/src/lib/workspaceRooms.js` | New: registry, shared room initialization, short-lived join leases, serial queue |
| `server/src/sockets/workspace.socket.js` | New: validated join/leave/disconnecting handlers and async cancellation |
| `server/src/lib/socket.js` | Import and call registerWorkspaceHandlers after registerChatHandlers; no other behavior change |
| `server/src/lib/safeHandler.js` | Comment-only correction: acked handlers now exist; preserve wrapper implementation |
| `server/test/workspaceRooms.test.js` | New: database-free registry/queue tests |
| `server/test/workspace.socket.test.js` | New: database-free socket boundary and race tests |
| `server/readme.md` | Structure, implemented workspace events/ack examples, storage and deployment limitations |
| `src/collaborate/lib/tabId.js` | New: stable per-tab UUID with sessionStorage |
| `src/collaborate/store/useWorkspaceStore.js` | Socket lifecycle, join/retry/cleanup, snapshot installation; preserve S10–S12 actions |
| `src/collaborate/routes/WorkspacePage.jsx` | Bind route/socket to store; loader, access-denied and retry states |
| `context/6-progress-tracker.md` | Status, verification, deviations and end-of-day handoff |

No other production files, dependencies, test framework, environment edits, or shared/model/schema changes. In particular, do not modify the Clerk handshake, session store, chat socket handlers, canvas components, or the supplied spec/context clarification. New server tests run with the existing `node --test` command.

## Server registry and serial queue

Keep this module independent of Mongoose, Socket.io, timers, and environment variables. Use Maps for caller-controlled keys. Export `createSerialQueue()` and `createWorkspaceRegistry()`, plus one module-level registry instance used by workspace.socket.js. Factory instances let tests isolate state without a reset endpoint or production debug hook.

`createSerialQueue()` returns an enqueue function accepting a function and returning a Promise for that job's own result/error. Jobs execute in submission order, including async jobs. A synchronous throw or rejection rejects that caller, but never poisons the tail: later jobs still run. Separate queue instances do not block one another. Do not run all jobs with Promise.all.

A room holds `{ canvas, members, connections, writeQueue }`:

- `canvas`: normalized `{ nodes, edges, version }`, loaded once for the current room lifetime. No database ids, display fields, or raw Mongoose objects.
- `members`: Map keyed by authenticated userId, values `{ role, fullName, img }`. No emails, Clerk ids, or client-supplied profiles.
- `connections`: Map keyed by socket id, values `{ userId, tabId }`. Multiple sockets for one user remain distinct. Do not key connections by tabId or merge tabs that happen to carry the same UUID.
- `writeQueue`: its own `createSerialQueue()` instance, reserved for S14. Do not use one global write queue for all rooms.

Provide small registry operations for acquire/release, lookup, adding a connection, and removing a connection. Names other than the two factories may follow the implementation, but document exports in the slice note.

Room acquisition takes an injected async `loadCanvas` function so persistence stays in the socket module. Concurrent acquisitions of the same project share one initialization Promise and one room object. Different projects initialize independently. Failed initialization removes the failed cache entry and permits a later retry.

Acquire must keep a short-lived lease/pending-join count until its caller either attaches a connection or abandons the join, then release in a finally block. A room is evicted when it has neither connections nor pending joins. This prevents the last existing connection from deleting a room while another authorized join is awaiting it, and prevents abandoned/failed loads from leaving empty rooms behind. Do not expose placeholders as usable rooms before the loader resolves. An acquire failure releases its own reservation. Guard eviction by room/entry identity so late cleanup cannot delete a newer entry under the same project id.

Adding an existing socket is idempotent, not another member count. Refresh that user's trusted member metadata. Removing one socket keeps the user's member entry while another socket for that user remains; removing the last drops it. Missing/repeated removal is harmless. Registry operations never write the database.

## Server event registration and identity

Export `registerWorkspaceHandlers(io, socket)` and call it after existing chat registration. Register each of `workspace:join`, `workspace:leave`, and `disconnecting` through the existing `safeHandler`. Do not import the shared socket server into this module: io and socket are supplied by the caller.

Identity is only `socket.data.userId` from the existing handshake. Read the synced user's profile with `User.findById(userId).select("fullName img").lean()` (or equivalent whitelist) during authorized joining. Never write User, accept a payload userId/role/profile, or alter the auth middleware. The existing per-user room and DM presence/typing remain intact.

### workspace:join

Payload is `{ projectId, tabId }`; ack must be a function. With no ack, ignore the event before doing queries or state changes. Validate record shape (not null/array), projectId as a 24-hex ObjectId string, and tabId as a UUID v4 string. Accept hex case, canonicalize projectId and tabId to lowercase before using them as keys. Ignore extra fields by whitelisting; they cannot override identity or permission.

Response failures have no project, role, canvas, or membership information:

| Case | Response |
| --- | --- |
| Invalid project id, nonexistent project, non-member, or no readable role | `{ ok: false, message: "Project not found" }` |
| Malformed payload/tab id | `{ ok: false, message: "Invalid workspace request" }` |
| Expected cancellation by a newer join/leave | `{ ok: false, message: "Workspace request superseded" }` if the socket is still connected and the ack has not been sent |
| Database/adapter/unexpected join error | Log server-side; `{ ok: false, message: "Unable to open workspace" }` |

For a record with a bad projectId, use Project not found before other field validation, matching REST's non-disclosure rule. Missing server identity/profile fails closed with Project not found. Do not return raw database error messages. Ack at most once. If disconnected, skip the ack but still finish cleanup. The handler must catch operational errors to return the generic failure; safeHandler alone logs errors and would leave the caller waiting for its timeout.

For every valid join, including repeated joins to a cached room:

1. Resolve membership using `findProjectForMember(projectId, socket.data.userId)` and `roleOf`. Do not authorize from cached room.members, fetch an unrestricted Project first, or perform a canvas query for a non-member.
2. Read the caller's trusted display profile. Construct a project summary with only `{ _id: String(project._id), name, description }`. Do not expose raw project documents, member/invite lists, user emails, or unrelated fields.
3. Acquire the room. Its loader lazily upserts Canvas by `{ project: projectId }` with `$setOnInsert` defaults for project/nodes/edges/version, `upsert: true`, `returnDocument: "after"`, and validation. Never `$set` existing nodes/edges/version during join. Normalize loaded nodes/edges using shared `normalizeCanvas`. Preserve the stored nonnegative integer version (missing legacy value may default to 0; malformed values fail as an operational error). Return only `{ ...normalized, version }` to the registry. Catch duplicate-key code 11000 specifically, then read the existing canvas; do not broadly swallow write errors. Shared initialization prevents normal same-process races, and the unique index remains the database guard.
4. Confirm the request is still current and the socket connected. Join only `project:<canonicalProjectId>`; attach the registry connection/member after adapter joining succeeds. Roll back partial attachment/adapter membership on failure or cancellation. Release the acquisition lease in finally.
5. Ack success with the exact wire shape below. `serverNow` is Date.now() in milliseconds. `participants` is an empty array and `turn` is null for this slice. No join/leave broadcast yet.

```js
{
  ok: true,
  project: { _id, name, description },
  role: "owner" | "editor" | "viewer",
  canvas: { nodes, edges, version },
  participants: [],
  turn: null,
  serverNow,
}
```

Normalize only in memory; joining is not a repair/save operation and must not rewrite an existing graph or increment version. Existing Mongoose timestamp behavior is not an edit-save guarantee. Non-members must never trigger lazy canvas creation.

### Ordered lifecycle and cancellation

One socket has one active workspace at a time; its existing per-user room is separate. A join to another project replaces its previous workspace membership. Rejoining the same project refreshes membership/profile and snapshot without duplicate connections. A failed join leaves the socket with no workspace subscription, not silently subscribed to the previously open project.

Use a per-socket intent generation and an ordered lifecycle queue (the serial-queue helper can be reused). Join/leave event receipt invalidates the relevant pending intent synchronously, before awaiting anything. Order membership mutations, and check the intent/socket state after every async boundary and immediately before success. Leave/disconnect cannot merely enqueue cleanup behind a delayed lookup without first marking it cancelled. Older handlers may finish I/O, but cannot install/ack success or evict a replacement room. A currently pending join may finish creating an empty Canvas; cancellation need not delete that durable empty document, but all ephemeral memberships/leases must be cleaned.

`workspace:leave` takes `{ projectId }`, no ack. Invalid payload/id is ignored. It cancels pending joins and removes active membership for that project only. A late leave for A must not cancel/remove B. Repeated leave is harmless. `disconnecting` cancels all pending work and removes active registry connections, even though Socket.io handles adapter-room teardown itself. Do not use disconnecting to remove chat's per-user room or alter its handlers.

Required race outcomes: join A then leave A before lookup resolves; join A then join B with A delayed; StrictMode join A / leave A / join A; disconnect during initialization; last member leaves while another acquire is pending; error during adapter join. None may leave a ghost connection, stale success, leaked lease, or poisoned queue.

## Stable tab identity

`src/collaborate/lib/tabId.js` exports `getTabId()`. Lazily read a namespaced sessionStorage key such as `collab:tabId`. Reuse a valid UUID v4; replace malformed/missing values with `crypto.randomUUID()`. Cache the value for that page lifetime so storage denial does not break joins or regenerate it on each reconnect. Catch storage read/write errors and use the in-memory UUID fallback. Do not use localStorage, cookies, a user id, or a fresh UUID per join. Access browser globals inside the function, not during module evaluation. A reload retains the id when sessionStorage works; separately opened tabs normally have separate ids. SessionStorage copied by browser tab duplication is not a new coordination mechanism in S13; connections remain keyed by socket id.

## Client store and route lifecycle

Keep socket listeners, emits, async response validation, and cleanup in useWorkspaceStore. WorkspacePage reads `useSessionStore(s => s.socket)`, projectId, status, and store actions; it binds these in an effect and returns the store's disposer. It never emits or registers listeners itself. Do not create another Socket.io connection or change useSessionStore.

Add a store binding action (for example `bindWorkspace(socket, projectId)`) returning a disposer and a retry action for the current binding. Replace the REST-based `loadWorkspace` flow: do not retain a redundant `/projects/:id` GET to open the workspace or use it as an offline fallback. Keep all S10–S12 content actions unchanged. Use existing display builders so snapshots receive display-only arrows and selection/measurement handling remains correct for subsequent local edits.

- A new route/socket binding clears the old project/role/canvas/display before attempting a join. A null or connecting socket shows the existing loader. Register named connect/disconnect callbacks once for that active socket binding, removing only those references on cleanup; never `removeAllListeners`, disconnect the shared socket, or disturb session/chat listeners.
- If already connected, join immediately; otherwise wait for connect. Every later connect triggers a fresh join with the same tabId. Suppress duplicate joins for the same binding/connection while one is in flight. Retry replaces/supersedes an old attempt and uses the currently connected socket. No custom reconnection timers/polling.
- Use `socket.timeout(10000).emitWithAck("workspace:join", { projectId, tabId: getTabId() })`, catch timeout/rejection, and never emit a buffered join while disconnected.
- Bind responses to socket object, current connection id, route/binding generation, and attempt generation. A late ack/timeout after navigation, disconnect, retry, sign-out, or StrictMode cleanup cannot install state, show a toast, or erase a newer result. Capture each connection id before emit; the same socket object gets a new id on reconnect.
- On success, validate the ack record, project id matches the requested canonical id, valid role, canvas arrays and nonnegative integer version, empty participants array, null turn, and finite serverNow. Normalize snapshot nodes/edges through shared normalizeCanvas before setting canonical state; do not pass untrusted snapshot objects into display builders. A malformed success is an error, not ready. Install project/role/canvas/display as one store update, `status: "ready"`, fresh display selection, no content dispatch, and no version increment. The join snapshot explicitly replaces local-only edits.
- `ok:false` with Project not found shows the existing NotFoundCard (its copy already covers missing access); generic server failures, malformed acks, and timeouts show ErrorCard with Try again. Display current server message in an error toast when present; do not turn cancellations from an obsolete attempt into user errors. A disconnect clears edit permission and ready content, invalidates in-flight acks, and shows the loader until connect retries; prevent editing stale content while disconnected. The richer ConnectionBanner belongs to S22.
- On current attempt timeout/malformed response/failure, emit a best-effort leave for that project if still connected and still the current binding/attempt. This cancels a server join that may have finished after the client gave up. Do not let an obsolete attempt send a leave against a newer binding to the same project.
- On binding cleanup, invalidate its work first, detach its named listeners, emit workspace:leave only if its socket is connected, then reset only if that binding still owns the store. Never queue a leave while disconnected: it could replay after a newer join. An old disposer called twice or after replacement cannot reset/leave the new workspace. `resetWorkspace` must invalidate active attempts and release binding resources consistently, not leave listeners behind.

Use existing scoped loader/cards/tokens and workspace layout; no new theme, navbar, or canvas changes. Update ErrorCard to call the store's current retry action. Role gating remains centralized; clearing role during loading/disconnect must make all existing edit actions refuse. Do not add turn checks or a commit queue on the client.

## Documentation and tests

Update server/readme.md's structure and Socket.io tables for the two implemented workspace events. Include success/failure ack examples, room naming, tab identity, single-instance in-memory registry, fresh membership checks, lazy creation/normalization, reconnect reload, and the explicit limitation that editing is still local until S15. Keep existing DM tables correct. Do not document later events as implemented.

New node:test files must need no database, network, real timeouts, or environment. Use deferred Promises and assertions of outcomes/order, not arbitrary sleeps. Socket tests may stub existing model static queries with node:test mock facilities, restoring them after each test, and use small fake io/socket/ack objects to run the actual registered handlers. If useful, createWorkspaceRegistry factory can be supplied to an internal handler factory; keep the public production entry point `registerWorkspaceHandlers(io, socket)` and do not create an auth bypass or debug endpoint. Tests must cover race/error behavior, not just mirror happy-path implementation.

## Verification checklist

- [ ] Queue: submission order under concurrent enqueue; async results; rejection and synchronous throw affect only their callers; subsequent jobs run; different queues are independent.
- [ ] Registry: same-project loader deduplication; different-project independence; initialization failure/retry; socket idempotence; two tabs/one user, member removal only on last socket; lease protection and final eviction; cancelled acquisition; stale release cannot evict a replacement. No DB/network in these tests.
- [ ] Socket authorization/protocol: malformed payload/id/tabId/no ack; canonical ids; outsider/no-project/unreadable-role all disclose no resource and never upsert; trusted userId/profile only; no leaked fields; correct success shape, normalization and version; repeated cached join still checks membership; one lazy canvas; 11000 fallback versus other errors; at-most-once ack and no success on cancellation/error.
- [ ] Socket lifecycle with deferred I/O: all race outcomes listed above, stale leave A after join B, failed/denied replacement join leaves no old subscription, and two users joining/leaving the same room. Assert both registry and adapter rooms; preserve each socket's per-user room. Pending leases/load entries disappear after all work settles.
- [ ] Browser/store lifecycle under StrictMode: connecting and already-connected socket; no duplicate listeners; join success loads a seeded saved graph (node and labelled arrow edge) with stored version, no content op; viewer gets no editing affordances; missing/non-member shows access-denied card; timeout/generic failure/malformed ack shows retry; success after retry; no REST project load.
- [ ] Client races with a controlled socket: deferred/out-of-order acks across A to B and A to A remounts, connect/disconnect on the same socket object with a different connection id, timeout followed by late success, retry superseding a delayed ack, socket replacement, route exit/sign-out, double cleanup and reset. No stale state/toast/leave; only binding-owned listeners removed; no buffered join/leave while disconnected. Record the controlled nature of role/socket tests.
- [ ] getTabId: valid reuse, invalid replacement, per-page fallback with storage getter/setter throwing, repeated calls/reconnect stability, and reload/sessionStorage reuse. Do not write production storage debug hooks or claim tab duplication guarantees it does not have.
- [ ] Actual configured API: clean boot; a controlled existing synced account can join and lazily create one canvas; two clients to one authorized fixture see the same saved snapshot/version; a non-member cannot join; leave/disconnect cleanup verified. Restart only the temporary server created for this verification, reconnect and rejoin automatically, and reload the same saved fixture. This checks loading, not edit persistence. If credentials/sessions are unavailable, report exactly which real paths remain unverified and use the socket/browser harness for the race cases.
- [ ] Regression: S12 native edge creation/labels/Delete/self-loop and S10–S11 drag/resize/node-label/palette still work after a join. Local edits do not write or broadcast; reconnect restores the saved snapshot. /blog loads posts and /chat retains existing auth/presence/typing behavior where controlled sessions permit. No messages to real users; fixtures use controlled test accounts only.
- [ ] Root npm run build, server npm test (104 existing tests plus meaningful S13 tests), node --check on new server modules, and git diff --check pass. No new collaborate warnings, production test hooks, new dependencies, env edits, or imports from chat/blog. Report lazy bundle sizes and exact test count.
- [ ] Live verification uses the configured database per Q2: record fixture ids, clean only the projects/canvases created for this verification in finally, and never create/update/delete User documents or real user data. Use temporary ports and close only processes/listeners you created. Distinguish source checks, stubs, authenticated sockets, and signed-in browser checks; do not count one as another.
- [ ] Preserve the approved S12 baseline; list S13-only changes and exact evidence/deviations. Mark S13 Ready for review. Add an end-of-day handoff: S12 approved, S13 awaiting Codex review, commit state, any remaining QA limits. Stop for Codex. No S14 or further slice planning/implementation today, commits, pushes, or branches.
