# Slice 28 — Share dialog and invitations UI

**Execution status (2026-11-13): Approved** (implemented by GPT 6.1 Terra, approved by Claude Opus 5.5 after one correction round; see `28-share-dialog-invitations-ui-review.md`); uncommitted.

**Lane** client · **Depends on** S24 (Committed), S27 (Approved, uncommitted) · **Unblocks** S29

**Spec author / reviewer** Claude Opus 5.5 · **Implementer** GPT 6.1 Terra, assigned by the user on 2026-11-13

## Baseline and scope

Read AGENTS.md, the six context files in order, HANDOFF.md, this spec, `26-invites-members-api.md` (the REST contract), `27-live-membership-enforcement.md` with its review, and `server/readme.md` § "Invitations and Members (S26)". Planning HEAD is `c14a185` (commit 69). The working tree holds Approved, uncommitted S27 plus today's documents, unless the user has committed them since. Recheck `git status` and `git log -3` before starting. Do not modify S27's files.

S26 added the membership REST API, and S27 made membership changes live on the server. S28 adds the browser half:

1. A **Share dialog** in the workspace navbar. The owner can invite by email, revoke pending invitations, change member roles and remove members. Everyone else sees a read-only member list and can leave the project.
2. An **Invitations** list on the dashboard with Accept and Decline.
3. Listeners for S27's `workspace:removed` (leave the workspace with a toast) and `workspace:role` (re-gate the UI live).
4. A cancelled join (S27 answers `Workspace request superseded` to a join in flight during a membership change) retries once automatically instead of showing the error card.

**Client only.** No server, route, response shape, socket event, model, dependency or limit changes. Use only the endpoints and fields that already exist. No email delivery, user search, ownership transfer, invite links or project deletion from the workspace.

Mark S28 In progress, implement, run the verification, mark Ready for review with a slice note, and stop. Never commit, push, branch or deploy, and do not start S29.

## Allowed files

| File | Work |
| --- | --- |
| `src/collaborate/store/useWorkspaceStore.js` | `workspace:removed` / `workspace:role` listeners, the `removed` status, the self-leave marker, the superseded-join retry |
| `src/collaborate/routes/WorkspacePage.jsx` | Redirect on `removed` |
| `src/collaborate/components/workspace/WorkspaceNavbar.jsx` | Share button; mounts the dialog |
| `src/collaborate/components/workspace/ShareDialog.jsx` | **New** |
| `src/collaborate/store/useShareStore.js` | **New.** The dialog's REST state |
| `src/collaborate/store/useInvitationsStore.js` | **New.** The dashboard invitations state |
| `src/collaborate/components/projects/InvitationsList.jsx` | **New** |
| `src/collaborate/routes/ProjectsPage.jsx` | Mount InvitationsList and load invitations |
| `src/collaborate/lib/projectLimits.js` | Add `MAX_PROJECT_SEATS = 10` and `INVITE_EMAIL_MAX = 254` (mirrors of the server) |
| `test/membershipUi.test.mjs` | **New** root suite |
| Existing root suites | Only a minimal update to an assertion broken by the new navbar button, each one justified in the slice note. No deleted or weakened tests. |
| `context/2-architecture.md`, `context/3-ui-context.md`, `context/6-progress-tracker.md`, `context/HANDOFF.md` | Docs |

Everything else is out of scope, including `src/collaborate/lib/workspaceSync.js`, every server file, `package.json` and the protected files. If the work cannot be done without another file, stop and record an Open Question.

## 1. REST contract used (existing, unchanged)

All calls go through `axiosInstance` (`src/collaborate/lib/axios.js`), with paths under `/projects`. Error text is always `error.response?.data?.message`, falling back to the fixed strings below.

| Call | Use |
| --- | --- |
| `GET /projects/:id` | `{ project: { _id, name, owner: {_id, fullName, img}, members: [{ user: {_id, fullName, img}, role, addedAt }], invites? }, role }`. `invites` (`[{ _id, email, role, invitedBy, createdAt }]`) is present only for the owner. |
| `POST /projects/:id/invites` | Body exactly `{ email, role }` → `201 { invite }` |
| `DELETE /projects/:id/invites/:inviteId` | → `200` |
| `PATCH /projects/:id/members/:userId` | Body exactly `{ role }` → `200 { member }` |
| `DELETE /projects/:id/members/:userId` | → `200`. Owner removing a member, or a member removing themself (leave) |
| `GET /projects/invites/mine` | `{ invites: [{ _id, project: {_id, name}, role, invitedBy: {_id, fullName, img} \| null, createdAt }] }` |
| `POST /projects/invites/:inviteId/accept` | → `200 { projectId, role }` |
| `POST /projects/invites/:inviteId/decline` | → `200` |

Member emails are never returned and must not be displayed or derived. Seats used = `members.length + invites.length`, out of `MAX_PROJECT_SEATS`. The owner does not take a seat.

## 2. Workspace store: live membership (`useWorkspaceStore.js`)

Add both listeners in `bindWorkspace`, next to the existing ones, and remove them in `binding.unlisten`. Both use the same guard as `onPresence`:

- the binding is active and not disposed;
- the socket is connected and `socket.id === binding.sync?.joinedConnectionId`;
- the payload is a record and its lowercased `projectId` equals `binding.projectId`.

Anything else is ignored silently.

### 2.1 `workspace:removed { projectId, reason }`

`reason` must be `"removed"` or `"deleted"`; ignore anything else. The event is accepted in **any** status (`loading` included), because S27 sends it only for a connection that was attached. It is ignored once the status is already `removed`.

The exit runs synchronously, in this order:

1. `clearConnectionNotice`.
2. `binding.noticeMode = null` and `binding.wasReady = false`.
3. `binding.attempt += 1` and `binding.inFlight = null`.
4. `binding.presenceBuffer = null`.
5. `invalidateSession(binding.sync)`.
6. `binding.sync.joinedConnectionId = null`.
7. `binding.joinedAccountId = ""`.
8. `invalidateHistory(binding, "removed")`.
9. Clear previews and cursors as `failConnection` does.
10. `set({ ...emptyWorkspace("removed"), connectionNotice: null })`.

Clearing `joinedConnectionId` is what makes the `presence:update` / `turn:state` that S27 still sends in the same tick (S27 review, note 1) fall on the existing guards and be dropped. Do **not** emit `workspace:leave` from the handler, because the server already detached this connection. The unmount disposer may still emit it; the server ignores a leave for a project the socket is not in.

Then show exactly one toast, with `toastId: \`workspace-exit-${projectId}\``:

| Case | Toast |
| --- | --- |
| `reason === "deleted"` | `toast.error("This project was deleted")` |
| `reason === "removed"` and the self-leave marker (§2.3) is set for this project | `toast.success("You left the project")` |
| `reason === "removed"` otherwise | `toast.error("You were removed from this project")` |

`removed` is a new value of `status`. `emptyWorkspace` already handles any status string. No selector may treat `removed` as ready.

### 2.2 `workspace:role { projectId, role }`

Accepted only when `status === "ready"`, the role is `"editor"` or `"viewer"`, the current `state.role` is `"editor"` or `"viewer"` (an owner's role never changes), and it differs from the current role. Otherwise ignore it.

Then `set({ role })` and `toast.info(\`Your role is now ${role}\`)`, with `toastId: \`workspace-role-${projectId}\``.

Nothing else: S27 sends the `turn:state` that revokes a demoted holder's turn and queue entry right after this event. The existing `publishTurn` turn-loss path already invalidates history and starts recovery for pending edits. Because `selectCanEdit`, `requestTurn` and the others read `state.role`, the gating follows automatically. Do not add a second recovery path.

### 2.3 Self-leave marker

Export two plain functions:

- `markSelfLeave(projectId)` sets `binding.selfLeave = canonical projectId` on the active binding if it matches that binding's project.
- `clearSelfLeave(projectId)` clears it when it matches.

The marker lives on the binding, so it disappears with it. Only `useShareStore.leave` (§3) calls these.

### 2.4 Superseded join retry

In `startJoin`'s non-ok branch, when `result.message === "Workspace request superseded"` and the attempt is still current (the existing `stillCurrent` check), and `binding.supersededRetry` is not set:

1. set `binding.supersededRetry = true`;
2. call `startJoin(set, binding, true)`;
3. return without a toast, `leaveIfCurrent` or the error state.

Clear `binding.supersededRetry` when a join succeeds (the ok branch) and when `retryWorkspace` runs. A second consecutive superseded ack takes the existing error path unchanged. If the user was removed, the retry answers `Project not found` and the existing not-found card shows. That is correct, because the `workspace:removed` event only reaches attached connections.

## 3. Share store (`useShareStore.js`, new)

A zustand store, following the patterns in `useProjectsStore` (request counter, toast on error):

```text
state:   projectId | null, detail | null, viewerRole | null,
         status: "idle" | "loading" | "ready" | "error", busy: string | null
actions: open(projectId), close(), reload(),
         invite(email, role), revokeInvite(inviteId), changeRole(userId, role),
         removeMember(userId), leave()
```

- **Open and reload.** `open` sets `projectId`, `status: "loading"` and clears `detail`, then loads `GET /projects/:id`. `reload` loads again without clearing `detail`. A module-level request counter makes sure only the latest load for the current `projectId` writes state. `close` resets to idle and bumps the counter, so a late response cannot repopulate the store. On success it stores `detail = res.data.project` and `viewerRole = res.data.role` with status `ready`. On `404` it toasts the message and calls `close()`, because the workspace's own removal handling navigates. Any other failure gives status `error`, which the dialog shows with a Retry button.
- **Mutations.** At most one mutation runs at a time: `busy` holds a key such as `"invite"`, `"revoke:<id>"`, `"role:<userId>"`, `"remove:<userId>"` or `"leave"`, and a call while `busy` is set returns `false` immediately. Each mutation returns `true` or `false`.
  - On success it calls `reload()` (not awaited for the boolean). Toasts: invite `"Invitation sent"`, revoke `"Invitation revoked"`, role `"Role updated"`, remove `"Member removed"`.
  - On failure it toasts the server message (fallbacks: `"Failed to send the invitation"`, `"Failed to revoke the invitation"`, `"Failed to change the role"`, `"Failed to remove the member"`), then: on `404 Project not found` it calls `close()`; on any other error it calls `reload()`. That covers the `400 Project membership changed` race.
  - `busy` returns to `null` on every path. A mutation whose `projectId` changed or was closed during the request must not write state.
- **`invite(email, role)`** sends `{ email: email.trim(), role }`. It does no other client-side validation; the server is authoritative.
- **`leave()`:**
  1. Read the caller's id from `useSessionStore.getState().authUser?._id`. Without it, return `false`.
  2. Call `markSelfLeave(projectId)`, then `DELETE /projects/:id/members/:selfId`.
  3. On success: `toast.success("You left the project", { toastId: \`workspace-exit-${projectId}\` })` (the same id as §2.1, so the socket path and the REST path show one toast), then `close()`, then return `true`.
  4. On failure: `clearSelfLeave(projectId)`, toast the message (fallback `"Failed to leave the project"`), `reload()`, return `false`.

## 4. ShareDialog (`ShareDialog.jsx`, new)

**Button and props.**
- The navbar gets a **Share** button between `RoleBadge` and the Chat toggle. It uses the Users icon from lucide, `aria-label="Share project"` and `aria-haspopup="dialog"`.
- The visible text "Share" is `hidden sm:inline`, so a 320px navbar still fits; check that the existing `overflow-hidden` navbar does not clip the Chat toggle at 320px.
- The button shows for every role while `status === "ready"`.
- The navbar owns `open` local state. While open it calls `useShareStore.open(projectId)` and on close `useShareStore.close()`.
- `ShareDialog` takes `{ open, onClose, projectId }`. It is built on the shared `Dialog` shell and is dismissible unless `busy`. Reuse the LABEL/FIELD/PRIMARY/SECONDARY class strings as in `ProjectDialogs.jsx` (copy them locally, as that file does), and use only `--collab-*` tokens.

**Layout.**
- The title is "Share project" for the owner and "Project members" for others.
- The body scrolls (`max-h-[60vh] overflow-y-auto`).
- Loading shows the spinner, and error shows "Couldn't load members." with Retry (`reload`).

**Owner view.**
1. **Invite form.** An email input (`type="email"`, `maxLength={INVITE_EMAIL_MAX}`, autofocus), a role `<select>` with Editor (default) and Viewer, and an Invite submit button with a spinner while `busy === "invite"`.
   - Disable submit when the trimmed email is empty, when seats are full, or while any `busy`.
   - On success, clear the email and keep the role.
   - Show `Seats used: {used}/{MAX_PROJECT_SEATS}` under the form. When full, add "Remove a member or revoke an invitation to invite someone else."
2. **Pending invitations.** One row per invite: email (truncate, with `title` set), RoleBadge, and a Revoke button. If there are none, show "No pending invitations".
3. **Members.**
   - The owner row comes first, with name, "(you)" and an `owner` RoleBadge, and no controls.
   - Each member row has an avatar (`img`, or a fallback initial), the name, a role `<select>` (Editor/Viewer, whose change calls `changeRole`), and a Remove button.
   - Remove needs an inline confirmation in the same row: "Remove {name}?" with Confirm and Cancel. Do not open a second dialog.
   - If there are no members, show "No members yet".

**Member view.**
- Show the same member list, owner row included, read-only: badges only, no selects, no Remove. The caller's own row is marked "(you)".
- At the bottom there is a **Leave project** button with an inline confirmation: "Leave {project name}? You'll lose access until you're invited again." with Leave and Cancel.
- On a `true` result from `leave()`, the dialog's caller navigates to `/collaborate` with `{ replace: true }`, but only if it is still mounted. Usually §2.1 has already redirected.

**General rules.**
- While any `busy` is set, disable every control.
- A role `<select>` shows the stored role until the reload lands; there is no optimistic update.
- Labels are real `<label htmlFor>`.
- Icon-only buttons have an `aria-label`.

**Live roles.** If the workspace store's `role` changes while the dialog is open, call `reload()`. A demoted or promoted member then sees the right list, and an owner never gets this event.

## 5. Dashboard invitations

**`useInvitationsStore.js` (new).**
- State: `invites: []`, `hasLoaded`, `busy: string | null`.
- `loadInvites()`:
  - It resets the list like `loadProjects` does, so an account switch never shows another user's invites.
  - It uses a latest-request-wins counter.
  - On failure it toasts `"Failed to load your invitations"` and keeps `invites: []`.
- `refreshInvites()` follows the same rules but does not clear the list first, and it does not toast on failure.
- `accept(invite)` and `decline(invite)` allow one at a time, with `busy` set to `accept:<id>` or `decline:<id>`.
  - On success:
    - remove the invite locally;
    - accept also calls `useProjectsStore.getState().refreshProjects()`;
    - accept toasts `"You joined {project.name}"`;
    - decline toasts `"Invitation declined"`.
  - On failure:
    - toast the server message (fallbacks `"Failed to accept the invitation"` / `"Failed to decline the invitation"`);
    - then call `refreshInvites()`. This covers a `404`, which means revoked or already used.

**`InvitationsList.jsx` (new).**
- Rendered by `ProjectsPage` above "My projects", only when the lists are shown and `invites.length > 0` (as `3-ui-context.md` already specifies).
- The heading is "Invitations · {count}", in the same heading style as the other sections.
- Each card shows:
  - the project name;
  - "Invited by {invitedBy.fullName}", or "Invited by a former user" when `invitedBy` is `null`;
  - a RoleBadge;
  - Accept (primary) and Decline (secondary). Every button is disabled while any `busy` is set, and the active one shows a spinner.
- Use the existing card/grid classes. On a phone the buttons wrap below the text.

**`ProjectsPage.jsx`.**
- It calls `loadInvites()` in the same mount effect as `loadProjects()`.
- It calls `refreshInvites()` on `window` `focus` and on `document` `visibilitychange` when visible, at most once every 5 seconds (a timestamp check, no new dependency).
- Remove both listeners on unmount.

This is how an invitee sees a new invitation without reloading: the server sends no invitation event.

## 6. WorkspacePage

`if (status === "removed") return <Navigate to="/collaborate" replace />;`, placed before the not-found check. Unmounting runs the existing disposers. The dashboard's mount effect reloads projects, so the lost project disappears from the list.

## 7. Behavior summary (the "Done when" target)

With two accounts, A (owner) and B, and no page reload:

1. A invites B's email as Editor, and the invitation appears in A's Share dialog.
2. B's dashboard shows it on focus. B accepts, and the project appears under Shared with me.
3. B opens the project as Editor. A changes B to Viewer: B's toast shows, the badge updates, B's turn controls disappear, and B loses the turn if B held it.
4. A changes B back to Editor, and B can request the turn.
5. A removes B. B lands on `/collaborate` with "You were removed from this project", and the project is gone from B's list.
6. A invites B again and B accepts. B then uses Leave project and lands on `/collaborate` with one "You left the project" toast.
7. A deletes the project from the dashboard while B is inside it. B lands on `/collaborate` with "This project was deleted".

The implementer runs this manually only with isolated accounts and data. Local config targets the live database: if that is not available, record it as **not run**. Do not create live data to satisfy this list.

## 8. Tests (`test/membershipUi.test.mjs`, new root suite)

Use the existing root-suite harness: a Vite `ssrLoadModule` server, the client-snapshot patch, the `createSocket` fake from `turnRobustness.test.mjs`/`projectChat.test.mjs`, and axios mocked through `axiosInstance.defaults.adapter` as `projectChat.test.mjs` does. Copy the helpers you need; do not import across suites. Mock or spy on `toast` the way the existing suites do. Use a Vite server port setting that does not collide when the suite runs alone.

**Workspace store**
1. `workspace:removed` for the joined project sets `status: "removed"`. It leaves no pending ops, no further `canvas:commit` emits, and history `{undo:0, redo:0}`, and shows exactly one error toast with the `workspace-exit-<id>` id. A `presence:update` and a `turn:state` for that project, sent right after, change nothing.
2. `reason: "deleted"` shows "This project was deleted". When `markSelfLeave` was called first, `reason: "removed"` shows the success "You left the project".
3. These are all ignored: a removal for another project, from a socket that is not the joined connection, a malformed payload or an unknown reason, and a second removal.
4. A removal while `loading` (a rejoin in flight) is accepted, and a late join ack for that attempt does not resurrect `ready`.
5. `workspace:role` editor→viewer makes `selectCanEdit` false and shows the role toast; a following `turn:state` that drops this tab as holder invalidates history through the existing path. viewer→editor lets `requestTurn` emit `turn:request`. These are ignored: the same role, `"owner"`, an owner's own state, and a status that is not `ready`.
6. A `Workspace request superseded` join ack triggers exactly one automatic re-emit of `workspace:join` with no toast. A second consecutive superseded ack ends in `status: "error"` with the existing toast. A successful join in between resets the allowance.
7. Disposing the binding calls `socket.off` for both new events.

**Share store**
8. `open` issues `GET /projects/:id` and stores the detail and role. A response after `close()`, or after reopening another project, is discarded.
9. `invite` sends exactly `{ email: <trimmed>, role }` to the right URL and reloads afterwards. A server `400` message is toasted and returns `false`. A second mutation while `busy` returns `false` without a request.
10. `revokeInvite`, `changeRole` and `removeMember` hit the right method and URL with the right body. A `404` closes the store, and a `400` membership-changed reloads.
11. `leave` marks self-leave before the request, sends `DELETE` with the session user's id, and clears the marker on failure.

**Invitations store**
12. `loadInvites` is latest-wins and clears the previous list first. `accept` removes the invite, calls `refreshProjects` and toasts with the project name. `decline` works the same way. A failure toasts the server message and refreshes.

**Rendering (SSR markup, as the existing UI suites do)**
13. The owner dialog renders: the invite form with a labelled email and role, seat count `n/10`, a pending invite with Revoke, member rows with a role select and Remove, and an owner row with no controls. A full project disables Invite and shows the full-seat hint.
14. The member dialog renders the read-only list, "(you)" on the caller's row, Leave project, and no select, Remove or invite form.
15. The navbar renders the Share button with its `aria-label` when ready.
16. `ProjectsPage` renders the Invitations section only when invitations exist, and "Invited by a former user" for `invitedBy: null`.
17. `WorkspacePage` with `status: "removed"` renders the `/collaborate` route (a marker element in a `MemoryRouter`), not the workspace.

## 9. Docs

- **`3-ui-context.md`:**
  - Navbar: replace "Share stays S28" with the Share button, its position, and its icon-only behavior below `sm`.
  - Add the ShareDialog and InvitationsList layouts to the patterns.
  - Update the S28 checkpoint lines.
- **`2-architecture.md`:**
  - Mark ShareDialog/InvitationsList implemented in the tree note.
  - Add a short "S28 client membership" section: the listeners, the `removed` status, the self-leave toast id, the superseded retry, and invitation refresh on focus.
  - Update the checkpoint line.
- **Tracker and HANDOFF:** status, slice note, verification numbers and what was not run.
- **No `server/readme.md` change:** there is no server change.

## 10. Verify when done

- [ ] Server suite unchanged and passing (`cd server && npm test`; baseline **304**).
- [ ] The ten existing root suites pass, one command each (baseline **259**). Any changed assertion is justified in the slice note.
- [ ] The new `test/membershipUi.test.mjs` passes on its own command. Record its count.
- [ ] `npm run build` passes. Record the `WorkspacePage` and `ProjectsPage` chunk sizes; the only allowed warning is the existing large-chunk warning. `@xyflow/react` must not move into the entry chunk.
- [ ] `git diff --check` passes. `git diff --stat` and `git status` show only the allowed files.
- [ ] No server file, `workspaceSync.js`, `package.json` or protected file changed.
- [ ] No member email rendered anywhere. Invite emails appear only in the owner's dialog.
- [ ] The `removed` handler never emits `workspace:leave`. One exit toast per removal, including self-leave.
- [ ] Manual §7 walkthrough and the 320px navbar check: performed with isolated accounts and recorded, or recorded as **not run**.
