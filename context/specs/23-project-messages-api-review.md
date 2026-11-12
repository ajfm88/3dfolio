# S23 review

**Status:** Approved after correction · **Reviewer:** Codex · **Baseline:** `43eb732`

## Finding

1. **Medium — An empty history cursor is accepted as the first page.** In `server/src/lib/projectMessages.js`, `isoTimestamp` returns an empty string for invalid input, and `parseHistoryQuery` accepts a string when that result equals the supplied value. For `before: ""`, both sides are empty. `historyFilter` then treats it as absent. Through the production authorization middleware and history handler on a loopback Express server with stubbed models, `GET /projects/<authorized-project>/messages?before=` returned 200 and executed only `{ project: <id> }`, with no cursor constraint. The helper returned `{ ok: true, limit: 50, before: "", beforeId: null }`. The spec and server readme require every supplied `before` to be a canonical UTC timestamp and invalid timestamps to return 400. A malformed cursor must not silently restart pagination.

Reject the invalid/empty timestamp before accepting the cursor. Keep missing `before` valid, canonical timestamps valid, timestamp-only and paired-cursor paging unchanged, and authorization before validation. Add a helper regression and an HTTP regression using the mounted middleware/handler path: an authorized request with `?before=` returns 400 `before must be a UTC timestamp` without calling `ProjectMessage.find`; an outsider still gets 404 first. Keep the fix in the existing S23 files and retain all current assertions.

## Verification and scope

- Independently ran server `npm test`: 221 passed, 0 failed, 0 skipped/cancelled; exited on its own, duration 957.0961 ms.
- Independently ran root client suites sequentially, one command per suite: workspaceSync 13, canvasPreview 39, participants 6, cursorPresence 69, turnState 10, turnRobustness 28. All passed. Combined with server: 386 passed.
- Root `npm run build`: Vite 7.3.5, 4265 modules, 8.45 s. Only the existing chunk-size warning. Workspace chunk remains `WorkspacePage-D2QW4qBn.js`, 262.23 kB, gzip 84.07 kB.
- `git diff --check` passed, with the reported LF-to-CRLF notices on three server source files.
- Inspected the new model, helpers, middleware, controller, all four new test files, route and delete changes, typing authority, media helper, documentation, and scope against the spec. No application-code edits were made during review. No S24 work was started.
- Targeted HTTP reproduction used an ephemeral loopback listener and stubbed project/message models; it performed no database or ImageKit operations. The listener was closed and stubs restored. No reproduction file was left in the tree.
- The implementer's API boot/health result remains reported evidence; review did not repeat the live database connection. Browser/two-account checks, live REST with Clerk, real attachments, `/blog`, and `/chat` remain unverified as already recorded. SDK upload coverage is stubbed. These planned runtime limitations are separate from the cursor correction.

Fix only the finding above, rerun the S23 verification, update the tracker with evidence, mark S23 Ready for review, and stop. Codex will recheck the correction. Do not commit, push, branch, deploy, or start S24.

## Final code review

**Approved.** The parser now rejects an explicitly empty `before` before comparing its canonical timestamp. The helper regression asserts the exact failure, and the HTTP regression exercises the production authorization middleware and history handler, verifying 400 with no message query for the member and 404 first for the outsider. Existing first-page, timestamp-only, and paired-cursor assertions remain intact and pass. The correction resolves the sole requested finding.

Independent rerun: all 386 tests pass (221 server and 165 client). Server duration: 1115.8945 ms, with no skipped or cancelled tests. Client suites ran separately and sequentially: 13 workspaceSync, 39 canvasPreview, 6 participants, 69 cursorPresence, 10 turnState, and 28 turnRobustness. The production build passed in 8.37 s with the existing chunk-size warning; the workspace chunk remains `WorkspacePage-D2QW4qBn.js`, 262.23 kB, gzip 84.07 kB. `git diff --check` passed with the existing three line-ending notices.

Approval is for the submitted code. Browser, two-account, live-media, `/blog`, and `/chat` checks remain unverified as recorded; the implementer's API boot/health check was not repeated against the live database during review. No application code was edited by the reviewer and no commit, push, branch, deployment, or S24 implementation occurred. The user handles commits. S24 may now be specified and implemented as the next slice.
