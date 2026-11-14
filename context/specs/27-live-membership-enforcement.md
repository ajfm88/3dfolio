# Slice 27 — Live membership enforcement and cleanup

**Execution status (2026-11-13): Approved** (implemented by GPT 6.1 Terra, reviewed by Claude Opus 5.5 in `27-live-membership-enforcement-review.md`); uncommitted.

**Lane** server · **Depends on** S20, S26 (both Committed) · **Unblocks** S28

**Spec author / reviewer** Claude Opus 5.5 · **Implementer** GPT 6.1 Terra, assigned by the user on 2026-11-13

## Baseline and scope

Read AGENTS.md, the six context files in order, HANDOFF.md, this spec, `13-workspace-join-leave.md`, `20-turn-events-enforcement.md` and `26-invites-members-api.md` with its review. Planning HEAD is `c14a185` (commit 69); the tree was clean apart from today's documentation update and this spec. Recheck `git status` and `git log -3` before starting.

S26 changes stored membership over REST but leaves every already-joined socket alone. S27 makes those changes live, and adds the Clerk `user.deleted` cascade for collaborate data:

1. An owner removing a member, or a member leaving, kicks that user's sockets out of the project room immediately.
2. An owner changing a member's role updates the cached role immediately, and a downgrade to viewer takes away the turn and the queue place.
3. Deleting a project kicks every socket out and discards the in-memory room.
4. Deleting a Clerk user removes their collaborate footprint.

Server only. **No client change**: the client listeners for `workspace:removed` and `workspace:role` are S28. No new collection, model field, REST route, response shape, limit or dependency. No change to `/blog` or `/chat` behavior.

Mark S27 In progress, implement, run the verification, mark Ready for review with a slice note and stop. Never commit, push, branch or deploy, and do not start S28.

## Allowed files

| File | Work |
| --- | --- |
| `server/src/sockets/workspace.socket.js` | Socket index, in-flight join cancellation, `onMemberChanged`, `onProjectDeleted` |
| `server/src/lib/workspaceRooms.js` | New `discard(projectId)` on the registry |
| `server/src/lib/projectCleanup.js` | **New.** `deleteProjectContent` and `deleteUserCollaborateData` |
| `server/src/controllers/projectMember.controller.js` | Call `onMemberChanged` after a successful role change, removal or leave |
| `server/src/controllers/project.controller.js` | `deleteProject` uses `deleteProjectContent` |
| `server/src/webhooks/clerk.webhook.js` | Run the collaborate cascade before the existing user deletion (S27 is this file's one allowed slice) |
| `server/test/membership.socket.test.js` | **New.** Socket-level tests for both hooks |
| `server/test/projectCleanup.test.js` | **New.** Cleanup module tests with mocked models |
| `server/test/workspaceRooms.test.js` | Add `discard` tests; do not change existing assertions |
| `server/test/projectMember.api.test.js` | Add wiring tests only; do not change existing assertions |
| `server/readme.md` | Events, live-membership behavior, user deletion cascade; remove the S26 rollout-limit paragraph |
| `context/2-architecture.md`, `context/6-progress-tracker.md`, `context/HANDOFF.md` | Replace the planned S27 summary with what was built; status and evidence |

Everything else stays unchanged: all client code, `lib/socket.js`, `lib/turns.js` (its existing `revokeEditRights` is enough), `projectAccess.js`, `projectMembership.js`, models, middleware, routes, manifests and environment files. If the work seems to need another file, stop and record an open question in the tracker.

## 1. Wire events

Both events are already reserved in `2-architecture.md`. Payloads are exactly:

| Event | Payload | Sent to |
| --- | --- | --- |
| `workspace:role` | `{ projectId, role }` | Each socket of that user that is attached to the room, via `io.to(socketId)` |
| `workspace:removed` | `{ projectId, reason: "removed" }` | Each socket of the removed user that is attached to the room, via `io.to(socketId)` |
| `workspace:removed` | `{ projectId, reason: "deleted" }` | The whole project room, via `io.to("project:<projectId>")` |

`projectId` is the canonical lowercase 24-hex string and `role` is `"editor"` or `"viewer"`. Both events are non-volatile and have no ack. A self-leave uses `reason: "removed"` too; the S28 client can tell its own leave apart because it made the request. Nothing else is added to either payload.

## 2. Socket index and join cancellation (`workspace.socket.js`)

The hooks need socket objects (to leave rooms and to invalidate lifecycles), and they need sockets whose join is still in flight, which are not in the registry yet.

- Keep a module-level `WeakMap` from registry to `Map<socketId, socket>`. `registerWorkspaceHandlers` adds the socket to its registry's map. The **existing** `disconnecting` handler removes it after its current work, and only if the map still holds that same socket object. Do not register a second `disconnecting` or `disconnect` listener: the test fakes keep one handler per event.
- `invalidate(state)` bumps `generation`, clears `intent` and clears `joinedGeneration`. That is exactly what leave and disconnect already do, so every existing staleness check (`stale()`, `sameAttempt`, `joinedConnection`) refuses the socket from then on.
- `cancelPendingJoins(registry, projectId, userId | null)`: for each indexed socket (filtered to `readUserId(socket) === userId` when a user is given) whose lifecycle `intent` is a join for `projectId` that has **not** completed (`joinedGeneration !== intent.generation`), call `invalidate`. That join then answers `"Workspace request superseded"` through its existing paths and its rollback removes anything it attached. This closes the race where a join read membership just before the REST write and attaches just after the hook.

The cancelled client sees the existing join-failure path (toast plus error card with Retry), and a retry then reads the new membership. That is accepted for S27; S28 owns the polish.

## 3. `onMemberChanged(io, projectId, userId, role, registry = workspaceRegistry)`

Exported. **Synchronous**: it returns `undefined`, never awaits, and never throws. Wrap the body so an internal error is logged with `logHandler("workspace:member", error)` and swallowed, because the database write has already succeeded and the REST response must not turn into a 500.

Input: `projectId` and `userId` may be strings or ObjectIds. Canonicalize with `String(value).toLowerCase()` and require the existing `OBJECT_ID` pattern. `role` must be `null`, `"editor"` or `"viewer"`. Anything else returns without effect.

Always call `cancelPendingJoins(registry, projectId, userId)` first, for both removal and role change. Then look up `room = registry.getRoom(projectId)`. With no room, stop there.

**Removal (`role === null`).** Take the room's connections whose `userId` equals the user. For each socket id:

1. `io.to(socketId).emit("workspace:removed", { projectId, reason: "removed" })`, with that emit wrapped in its own try/catch.
2. If the indexed socket's lifecycle has `activeProjectId === projectId`, call `invalidate` and set `activeProjectId = null`.
3. `registry.removeConnection(projectId, socketId)`.
4. Make the socket leave `project:<projectId>`. Do not await it: `Promise.resolve().then(() => socket.leave(room)).catch(log)`. Authority is already gone through step 2, so the adapter leave can finish later.

After the loop, if `registry.getRoom(projectId)` is still that same room, apply `revokeEditRights(room.turn, userId, now)` through the existing `setTurn` (a holder loses the turn at once with **no grace**, and queue entries are dropped), then `publishPresence`. If the room was evicted because nobody else is left, publish presence only, as `removeFromRoom` already does. **Never call `tabLeft`** here: it would give a removed holder a 20-second grace.

**Role change (`"editor"` or `"viewer"`).** `member = room.members.get(userId)`. With no member, or `member.role === role`, do nothing more. Otherwise:

1. Set `member.role = role`.
2. Emit `workspace:role` `{ projectId, role }` to each of that user's attached socket ids.
3. If `can(role, "edit") !== true`, apply `revokeEditRights` through `setTurn`.
4. `publishPresence` so every roster shows the new role.

Owner roles never change (S26 refuses owner demotion and transfer), so the hook needs no owner case.

## 4. `onProjectDeleted(io, projectId, registry = workspaceRegistry)`

Exported. Synchronous, never throws, and validates `projectId` the same way.

1. `cancelPendingJoins(registry, projectId, null)`, which cancels every user's join.
2. `io.to("project:<projectId>").emit("workspace:removed", { projectId, reason: "deleted" })`, even when this process has no registry room.
3. If a room exists, then for each connection's socket: invalidate its lifecycle when `activeProjectId === projectId`, clear `activeProjectId`, and leave the adapter room without awaiting, as in §3.
4. `registry.discard(projectId)`.

No presence or turn broadcast follows: the room is gone, and clients were told why.

## 5. `registry.discard(projectId)` (`workspaceRooms.js`)

Delete the map entry for `projectId` if there is one, then clear that room object's `connections` and `members` maps. Return `true` when an entry existed, otherwise `false`. A lease still held by an in-flight commit or join keeps its own reference. Its later `release` finds a different entry (or none) and evicts nothing, which `evictIfIdle` already guarantees. A later `acquire` builds a fresh room. Add `discard` to the returned object.

An in-flight commit whose `Canvas.updateOne` has already been sent is not cancelled (existing S14 rule). Because `deleteProjectContent` deletes the canvas after the hook, that write either lands first and is deleted, or matches nothing and answers `Project not found`.

## 6. `server/src/lib/projectCleanup.js` (new)

Imports `Project`, `Canvas`, `ProjectMessage`, `normalizeEmail` from `projectMembership.js`, and the two hooks. It takes `io` as a parameter and does **not** import `lib/socket.js`, so it can be tested with a fake `io`.

```js
export async function deleteProjectContent(io, projectId, registry)
// onProjectDeleted, then Canvas.deleteOne({ project }), then ProjectMessage.deleteMany({ project }).

export async function deleteUserCollaborateData(io, user, registry)
// user = { _id, email } read from the User row before it is deleted.
```

`deleteUserCollaborateData`, in this order:

1. **Owned projects.** `Project.find({ owner: id }).select("_id").lean()`. For each: `Project.deleteOne({ _id, owner: id })`, then `deleteProjectContent`. Run `deleteProjectContent` even when `deletedCount` is 0, because a retried webhook must still finish cleanup.
2. **Memberships.** Read `Project.find({ "members.user": id }).select("_id").lean()`, then `Project.updateMany({ "members.user": id }, { $pull: { members: { user: id } } })`, then `onMemberChanged(io, projectId, id, null, registry)` for each id read. This administrative pull is intentionally **unguarded**: S26's snapshot guard detects lost races between people, and removing a deleted account is always right.
3. **Pending invitations to their email.** `email = normalizeEmail(user.email)`. If it is valid: `Project.updateMany({ "invites.email": email }, { $pull: { invites: { email } } })`. Stored invite emails are already lowercase.
4. **Their project chat messages.** `ProjectMessage.deleteMany({ sender: id })`.

Every step is idempotent, so a retried webhook converges. Do not catch errors here: the caller decides.

## 7. Callers

**`projectMember.controller.js`.** Import `io` from `../lib/socket.js` (the S23 message controller already does this) and `onMemberChanged` from the socket module. Call it only on the success branches:

- `updateMemberRole`: after `saved` and the found member, `onMemberChanged(io, projectId, targetId, member.role)`.
- `removeMember`: after `saved`, `onMemberChanged(io, projectId, targetId, null)`. This covers both an owner removal and a self-leave.

Call it **before** sending the response, so the kick has happened by the time the caller's UI hears success. Never call it on a 4xx path, a classification re-read, or `acceptInvite`/`declineInvite`/`createInvite`/`revokeInvite` (a new member is not in any room yet).

**`project.controller.js` `deleteProject`.** After `Project.deleteOne` reports `deletedCount === 1`, replace the two inline cleanup lines with `await deleteProjectContent(io, project._id)`. Keep the existing rule that a cleanup throw does not answer success. Update the S27 comment there to describe what now happens.

**`clerk.webhook.js` `user.deleted`.** Before the existing `User.findOneAndDelete`, read `const doomed = await User.findOne({ clerkId: evt.data.id }).select("_id email").lean()` and, if it exists, `await deleteUserCollaborateData(io, doomed)`. Leave the existing `findOneAndDelete` and the Post/Comment/Message cascade unchanged, character for character. Collaborate cleanup runs first so that if it throws, the User row still exists and Clerk's retry runs the whole cascade again. Import `io` from `../lib/socket.js`. Add a comment explaining that ordering.

## 8. Things that stay true

- Identity still comes only from `socket.data.userId` and `req.user`. The hooks receive ids from controllers that already authorized the write, never from a socket payload.
- No socket event is added on the client-to-server side, and no handler signature changes.
- A REST-only user (no socket) is unaffected, since the hooks find nothing to do.
- `canWrite`, commit, sync, preview, cursor, typing and turn handlers are not edited. They are refused through the existing lifecycle/registry checks once a socket is invalidated and removed.
- Single-instance assumption: the hooks act only on this process's registry and sockets. Document that next to the existing single-instance note.

## 9. Tests

Follow the existing fake socket and fake `io` harness in `turn.socket.test.js`. Copy the helpers into the new file; do not import from another test file. No live MongoDB, Clerk or network. Run each suite to completion with `cd server && npm test`.

**`membership.socket.test.js`**, at least:

1. Removing a joined viewer: their socket gets `workspace:removed` (`reason: "removed"`) on `io.to(socketId)`; the connection and member are gone; presence lists only the others; a later `cursor:move`, `project:typing` and `turn:request` from that socket relay nothing; a later `canvas:commit` and `canvas:sync` answer `Project not found`.
2. Removing the turn holder while someone is queued: the turn passes to the queue head immediately with `graceUntil: null`, one `turn:state` is published, and the removed tab is not re-queued.
3. Removing a user with two tabs removes both connections, and the user's other connected sockets elsewhere are untouched.
4. Removing the last user in the room evicts it, and no error is thrown.
5. Demoting the holder to viewer: `workspace:role` `{ role: "viewer" }` reaches that user's sockets, the cached role is viewer, the turn passes on, presence shows viewer, and a later `turn:request` from that tab does nothing.
6. Demoting a queued editor drops only their queue entry. Promoting a viewer lets a later `turn:request` succeed. Setting the same role emits nothing.
7. A join in flight (stalled at `findProjectForMember`, as existing tests stage it) when `onMemberChanged(..., null)` runs answers `Workspace request superseded` and leaves no connection behind. The same holds for a role change.
8. `onProjectDeleted`: the room gets one `workspace:removed` (`reason: "deleted"`); every socket's authority is gone; `registry.getRoom` is null; a pending join for that project by any user is superseded; a later join attempt builds a fresh room (with the stub still saying member) instead of reusing the discarded one.
9. A commit queued behind a held write when the project is deleted answers superseded and does not write.
10. Invalid inputs (bad ids, `role: "owner"`, unknown project) do nothing and do not throw. An `io.to` that throws is logged and does not stop the rest of the hook.
11. The socket index forgets a socket on `disconnecting`, and a replaced socket with the same id is not removed by the old one's disconnect.

**`workspaceRooms.test.js`**: `discard` returns true/false correctly, clears the maps, a held lease's release after discard does not delete a new room, and a new `acquire` after discard loads a fresh room.

**`projectCleanup.test.js`** (`mock.method` on the models, a fake `io`, a real registry): the call order and filters of `deleteProjectContent`; owned-project deletion including the `deletedCount: 0` retry path; the unguarded member pull plus a removal hook per project; the lowercase invite pull, skipped for an invalid email; sender message deletion; a model throw propagates.

**`projectMember.api.test.js`** additions: a successful role change, owner removal and self-leave each invoke the live hook for the right project, user and role. Attach a fake socket to the default `workspaceRegistry` through `registerWorkspaceHandlers` and observe the emits on a mocked `io.to`, or use an equally real method that does not add a production test hook. Failed paths (403, 404, conflict) emit nothing. Also add one `deleteProject` route test that observes `workspace:removed` with `reason: "deleted"` and the canvas and message deletes. If this needs the project router mounted on the existing loopback harness, that is fine within this file.

The webhook needs no new test file. Verify it by reading the code, and say so in the slice note.

## 10. Documentation

- `server/readme.md`: add `workspace:role` and `workspace:removed` to the Server-to-Client table, with exact payloads and recipients; describe live removal, demotion and deletion; replace the S26 "Rollout limit" paragraph with the actual behavior; add the collaborate part of the Clerk `user.deleted` cascade to User Synchronization; note the single-instance limit for these hooks.
- `context/2-architecture.md`: replace the "S27 live membership enforcement (planned)" section with what was built, and drop "planned" wording from the S26 section's "Not live" bullet.
- Tracker and HANDOFF: status, slice note (changes, verification with counts, deviations), remaining manual QA.

## Verify when done

- [ ] `cd server && npm test` passes and exits on its own; report the new total (baseline 283).
- [ ] Each root client suite passes in its own command, unchanged (baseline 259 across ten suites).
- [ ] `npm run build` passes at the repo root with no new warnings.
- [ ] `git diff --check` passes.
- [ ] `git diff --stat` touches only the allowed files.
- [ ] Every test case in §9 exists, or the slice note says why one could not be written as specified.
- [ ] No `tabLeft` on the removal path; demotion and removal use `revokeEditRights`.
- [ ] The hooks are synchronous and never throw into a controller.
- [ ] The webhook's existing Post/Comment/Message cascade is byte-identical apart from the inserted lines before it.
- [ ] The server boots with `npm run dev`, if an environment is configured. Do not write live data to satisfy this checklist; record what was and was not run.
- [ ] Manual two-browser checks (removal kicks, demotion re-gates, deletion kicks) are recorded as **not run** unless actually performed. Without S28 the client does not listen for these events yet. Expect the kicked tab to reach the existing not-found or error state on its next canvas request, not a polished redirect.
