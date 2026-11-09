# Slice 14: Commit handler

**Lane:** server · **Depends on:** S13 (Committed) · **Unblocks:** S15

**Implementer:** Grok · **Reviewer:** Codex

## Goal, baseline, and stopping point

Implement server-authoritative `canvas:commit` and `canvas:sync` on the existing authenticated workspace socket. Valid edits are applied atomically, saved with a version compare-and-set, then acknowledged and broadcast. Invalid, unauthorized, or stale edits do not write or broadcast.

Read `AGENTS.md`, all six context files, this spec, and the existing S13 lifecycle code/tests. Codex fills the planning/review role called Claude in the older workflow. Baseline is commit `5d0340e` (commit 63), containing approved S12 and S13. The supplied tracker, architecture clarification, and this spec are planning changes; preserve them. Record the starting diff before implementation.

Set S14 In progress when starting. Implement S14 only, mark Ready for review with evidence, and stop for Codex. No S15 planning/implementation, commits, pushes, or branches. No client changes: the existing UI continues to edit locally and does not send commits or receive remote ops until S15. Demonstrate this slice using actual registered server handlers and controlled socket clients, not by claiming the browser UI now saves.

## Allowed files

| File | Work |
| --- | --- |
| `server/src/sockets/workspace.socket.js` | Register commit/sync; central canWrite gate, validation, authorization, lifecycle guards, persistence, ack and broadcast |
| `server/src/lib/workspaceRooms.js` | Narrowly scoped room lease support if needed; preserve infrastructure independence |
| `server/test/workspace.socket.test.js` | Extend existing socket regressions/helpers if needed |
| `server/test/canvas.socket.test.js` | New database-free commit/sync boundary and concurrency tests |
| `server/test/workspaceRooms.test.js` | Any lease regressions |
| `server/readme.md` | Implemented protocol, examples, guarantees and remaining limits |
| `context/6-progress-tracker.md` | Status, slice note, verification and deviations |

No other production files, dependencies, environment changes, schemas, shared op changes, or client changes. Preserve S13 public registration (`registerWorkspaceHandlers(io, socket)` with existing optional test injection), join/leave semantics, auth, per-user rooms, and chat handlers. Use existing node:test/mocks; no production debug hooks.

## Protocol and validation

Register both handlers through `safeHandler`. Each must catch its operational failures and answer itself, because safeHandler only logs uncaught errors. If ack is not a function, ignore the event before I/O, state changes, or queueing. Ack at most once; an ack callback throwing must not undo a persisted edit or suppress its broadcast. Do not ack a disconnected socket or a replacement connection id.

Payloads are plain records, not null/arrays. Accept 24-hex project ids case-insensitively and canonicalize to lowercase. Whitelist the fields; never trust payload userId, role, tabId, version overrides, updatedBy, or project data.

- `canvas:commit`: `{ projectId, baseVersion, ops }`. baseVersion is a nonnegative safe integer with room for increment (`< Number.MAX_SAFE_INTEGER`); ops is an array of 1 through shared `MAX_OPS_PER_COMMIT` (50). Shared `applyOps` validates every operation and strips fields according to its existing semantics. Do not implement a second op validator or silently split/truncate a batch.
- `canvas:sync`: `{ projectId }`. Any currently authorized joined role, including viewer, may sync.
- Commit success: `{ ok: true, version }`, no graph or database document.
- Sync success: `{ ok: true, canvas: { nodes, edges, version } }`.
- Broadcast: `canvas:ops` with `{ projectId, version, ops, by }`, where `by` is the authenticated Mongo userId string, and ops are the normalized ops returned by applyOps. Send reliably to `project:<id>`, excluding only the submitting socket id (other tabs of that user receive it). Never use the per-user room, broadcast globally, or emit volatile committed ops.

Use these error messages consistently; the server readme must describe them:

| Case | Ack |
| --- | --- |
| Invalid project id, not joined, missing project/membership/identity | `{ ok: false, message: "Project not found" }` |
| Malformed record or invalid commit envelope | `{ ok: false, message: "Invalid canvas request" }` |
| Joined viewer attempts a commit | `{ ok: false, message: "You cannot edit this canvas" }` |
| Authorized writer's base version differs, or compare-and-set loses | `{ ok: false, message: "Canvas version mismatch", canvas }` |
| applyOps rejects | `{ ok: false, message: result.error, canvas }` |
| Request invalidated before persistence begins | `{ ok: false, message: "Workspace request superseded" }` if still connected |
| Database/other operational failure | Log privately; `{ ok: false, message: "Unable to save canvas" }` or `"Unable to sync canvas"` |

For a record, validate project id before other envelope fields. Check joined authorization before returning any snapshot or detailed op-validation error. Errors for malformed/unauthorized/operational cases omit canvas. A snapshot on a rejection is only for the still-current authorized writer. Never expose raw documents, invite/member data, database errors, or a canvas from another project. Unknown extra envelope fields are ignored.

## Authorization and lifecycle

Export `canWrite(room, connection)` from workspace.socket.js, using `can(role, "edit")` from the existing projectAccess dependency. It is the single edit gate for this slice and future previews/turns. It fails closed if the connection is missing or is not an actual connection object in that room, or its trusted member role lacks edit rights. The handler resolves the connection from `room.connections.get(socket.id)` and verifies its userId matches `socket.data.userId`; a payload object can never supply a connection. No turn-holder check until S20. Keep the registry free of Mongoose imports (including transitive imports through projectAccess), persistence, Socket.io, timers, and environment access.

Both events require a connected socket, matching active workspace lifecycle, adapter room membership, a live registry room, and that room's current connection entry. An in-flight join is not authorization. Do not acquire/create a room or upsert a canvas for a stranger. Within the room queue, refresh membership using `findProjectForMember` before any canvas database read/write; this preserves the membership-scoped query invariant. A missing/unreadable membership fails closed. Refresh the joined user's cached role from trusted roleOf output before canWrite; do not accept an old owner/editor role over a fresh viewer result. Full live revocation broadcasts/eviction remain S27.

Capture the socket id, lifecycle generation, room identity, and connection object on receipt. Recheck them when the queued job starts and after authorization awaits, immediately before starting persistence or returning a sync/rejection snapshot. Use S13's synchronous intent invalidation so leave, disconnect, a newer join (including same-project rejoin), or project replacement cancels queued work even before adapter cleanup runs. A delayed old job must not become authorized by a later connection entry with the same socket id. Do not reorder S13 lifecycle mutations onto a queue in a way that deadlocks waiting for the write queue.

Hold a room acquisition lease for accepted queued/in-flight jobs through finally, using the existing acquire/release mechanism or a small existing-room retain helper. It must not initialize a new room for an unjoined socket. The last socket leaving while a database write is pending must not evict that room and allow a second independent write queue/cache for the same project. Release on all paths, including stale jobs, rejected ops, thrown database calls, and throwing ack callbacks; final empty-room eviction must still happen.

Once the database write has started, a leave/disconnect cannot cancel that database operation. If it succeeds, finish cache installation and broadcast to remaining subscribers even if the sender left; skip an obsolete ack. Use the captured project room and sender socket id for broadcast, rather than a new active project or a disconnected socket's mutable id. Queued operations not yet started must fail their lifecycle guard without writing. Document this boundary; no transaction or cancellation mechanism is added.

## Commit pipeline

Use that room's existing writeQueue. All validation against mutable room state, base-version comparison, applyOps, database persistence, cache installation and broadcast ordering happen inside its serialized job. Different projects remain independent.

1. Recheck lifecycle/connection, refresh membership, and pass canWrite. Read the current room snapshot only inside the job.
2. Compare baseVersion to room.canvas.version. Reject stale versions with the current whitelisted snapshot; no write/broadcast. Fail generically on a malformed cached version or version overflow.
3. Run shared applyOps(room.canvas, ops). On failure leave the entire cache/database unchanged. Do not normalize away invalid ops and partially apply the rest. Construct a candidate snapshot without mutating the accepted cache.
4. Persist exactly via a conditional update equivalent to:

   ```js
   Canvas.updateOne(
     { project: projectId, version: baseVersion },
     { $set: { nodes: candidate.nodes, edges: candidate.edges, updatedBy: userId },
       $inc: { version: 1 } },
   )
   ```

   No upsert, whole-document replacement, client-provided updatedBy, or pre-save cache advance. Mongoose timestamps are allowed. Check acknowledged success and matchedCount, not truthiness of the result or modifiedCount alone.
5. On one matched document, install `{ nodes, edges, version: baseVersion + 1 }`, attempt the current sender's success ack, then broadcast normalized ops exactly once. Keep notification error handling separate from the database failure path: an ack/emit error after persistence cannot be described as an unapplied edit or cause a second save. Future queued jobs must still run.
6. On zero matches, read the existing Canvas by project without upsert, normalize in memory, preserve its valid stored version (reuse S13 version rules), and replace the cache. Reject with that snapshot and Canvas version mismatch; no ops broadcast or version increment. Missing canvas returns Project not found without canvas; malformed version/read failure is operational failure. Do not substitute an empty graph, recreate a missing canvas, or keep using a known-stale cache after a failed conflict reload: later requests must retry a reload before any success/snapshot, or fail closed until a fresh room load. This recovery can use a small internal room flag in the allowed files.
7. A thrown/rejected or unacknowledged write never advances the cache or emits ops. A transport error can leave the write outcome unknown: mark the room as needing a database refresh before the next commit/sync success. Reload read-only and normalize, never replay the possibly completed write automatically. Keep the original request's failure generic. Recovery failure stays closed and does not poison the serial queue.

A retry with the old version after a successful save must be rejected, not applied twice. There is no commit id/deduplication protocol in S14. Existing stored version missing/legacy handling follows S13; do not migrate/repair legacy documents in this slice. A compare-and-set that cannot match a missing version returns a conflict, not an unconditional write.

## Sync and room ordering

Queue sync on the same room writeQueue so it waits for earlier writes and does not expose an unpersisted candidate. Recheck lifecycle, fresh project membership, and trusted role. Normally ack the current accepted cache without writing; if a previous ambiguous write/failed conflict reload requires recovery, refresh from the database first. Return a whitelisted detached snapshot, never the room object or raw document. Sync does not increment version, broadcast ops, lazily create a canvas, or mutate existing durable content. Viewers may sync; outsiders/unjoined sockets cannot.

Joins must keep S13's snapshot-before-future-ops ordering: a joining socket gets a valid persisted version and any later accepted changes arrive in order. Inspect the interaction with pending writes; preserve S13 intent cancellation and do not add client listeners to compensate. Pending writes keep the room alive under the lease rule above.

## Tests and verification

Use node:test and actual registered handlers with isolated registries, model static mocks, controlled sockets/io, and deferred Promises. No network/database/env in unit tests and no sleep-based races. Existing S13 tests stay intact. The optional dependency injection pattern may be extended narrowly within the allowed module; no authentication bypass or runtime debug route.

- [ ] Envelope boundaries: null/array/wrong types, invalid/case-varied ids, missing/non-function ack, negative/fractional/unsafe/overflow base versions, empty/non-array/51 ops, forged identity/role/updatedBy, stripped extra fields. No write or broadcast on invalid input.
- [ ] Gate: owner/editor allowed, viewer refused; unjoined, wrong-project, missing identity/member, stale connection object and spoofed payload denied. A fresh membership read denying access or returning viewer overrides cached edit rights. No resource leak or lazy canvas creation for unauthorized requests.
- [ ] Success: valid mixed ops persist one canonical graph and increment once; updatedBy is authenticated user; exact query/update checked. Cache/ack/broadcast remain untouched while save is deferred. After save, assert ordering and normalized ops/by/project/version, exclusion of only sender, inclusion of that user's second tab, and no per-user/global/volatile emit.
- [ ] Atomic failure: invalid op after a valid op, oversized labels, duplicate ids and other shared-validator failures leave original graph/version unchanged, make zero writes and emit nothing. Exercise real applyOps rather than stubbing it.
- [ ] Conflicts: stale in-memory base; two concurrent writers on the same base (one success, one conflict); database compare-and-set zero matches reloads a different normalized snapshot/version. Missing/failed/malformed reload fails closed; later recovery works without inventing a graph. Successful retry with a new base works; replaying the old base cannot duplicate the edit.
- [ ] Ambiguous save: write rejection/unacknowledged result returns generic failure, no cache advance or broadcast; next request refreshes before proceeding, including a fixture where the failed call actually persisted. A failed refresh never returns a stale success. Queue runs later jobs after failures.
- [ ] Lifecycle: queued commit/sync invalidated by leave, disconnect, join B, or same-project rejoin makes no write/leaked snapshot. Departure during an already-started successful save still updates cache and notifies remaining project subscribers, with no obsolete ack. A new join during that save shares the retained room/queue. Leases release on every failure and final departure; different projects do not block each other. Throwing ack after save does not suppress broadcast or trigger duplicate persistence.
- [ ] Sync: viewer success; exact graph/version whitelist; no write/upsert/broadcast; waits behind a deferred commit; unauthorized and stale lifecycle denied. Pending join is not yet a joined connection. Preserve snapshot/ops order for joins during pending commits.
- [ ] Regression: all existing 126 server tests plus new meaningful cases pass; root npm run build passes with no new collaborate warnings; node --check on affected server modules and git diff --check pass. Record exact counts, warning differences, and bundle sizes. No dependency/client/schema changes.
- [ ] Controlled integration on a temporary server where existing synced-account sessions permit: create a dedicated fixture project/canvas; owner commits, second authorized socket sees ops, viewer commit fails but sync succeeds, stale base conflicts, reload/rejoin sees saved graph/version. Restart only your temporary server and confirm persistence. Do not claim this is UI integration: S15 is absent. If sessions are unavailable, identify the unverified paths and report controlled tests separately.
- [ ] Follow Q2 for any live fixture: configured database is live. Never write User documents or existing user content; use already-synced controlled accounts. Record fixture ids and clean only this run's projects/canvas documents in finally (inspect actual Mongoose collection names; Canvas currently uses `canvas`). Revoke any temporary sessions and close only processes you started. Verify boot/health and blog read/chat presence/typing regressions where controlled sessions permit; send no messages to real users.
- [ ] Update server/readme.md for commit/sync/ops wire shapes, errors, authorization, serialization, save-before-broadcast, conflict/recovery rules and single-instance limits. Explain that the production client still edits locally until S15. Do not document previews/turns as implemented.
- [ ] Tracker: S14 Ready for review with changed files, exact tests and manual evidence, deviations, fixture cleanup, and limitations. Stop for Codex review. Do not mark Approved yourself or begin S15.
