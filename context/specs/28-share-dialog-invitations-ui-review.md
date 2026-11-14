# Slice 28 review — Share dialog and invitations UI

**Reviewer:** Claude Opus 5.5 · **Implementer:** GPT 6.1 Terra · **Date:** 2026-11-13 · **HEAD:** `c14a185` (uncommitted working tree, Approved S27 included)

**Verdict: Changes requested.** The behavior matches the spec except for one gap, which comes from the spec itself (item 1). The rest is code quality. Every test passes. The corrections are small and must not change any other behavior.

## Independent verification

| Check | Result |
| --- | --- |
| Server suite | **304 passed** (unchanged) |
| Ten existing root suites, one command each | **259 passed**; no existing test file changed |
| New `test/membershipUi.test.mjs` | **20 passed** |
| Production build | Passed. `WorkspacePage` chunk 313.70 kB (gzip 98.75 kB), up from 303.85 kB. Only the existing large-chunk warning. |
| `git diff --check` | Passed |
| Scope | Only allowed client files, the new suite and docs. No server, `workspaceSync.js`, `package.json` or protected file. |

Not run: the two-account walkthrough (§7), the 320px navbar check, real browser focus and layout.

## What is right

- **`workspace:removed`.**
  - The guard is the same as `onPresence` uses, and the event is accepted while loading.
  - The exit sequence follows the spec's ordered list in `useWorkspaceStore.js`.
  - Clearing `joinedConnectionId` makes S27's same-tick `presence:update`/`turn:state` fall on the existing guards; a test covers this.
  - There is no `workspace:leave` emit, and one toast with the `workspace-exit-<id>` id.
- **`workspace:role`.** It is accepted only while ready, editor and viewer only, and never on an owner. Turn loss reuses `publishTurn`, with no second recovery path.
- **Superseded-join retry.** One automatic retry, reset when a join succeeds and when `retryWorkspace` runs. A real self-supersede is still caught earlier by `stillCurrent`.
- **Share store.**
  - Latest-wins loads, and `close()` discards late responses.
  - One mutation at a time.
  - A `404` closes only for `Project not found`; `Invitation not found` reloads instead, which is the right refinement.
  - The self-leave marker is set before the request and cleared on failure.
- **Invitations store.**
  - Reset on load.
  - A successful response bumps the request counter, so an in-flight refresh cannot bring a consumed invitation back.
  - Accept refreshes the project list.
- **No member email** is rendered anywhere. Invite emails appear only in the owner view.
- **Navbar.** The Share button shows only while ready, is icon-only below `sm`, and has its `aria-label`. The idle-close effect closes the dialog when the store closes itself (on a 404 or after leave).

## Changes requested

1. **Leave without a socket event never leaves the page.**
   - **Cause.** The spec's ordering (`leave()` calls `close()` and then returns `true`) combines badly with the navbar's idle-close effect. `close()` unmounts the dialog before the `await leave()` continuation runs, so `mounted.current` is false and the `navigate` call is skipped.
   - **Usually hidden.** S27 sends `workspace:removed` before the REST response, so on a live socket the store redirects first.
   - **When it fails.** When the socket is disconnected or reconnecting, the user stays on the workspace and later sees "Project not found".
   - **Fix.**
     - Export `exitWorkspace(projectId)` from `useWorkspaceStore.js`. When the active binding matches and its status is not already `removed`, it runs the same exit sequence as `onRemoved` (factor that sequence into one shared function) and sets `status: "removed"`. It shows no toast, because `leave()` already showed the deduplicated one.
     - `useShareStore.leave` calls `exitWorkspace(id)` on success, after its toast and before `close()`.
     - Remove `useNavigate`, the `mounted` ref and the navigate call from `ShareDialog`. `WorkspacePage`'s existing `<Navigate>` then handles every path.
     - Add a test: a successful leave with no socket event sets `status: "removed"`, shows exactly one toast, and a later `workspace:removed` adds no second toast.
2. **Remove the UTF-8 byte-order marks** at the start of `useShareStore.js`, `useInvitationsStore.js`, `ShareDialog.jsx`, `InvitationsList.jsx` and `membershipUi.test.mjs`. No other file in the repo has one.
3. **Format the new source files like the rest of the repo.** No behavior change.
   - `ShareDialog.jsx` and `InvitationsList.jsx` pack several elements, conditionals and handlers onto single lines of several hundred characters. Use the multi-line JSX layout of `ProjectDialogs.jsx` and `ProjectsPage.jsx`: one element per line, and named handlers for the invite submit, remove confirm and leave confirm.
   - In `useShareStore.js`, `useInvitationsStore.js`, the new `useWorkspaceStore.js` listeners and the `ProjectsPage.jsx` effect, use one statement per line.
   - Add short *why* comments, as `4-code-standards.md` asks, where the reason is not obvious:
     - the shared exit toast id;
     - why `joinedConnectionId` is cleared on removal;
     - the single superseded retry;
     - the navbar's idle-close effect;
     - the request and generation counters in both stores;
     - the success-path request bump in the invitations store.
   - Reformatting `membershipUi.test.mjs` the same way is encouraged but not required.
4. **Small accessibility fixes.**
   - Add `aria-hidden="true"` to the two `Loader2` spinners in `InvitationsList.jsx`.
   - Give the ShareDialog loading spinner an accessible status: wrap it in `role="status"` with an `sr-only` "Loading members".
   - Give the Invite button an explicit `type="submit"`.
5. **Tracker status.** The S28 row still says `Todo` (S27 had the same slip). The row must state the real status. Set it to `Ready for review` again after the corrections, and add a correction slice note.

After the corrections, run the server suite, the ten root suites and the new suite (one command each), the build and `git diff --check`. Record the counts, and say again that the §7 walkthrough was not run.

## Notes (no change requested)

- **Dialog autofocus.** The dialog opens in loading state, so the `Dialog` shell's initial focus runs before the email input exists and focus lands on Close. This is acceptable; S29's accessibility pass can revisit it.
- **Role select.** The select shows the stored role while a change is in flight, as specified, so a slow request looks briefly unchanged.
- **Chunk size.** `WorkspacePage` grew by about 10 kB raw / 2.7 kB gzip, which is expected for the dialog and its store.

## Re-review after corrections — 2026-11-13

**Verdict: Approved.** All five requested changes are in. No new behavior was added.

| Check | Result |
| --- | --- |
| Server suite | **304 passed** |
| Ten existing root suites, one command each | **259 passed**; no existing test file changed |
| `test/membershipUi.test.mjs` | **21 passed** (+1: a successful leave with no socket event exits once and ignores a later removal) |
| Production build | Passed. `WorkspacePage` 313.85 kB (gzip 98.78 kB). Only the existing large-chunk warning. |
| `git diff --check` | Passed |

1. **Leave.** `exitBinding` is now the one exit sequence, shared by `onRemoved` and the new exported `exitWorkspace(projectId)`. `useShareStore.leave` calls `exitWorkspace` after its deduplicated toast and before `close()`. `ShareDialog` no longer navigates. After a REST exit, `joinedConnectionId` is null, so a late `workspace:removed` fails the guard and shows no second toast; the new test covers this.
2. **Byte-order marks** removed from all five files.
3. **Formatting.** The stores, `ShareDialog`, `InvitationsList` and the `ProjectsPage` effect are now multi-line, with named handlers and why-comments covering the toast id, the `joinedConnectionId` clearing, the single retry, the idle-close effect and the counters. The remaining long lines are Tailwind class strings, which the existing files have too. One nit is accepted: the navbar's Share button is still a single 361-character JSX line. Reformat it whenever that file is next touched.
4. **Accessibility.** The spinners are `aria-hidden`, the dialog's loading state is `role="status"` with "Loading members", and Invite is `type="submit"`.
5. **Tracker.** The row was Ready for review with a correction note, and is now set to Approved by this review.

Still not run: the §7 two-account walkthrough, the 320px navbar check, and real-browser focus and layout. These carry into the S29 hardening pass and launch QA.
