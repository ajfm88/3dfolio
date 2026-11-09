# Slice 17: Workspace participants

**Lane:** both · **Depends on:** S13 (Committed) · **Unblocks:** S18

**Implementer:** Grok · **Reviewer:** Codex

## Goal and baseline

Show the other people currently connected to this project in the workspace navbar. Multiple sockets or tabs for one user count as one participant. Closing the last tab removes that person. This is project presence, separate from the existing global `/chat` presence.

Read AGENTS.md, the six context files, this spec, and the existing join/leave, registry, store binding, sync, and navbar code before implementation. This spec is the S17 contract; Codex fills the reviewer role called Claude in older workflow text.

Planning baseline: HEAD `cc1f681` (commit 64), with a clean working tree before these planning documents. S14, S15, and the S16 implementation are already committed. S16 still has Changes requested in its review record; committing it did not resolve those findings or approve it. Preserve that distinction.

This document plans the next numbered slice at the user's request. It does not approve S16 or authorize combining S16 corrections with S17. The workflow requires passing verification before moving on: resolve and review S16 separately before implementing S17. If the user explicitly assigns S17 against the current baseline anyway, record that instruction and the existing failures; do not repair previews under this spec or claim that full verification passed.

When implementation is assigned, capture the starting diff, mark S17 In progress, implement only this spec, run verification, and mark Ready for review with evidence and remaining limitations. Stop for Codex review. No commit, push, branch, or S18 work.

## Allowed files

| File | Work |
| --- | --- |
| `server/src/lib/workspaceRooms.js` | Pure participant snapshot helper on the registry |
| `server/src/sockets/workspace.socket.js` | Join snapshots and project-scoped presence broadcasts on successful attach and detach |
| `server/test/workspaceRooms.test.js` | Snapshot, deduplication, removal, copy, and ordering tests |
| `server/test/workspace.socket.test.js` | Join/leave/disconnect/replacement and failed-join presence tests; extend fake io |
| `server/test/canvas.socket.test.js` | Adapt fake io/fixtures only where presence emissions require it; preserve commit/preview assertions |
| `src/collaborate/lib/participants.js` | Pure inbound participant validation and normalization |
| `src/collaborate/store/useWorkspaceStore.js` | Participants state, join installation, one presence listener per binding, lifecycle cleanup |
| `src/collaborate/components/workspace/ParticipantStack.jsx` | Avatar stack and overflow |
| `src/collaborate/components/workspace/WorkspaceNavbar.jsx` | Mount ParticipantStack beside the existing role badge |
| `test/participants.test.mjs` | Actual-store presence and component-rendering regressions using the existing Vite/Node harness pattern |
| `test/workspaceSync.test.mjs` | Extend join fixtures/assertions where needed to exercise non-empty participants without changing sync expectations |
| `server/readme.md` | Join participants and presence event documentation |
| `context/2-architecture.md` | Mark the S17 participant behavior as implemented when it is implemented |
| `context/6-progress-tracker.md` | Status, implementation evidence, and review notes |

No dependencies, configuration changes, new collections, REST endpoints, timers, polling, or external services. Keep `workspaceSync.js`, canvas op semantics, preview helpers, canvas components, session/socket creation, and protected portfolio/blog/chat files unchanged. In particular, do not implement cursors, turns, invitations, live role enforcement, chat, or avatar menus. If another production file is required, record the blocker before expanding scope.

## Wire and server snapshots

Keep the existing `workspace:join` request unchanged. Replace the successful ack's empty `participants` array with a full snapshot, including the joining user:

```js
{ userId, fullName, img, role } // one participant
```

Add the existing architecture-defined server event:

```js
io.to(`project:${projectId}`).emit("presence:update", {
  projectId,
  participants: [{ userId, fullName, img, role }],
});
```

This is a normal full-snapshot event, not volatile. Include all sockets still in the project adapter room; the client filters self only for display. No ack, client presence request, version, timestamp, socket ids, tab ids, emails, Clerk ids, or other profile fields. Never broadcast globally or to a per-user room. No extra database queries or writes beyond the existing join lookups.

Expose `registry.getParticipants(projectId)`. It reads the existing connections and member cache, returns `[]` for a missing/empty room, deduplicates connected user ids, and returns fresh, whitelisted plain objects sorted lexicographically by canonical Mongo userId. Use the role and profile cached by the existing authenticated project/User lookups. Empty/missing profile strings become `""`; role must be owner/editor/viewer. Do not expose a mutable room/member object or count cached members who have no connection. Existing add/remove connection and room-retention behavior stays intact.

## Publication and lifecycle

Thread io through the existing lifecycle helpers as needed; do not replace their queues or authority model.

- Successful join: attach the connection and publish `joinedGeneration` as today. Take the participant snapshot after attach. Ack with that snapshot, then broadcast the current snapshot within the same synchronous continuation, without an added await between snapshot/ack/broadcast. Preserve the existing serialized canvas snapshot/subscription and commit ordering.
- Publish after every successful attach and actual connection removal, even when another tab keeps the same user present. Consumers replace the whole list, so these duplicate-looking snapshots are harmless and carry refreshed profile data from a successful rejoin.
- Leave, disconnecting, switching projects, and a denied replacement that detaches an old project all notify the old project's remaining sockets. Capture the project id before clearing lifecycle state. Publish the post-removal snapshot immediately after registry removal, before awaiting adapter leave, and only if a connection was actually removed. An evicted room has snapshot `[]`.
- A no-op or different-project leave does not publish a departure for the active room. An invalid/unauthorized/stale join that never attaches does not announce a new participant.
- Rollback must use the same removal/publication rule if attachment actually occurred. A socket which merely entered the adapter room and then failed must not remove or announce an unrelated connection. Preserve generation checks, pending room leases, and late-ack protection.
- A second tab adds a connection without duplicating a user. Removing one of two tabs retains that user; removing the last drops them. Disconnecting can already have `socket.connected === false`; broadcast through io to remaining room sockets anyway.
- A same-project rejoin refreshes the cached profile and role through the existing lookup. Do not introduce live membership enforcement; that remains S27.

No presence path changes canvas content/version, writes the database, or emits `canvas:ops` or `canvas:preview`. Joining may still perform the pre-existing lazy canvas upsert. Tests must distinguish that existing initialization from any new presence work.

## Client state and validation

Add `participants: []` to `emptyWorkspace`. Keep the complete list, including self, in the workspace store. Use a pure validator in `lib/participants.js` for both join acks and events:

- Require an array of plain records, each with a 24-character hex `userId`, string `fullName`, string `img`, and role owner/editor/viewer.
- Normalize user ids to lowercase, strip extra fields, and return a new array sorted by userId. Reject duplicate normalized ids and reject the entire list if an entry is malformed. Empty strings and an empty list are valid. Do not invent profile or roster limits beyond the architecture's existing project limits.
- A malformed join roster follows the current malformed-join error path. Remove the old `ack.participants.length === 0` condition. Do not alter canvas normalization, join timeouts, role gates, or turn's current `null` requirement.
- A malformed presence event is ignored without toast, leave, sync, dispatch, or partial state change. Validate the project id and match the bound canonical project id.

Register one `presence:update` listener in the current binding, remove that exact listener on disposal, and require the active, non-disposed binding, live connected socket, and matching joined connection id. A stale socket/binding/project must never restore a roster. Duplicate snapshots may replace the list without side effects.

Handle events during a pending join explicitly. The server can subscribe a joining socket before its ack has installed client state. Keep only the latest valid presence snapshot on that binding/join attempt. When its ack succeeds, install the ack's roster unless a later presence snapshot was received during that attempt; in that case install the buffered roster. Clear the buffer at every new join attempt and on disconnect/disposal. A snapshot from an old attempt cannot overwrite the new attempt. Do not add sequence fields to solve this.

Install participants adjacent to `sync.onJoined` in the store after classifying the ack and checking the same attempt/connection. No edits to `workspaceSync.js` are needed. Ensure a failed join clears all roster state.

Canvas recovery is independent of presence: while status is ready and `syncStatus` is syncing, accept valid presence updates from the same joined connection. Preserve that roster through canvas-only snapshot publication. If recovery fails into error/notFound, existing empty-workspace cleanup clears it. Disconnect, retry/new join, binding replacement, route disposal, and reset clear the visible roster immediately. Reconnect repopulates from the new join; never retain another project's roster during loading.

## ParticipantStack

Read participants from the workspace store and the current Mongo user id from `useSessionStore(s => s.authUser?._id)`. Normalize before comparing. The id is not the Clerk id. Render nothing until a current user id exists; exclude all entries matching it. Keep the server/store order so avatars do not shuffle on another tab's join.

- Show at most five other-user avatars, then a `+N` badge for the remaining others. The overflow count excludes self and the five visible avatars.
- Use 28px circular avatars with slight overlap and the existing panel/strong-border tokens. Use existing fonts and `--collab-*` colors only. Do not add the S18 cursor-color helper in this slice.
- Use a plain `img`, `alt` text with the display name, and initials when the URL is empty or loading fails. For trimmed names use the first letters of the first and last words, uppercase; a one-word name uses its first letter. A blank name displays `Unknown user` and `?`. Reset failed-image fallback if that participant's image URL changes.
- Each avatar exposes name and role through a native title tooltip and an accessible label, for example `Ada Lovelace — editor`. Make the avatar wrapper keyboard focusable so the label is available without a mouse; no click action or menu. The overflow badge has an accessible label and title listing the hidden names and roles.
- Mount the stack on the right of WorkspaceNavbar before the existing local RoleBadge. Preserve the back link, project-name truncation, badge, h-14 height, and responsive layout. Avatar/overflow elements do not shrink; the project name yields available space. At 320px viewport width there is no page overflow.

Do not show self in the stack even if the same account has multiple tabs. That account remains in the full roster used by other users.

## Verification and review checklist

Use deterministic fake sockets, deferred promises, and mocked model lookups. No live database fixtures or writes to users are needed for automated verification. Follow the actual-store Vite harness in `test/workspaceSync.test.mjs`; load modules inside before hooks before destructuring them in tests. Pure normalization and rendered markup checks may share this harness. Use the installed React DOM server renderer for small markup assertions; add no DOM/test dependencies. Image load failure and real tooltip/layout behavior still need the browser checks below.

- [ ] Registry: missing room, one user, multiple tabs, two users, stable ordering, fresh copies, role/profile refresh, first-tab and last-tab removal. Mutating a returned roster cannot alter the registry.
- [ ] Server: successful join ack includes self and current other users. Full `presence:update` reaches only that project, is non-volatile, and strips private fields. Viewers appear too.
- [ ] Server: second-tab join does not duplicate a user; closing one tab retains them; last-tab leave/disconnect removes them. Switching projects notifies both rooms with the right rosters.
- [ ] Server: no-op leave, denied join, superseded/deferred join, failed adapter join, rollback, and disconnect during join leave accurate rosters and no ghost participant. Preserve existing join generation and canvas tests. Assert no new model query/write caused by presence publication.
- [ ] Client: populated and empty join rosters install; malformed/duplicate entries are rejected atomically; extras are stripped. Join role/canvas behavior remains unchanged.
- [ ] Client: presence before join ack wins over its older ack roster; a later normal event replaces the list. Multiple pre-ack events coalesce to the latest. A failed/stale ack cannot install buffered participants.
- [ ] Client: old socket id, disconnected socket, disposed/replaced binding, wrong project, malformed payload, and old listener callbacks are ignored. Assert one listener per live binding and removal by reference.
- [ ] Client: disconnect, retry, reset, disposal, project switch, and failed join clear the roster. Recovery accepts valid presence without any canvas change, commit, sync request, or toast; a canvas snapshot does not reset presence.
- [ ] UI: render checks cover zero others, self filtering (including multiple tabs), five visible avatars, overflow for six or more, initials, blank names, labels, and stable order. Browser checks cover failed image fallback/reset, keyboard access, and 320px width.
- [ ] Run focused tests: `node --test test/participants.test.mjs`, `node --test test/workspaceSync.test.mjs`, and `node --test --test-timeout=8000 test/workspaceRooms.test.js test/workspace.socket.test.js` from server/ for the latter command.
- [ ] Run `node --test test/canvasPreview.test.mjs` from root and `node --test --test-timeout=8000` from server/. Compare with the starting baseline. Do not hang indefinitely on the documented S16 test deadlock. Record every failure and whether it was already present; passing presence tests does not mean all checks passed.
- [ ] Run root `npm run build` and `git diff --check`. Record test counts, bundle sizes, warnings, and limitations. Do not install or upgrade packages.
- [ ] Follow the workflow's server boot and blog/chat smoke checks where authenticated sessions are available. Record checks that could not be performed.
- [ ] Browser with two existing accounts: open the same project, then a second tab for one account; each sees only the other account once. Close one duplicate tab, then its last tab. Reopen/reconnect. Open a different project and confirm no presence crosses projects. No new users or synthetic live database fixtures.
- [ ] Update server/readme's join ack text/example and server-event table: full roster, all roles, per-user deduplication, last-tab departure, project scope, in-memory lifetime. Keep global chat presence documentation distinct and historical S13 notes clearly historical.
- [ ] Record S17 Ready for review with its changed files, evidence, deviations, browser limitations, and outstanding baseline failures. Codex reviews the diff and independently reruns relevant checks. Approval requires accurately reported evidence; unresolved S16 verification blockers remain explicitly outstanding.

## Handoff prompt

Read AGENTS.md and all six context files, then `context/specs/17-participants.md`. Grok implements; Codex reviews. Check the S16 baseline prerequisite in this spec before starting. Implement S17 only when assigned, mark it In progress, run the listed checks, and return Ready for review with evidence. Preserve existing canvas synchronization and previews. No S18, unrelated fixes, commits, pushes, or branches.
