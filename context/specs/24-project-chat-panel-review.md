# S24 review

**Status:** Approved after second correction · **Reviewer:** Codex · **Baseline:** `43eb732`

The findings and correction handoffs below are historical. The final review at the end supersedes their requested status.

## Findings

1. **High — Session changes do not fully invalidate chat authority.** `selectCanChat` checks that some account is signed in, but not that it is the account that established the workspace socket/join. In `useProjectChatStore`, the session subscriber changes `binding.accountId` to the new account and immediately calls `onWorkspace` against the previous ready workspace. That function checks status/project, not matching join authority, and rearms history. The old socket's message callback can then publish into the new account's client state. Independently reproduced using the real stores and existing fake-socket harness: connect as SELF, set authUser to THIRD without replacing the socket, then deliver a message on that old socket. `selectCanChat` returned true and the message appeared as `packet on old account socket`.

   The same invalidation gap occurs when the session socket becomes null: the subscriber tests `binding.socket && state.socket && state.socket !== binding.socket`, so null is skipped. `same(snap)` also does not require the captured socket to remain the session's current live joined socket. Independently reproduced: start a deferred send, set session.socket to null, resolve its successful response. The old response appended one row and cleared `retain this draft` to an empty string.

   Pin authority to the account/socket/join that established it. An account change or any session socket replacement, including null, must synchronously disable old chat, invalidate operations, and clear the required content before React cleanup. Rearm only after a fresh matching workspace join. Do not reuse a previous account's ready status. Check binding-specific live authority before starting requests, accepting socket events, and publishing async completions; do not merely ask whether some current workspace can chat. Preserve same-account temporary disconnect draft/file behavior and all-role access during canvas-only recovery. Add the two failing store sequences above, plus a stale GET after socket removal, and prove a new valid binding still works.

   The S24 spec's allowed workspace-store edit is expanded narrowly to let the selector capture/check the binding's account identity. No canvas/turn semantics, session-store changes, backend changes, or broader refactor are required.

2. **Medium — An earlier-page retry skips scroll anchoring.** `ProjectMessageList` captures the anchor in `onEarlier`, but the error Retry button calls `retryEarlier()` directly. `useProjectChatScroll` clears holdRef when earlierStatus leaves loading, including on failure. A later successful retry therefore has no anchor and treats the extra rows as an ordinary live append. With the reader away from bottom it performs no compensation.

   Reproduced by invoking the actual hook with an isolated React dispatcher and controlled scroll element/effects: start at scrollTop 400, capture an anchor, transition loading → error → retry loading, then prepend ten 40px rows. holdRef was null after the error and scrollTop remained 400; preserving the original message/offset requires 800. This exercises hook wiring, not only the pure arithmetic helper. It does not claim browser/native anchoring was verified.

   Use the same anchor-capture path for Load earlier and Retry, preserve current messages during errors, and retain the first visible message/offset when retry succeeds alongside a live append. Add a regression that executes the production handler/controller/hook sequence. Keep the original successful-prepend test too.

3. **Medium — Late media growth is not observed by the scroll hook.** `useProjectChatScroll` observes only the scroll container with ResizeObserver. That element has a constrained panel height. Loading an image/video changes its content height and scrollHeight, while the observed box can stay the same size; no resize callback is required for that change. The bubble media has maximum dimensions but reserves no fixed height/aspect ratio. A delayed media load therefore has no reliable path to follow the bottom or preserve the reader's visible anchor. The hook harness confirmed the only observed target is the scrollport.

   Observe the message content/rows or handle their actual media layout changes, with cleanup and a stable visible anchor when reading older history. Follow bottom only for a reader already near it. Do not depend on native browser scroll anchoring or observe just the fixed viewport; avoid resize feedback loops. Add tests exercising a content resize at unchanged viewport dimensions, both at bottom and while reading older messages. Tests of planScrollAction alone are insufficient to establish this effect wiring.

## Independent verification

- Server npm test: 221 pass, 0 fail, 0 skipped/cancelled, duration 863.5762 ms; process exited on its own.
- Root suites ran separately and sequentially: workspaceSync 13, canvasPreview 39, participants 6, cursorPresence 69, turnState 10, turnRobustness 28, projectChat 12, projectChatUi 4. Combined with server: all 402 submitted tests passed.
- Root production build passed: Vite 7.3.5, 4275 modules, 8.16 s, existing chunk-size warning only. Workspace chunk `WorkspacePage-DCLNH8ki.js`, 291.52 kB, gzip 92.41 kB.
- `git diff --check` passed with the reported line-ending notices. S23's approved empty-cursor correction remains present. No S25 work was found or started.
- Temporary store test copy retained all 12 submitted tests (passing) and added the two lifecycle regressions (both failed with the observed outputs above). The scroll-hook reproduction used the production hook and controlled effects/DOM metrics, restoring React internals and observer afterward. Temporary files were removed. No application code was changed by review.
- No database, Clerk, ImageKit or user/membership writes were performed. API boot/health remains the implementer's reported evidence; review did not repeat the live database connection.
- Attempted an isolated local headless Chrome fixture, without account access. Automatic approval review rejected the browser launch as `blocked by policy`. The scratch fixture was removed and its Vite process stopped; no browser checklist result is claimed. Real DOM, two-account, media, `/blog`, and `/chat` checks remain open as documented.

## Correction handoff

Fix these findings only within S24's named files (including the narrow account capture allowed in the updated spec). Preserve approved S23 and existing assertions. Add regressions that fail against this submission, rerun all server/client suites individually plus build and diff check, and record evidence and remaining browser limitations in the tracker. Mark S24 Ready for review and stop. Codex will review again. Do not commit, push, branch, deploy, or start S25.

## Second review

**Changes requested.** The original immediate account-change and null-socket callback reproductions now pass. Load earlier and Retry share requestEarlier, the retry anchor survives failure, and content resizing is observed rather than just the scrollport. The new mounted-hook test exercises real React effects against controlled element metrics. Two follow-up sequences still violate those same authority and scroll contracts:

1. **High — A workspace retry reassigns an existing connection to the new account.** `revokeJoinedAccount` clears the join's account field, but `startJoin` sets it again from the current session user on every workspace join. Socket authentication happens at connection handshake, not workspace:join. A new workspace acknowledgement on the unchanged socket does not authenticate the new account. Reproduced with the production stores: connect as SELF, replace authUser with THIRD while keeping that socket/connection, verify chat is initially disabled, call retryWorkspace, finish the old connection's join, and deliver an old-socket message. Chat becomes enabled and displays `old account traffic after retry`. The submitted 13 chat tests still pass; this added sequence fails.

   Keep the authenticated connection's account ownership pinned across workspace retries and route rebinds. Changing accounts cannot assign the unchanged transport connection to a different user by retrying a join. Require a fresh authenticated connection/connection epoch before allowing the new account, then permit a valid join. Preserve ordinary retries and cross-project routing for the same account. Keep the metadata change within the named workspace/chat files; no server protocol or canvas/turn semantics change is requested. Add the exact failure sequence and a successful new-connection sequence, retaining all immediate-invalidation tests.

2. **Medium — The error anchor overrides subsequent user scrolling.** The hook retains holdRef while earlierStatus is error and declines to update anchorRef in onScroll while holdRef exists. Every later message render or content resize then restores the old hold even after the reader deliberately moves elsewhere. Reproduced against the actual hook/effects with controlled metrics: capture row10 at scrollTop 400, fail the earlier-page request, manually scroll to 800 and deliver its scroll event, then append one live row. scrollTop returns to 400 instead of remaining 800; holdRef still names row10. The content observer follows the same stale hold.

   Honor deliberate reader movement while a page is failed or pending: refresh/release the old hold as appropriate, and recapture the reader's current visible anchor when Retry starts. Both live append and content resize must preserve the new reading position while away from bottom. A retry success must still compensate for prepended rows, including a concurrent append. Add mounted-hook regressions for manual scroll after an error followed by a live append and media resize. Keep the original retry/content-resize checks.

Independent verification: server 221/221 (1105.8334 ms); sequential root suites 13, 39, 6, 69, 10, 28, 13, 5, all passing, combined 404/404. Production build passed in 8.91s, Vite 7.3.5, 4275 modules, workspace `WorkspacePage-teVtu__c.js` 292.47 kB, gzip 92.63 kB, existing chunk warning only. `git diff --check` passed with the existing line-ending notices. The additional store regression and hook reproduction produced the failures above; temporary files were removed and test plumbing restored. No application-code edits, database writes, live-media operations, or browser launch occurred in this review. API boot remains reported implementer evidence; browser/two-account and other-route checks remain open.

Fix only these two remaining findings, rerun verification, update the tracker and return S24 to Ready for review. Preserve approved S23 and do not start S25.

## Final code review

**Approved after second correction.** Connection account ownership is retained by socket object and connection id in a WeakMap, so workspace retries/rebinds cannot relabel the unchanged connection for another account. A fresh id can establish new ownership. The account-change/retry regression rejects old traffic and the new-connection check accepts a valid binding. Existing same-account retry, immediate account invalidation, null-socket send/GET invalidation, and all-role chat checks pass.

The scroll listener now updates the visible anchor after reader movement and releases a stale earlier-page hold. The mounted-hook regression verifies that a live append preserves the new position and subsequent content resize follows the newly visible row. Retry still uses requestEarlier; the content observer and prepend regressions remain intact. These corrections resolve the remaining findings.

Independent final verification: server 221/221, duration 1021.4669 ms; root client suites run separately and sequentially: workspaceSync 13, canvasPreview 39, participants 6, cursorPresence 69, turnState 10, turnRobustness 28, projectChat 14, projectChatUi 5. Combined: 405 pass, 0 fail. Build: Vite 7.3.5, 4275 modules, 8.77s; workspace `WorkspacePage-CNgz3832.js`, 292.98 kB, gzip 92.84 kB. Only the existing chunk-size warning. `git diff --check` passed with existing line-ending notices.

Approval is for code and automated coverage. Browser/two-account/live-media, `/blog`, and `/chat` checks remain open. API health is reported implementer evidence; review did not repeat the live database connection. No application code was edited by the reviewer, and no commit, push, branch, or deployment occurred. The user stopped work after S23/S24. S25 has no spec or implementation; see `../HANDOFF.md` for the next session.
