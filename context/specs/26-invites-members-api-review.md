# S26 code review — 2026-11-12

**Status: Approved** · **Reviewer:** Codex · **Implementer:** Claude Sonnet · **Baseline:** HEAD `9b47c77` (commit 68), with Approved S25, S26 and planning documents uncommitted.

## Outcome

No blocking code findings. The seven endpoints implement the S26 REST contract within the named server/helper/router/test/documentation files. S25 remains Approved and uncommitted. The user explicitly asked to stop after S26 review today; no S27 spec, planning or implementation was started.

## Review conclusions

- Project-scoped authorization precedes body/target checks, with 404 for missing/outsider projects and 403 for unauthorized members. Owner writes repeat owner authority; self-leave writes repeat membership. Platform admin has no implicit project privilege. Identity remains protectRoute's synced user, without a production test-auth escape hatch.
- Invitation accept/decline use a single $elemMatch containing invitation id and trusted normalized email in reads and writes. The split-element trap is covered. Offers expose only whitelisted project/inviter metadata; normal project access still requires membership.
- Input and response whitelists prevent mass assignment and operator payloads. Address normalization handles mixed-case existing User.email by reading only this project's member-user ids, with no directory or external account lookup. Pending invites can precede signup; no User writes occur.
- The ten-seat reservation includes members and pending invites. Accept consumes its reserved invite and adds the caller with the stored role in one guarded update, including at capacity. Duplicate/competing consumers cannot both succeed. Owner role/removal/self-join restrictions and explicit leave/remove responses follow the spec.
- All membership writes guard the prior arrays and authorization; conditional misses are classified by a fresh scoped read and never blindly retried. Narrow $push/$pull/role writes preserve unrelated metadata and cannot recreate a removed member. Controlled read barriers exercise same-email/tenth-seat races, double accept, accept versus decline/revoke, different accepts, role versus removal, create versus accept and unrelated rename.
- Real production router/protectRoute HTTP coverage verifies static route order and auth boundaries. Existing project/chat routes remain registered. Unexpected persistence errors do not report success. New handlers add no socket, canvas, message, webhook, client, model, schema or dependency changes.

## Implementation choices accepted

The snapshot guard uses array $size plus $all of per-element $elemMatch conditions for the stored member/invite fields, instead of literal whole-subdocument array equality. For the unique member-user and invitation-id entries maintained by these APIs, this guards the same membership content without depending on BSON subdocument field order or array ordering. No S26 transition creates duplicate member-user or invite-id entries. ObjectId/date/empty-array query casting is tested against the installed real Project schema without I/O. This is an acceptable implementation of the concurrency contract, not a new schema/version/locking mechanism; the controlled model tests do not establish live MongoDB behavior.

Role changes check target-id syntax, body, owner target and membership after owner authorization. The spec did not impose an ordering among simultaneous target/body errors, and privacy is preserved. A non-owner attempting removal of a malformed/nonself id receives 403 before target existence; authorized owner invalid targets remain 404. Create's account-email check follows authorized body validation and precedes semantic checks. These choices do not require corrections.

## Independent verification

All suites ran independently of the implementer's report; root suites ran separately and sequentially:

| Suite | Passed |
| --- | ---: |
| server: npm test | 283 |
| workspaceSync | 13 |
| canvasPreview | 39 |
| participants | 6 |
| cursorPresence | 69 |
| turnState | 10 |
| turnRobustness | 28 |
| projectChat | 14 |
| projectChatUi | 5 |
| canvasHistory | 31 |
| canvasShortcuts | 44 |
| **Total** | **542 (283 server, 259 client)** |

Zero failures, skips or cancellations. Server exited on its own; duration 2047.3789ms. Root production build passed: Vite 7.3.5, 4277 modules, 8.44s, `WorkspacePage-9VQR8OGU.js` 303.85 kB/gzip 96.09 kB, unchanged from Approved S25. Existing chunk-size warning only. `git diff --check` passed with LF-to-CRLF notices.

Inspected new helpers/controller/tests, route diff, server readme and architecture/standards against the S26 spec and existing project/access/auth/model code. No application, submitted test or dependency changes were made during review; reviewer updates are documentation only. No live database reads/writes, external service calls, commits, pushes, branches or deployment.

## Limits and stopping point

Approval is for code and automated coverage. The model fake evaluates current filters/updates with staged stale reads, but is single-threaded: no live MongoDB concurrency/index/Atlas test was run. No API boot/health, manual REST cycle on isolated accounts, browser/two-account/live-project/media or /blog and /chat runtime check was performed. Existing runtime QA limitations remain explicit.

S26 changes persisted REST membership only. Already joined sockets retain room/cached permissions/broadcast access until the later live-enforcement slice. There is no invitation/share UI yet. This approval does not establish live revocation or launch readiness, and these routes should not be presented as completed membership management alone.

**Stop for today as requested by the user.** S25 and S26 are Approved and uncommitted; the user handles commits. Preserve the entire tree. Do not plan/specify/implement S27 today. No S27/S28 or drawDB work was performed.
