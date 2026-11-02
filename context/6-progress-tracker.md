# Progress Tracker

Update this file after every meaningful implementation change. It records the **actual** state of `/collaborate`, not the intended state.

## Current Phase

- Phase A: Server foundation (S01 committed; S02 and S03 approved, awaiting one combined commit)

## Current Goal

- Commit S02 + S03 together (user decision, 2026-11-01). Then S04 (client shell) and S06 (shared canvas ops) are unblocked and can run in parallel.

## Completed

- S01: Split socket handlers by feature (approved 2026-10-31, committed 2026-11-01 as `421a99a`).
- S02: Project + Canvas models, access helpers, test harness (approved 2026-11-01, not yet committed).
- S03: Project REST API (approved 2026-11-01, not yet committed; to be committed together with S02).

## In Progress

- None.

## Next Up

- S04 (client) and S06 (server, pure) in parallel, then S05 once S04 is done. Specs to be written by Claude. See `specs/00-build-plan.md`.

## Slice Status

Status values: `Todo` · `In progress` · `Ready for review` · `Changes requested` · `Approved` · `Committed`

| # | Slice | Lane | Depends on | Spec | Status | Implementer | Commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | Split socket handlers by feature | server | — | ✓ | Committed | Codex | `421a99a` |
| S02 | Project + Canvas models, access helpers, test harness | server | S01 | ✓ | Approved | Codex | |
| S03 | Project REST API | server | S02 | ✓ | Approved | Grok | |
| S04 | `/collaborate` route shell + session | client | — | | Todo | | |
| S05 | Projects dashboard | client | S03, S04 | | Todo | | |
| S06 | Shared canvas ops module | server | S02 | | Todo | | |
| S07 | Canvas foundation | client | S05, S06 | | Todo | | |
| S08 | Shape panel + drop | client | S07 | | Todo | | |
| S09 | Node rendering | client | S08 | | Todo | | |
| S10 | Move, resize, delete as ops | client | S09 | | Todo | | |
| S11 | Labels + colors | client | S10 | | Todo | | |
| S12 | Edges | client | S11 | | Todo | | |
| S13 | Workspace join / leave | both | S01, S06, S12 | | Todo | | |
| S14 | Commit handler | server | S13 | | Todo | | |
| S15 | Client sync wiring | client | S14 | | Todo | | |
| S16 | Drag / resize previews | both | S15 | | Todo | | |
| S17 | Participants | both | S13 | | Todo | | |
| S18 | Live cursors | both | S17 | | Todo | | |
| S19 | Turn state machine | server | — | | Todo | | |
| S20 | Turn events + enforcement | server | S14, S16, S19 | | Todo | | |
| S21 | Turn UI + read-only mode | client | S20 | | Todo | | |
| S22 | Turn robustness | client | S21 | | Todo | | |
| S23 | Project messages API + typing relay | server | S13 | | Todo | | |
| S24 | Chat panel | client | S23 | | Todo | | |
| S25 | Undo / redo for the turn holder | both | S22 | | Todo | | |
| S26 | Invites + members API | server | S03 | | Todo | | |
| S27 | Live membership enforcement + cleanup | server | S20, S26 | | Todo | | |
| S28 | Share dialog + invitations UI | client | S24, S27 | | Todo | | |
| S29 | Hardening pass | both | S28 | | Todo | | |
| S30 | Launch | client + docs | S29 | | Todo | | |

## Slice Notes

<!-- One block per slice, added by the implementer when it reaches Ready for review:

### S0X — <name>
**Implementer:** Grok | Codex
**Changed:** files and a one-line summary each
**Verified:** each "Verify when done" item, with how it was checked
**Deviations:** anything that differs from the spec and why (or "None")
**Review:** (Claude) findings, then "Approved — <date>"
-->

### S01 — Split socket handlers by feature

**Implementer:** Codex

**Changed:**

- `server/src/lib/safeHandler.js`: extracted the named wrapper unchanged; adjusted its explanatory comment for use by every feature module.
- `server/src/sockets/chat.socket.js`: moved the module-scoped presence map, typing relay, disconnect handler, and their comments. Its only import is `safeHandler`; `io` is supplied by the caller.
- `server/src/lib/socket.js`: retains server creation, CORS, handshake auth, per-user room join, and exactly `{ app, server, io }` exports; dispatches connections to `registerChatHandlers`.
- `server/readme.md`: updated the structure tree and documented per-feature handler registration. Event tables remain unchanged.

**Verified (2026-10-31):**

- PASS: `npm install --no-audit --no-fund` in `server/` installed dependencies without editing either package manifest.
- PASS: `node --check` on all three socket modules.
- PASS: one-off source comparisons against `git show HEAD:server/src/lib/socket.js` confirmed the moved chat body matches after indentation/line-ending normalization, the wrapper body is unchanged, and the handshake middleware is unchanged.
- PASS: checked that `socket.js` contains no `userSocketMap`, `typing`, or `getOnlineUsers`; `chat.socket.js` has no import of `lib/socket.js` and wraps both handlers through `safeHandler`; exports remain `{ app, server, io }`.
- PASS: imported the shared server and exercised a real local Socket.io connection on an ephemeral port without a token; it was refused with `Unauthorized`. Closed the client and server afterward. This checks the server boundary, not the signed-out browser flow.
- PASS: `git diff` confirmed `message.controller.js`, `index.js`, both package manifests, and all client source files are unchanged.
- PASS: root `npm run build` completed. Vite reported its large-chunk warning for existing frontend bundles; no collaborate code or dependencies were added.
- PASS: `git diff --check`; readme structure and registration sentence updated, event tables unchanged.
- BLOCKED: `npm run dev` was attempted in `server/`; nodemon launched the entry point, which exited with `MongoDB connection error: MONGO_URI is required`. No `server/.env` or required database/auth environment variables are present. Stopped nodemon afterward. A clean boot with `MongoDB connected` is not verified.
- PENDING: two-account browser DM delivery/chime/unread badge, typing, multiple-tab presence and last-tab offline behavior, media send (or expected 503), signed-out browser socket behavior, and `/blog` post loading. These require configured local services and synced Clerk accounts; source equivalence and the build do not establish end-to-end behavior.
- NOT APPLICABLE: `npm test`; S02 introduces the harness. No test files or scripts were added in S01.

**Deviations:** No implementation deviations. Runtime verification is incomplete because configuration and authenticated browser sessions are unavailable. Ready for code review, not approved or ready to proceed to S02. No commits, pushes, or branches created.

**Review (Claude):**

- Diff scope correct: only `server/src/lib/socket.js` and `server/readme.md` modified, plus the new `server/src/lib/safeHandler.js` and `server/src/sockets/chat.socket.js`. No client, controller, `index.js`, or manifest changes.
- Chat logic and comments moved verbatim. Connection order is preserved (user room join, then presence add, then broadcast). `chat.socket.js` imports only `safeHandler`, so there's no circular import. Exports are still `app, io, server`, and `message.controller.js` still loads.
- Behavior exercised with stub `io` and socket objects: multi-tab presence, typing relayed with a coerced boolean, `null` and `{}` payloads ignored, user stays online until the last tab closes. `node --check` passes on all three files, and `npm run build` passes.
- Optional nit, not required: the moved comment about every socket joining a room named for its user now lives in `chat.socket.js`, while the join is still in `lib/socket.js`.
- Carry-forward to S13: `safeHandler`'s comment says no handler uses an acknowledgement callback, which stops being true when the S13 acked events land. The S13 spec will update it.
- Runtime QA: the configured-server boot and the two-browser `/chat` checks were not run during this review. Approved at the user's request.

Approved — 2026-10-31

Committed — 2026-11-01 as `421a99a` ("57. Split the socket layer into per-feature handler modules…").

### S02 — Project and Canvas models, access helpers, test harness

**Implementer:** Codex

**Changed:**

- `server/src/models/project.model.js`: added ownership, member and invite subdocuments, defaults, validation, and the three specified indexes. Member subdocuments have no id; invites keep theirs.
- `server/src/models/canvas.model.js`: added the unique project reference, Mixed canvas arrays, version, optional editor, and timestamps.
- `server/src/lib/projectAccess.js`: added project limits, pure role resolution, the frozen permission table, and the membership-scoped lean lookup with invalid-id guards.
- `server/test/projectAccess.test.js`: added permission, role/ID representation, malformed input, nonmutation, invalid-id/no-query, and constant checks.
- `server/test/models.test.js`: added database-free schema validation, default, normalization, subdocument id, index, and enum consistency checks.
- `server/package.json`: added only `"test": "node --test"`; dependencies are unchanged.
- `server/readme.md`: updated the structure tree, Projects and Canvases collection documentation, and Available Scripts. API and Socket.io tables are unchanged.

**Verified (2026-11-01):**

- PASS: `cd server; npm test` ran both test files and exited on its own: 47 tests passed, 0 failed, 0 skipped. The table-driven `can` suite covers all 18 cells, unknown roles, and inherited names. Invalid-id tests stub `Project.findOne` to fail if called and confirm zero queries; no test connects to MongoDB.
- PASS: schema tests use the specified `validateSync()` API. Installed Mongoose emits deprecation warnings for that API; it still works. No dependency or third-party changes were made to suppress the warnings.
- PASS: `node --check` on all three new source files.
- PASS: imported all six models (User, Post, Comment, Message, Project, Canvas) together in one process; all compiled and the process exited successfully.
- PASS: inspected imports: `projectAccess.js` imports only Mongoose and Project; neither model imports the access module. `roleOf` and `can` read no clock and perform no I/O. Arguments are not mutated; tests also exercise hydrated and frozen lean inputs.
- PASS: root `npm run build` completed (4,210 modules, 48.91 seconds). Vite reported the existing large-chunk warning; no client files or collaborate client code changed.
- PASS: `git diff --check`, tracked diff/stat inspection, and untracked file inventory confirm changes are confined to the specified files. The S02 spec was already untracked and the tracker already modified at task start; those existing changes were preserved. The five implementation/test files are new and untracked, so ordinary `git diff --stat` omits them.
- PASS: documentation describes the prescribed fields, sub-shapes, indexes, owner exclusion, and shared canvas validation responsibility. No routes, controllers, sockets, webhook, existing models, environment files, or client files changed.
- BLOCKED: `cd server; npm run dev` launched nodemon and the entry point, then exited with `MongoDB connection error: MONGO_URI is required`. `server/.env` is absent. Stopped nodemon afterward; no environment file was created or edited. A clean database-connected boot is not verified.
- PENDING: `/blog` post loading and two-account `/chat` DM, typing, and presence regression checks require configured services and authenticated browser sessions. The passing build does not establish those runtime behaviors.
- PASS: reviewed applicable architecture invariants: membership is scoped inside the lookup, canvas content rules remain reserved for S06, and no transport or client boundary was changed. The new modules are deliberately not wired into the server yet, per the S02 spec.

**Deviations:** No implementation deviations. Runtime verification remains incomplete as recorded above. S02 is Ready for review, not approved. No commits, pushes, or branches created; no subsequent slice started.

**Review (Claude, 2026-11-01): Changes requested.**

Confirmed: the diff is confined to the specified files; 47/47 tests pass in under a second and exit cleanly; `node --check` passes on all three files; the root build passes; the models don't import `projectAccess.js`; membership is scoped inside the query; and invalid ids never reach `findProjectForMember`'s query (stubbed). The `can` table is exact, and `Object.hasOwn` blocks inherited names.

Fix these three. The first two came from defects in the spec, which has been corrected:

1. **`roleOf` fails open on non-id values** (`server/src/lib/projectAccess.js`, `idString`). Any value without a recognizable id falls through to `String(value)`, so unrelated values collide: `roleOf({ owner: {} }, {})` and `roleOf({ owner: new Date(0) }, new Date(0))` both return `"owner"` (reproduced). Unreachable today because ids come from the server, but an access check must fail closed. Implement the corrected normalization rule in the spec (string, ObjectId, or an object whose `_id` is a string or ObjectId; everything else → `null`), and add the new "non-id values never match" test cases from the spec.
2. **Deprecated `validateSync()`** (`server/test/models.test.js`). Mongoose 9 prints a deprecation warning on every call, which floods `npm test` output. Switch to `await doc.validate()` / `assert.rejects` per the corrected spec. `npm test` must print no Mongoose warnings. Confirmed `validate()` runs without a connection.
3. **Readme tree alignment** (`server/readme.md`, `test/` block). The two test-file comments start one column right of every other `#` in the tree. Align them.

Runtime checks (server boot, `/blog`, `/chat`) remain blocked on a missing `server/.env`. S02 adds no wiring, so they're regression checks only and don't block approval.

**Corrections (Codex, 2026-11-01): Ready for review.**

1. Changed only `idString` in `server/src/lib/projectAccess.js` to accept strings, ObjectIds, and populated objects with a string/ObjectId `_id`; other values return `null`. Added owner and member regression cases in `server/test/projectAccess.test.js` for plain objects, Dates, numbers, null ids, arrays, and numeric nested ids. Existing ObjectId, string, populated, and hydrated-document cases still pass.
2. Replaced all `validateSync()` calls in `server/test/models.test.js` with awaited `validate()` calls and `assert.rejects` checks of the expected validation error paths. Both test files run without a database connection and without Mongoose warnings.
3. Removed one padding space from each test-file entry in the `server/readme.md` tree so their comments align with the other entries.

**Reverification:** `cd server; npm test` passed all 48 tests (0 failures/skips) and exited cleanly with no warnings. `node --check` passed on all three S02 source files. Root `npm run build` passed (4,210 modules, 7.19 seconds), with only the existing large-chunk warning. `git diff --check` and tree-comment alignment checks passed. Only the three requested corrections and this slice-note/status update were made; models, dependencies, spec, and runtime wiring were not changed. The previously recorded missing-environment runtime checks remain blocked and were not repeated. No commits, pushes, branches, or subsequent slice work.

**Re-review (Claude, 2026-11-01):** All three findings fixed, nothing else changed.

1. Probed `roleOf` independently: `{}`/`{}`, equal `Date`s, `5`/`5`, `{ _id: null }`/`"null"`, `[]`/`[]`, and `{ _id: {} }` all return `null`, while ObjectId, string, and populated ids in every combination still resolve. The regression test covers both the owner and member paths.
2. No `validateSync` left. `npm test` prints zero warnings: 48/48 pass.
3. Readme `test/` comments are aligned with the rest of the tree.

Server boot, `/blog`, and `/chat` runtime checks are still blocked on `server/.env`. S02 wires nothing in, so this is accepted.

Approved — 2026-11-01

Post-approval (Claude, 2026-11-01): `server/.env` now present. `node src/index.js` boots with `Server is up and running on PORT: 3000` and `MongoDB connected: … / 3dfolio`, with no errors or warnings. `/blog` and `/chat` browser checks are still not run.

### S03 — Project REST API

**Implementer:** Grok

**Changed:**

- `server/src/lib/projectAccess.js`: added pure `parseProjectInput`. No other line in the file changed.
- `server/src/controllers/project.controller.js`: list, create, read, rename, and delete. Reads and writes stay inside membership-scoped queries. `invites` is included only for the owner.
- `server/src/routes/project.route.js`: `/api/projects` behind `protectRoute`.
- `server/src/index.js`: import plus `app.use("/api/projects", projectRoutes)` after `/api/messages` and before the error handler.
- `server/test/projectAccess.test.js`: `parseProjectInput` cases. Existing tests were not changed.
- `server/readme.md`: structure tree, Project Routes table, and the two response examples.

**Verified (2026-11-01):**

- PASS: `cd server; npm test` — 67 passed, 0 failed, 0 skipped, no warnings. The new `parseProjectInput` block is included. The previous 48 tests still pass.
- PASS: `node --check` on `projectAccess.js`, `project.controller.js`, `project.route.js`, `index.js`, and `projectAccess.test.js`.
- PASS: `npm run dev` printed `Server is up and running on PORT: 3000` and `MongoDB connected: … / 3dfolio`. No errors and no Mongoose warnings. During the first authenticated request Clerk printed its development-instance telemetry notice. That notice comes from `@clerk/express`, not from this slice.
- PASS: `curl.exe -i` with no token on `GET /api/projects`, `POST /api/projects`, and `GET /api/projects/not-an-id` each returned `401` `{"message":"Unauthorized"}`.
- PASS: two accounts already synced in MongoDB. Tokens came from the Clerk Backend API (`sessions.getToken`, creating a session only when no active one yielded a token) because no browser console was available. Both sessions created for the run were revoked. The user-document count was unchanged, and no user document was written.
  - `POST {}` → `201`, name `"Untitled project"`, description `""`, role `"owner"`, `memberCount` 1, owner is A, no `invites` key.
  - `POST` with an 81-character name → `400` `"Name must be 80 characters or fewer"`. The owned id list did not change.
  - `POST` with `owner`, `members`, `invites`, and `_id` → `201` owned by A, `memberCount` 1, `members: []`, `invites: []`.
  - `GET /` → both new projects are in `owned`, neither is in `shared`, newest first, and no item has `invites`.
  - `GET /:id` as the owner → `200`, `role: "owner"`, `invites: []`.
  - `PATCH` with a padded name → `200` and the stored name is trimmed. `PATCH {}` → `400` `"Nothing to update"`. `PATCH` with `name: 5` → `400` `"Name must be text"`. The stored name stayed trimmed.
  - B `GET`, `PATCH`, and `DELETE` on A's project → all `404` with body `{"message":"Project not found"}`. B `PATCH` `{ "name": 5 }` was also `404`, not a validation error.
  - `GET`, `PATCH`, and `DELETE` for `not-an-id`, `aaaaaaaaaaaa`, and a well-formed missing id → `404` each, never `500`.
  - B was added with a scratch `updateOne` as editor (not committed). `GET` → `200`, role `"editor"`, no `invites` key, and the member user has only `_id`, `fullName`, and `img`. `PATCH` and `DELETE` → `403` `"Only the project owner can do that"`. The project is in B's `shared` and not in `owned`. A `$pull` then made B's `GET` `404`.
  - A canvas was seeded with `Canvas.create`, then A `DELETE` → `200` `"Project deleted"`, `GET /:id` → `404`, and no canvas remained for that id.
  - Owned projects were scratch-seeded up to 20. The next `POST` → `400` `"You can own at most 20 projects"`. Those rows were deleted. A's owned count matches the pre-test count.
- PASS, with a data limit: `GET /api/posts?limit=5` returns `200` `{ posts: [], hasMore: false }`. The `posts` collection in `3dfolio` has 0 documents, so a populated blog page could not be shown. The posts route was not modified.
- PASS: `/chat` against the local server. Both sockets showed up in `getOnlineUsers`, a typing event reached B, and A's `POST /api/messages/send/:id` returned `201` with B receiving `newMessage` for that same text (also present on B's history `GET`). Closing A's socket removed A from B's presence list. The test message was then deleted. This used a Socket.io client, not the browser UI.
- PASS: root `npm run build` finished in 13.62s. Vite printed only its existing large-chunk warning. The output has no collaborate chunk, and no client file changed.
- PASS: `git diff --check` is clean. `server/src/index.js` differs by the import and the `/api/projects` mount only. `git status` also lists S02's still-uncommitted files (`server/package.json`, both models, `projectAccess.js`, `server/test/`, and the readme's S02 sections) and the already-untracked specs `context/specs/02-project-models-access.md` and `context/specs/03-project-rest-api.md`. No scratch script remains.
- PASS: readme tree comments stay on column 37. The Project Routes section, the 404/403 paragraph, and both examples are in place. Non-owners are documented as receiving no `invites` key.
- Invariants checked: membership is inside `findProjectForMember` and inside the update and delete filters (`owner` stays in those queries). A non-member gets `404`. `PATCH` and `DELETE` require `manage`. `POST` does not create a canvas. No socket event was added.

**Deviations:** No implementation deviations. Verification minted Clerk session tokens instead of reading `window.Clerk.session.getToken()`, and `/blog` could not display existing posts because that collection is empty. `/chat` was checked through the local socket and message API rather than the browser.

**Review:** (Claude)

**Review (Claude, 2026-11-01):** No findings.

- Scope: diffed against a snapshot of the approved S02 tree. All S02 files are byte-identical, except `projectAccess.js` and `projectAccess.test.js`, which only gained `parseProjectInput` and its tests (0 removed lines). `index.js` gained exactly the import and mount. No client files changed.
- Code: matches the spec. Access check before body validation; `owner: me` kept in the update and delete filters; `returnDocument: "after"`; `USER_FIELDS` on every populate; `invites` key only for the owner; stray owner-as-member excluded from `shared`.
- `npm test`: 67/67 pass, no warnings.
- Independent live-DB run (scratch script calling the controllers as two real users, all test data tagged and removed in `finally`): 35/35 checks passed. Coverage: defaults, the 81-character name, mass-assignment ignored, list order and no invites, owner and member detail shapes (no emails leaked), rename trimming, `Nothing to update` and blank-name 400s, identical non-member 404s on every verb, invalid and nonexistent ids (404, never 500), member 403s (including a bad body still 403), shared listing and `memberCount`, stray owner entry, delete with canvas cascade, and the 20-project cap. Cleanup: 20 projects removed, and A and B own 0 afterwards, as before.
- HTTP: the server booted cleanly against `3dfolio`. Without a session, all five project routes return `401 {"message":"Unauthorized"}`. `/api/posts` returns 200.
- Not re-run by Claude: root `npm run build` (no client changes; Grok reports pass) and the browser `/chat` check (Grok reports pass).

Approved — 2026-11-01

## Open Questions

- **Q1. What happens to `/chat`?** The user is fine with `/chat` going away, since `/collaborate` is meant to replace it (2026-11-01). Two directions are still open: (a) retire `/chat` entirely after launch, with project chat (S23–S24) as the only chat, or (b) move 1:1 DMs into `/collaborate` as post-launch slices, then retire the standalone `/chat` route. Either way, `/chat` stays untouched and working through S30 (goal 6, invariant 10). *Leaning: retire.* Needed before S30.
- **Q2. Which database do local test runs write to?** *Resolved 2026-11-01: the live database.* The user chose it, and `server/.env` holds the values Render uses. Slice verification must clean up its test data (projects, canvases, and later project messages) and never write `users` documents.
- **Q3. Lane assignment.** Which agent takes server-lane vs client-lane slices, and whether slices run in parallel (separate git worktrees) or strictly in sequence. *Default: sequential, S01 → S30.*

## Architecture Decisions

- 2026-10-31: No Liveblocks, no Trigger.dev, no AI. Socket.io and MongoDB on the existing Render server cover realtime and persistence, which keeps the stack to services already running and paid for.
- 2026-10-31: Turn-based editing. With one writer at a time there are no conflicting edits to merge, so a server-checked version number replaces a CRDT.
- 2026-10-31: MongoDB stays for this plan. A PostgreSQL migration would double the risk and isn't needed for turn coordination (MongoDB's atomic conditional updates suffice).
- 2026-10-31: Canvas op semantics live in one pure module (`server/src/shared/canvasOps.js`) that both the server and the client import, so validation and application can't drift between implementers.
- 2026-10-31: Turns belong to a tab (`userId` + `tabId`), not a user, so a second tab is read-only and a reconnecting tab keeps its turn through the grace period.
- 2026-10-31: Project chat uses a new `projectmessages` collection rather than extending `messages`, so 1:1 DMs are untouched whatever Q1 decides.
- 2026-10-31: Spec files are written just in time, one per slice, by Claude, from `specs/00-build-plan.md`, so each spec reflects the code as it actually is.

## Session Notes

- Outside `/collaborate`, not fixed: `clerk.webhook.js` passes `new: true` to `findOneAndUpdate`, which Mongoose 9 deprecates in favor of `returnDocument: "after"`. It still works, and it should print a warning when the webhook fires.
- Outside `/collaborate`, not fixed: `server/src/webhooks/clerk.webhook.js` imports `@clerk/backend/webhooks`, but `@clerk/backend` isn't declared in `server/package.json`. It resolves only as a transitive dependency of `@clerk/express`. Also, a file type multer rejects returns `500` instead of `400`, because the error carries no `status`.
- S01 installed `server/node_modules`. `server/.env` was added by the user on 2026-11-01 (live values, per Q2), and the server boots against the live `3dfolio` database.
- Render's free tier is kept awake by an external cron hitting `/health` every 10 minutes (see `server/readme.md`). Sockets still drop on deploys and restarts, which is what the S13 rejoin and S22 grace handling exist for.
- `/collaborate` stays dark-launched (URL only, no navbar link) until S30.
