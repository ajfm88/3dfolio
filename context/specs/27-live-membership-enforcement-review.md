# Slice 27 review — Live membership enforcement and cleanup

**Reviewer:** Claude Opus 5.5 · **Implementer:** GPT 6.1 Terra · **Date:** 2026-11-13 · **HEAD:** `c14a185` (uncommitted working tree)

**Verdict: Approved.** No code changes requested. The reviewer corrected the documentation bookkeeping (see the end of this review).

## Independent verification

| Check | Result |
|---|---|
| Server suite (`server/`, `npm test`) | **304 passed**, 0 failed (baseline 283; +21) |
| Root client suites, one command each | **259 passed**: canvasHistory 31, canvasPreview 39, canvasShortcuts 44, cursorPresence 69, participants 6, projectChat 14, projectChatUi 5, turnRobustness 28, turnState 10, workspaceSync 13 |
| Production build | Passed; existing large-chunk warning only |
| `git diff --check` | Passed (LF→CRLF notices only) |
| Diff scope | Only the spec's allowed files plus today's planning documents |
| Webhook cascade | The `clerk.webhook.js` diff has no removed lines; the existing `findOneAndDelete` and Post/Comment/Message cascade are unchanged |

Not run, by the reviewer or the implementer: two-browser QA, a live Clerk webhook, live MongoDB mutation. Local configuration targets the live database.

## Spec conformance

- **Socket index (§2).** A registry-scoped `WeakMap` holds `Map<socketId, socket>`. It is filled in `registerWorkspaceHandlers` and cleared inside the existing `disconnecting` handler, only when the stored entry is the same socket object. No second listener was added. `invalidate` matches the leave/disconnect revocation exactly.
- **Join cancellation.** `cancelPendingJoins` filters by user when one is given and invalidates only uncompleted joins to the target project (`joinedGeneration !== intent.generation`). It runs first in both hooks, before the room lookup, so it also cancels a join still at the membership read with no room yet. The tests stall `findProjectForMember` and observe `Workspace request superseded` and no room left behind, for removal, demotion and deletion.
- **`onMemberChanged` (§3–4).** Ids are canonicalized and validated, and `owner` is ignored. On removal, each attached socket gets `workspace:removed`. Its lifecycle is invalidated only when it is active in this project, so the same user's socket in another project survives (tested). The connection is removed without `tabLeft`, and the adapter leave is deferred. The turn is revoked through `revokeEditRights` only if the same room object still exists (`registry.getRoom(projectId) === room`), so an evicted room is never published to. The tests assert that the holder hands off to the queued member at once with `graceUntil === null`. A role change updates the cached `room.members` role, which is what `joinedConnection` reads. A demotion revokes the turn and queue entry, an upgrade only republishes presence, and the same role emits nothing. Every emit is wrapped, and the whole hook is wrapped in `try` and logged as `workspace:member`.
- **`onProjectDeleted` / `discard` (§5).** The hook cancels every pending join, emits `deleted` to the room, invalidates and leaves each attached socket, then discards the room. `discard` removes the entry and clears its maps. A lease taken before the discard cannot evict a replacement room, because `evictIfIdle` compares the entry. A test covers this, along with a commit waiting on the write queue, which answers superseded without writing.
- **`projectCleanup.js` (§6).** `io` is a parameter and the module does not import `lib/socket.js`. The order is: the live hook first, then the canvas, then the messages. For user deletion: owned projects, then memberships read before an unguarded `$pull`, then live removal for each project, then invites by `normalizeEmail` (skipped when the email is invalid), then messages the user sent. A failure stops the run and propagates (tested).
- **Callers (§7).** `updateMemberRole` and `removeMember` call the hook only on a successful write, before the response. 403, 404 and stale-snapshot 400 paths emit nothing (tested). `deleteProject` awaits `deleteProjectContent` after the guarded `deleteOne`. The route test observes the order project → `workspace:removed` (`deleted`) → canvas → messages. The webhook reads `_id email`, runs the cleanup, and only then deletes the User row, with the ordering comment the spec asks for.

## Notes (no change requested)

1. **Removed sockets get one more presence/turn broadcast.** The adapter leave is deferred to a microtask, as the spec says, so the `presence:update` and `turn:state` sent in the same tick still reach the removed sockets. Authority was already gone. Since the payloads are participants and turn holders the user saw a moment earlier, this is accepted. S28's client must ignore project events after it handles `workspace:removed`.
2. **A removal also cancels the socket's other in-flight request.** `invalidate` bumps the whole socket's generation. If a removed socket happens to be mid-way through switching to another project, that switch answers superseded and the client's existing Retry recovers it. This is rare and harmless.
3. **The socket index could keep a socket if `onDisconnecting` throws.** The index entry is deleted after `onDisconnecting` returns, and `safeHandler` catches any throw from it. `onDisconnecting` only does in-memory bookkeeping, so this is accepted. A hardening pass (S29) could move the delete into a `finally`.
4. **Test style.** `membership.socket.test.js`, `projectCleanup.test.js` and the new API tests are written in a dense, semicolon-joined style unlike the rest of the suite. They pass and cover every §9 case. Reformatting is optional and was not requested.
5. **Single process only.** The hooks act within the current server process. `server/readme.md` now says this, matching the existing single-instance deployment.

## Reviewer documentation corrections

The implementation left the tracker's S27 row and the spec's status line at Todo. The new slice-note heading also had a `?` where the em dash belongs, and the architecture checkpoint said "in progress". The reviewer set S27 to **Approved** (uncommitted) in the tracker, spec, HANDOFF, AGENTS, workflow rules, build plan and architecture checkpoint, and fixed the heading. No application or test code was touched in review.
