# Slice 26 — Invitations and members API

**Execution status (2026-11-12): Approved, uncommitted on `9b47c77`.** See `26-invites-members-api-review.md` for final evidence and accepted snapshot/validation choices. The planning baseline and instructions below remain the original implementation contract; they are not the current progress status. The user requested stopping after S26 review and no S27 planning today.

**Lane** server · **Depends on** S03 (Committed) · **Unblocks** S27, then S28

**Spec author / reviewer** Codex · **Implementer** Claude Sonnet, assigned by the user on 2026-11-12

## Baseline and scope

Read AGENTS.md, its six context files in order, HANDOFF.md, this spec, the S03 project REST spec, and the final S25 review. Planning HEAD is `9b47c77` (commit 68). S25 is Approved but uncommitted, together with planning/context documents; preserve all of it. Recheck actual git status/log before starting. S25 need not be committed to implement this slice, whose dependency S03 is already Committed.

Implement seven protected REST endpoints for invitation creation/revocation/listing/acceptance/decline and member role changes/removal/self-leave, using existing Project members/invites and synced User identities. No client changes, email delivery, directory/search, new collections, ownership transfer, expiry, migration or dependency. No sockets, room mutation, turn changes, Clerk webhook changes or live enforcement: those belong to S27; sharing/invitations UI belongs to S28. Existing user records are written only by the webhook.

Mark S26 In progress, implement the named files and verification, mark Ready for review and stop for Codex. Never commit, push, branch, deploy, start S27/S28, or touch drawDB. This document is a plan; no S26 implementation is claimed.

## Allowed files

| File | Work |
| --- | --- |
| `server/src/controllers/projectMember.controller.js` | New seven handlers; access, scoped queries, atomic guarded writes, response shaping |
| `server/src/lib/projectMembership.js` | New small validation/normalization, snapshot/transition and response helpers as useful; no separate authorization system |
| `server/src/routes/project.route.js` | Import/register new handlers behind existing protectRoute; static routes before /:id |
| `server/test/projectMembership.test.js` | New pure helper and query/casting/guard tests |
| `server/test/projectMember.api.test.js` | New mounted REST/router, privacy, mutation and controlled-concurrency tests |
| `server/readme.md` | Endpoint table, resource/error examples, concurrency and rollout limitation |
| `context/2-architecture.md`, `context/4-code-standards.md`, `context/6-progress-tracker.md`, `context/HANDOFF.md` | Actual contract, tests, status and evidence |

Everything else stays unchanged, particularly approved S25, all client code, projectAccess.js, project.controller.js, models, auth/middleware/webhook, server entry/socket modules, manifests/configuration/environment files, installed dependencies and existing test assertions. Add tests in the two named new files without adding test-only production endpoints or swapping out production handlers. Existing Project defaults, indexes, ten-seat limit and owner-not-in-members invariant suffice.

## 1. API and resources

Every path below is relative to `/api/projects`, behind the existing router-level protectRoute. Identity is `req.user._id` and the synced `req.user.email`, never body/query/header identity in production. No new auth mechanism. No session is the existing 401; an unsynced user retains protectRoute's 404.

| Method | Path | Who | Success |
| --- | --- | --- | --- |
| POST | `/:id/invites` | Owner | `201 { invite: Invite }` |
| DELETE | `/:id/invites/:inviteId` | Owner | `200 { message: "Invitation revoked" }` |
| GET | `/invites/mine` | Signed-in invite recipient | `200 { invites: [OfferedInvite] }` |
| POST | `/invites/:inviteId/accept` | Matching invite recipient | `200 { projectId, role }` |
| POST | `/invites/:inviteId/decline` | Matching invite recipient | `200 { message: "Invitation declined" }` |
| PATCH | `/:id/members/:userId` | Owner | `200 { member: { userId, role } }` |
| DELETE | `/:id/members/:userId` | Owner removing a member, or that member leaving | `200 { message: "Member removed" }` or `200 { message: "Project left" }` |

Invite is exactly `{ _id, email, role, invitedBy, createdAt }`, matching the existing owner's GET project detail (invitedBy is an id). OfferedInvite is exactly `{ _id, project: { _id, name }, role, invitedBy: { _id, fullName, img } | null, createdAt }`. Its _id is the embedded invitation id, not the project id. Dates are ISO timestamps and ids canonical strings. No full documents, email of other users, clerkId, __v, member roster, other pending invites or canvas content is exposed to an invite recipient. No changes to existing list/detail response shapes.

Return only the explicit whitelist for every response. Null inviter handles a missing User row without failing or leaking it; project deletion naturally removes its embedded invitations. Only the owner sees a newly created invite's email; an owner-authorized duplicate error is generic and does not expose a User record. Decline/revoke/removal return no private project detail.

## 2. Validation and authorization order

Use existing MEMBER_ROLES, MAX_PROJECT_SEATS (10), roleOf/can and findProjectForMember. Do not duplicate different permission rules. All external ids must be primitive 24-hex strings; check with mongoose.isValidObjectId before queries and canonicalize lowercase. Invalid project id is 404 Project not found. An invalid invitation id on an invite-recipient route is 404 Invitation not found without a project lookup.

Project-scoped owner/member routes: validate project id → scoped membership read → trusted role → permission check → validate target id/body → attempt write with authorization still in its filter. An outsider or missing project always gets 404 Project not found before body/target validation. An editor/viewer attempting owner operations gets 403 Only the project owner can do that before body errors or target lookups. For remove/self-leave, any valid member may proceed to compare their own target id; someone removing another member is 403 before target existence is revealed. Target invitation/member ids that are malformed or absent, after authorization, are 404 Invitation not found / Member not found.

Recipient routes are the intentional narrow exception to project membership: an invitee is not a member yet. Authorize the read/write by **one matching invitation element containing both that invite id and the caller's normalized email**, via $elemMatch, rather than fetching an arbitrary project or matching id and email in different elements. A user with another invitation in the same project cannot accept/decline this one. Wrong email, missing/revoked/consumed invite and missing project all return 404 Invitation not found, with no metadata. This invitation authority grants only offered metadata and accept/decline, not project GET, chat, canvas or sockets.

Email normalization: primitive string, trim outer whitespace, lowercase the entire address. Normalized address must be at most 254 characters and match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; reject ASCII control characters as well. This is a bounded product validator, not full RFC parsing or email verification. Preserve plus tags and dots; do not equate provider aliases. No coercion of arrays/objects/numbers/null and no request-supplied Mongo operator objects. Normalize req.user.email the same way. For list/create/accept/decline, an invalid trusted account email yields 400 Your account needs a valid email address (after owner authorization for create); the other endpoints require only account id.

Create body must be a non-null, non-array object with email and role. PATCH body must likewise contain role. Role is exactly editor or viewer, with no coercion, default or owner/admin value. Whitelist only those fields; ignore extra keys such as user, invitedBy, createdAt, _id, owner, members, invites and projectId. Missing/invalid email is 400 Email must be a valid address; missing/invalid role or nonobject PATCH is 400 Role must be editor or viewer. For a nonobject create body use the email error first. Ignore bodies on revoke/accept/decline/removal; they cannot choose identity, project or granted role.

## 3. Guarded writes and concurrency

Use single-Project-document atomic updates; no read-modify-save, no transaction dependency, no in-memory lock/queue as the authority, and no new version field. A read may determine validation and the transition, but the write must guard the state and authorization it relied on. Preserve unrelated project metadata and any concurrently written name/description; never replace the entire project document.

For this slice use a consistent **membership snapshot compare-and-swap**: retain the complete unpopulated members and invites arrays from the authorized read, and include exact array equality for both in the final mutation filter, together with project id and the required owner/member/invitation authority. Do not populate/mutate those arrays before building the snapshot guard. Protect equality semantics for BSON ObjectIds/dates and empty arrays under installed Mongoose casting; do not JSON-stringify snapshots into Mongo filters. Guard current owner as well where the transition used it. No updatedAt-only guard: timestamps can collide, and ordinary project metadata updates should not cause lost membership changes.

Keep actual changes narrow: create $push invites; revoke/decline $pull only the addressed invite; accept $pull that invite and $push the trusted member **in the same update**; role change $set only the addressed member role (positional/arrayFilters or a guarded replacement of members); remove $pull only the target member. Use returnDocument: after and runValidators: true where supported. Construct invite _id and trusted createdAt/addedAt server-side, independent of input. Never upsert a Project or User. Preserve createdAt on existing invites and addedAt when changing a role.

The exact snapshot guards serialize races for membership/invites without losing writes or making a new schema/protocol. Parallel requests on the same snapshot may yield one success and one safe conflict; they need not both succeed automatically. Do not silently retry a failed mutation. On a conditional miss, perform only a fresh **authorized scoped read** to classify it: no longer authorized → existing 404/403; addressed invite/member gone → its 404; a now-invalid semantic condition → its specific 400; otherwise 400 Project membership changed. Please try again. For accept/decline, re-read only by the same invitation id+email scope; a consumed/revoked invite is 404 even if the caller has become a member. No stale response may imply a successful write when no document matched.

Snapshot guards must cover all S26 membership mutators. Required races: two requests inviting the same canonical email; different invites competing for the tenth seat; accept versus accept; accept versus decline/revoke; accept of different invites; role change versus removal; create invite versus acceptance that changes members; unrelated metadata updates. Exactly one competing consume of an invite can succeed. A stale role update cannot recreate a removed member. An update with a stale snapshot cannot overwrite a newer array. For no-op PATCH of an already matching role, still use the guarded authorization/target check and return success only on a matched document; do not bypass permission checks or turn matched no-op into a false 404.

Tests must inspect/assert real filters and updates and exercise conditional matches; returning a preselected success regardless of the filter does not prove atomicity. The in-memory model fake is not a real MongoDB concurrency test; document that boundary honestly.

## 4. Endpoint behavior

### Create invitation

Authorize owner first, then normalize/validate fields. Reject:

- Caller's normalized email: 400 You cannot invite yourself.
- Canonical email of an existing member: 400 This person is already a member.
- Already pending canonical email in this project: 400 This email is already invited.
- `members.length + invites.length >= MAX_PROJECT_SEATS`: 400 A project can have at most 10 members and pending invites.

Check in the order above after field validation. Capacity includes every stored member and invite, excludes owner, and does not rely on populated users that might be missing. Invitations reserve a seat even if the recipient has not signed up. Never add a member directly at creation or create a User row. An email with no matching User is valid.

Existing User.email is case-sensitive storage populated by the webhook, so a lowercase exact User lookup alone can miss a mixed-case existing member. To check existing-member addresses, read only User rows whose _id is in this authorized project's stored member ids, select _id/email, normalize their emails in application code and compare. Owner-self uses trusted caller email. No unscoped email/user lookup, Clerk API call, regex supplied by the user, user directory, or User schema/webhook change. Snapshot guards protect the membership ids used by this check. A concurrent external User email change is not transactionally coupled to Project; matching uses the trusted/local email snapshot for that request, not a new email-identity service.

Build the invitation with generated id, canonical email, chosen role, invitedBy = me and server time; guarded $push, then shape the saved addressed invite. Return 201 only after successful persistence. Failure leaves no partial invite/member.

### Revoke invitation

Owner only; remove one addressed pending invite by id within that project. Missing target is 404 Invitation not found. It does not remove a member who already accepted, and a concurrent accept/revoke has only one winner. Do not broadcast, send mail, alter history, or delete the recipient.

### List my invitations

Normalize caller email; query Projects by stored invites.email using that exact normalized string, selecting only project _id/name and necessary invitation fields. Include only matching invitation elements, never another recipient's element from the same project. Populate inviter only with _id/fullName/img, or fetch those exact ids with that projection; no email/clerkId. Flatten into OfferedInvite rows, sorted newest first by invitation createdAt then invitation _id descending for ties. Return `{ invites: [] }` if none. No pagination/search/query filters or project-membership requirement in this slice. The array is for current pending offers only, not an audit history.

### Accept invitation

Read by the id+email invitation scope. Reject owner-self (400 Owner cannot join as a member) or an already-existing member id (400 You are already a member). Grant **the invitation's stored role**, never the body's. Enforce current total seats <=10: accepting swaps a reserved invitation for one member, so it must succeed when exactly ten seats are already reserved. Over-cap corrupted input yields the capacity 400, not a new member. No user-owned project cap applies to joining shared projects.

One guarded update removes only the matched invitation and appends `{ user: me, role: invite.role, addedAt: now }`, with current owner not me, current user absent from members, and that exact invitation element still present. The full arrays snapshot also protects its role/content. Return canonical projectId and granted role only. A second accept, stale tab, or request racing decline/revoke must not duplicate membership or recreate an invitation; missing matching offer becomes 404. Do not auto-join a Socket.IO room or grant a turn.

### Decline invitation

Read by the same id+email scope, then guarded $pull only that offer. Can decline regardless of body content and without access to project detail. Repeated/consumed/revoked offer returns 404 Invitation not found. No member mutation, delete, owner transfer, email or socket side effect.

### Change member role

Owner authorization precedes role validation/target errors. The target is a stored members.user, not an invitation id, embedded member id (member subdocs have no _id), Clerk id or email. Owner target is 400 Owner role cannot be changed. A nonmember target is 404 Member not found without a User-directory lookup. Patch only editor/viewer; preserve member user and addedAt, the owner and all other members/invites. Respond with `{ member: { userId, role } }` even for the same role, after guarded matching. No workspace:role event or turn revocation yet.

### Remove member / leave

Owner can remove a stored member; an editor/viewer can remove only themselves. An owner cannot remove/leave themselves: 400 Owner cannot leave the project. A non-owner asking to remove anyone else is 403 Only the project owner can do that. Missing target for an authorized owner is 404 Member not found. A repeat leave by someone no longer a member is 404 Project not found. Guard removal with owner:me for an owner removal, or membership including members.user:me for self-leave. Remove only that member; do not remove other invites by email, delete messages or canvas, or transfer/delete ownership. Return Member removed for owner action and Project left for self-leave. Existing messages remain; S27 owns broader lifecycle cleanup.

## 5. Route order, privacy and rollout boundary

Keep router.use(protectRoute). Register GET /invites/mine and both POST /invites/:inviteId actions before generic /:id routes. Add the project-scoped routes without changing existing project/chat handlers. Test the real router's static-path dispatch and authentication boundary; do not pass a manually recreated set of routes as the sole evidence for route order.

The membership exception to architecture invariant 2 is narrow and explicit: normal project reads/writes remain member/owner-scoped; invitation-recipient reads/writes are scoped in the database to the invitation email/id belonging to the trusted caller. Owner-specific writes still repeat owner authorization in the filter. No request can choose a different caller email/id. Admin role confers no project privilege.

**S26 does not make revocation/demotion live.** New REST requests see changed membership and commit/sync retain their existing rechecks, but already joined rooms, cached cursor/typing/turn permissions and broadcasts can remain stale until S27. Do not claim removal is immediately secure for an active workspace or deploy this as completed membership management without S27's enforcement. Do not fix that boundary here by touching sockets or adding no-op S27 callbacks. S28 still owns all UI for these routes.

## 6. Required coverage

Use node:test, installed Express/Mongoose and controlled model stubs. No new package, real MongoDB/Clerk/ImageKit or production database mutation. Pure helpers get direct tests. API coverage uses ephemeral loopback HTTP with production handlers and production router where routing/auth is under test; inject trusted test auth at the test boundary or isolate existing protectRoute with stubbed synced-user lookup, following installed Clerk request shape. Do not add a test auth escape hatch in production. Restore mocks, close listeners/sockets and finish the process without forced exit.

- Primitive/body/id/email/role validation: trim/case, plus tags, control characters, 254 boundary, malformed email, arrays/objects/null/operator payloads, extra fields ignored; strict ids including uppercase canonicalization; nonmutating helpers.
- Auth/access matrix across all seven routes: signed out, unsynced user, owner, editor, viewer, outsider, invited nonmember, wrong-email recipient, platform admin with no membership. Authorization-before-validation and 404 privacy for existing/missing projects. Owner cannot be demoted/removed/self-joined. No ownership transfer through any request field.
- Invite creation for nonexistent user; mixed-case caller and existing member email; duplicate canonical invitation; capacity 9→10 and rejection at10; stale snapshots and missing member User row. Owner GET retains invitedBy id/email and nonowner GET omits invites. List exposes only that user's own offers and minimal project/inviter projections, including ties and missing inviter.
- Same-element trap: one invite has the requested id but a different email; another has the caller's email. Neither accept nor decline may consume the wrong invite or reveal project metadata. Owner revoke cannot address an invite from a different project.
- Full mounted lifecycle: create → list mine → accept → shared project visibility → patch role → remove/self-leave, with existing GET/list reading updated membership and old messages/canvas preserved. Decline/revoke remove only the target and release a seat; repeat consumes return documented 404. Acceptance at10 seats swaps the reserved seat without exceeding10. Granted role comes from stored invite despite malicious body.
- Controlled races listed in section3: verify actual snapshot/authority/element guards and conditional failures; stage requests with deferred reads then let writes compete against current fake state, not independent hardcoded outcomes. Exactly one consumer wins; safe conflicts do not lose arrays or recreate targets. Include unrelated name change surviving membership mutation. Assert zero writes on rejected requests and zero extra User writes/lookups/directory exposure.
- Use the real Project schema/query casting to verify snapshot equality filters preserve ObjectIds, dates and empty arrays. Model stubs alone do not exercise casting; a no-I/O cast check is enough here. Existing model defaults/indexes are unchanged. Document that no live database race test is claimed.
- Router-level static /invites/mine dispatches to listing rather than /:id; every new route is behind protectRoute. Existing project/chat routes remain registered. Unexpected persistence errors reach the central handler and never return a false 2xx. No unhandled rejection/stranded HTTP server; no sockets emitted by new handlers.

## 7. Implementation and verification sequence

Implement (1) validators/helpers and unit tests, (2) scoped handlers/atomic filters, (3) real router wiring and HTTP/concurrency tests, (4) readme/context updates, then full verification. Preserve approved S25 and stop before S27.

Run server `npm test`, then every root suite in a separate command **sequentially** (Vite harnesses can collide on port24678):

```text
In server/: npm test
At root: node --test test/workspaceSync.test.mjs
At root: node --test test/canvasPreview.test.mjs
At root: node --test test/participants.test.mjs
At root: node --test test/cursorPresence.test.mjs
At root: node --test test/turnState.test.mjs
At root: node --test test/turnRobustness.test.mjs
At root: node --test test/projectChat.test.mjs
At root: node --test test/projectChatUi.test.mjs
At root: node --test test/canvasHistory.test.mjs
At root: node --test test/canvasShortcuts.test.mjs
At root: npm run build
At root: git diff --check
```

Last independent S25 baseline: 492 tests (233 server,259 client), build passed, existing chunk warning only. That is inherited evidence, not S26 verification; new server tests increase the total. Record counts/durations and investigate failures rather than altering existing assertions or dependencies.

Follow the workflow's API boot/health and /blog,/chat smoke checks when available. Any started process must be stopped. Local configuration may point to the live 3dfolio database: do not create invitations/members/projects or modify real data just to satisfy a checklist. Use loopback HTTP/model fakes for automated lifecycle coverage. If configured isolated test accounts/data are already available and authorized, manually run the REST invite→accept→change-role→remove cycle; otherwise explicitly record it as unverified. No Share UI or live socket enforcement is claimed; full shared-project browser QA remains with S27/S28 and launch QA. No temporary membership backdoor.

Update server/readme.md's structure tree, protected endpoint table, error table/examples and Project membership section in the same slice. Document the exact responses, invite privacy scope, normalization, reserved seats, snapshot conflicts and S27 rollout gap. Reconcile the planned architecture section to actual behavior. Update tracker/handoff with baseline, changed files, per-suite counts, build/diff evidence, manual checks or limitations, and deviations. Mark S26 Ready for review and stop for Codex. No commits/deployments or next-slice implementation.
