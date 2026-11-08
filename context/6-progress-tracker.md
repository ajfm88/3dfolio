# Progress Tracker

Update this file after every meaningful implementation change. It records the **actual** state of `/collaborate`, not the intended state.

## Current Phase

- Phase D: Server-authoritative sync. S01–S11 are committed: S01 as `421a99a`, S02 + S03 as `06716fa`, S04 + S05 as `7ad4bbb`, S06 + S07 as `a7e9d6d`, S08 + S09 as `7fb9533`, S10 + S11 as `050c1a8`. S12 and S13 are approved and uncommitted.

## Current Goal

- S13 (workspace join / leave) approved by Codex on 2026-11-06 after rechecking both cleanup fixes. S12 stays Approved. Both are uncommitted. Today's work stops here; no S14 planning or implementation.

## Completed

- S01: Split socket handlers by feature (approved 2026-10-31, committed 2026-11-01 as `421a99a`).
- S02: Project + Canvas models, access helpers, test harness (approved 2026-11-01, committed 2026-11-01 as `06716fa`, together with S03).
- S03: Project REST API (approved 2026-11-01, committed 2026-11-01 as `06716fa`, together with S02).
- S04: `/collaborate` route shell + session (approved 2026-11-02, committed 2026-11-02 as `7ad4bbb`, together with S05).
- S05: Projects dashboard (approved 2026-11-02, committed 2026-11-02 as `7ad4bbb`, together with S04).
- S06: Shared canvas ops module (approved 2026-11-03, committed 2026-11-04 as `a7e9d6d`, together with S07).
- S07: Canvas foundation (approved 2026-11-03, committed 2026-11-04 as `a7e9d6d`, together with S06).
- S08: Shape panel + drop (approved 2026-11-04, committed as `7fb9533`, together with S09).
- S09: Node rendering (approved 2026-11-04, committed as `7fb9533`, together with S08).
- S10: Move, resize, delete as ops (approved 2026-11-05 by Codex, committed together with S11 as `050c1a8`).
- S11: Labels and colors (approved 2026-11-05 by Codex, committed together with S10 as `050c1a8`).
- S12: Edges (approved 2026-11-06 by Codex, uncommitted).
- S13: Workspace join / leave (approved 2026-11-06 by Codex after cleanup corrections, uncommitted).

## In Progress

- None. HEAD remains `050c1a8`; S12 and S13 are approved in the working tree.

## Next Up

- The user handles commits for S12 and S13. Stop for today. S14 remains unstarted and unspecced; no further planning or implementation in this session.

## Slice Status

Status values: `Todo` · `In progress` · `Ready for review` · `Changes requested` · `Approved` · `Committed`

| # | Slice | Lane | Depends on | Spec | Status | Implementer | Commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | Split socket handlers by feature | server | — | ✓ | Committed | Codex | `421a99a` |
| S02 | Project + Canvas models, access helpers, test harness | server | S01 | ✓ | Committed | Codex | `06716fa` |
| S03 | Project REST API | server | S02 | ✓ | Committed | Grok | `06716fa` |
| S04 | `/collaborate` route shell + session | client | — | ✓ | Committed | Codex | `7ad4bbb` |
| S05 | Projects dashboard | client | S03, S04 | ✓ | Committed | Codex | `7ad4bbb` |
| S06 | Shared canvas ops module | server | S02 | ✓ | Committed | Grok | `a7e9d6d` |
| S07 | Canvas foundation | client | S05, S06 | ✓ | Committed | Grok | `a7e9d6d` |
| S08 | Shape panel + drop | client | S07 | ✓ | Committed | Codex | `7fb9533` |
| S09 | Node rendering | client | S08 | ✓ | Committed | Codex | `7fb9533` |
| S10 | Move, resize, delete as ops | client | S09 | ✓ | Committed | Grok | `050c1a8` |
| S11 | Labels + colors | client | S10 | ✓ | Committed | Grok | `050c1a8` |
| S12 | Edges | client | S11 | ✓ | Approved | Grok | |
| S13 | Workspace join / leave | both | S01, S06, S12 | ✓ | Approved | Grok | |
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

Committed — 2026-11-01 as `06716fa` ("58. Add the /collaborate server foundation…"), together with S03.

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

Committed — 2026-11-01 as `06716fa`, together with S02.

### S04 — `/collaborate` route shell and session

**Implementer:** Codex

**Changed:**

- `src/App.jsx`: added only the lazy Collaborate import and `/collaborate/*` route through the existing feature boundary.
- `src/pages/Collaborate.jsx`: scoped Clerk and toast providers, loader, signed-out gate, retryable session error card, nested placeholder routes, and socket cleanup when leaving the route.
- `src/collaborate/collaborate.css`: all 17 prescribed tokens, scoped dark theme, and reduced-motion-compatible logo animation.
- `src/collaborate/lib/axios.js`: independent API client with Clerk Bearer interceptor.
- `src/collaborate/store/useSessionStore.js`: guarded session requests, one socket including while connecting, fresh tokens on reconnect, connection status, and unconditional listener/socket cleanup.
- `src/collaborate/routes/{CollaborateAuthGate,ProjectsPage,WorkspacePage}.jsx`: modal sign-in gate that preserves deep links and the two specified placeholders. No project API, canvas, or workspace events added.

**Verified (2026-11-02):**

- PASS: baseline `npm run build`, before implementation, produced entry `dist/assets/index-8qGLiKNx.js`, **576,888 bytes** (576.89 kB, gzip 180.72 kB). Final build produced `dist/assets/index-Chza-XZ2.js`, **577,550 bytes** (577.55 kB, gzip 180.91 kB): **+662 bytes**. Both builds report only the existing large-chunk warning.
- PASS: separate `Collaborate-DdpOpePv.js` (6,186 bytes) and `Collaborate-uT-ov48Z.css` (820 bytes). A source assertion confirms the entry contains neither `collab-root`, the collaborate socket error string, nor `/auth/check`. Collaborate code stays behind the lazy import; Rollup shares existing auth/socket libraries across lazy feature chunks.
- PASS: automated assertions confirm all 17 CSS token names and values exactly match `3-ui-context.md`, no chat/blog imports in the new code, no raw hex in JSX, and no new dependencies. `node --check` passes for both new plain-JS modules; `git diff --check` passes.
- PASS: `cd server; npm test` passes all 67 unchanged tests with no failures, skips, or warnings.
- PASS: local `npm run dev` in `server/` boots on port 3000 and connects to the existing `3dfolio` MongoDB database. `/health` and `/api/posts` return HTTP 200. No application data was written for S04 verification.
- PASS: frontend dev server starts with `VITE_API_URL=http://localhost:3000/api` supplied only through its process environment. No environment files were edited.
- PASS WITH CONTROLLED SERVICES: headless Chromium exercised the real route components and zustand store under the existing React StrictMode, substituting Clerk, `/auth/check`, and Socket.io at browser request boundaries. Checked signed-out deep-link gate with no socket; transition to the same workspace id on sign-in; dashboard name; exactly one socket; connected/disconnected status; a fresh token for each auth callback; wildcard redirect; in-app navigation away removing listeners and disconnecting; verification failure and Try again recovery; and sign-out returning to the gate and closing the socket. No browser page errors occurred in the successful controlled run. This does not establish a real Clerk modal or HTTP 101 handshake.
- PASS WITH CONTROLLED SERVICES: deferred real-store requests prove a late success after sign-out or route cleanup cannot reconnect; overlapping checks with a newer success and older failure preserve the newer user and completion state; calling connect again while a socket is still connecting reuses it; disconnect cleans up that connecting socket. The temporary browser harness is outside the repository and adds no dependencies or test files to the slice.
- PENDING: real signed-out Clerk gate, modal deep-link sign-in, one HTTP 101 WebSocket under dev StrictMode, server stop/restart reconnect, real sign-out, and real stopped-server/retry checks. The frontend has no `.env` and no `VITE_CLERK_PUBLISHABLE_KEY`; without that key the new route correctly reaches the existing feature error boundary. These cannot be claimed from the controlled checks.
- PENDING: browser `/blog` post loading and two-account `/chat` DM/typing/presence regressions require the frontend Clerk configuration and authenticated sessions. The public posts endpoint returns 200; that and the passing build do not establish browser behavior. Existing chat/blog source and all server source remain unchanged.
- PASS: implementation files are confined to the spec's Design list plus this tracker. The S04 spec and tracker edits were already present at task start. A concurrent edit to `context/1-project-overview.md` and Q1/Q5 notes was observed during the slice and preserved; it was not made by this implementation. No commit, push, branch, or next slice.

**Deviations:** `disconnectSocket()` also invalidates pending auth requests. The specified unmount cleanup calls only this action; without invalidation, a pending `/auth/check` could reopen the socket after route exit. The guard applies to success, catch, and finally so superseded failures cannot erase a newer session or end its loading state. No product scope or architecture changes. Real integration verification remains pending as recorded above.

**Review (Claude, 2026-11-02): Changes requested.**

Confirmed:
- The diff is confined to the Design list. `App.jsx` gains exactly the lazy import and the route.
- There are no chat or blog imports, no raw hex in the JSX, and all 17 tokens match `3-ui-context.md`.
- `npm run build` passes, with the entry at 577.55 kB (+662 B) and a separate `Collaborate-*.js` (6.19 kB) and `Collaborate-*.css`. `grep` finds no `collab-root` or collaborate socket code in the entry chunk.
- `npm test` passes 67/67.
- Real Clerk, signed out: local server and Vite with the publishable key and `CLIENT_URL` passed as process environment variables, no files written. `/collaborate/abc123` shows the gate, the URL is unchanged, and no request reaches the API or the socket.
- Codex's deviation is accepted: `disconnectSocket()` invalidating pending checks closes a gap in the spec.

Fix this one. It comes from a gap in the spec, which has been corrected:

1. **Stale session on re-entry** (`useSessionStore.js`, `Collaborate.jsx`). Leaving `/collaborate` closes the socket but leaves `authUser` set and `isCheckingAuth: false`. Coming back renders `ProjectsPage` with the stale session for a frame, then the loader once `checkAuth` starts, then the page again. From S05 on, that would mount the dashboard twice and fetch projects twice. Add a `resetSession()` action: increment `authRequest`, close the socket the same way `disconnectSocket` does, and set `authUser: null, isCheckingAuth: true`. Call `resetSession()` from the unmount effect instead of `disconnectSocket()`. Leave `clearAuth` unchanged. Re-entry must go straight from the loader to the page.

Notes, not findings:
- Tailwind's `content` glob covers `src/**`, so collaborate's arbitrary-value utilities land in the global `index-*.css`, which grew from 55.4 kB to 56.9 kB. Chat already works this way, and changing it would mean editing the protected `tailwind.config.cjs`. Accepted.
- Carry-forward to S22: when the handshake middleware rejects the socket, Socket.io doesn't retry (`socket.active` is false), so the placeholder would show `connecting…` indefinitely. The ConnectionBanner should handle a denied connection. The fresh-token `auth` callback makes this rare.

Still pending, needs a signed-in browser: modal deep-link sign-in, a single `101` WebSocket under StrictMode, stop/restart reconnect, navigating away closing the socket, sign-out, the stopped-server error card and retry, and the `/blog` and `/chat` regressions. Frontend `.env` is still missing, so for local runs pass `VITE_CLERK_PUBLISHABLE_KEY` (the dev instance's `pk_test` key, the same value as `CLERK_PUBLISHABLE_KEY` in `server/.env`) and `VITE_API_URL` on the command line. Start the server with `CLIENT_URL=http://localhost:5173`, because `server/.env` lists only the production origins and CORS would otherwise block `/auth/check` and the socket.

**Corrections (Codex, 2026-11-02): Ready for review.**

- Added `resetSession()` in `useSessionStore.js`: invalidates pending auth requests, delegates listener/socket cleanup to `disconnectSocket()`, and sets `authUser: null, isCheckingAuth: true`. `clearAuth()` is unchanged.
- Changed only the route's unmount effect and its explanatory comment in `Collaborate.jsx` to use `resetSession()`. Returning to the route now starts from the loader with no previous session available to mount the dashboard.
- PASS: a one-off harness exercised the actual store actions with deferred auth and a connecting socket. Reset removes listeners and closes the socket, clears the previous user, and leaves checking true; a pending response cannot restore the old session or clear that loader; a fresh check then loads the new user; `clearAuth()` still ends in the signed-out state with checking false. No permanent test files or dependencies added.
- PASS: root `npm run build` (7.62 seconds) and all 67 server tests, with no test warnings. The build retains only its existing large-chunk warning. Entry `index-CieJ6W9K.js` remains 577,550 bytes (+662 bytes versus the original baseline); Collaborate remains a separate JS/CSS chunk. `node --check` on the store and `git diff --check` pass.
- Scope: this correction touches only the two requested source files and this tracker; all earlier implementation and concurrent documentation edits are preserved. No servers started, environment files changed, commits, pushes, branches, or next-slice work.
- Real signed-out checks passed in Claude's review above. The remaining signed-in browser checks are still pending the user's sign-in and re-review; the store harness does not claim those results.

**Re-review (Claude, 2026-11-02):** The finding is fixed and nothing else changed. `resetSession()` is called only from the unmount effect, and `clearAuth()` is untouched. Its own `authRequest++` repeats the one in `disconnectSocket()`; that's harmless. `npm test` passes 67/67.

Signed-in browser checks, with real Clerk (dev instance) and the local server against the live `3dfolio` database. Both were started with process environment only, and no files were written.
- PASS: signing in through the modal from `/collaborate/abc123` lands on the `abc123` workspace placeholder.
- PASS: loading the dashboard makes one `/auth/check` (200) and one Socket.io handshake (one `sid`), and shows `Signed in as A.J. Foucault` with `Live connection: connected`.
- PASS: `/collaborate/does/not/exist` redirects to `/collaborate`.
- PASS: stopping the server shows `connecting…`. Restarting it reconnects to `connected` without a reload, so the reconnect's fresh token was accepted.
- PASS: in-app navigation to `/` calls `WebSocket.close` once. Returning to `/collaborate` goes loader → page, with no stale page frame.
- PASS: with the server stopped, a fresh load shows the toast `Failed to verify your session` and the error card. After a restart, **Try again** reaches `connected`.
- PASS: after signing out, `/collaborate` shows the gate and makes no request to the API or socket. Clerk's `signOut()` does a full navigation to `/`, so the socket closes with the page. The in-place path (session lost without a navigation, then `clearAuth`) was observed earlier in this review, when the dev session ended between checks: the gate rendered on reload.
- PASS: `/chat` loads, `/auth/check`, users, and conversations all return 200, and its socket connects. No DM was sent, because there was only one signed-in account and it would have messaged a real user.
- PASS: `/blog` renders with no console errors and shows `No posts yet`, because the `posts` collection is empty.
- Not run: the two-account `/chat` DM, typing, and presence round trip. No chat or server code changed in S04.

Approved — 2026-11-02

Committed — 2026-11-02 as `7ad4bbb`, together with S05.

### S05 — Projects dashboard

**Implementer:** Codex

**Changed:**

- `src/collaborate/lib/projectLimits.js`: browser-safe mirrors of the three existing server project limits; no server imports.
- `src/collaborate/store/useProjectsStore.js`: initial load/reset, guarded latest-wins list requests, non-destructive refreshes, create/update/delete actions, server error toasts, and refresh after a stale-project 404.
- `src/collaborate/routes/ProjectsPage.jsx`: dashboard header with Clerk UserButton and portfolio link, owned/shared sections and counts, loading/retry/empty states, cap warning, and dialog actions. Create opens the workspace; edit/delete refresh and toast. A local first-load flag hides the persistent store's old lists before the mount effect resets them, preventing the same first-frame leak found in S04.
- `src/collaborate/components/projects/ProjectCard.jsx`: stretched card link with valid HTML, owner-only action buttons above the link, description fallback, role badge, access count, relative time, and shared owner attribution.
- `src/collaborate/components/projects/ProjectDialogs.jsx`: create/edit/delete dialogs, trimmed input, only changed edit fields, limits/counters, disabled controls and spinner during submission, preserved input after failure, and safe delete focus on Cancel.
- `src/collaborate/components/ui/Dialog.jsx`: body portal, labelled dialog, focus capture/trap/restoration, Escape and scrim dismissal, and body scroll locking/restoration. Submission moves focus to the panel while controls are disabled; focus cannot move behind the modal. Scrim dismissal requires the gesture to start and end on the scrim.
- `src/collaborate/collaborate.css`: unchanged 17 tokens, color, and color scheme shared by `.collab-root` and `.collab-portal`; page-only background and other rules remain on `.collab-root`.

**Verified (2026-11-02):**

- PASS: final root `npm run build` (17.48 seconds), with only the existing large-chunk warning. Entry `dist/assets/index-TYg5eSnN.js` is **577,687 bytes**, **+137 bytes** versus S04's 577,550 bytes. Collaborate remains its own JS chunk (`Collaborate-C0VRvpu0.js`, 19,905 bytes) and CSS chunk (`Collaborate-D0kg0Qda.css`, 848 bytes). No dashboard store code or `collab-portal` is in the entry chunk. The shared Tailwind CSS gains the dashboard utilities, following the accepted S04 setup.
- PASS: `cd server; npm test`: all 67 unchanged tests pass, no failures/skips or warnings. `node --check` passes for the new store and limits module. `git diff --check` passes.
- PASS: actual store actions exercised in a one-off harness with deferred API requests: reset removes previous-user lists; latest-wins guards ignore stale success, error, and finally paths; refresh failure preserves lists; create returns without awaiting refresh; update awaits refresh; a delete 404 toasts Project not found, refreshes away the stale card, and returns false; fallback messages and initial load error state work. No permanent test files/dependencies added.
- PASS WITH CONTROLLED SERVICES: headless Chromium exercises the real components and stores under dev StrictMode, with Clerk, Socket.io, and API responses replaced at browser request boundaries. Both empty states and create buttons work. Blank-name create sends blank values, navigates to the returned workspace id, and returns to an Untitled project owner card. Named create trims both fields and lists newest first. Input maxLength and counters enforce 80/500. Enter in Name submits. Edit is prefilled, unchanged/blank names disable Save, and description-only edits send only the trimmed description. Edit/delete display the required success toasts; delete removes the card. Action buttons open dialogs without navigating.
- PASS WITH CONTROLLED SERVICES: request failure keeps dialog input and re-enables controls; all controls, Escape, and scrim dismissal are disabled while submitting, and Tab remains trapped even when every input/button is disabled. A 404 refresh removes the stale card and closes the dialog. Initial list failure shows the retry panel and Try again recovers. Twenty mocked owned projects disable New project and show the warning. Shared viewer cards show owner attribution and no action buttons; keyboard Enter opens the workspace.
- PASS WITH CONTROLLED SERVICES: portal panel/text computed colors match the theme; initial focus, Tab/Shift+Tab wrapping, Escape/scrim dismissal, focus restoration to the opener, and body overflow restoration pass. A controlled sign-out/account-switch cycle uses a MutationObserver to confirm previous-account cards are never inserted into the DOM. Mobile dashboard/dialog fit a 390px viewport; screenshots were visually inspected. Successful controlled browser checks finish without page errors.
- PASS: source assertions verify the 17 token values are unchanged, no raw hex in new JSX, no chat/blog/framer-motion imports, no API/socket imports in components, and no dependency changes. S04's route root, workspace placeholder, session store, and axios module were left untouched. Implementation changes stay inside the S05 Design list plus this tracker; previously uncommitted S04/spec/context changes are preserved.
- PASS: local server starts on port 3000 and connects to the live `3dfolio` database with `CLIENT_URL=http://localhost:5173` supplied through process environment. `/health` and `/api/posts` return 200. No application data was created, seeded, edited, or deleted; every project/cap/shared fixture above exists only in the controlled browser harness. No cleanup of database test data is required.
- PENDING REAL ACCOUNTS A/B: all signed-in REST/browser acceptance checks, real create/edit/delete persistence and ordering after reload, stopped-server mutation failure, stale-project deletion from a second tab, seeding/cleaning 20 live projects, B's viewer membership and removal, actual Clerk UserButton account switching, and portfolio navigation/socket closure. The controlled checks do not establish those live integrations. As agreed, the user and Claude will perform these during review with the accounts signed in.
- PENDING REGRESSION: live `/blog` rendering and `/chat` authentication/connection checks for this slice. S04's approved review records those working; their sources and all server code are unchanged. A 200 public posts API response is not a browser regression check.

**Deviations:** No product/API/dependency/scope changes. The page adds a local initial-load guard to satisfy the no-stale-project-render requirement before the specified mount-effect store reset runs. Dialog focus also covers the all-controls-disabled submission state. Real browser/service verification remains pending as listed above. Temporary harnesses and screenshots are outside the repo. Stopped the server and temporary frontend started for verification; the already-running frontend on 5173 was left alone. No environment files changed, commits, pushes, branches, or subsequent slice work.

**Review (Claude, 2026-11-02): No blocking findings.**

Code:
- Matches the spec. The diff is confined to the Design list plus this tracker, alongside S04's uncommitted files.
- No raw hex, no chat/blog/framer-motion imports, and components don't touch axios or the socket.
- Both of Codex's deviations are accepted:
  - the `hasRequested` initial-load guard, which closes the gap before the mount effect resets the store
  - focus held on the dialog panel while every control is disabled

Build and tests:
- `npm run build` passes. The entry is 577.69 kB, +140 B over S04, from Vite's preload map for a new 1 kB shared chunk (`timeago.js` is now used by both Blog and Collaborate). `Collaborate-*.js` is 19.9 kB.
- `npm test` passes 67/67.

Real browser checks:
- Setup: user A signed in, dev Clerk, local server against the live `3dfolio` database, and Vite on port 5174, because 5173 belonged to an unrelated project. Everything ran with process environment only.
- PASS: both empty states render at 0/0. **New project** works from the empty state and from the header.
- PASS: dialog:
  - its colors resolve outside `.collab-root` (panel `rgb(23, 18, 58)`, text `rgb(236, 233, 251)`), so `.collab-portal` works
  - the name field is autofocused, and body scroll is locked, then restored
  - Tab ×4 wraps to the first field, and Shift+Tab wraps to the last
  - Escape and a backdrop click close it, and focus returns to whichever **New project** button opened it
- PASS: create:
  - with a blank name → lands on `/collaborate/<new id>`. The card reads `Untitled project · Owner · 1 · updated 12 seconds ago`.
  - with a name and description → lands on the new id. The card shows both and is listed first.
  - the counters read `19/80` and `44/500`, and `maxLength` is 80/500.
- PASS: edit:
  - prefilled, and **Save changes** stays disabled until something changes; a name of only spaces keeps it disabled
  - changing only the description sends `PATCH {"description":"Edited description"}`, then a refresh `GET`
  - the card moves to the top, and the `Project updated` toast appears
  - the edit button doesn't navigate
- PASS: stale project: deleted in the database behind the UI, then edited → `PATCH` 404, the `Project not found` toast, the dialog closes, and the card disappears.
- PASS: server stopped, then create → the `Failed to create the project` toast, the dialog stays open with the name kept, and every control is re-enabled.
- PASS: delete:
  - **Cancel** is autofocused, and the copy names the project
  - **Delete project** → the toast, the card is gone, and it's still gone after a reload
- PASS: navigation:
  - a click on the card body (not the name) opens the project
  - focusing the card link and pressing Enter opens it
  - the Tab order runs `Back to portfolio → New project → user menu → card → Edit → Delete`
  - **Back to portfolio** goes to `/` and closes the WebSocket once
- Cleanup: both review projects are gone, with no canvases or tagged rows left. A owns 0 and has 0 shared, the same as before the review.
- Not run in a browser:
  - the **Shared with me** card (viewer badge, `by <owner>`, no action buttons) and the 20-project cap: the permission system blocked seeding a project owned by another real account and 20 projects on A. The user chose to approve with these noted. Both are single conditionals in `ProjectCard` and `ProjectsPage` that Codex exercised with controlled data. S28 exercises shared projects end to end with two accounts.
  - the account switch: the `loadProjects` reset and the `hasRequested` guard are verified by reading the code. A second account wasn't available.
  - `/blog` and `/chat`: unchanged by this slice, and checked in S04's review.

Nit, not required: after a failed submit, focus stays on the dialog panel, not on the first field. The controls are re-enabled, but a keyboard user has to Tab back in. It can be picked up in the S29 accessibility pass.

Approved — 2026-11-02

Committed — 2026-11-02 as `7ad4bbb`, together with S04.

### S06 — Shared canvas ops module

**Implementer:** Grok

**Changed:**

- `server/src/shared/canvasOps.js`: pure canvas constants, sanitizers, `applyOps`, and `normalizeCanvas`. No imports. Ids use `globalThis.crypto.randomUUID()`.
- `server/test/canvasOps.test.js`: constants, ids, sanitizers, atomic batches, limits, frozen inputs, `__proto__` ids, and `normalizeCanvas`.
- `server/readme.md`: structure tree only. `shared/canvasOps.js` and `test/canvasOps.test.js` were added. API and Socket.io tables were not changed.

**Verified (2026-11-03):**

- PASS: `cd server; npm test` — 104 passed, 0 failed, 0 skipped, no warnings. The previous 67 tests still pass, and `canvasOps.test.js` is included.
- PASS: `node --check server/src/shared/canvasOps.js`. A source test strips comments and asserts there is no import statement and no `require(` call. `grep` over the file finds neither.
- PASS: the constants test asserts the export list matches the spec and that nothing else is exported (`invertOps` is not present).
- PASS: atomicity is a test. Five valid ops plus one duplicate `node.add` in the middle return `ok: false`, `index: 2`, no canvas, and a snapshot of the input is unchanged.
- PASS: deep-freeze tests. A frozen canvas and frozen ops do not throw, match the unfrozen result, and mutating the result does not change the input.
- PASS: `node --input-type=module -e` imported the module outside the test runner and ran one `node.add`. It returned `ok`, type `shape`, and the neutral default color. `version` was not copied onto the result.
- PASS: root `npm run build` (41.83s, 4222 modules). Vite printed only its existing large-chunk warning. The entry chunk is still `index-TYg5eSnN.js` at 577.69 kB, the same as the S05 build. `dist/` does not contain the string `Too many changes at once`, so this module is not in the client bundle.
- PASS: `cd server; npm run dev` printed `Server is up and running on PORT: 3000` and `MongoDB connected: … / 3dfolio`, with no errors or warnings. `GET /health` returned 200. `GET /api/posts?limit=5` returned 200 `{ posts: [], hasMore: false }` (the posts collection is empty). `GET /api/messages/users` and `GET /api/projects` with no token each returned 401 `{"message":"Unauthorized"}`. No application data was written. The dev server was stopped afterward.
- PASS: `git diff --check` is clean. Readme `#` comments stay on column 39. The readme diff is the two tree entries only.
- Node: local `node -v` is v24.19.0, so `globalThis.crypto.randomUUID()` works. Neither `package.json` pins `engines`, and there is no `.nvmrc` or `render.yaml`. This session has no Render CLI config and could not open the service's build log or Node setting. No shim was added. If that setting is below 19, this needs an open question before S07 bundles the file.

**Deviations:** No implementation deviations. `/blog` and `/chat` were not re-checked in a browser. This slice adds a module the server does not import, and no blog or chat file changed. The posts route returns 200 and the message route still requires a session.

Concurrent documentation that this slice did not write was left as it stood: `context/1-project-overview.md`, `context/specs/00-build-plan.md`, the untracked spec `context/specs/06-canvas-ops-module.md`, and the Q1/Q5 tracker wording. No commit, push, branch, or S07 work.

**Review (Claude):**

- Diff scope correct: the new module and test file, two readme tree lines, and the tracker. No client, route, socket, model, or manifest changes.
- Every export in the spec exists and nothing else is exported. Zero imports. Rules match the spec: field-by-field rebuild, uppercase colors, handles default to `null`, `type` forced, unknown patch keys dropped at every level, `"Nothing to change"` for empty patches, partial `position` rejected, cascade on `node.remove`, batch checks with `index: -1`, all-or-nothing application, `Map`/`Set` lookups.
- Probed by hand outside the tests: normalized ops are whitelisted (rogue patch keys gone, color uppercased), ops and the returned canvas share no references, a `null` label patch and a string width are rejected, `normalizeCanvas` drops an edge whose endpoint node was dropped and keeps a self-loop, and the frozen `ID_PATTERN` can be `.test`ed repeatedly.
- Re-ran `cd server && npm test` (104 pass) and root `npm run build` (pass, existing large-chunk warning only).
- Design note, not a finding: `applyOps` copies the incoming canvas without re-validating it, and silently skips structurally broken entries. That's correct because the canvas it receives is always the output of `normalizeCanvas` (server load) or of a previous `applyOps`. S13 must keep that true: normalize on load, before the room caches the canvas.
- Nit, not required: the readme tree puts `shared/` between `lib/` and `middleware/`, not in alphabetical order.
- Open before S07: Render's Node version isn't confirmed. The user checks it (19+ needed for global `crypto.randomUUID`).

Approved — 2026-11-03

Committed — 2026-11-04 as `a7e9d6d` ("60. Add the shared canvas ops module and the workspace canvas foundation…"), together with S07.

### S07 — Canvas foundation

**Implementer:** Grok

**Changed:**

- `package.json`: `@xyflow/react` `^12.12.1`. No other dependency was added. `package-lock.json` is gitignored, so it is not in `git diff`. npm wrote `@xyflow/react` 12.12.1, `@xyflow/system` 0.0.84 (that package depends on `@types/d3-drag`, `@types/d3-interpolate`, `@types/d3-selection`, `@types/d3-transition`, and `@types/d3-zoom`), `classcat`, and a nested `zustand` 4.5.7. Optional peer ranges for `@types/react` and `@types/react-dom` are recorded on `@xyflow/react` and the nested zustand. They were not added to `package.json`. `@types/react` and `@types/react-dom` `^19.0.0` were already devDependencies.
- `vite.config.js`: `@shared` alias to `server/src/shared`, plus the comment that the import only goes client to server.
- `src/pages/Collaborate.jsx`: `WorkspacePage` is `React.lazy`, and `Routes` sit in `Suspense` with `CollaborateLoader`.
- `src/collaborate/store/useWorkspaceStore.js`: load, reset, `dispatch`, and the display-only change handlers. The canvas starts empty.
- `src/collaborate/routes/WorkspacePage.jsx`: loader, not-found card, error card, navbar, and canvas.
- `src/collaborate/components/workspace/WorkspaceNavbar.jsx`: back link, name, role.
- `src/collaborate/components/canvas/WorkspaceCanvas.jsx` and `CanvasControls.jsx`: React Flow, dot background, zoom pill.
- `src/collaborate/components/ui/RoleBadge.jsx`: the badge moved out of `ProjectCard`. `ProjectCard` renders it in the same spot.
- `src/collaborate/collaborate.css`: React Flow variables under `.collab-root .react-flow`.

The canvas is local only. Every open starts from `{ nodes: [], edges: [], version: 0 }`. Nothing is saved or sent. The stored canvas arrives with `workspace:join` in S13, and sync arrives in S15.

**Verified (2026-11-03):**

- PASS: root `npm run build` (7.20s, 4244 modules). Vite printed only its existing large-chunk warning. Chunks:
  - Entry `dist/assets/index-aGfbmty4.js` 577.75 kB. After S06 the entry was `index-TYg5eSnN.js` at 577.69 kB. `grep` finds no `xyflow`, `react-flow`, or `Too many changes at once` in this file.
  - Dashboard `Collaborate-D_XHlYq8.js` 20.23 kB and `Collaborate-dYbC-kr_.css` 1.12 kB. After S06 those were `Collaborate-C0VRvpu0.js` 19.91 kB and `Collaborate-D0kg0Qda.css` 0.85 kB. The JS has no React Flow. The CSS growth is the theme rules in `collaborate.css`, which the dashboard shell already imports.
  - Workspace `WorkspacePage-DnEXQBHa.js` 199.73 kB and `WorkspacePage-BnuhLJ6X.css` 15.87 kB. This chunk contains React Flow and `Too many changes at once`.
- PASS: `cd server; npm test` — 104 passed, 0 failed, 0 skipped.
- PASS: signed-in owner, opened a project from the dashboard card. Navbar showed the project name and the `owner` badge. Drag-pan moved the viewport from `0,0` to `160,80`. Wheel zoom changed scale from `1` to `1.39474`. Zoom in went to `1.67369`, zoom out returned to `1.39474`, and Fit to screen ran. The dot background and the React Flow attribution link were present.
- PASS: scrolling element was `800/800` at 1280×800 and `844/844` at 390×844. `scrollY` stayed 0.
- PASS: `/collaborate/` plus 24 `a`s, and `/collaborate/not-an-id`, both showed Project not found with the access line. Back to projects returned to the dashboard.
- PASS: with the API stopped, an in-app open showed `We couldn't open this project` and `Check your connection and try again.` After the API restarted, Try again showed the project name again. A full reload while the API is down still hits the existing session card (`We couldn't verify your session`) before the workspace mounts. That card is S04. The dev server was stopped afterward. Boot had printed `Server is up and running on PORT: 3000` and `MongoDB connected` to `3dfolio`.
- PASS: project A, then the dashboard, then project B, with network latency set to 1500ms. A mutation observer on the workspace title recorded 6 samples. A's name was not among them.
- PASS: `dispatch`, through a temporary `window.__workspaceStore` assignment that existed only in dev and is gone. `git` has no `__workspaceStore`. A valid `node.add` returned `true` and rendered one fallback node. The console logged the missing-type warning that names fallback type `default`. An op `{ type: "nope" }` returned `false`, toasted `Unknown change type`, and left the canvas JSON unchanged. A `select` change, then `node.update` of the label, kept `selected` true, left `version` at 0, and the display node was not the canonical object.
- PASS: a second existing synced user was added as a `viewer` member on the test project, then removed by deleting that project. The badge text was `viewer`. `dispatch` of `node.add` returned `false` and the canvas stayed empty. A viewer has no nodes to drag, so the check placed one display-only node through that same temporary store. Its position stayed `100,100`, Backspace left it on screen, and the canonical canvas stayed empty. No `users` document was written.
- PASS: dashboard owner badge classes still include `rounded-full`, `capitalize`, `text-[11px]`, `bg-[var(--collab-elevated)]`, and `text-[var(--collab-accent-2)]`. The shared card used the viewer classes (`text-[var(--collab-muted)]`, `border-[var(--collab-border)]`).
- PASS: `grep` — feature imports of `src/collaborate/` are only in `src/pages/Collaborate.jsx`. Nothing under `src/collaborate/` imports `src/chat/` or `src/blog/`. `@xyflow/react` is imported only from the workspace store and the two canvas components.
- PASS: `/blog` rendered its heading and `GET /api/posts` returned 200. `/chat` between the two existing accounts showed typing, delivered one DM, and showed one other person online. The DM was deleted.
- PASS: cleanup left 0 projects named with the `S07 verify` prefix, 0 canvases for them, 0 `projectmessages` for them, and 0 messages with the test text. Clerk sessions created for the run were revoked.
- A search of the repo finds no `__workspaceStore`. The temporary hook is not in the source.

**Deviations:**

- Dot color uses `--collab-grid`, the token named for canvas grid dots. The spec allowed `--collab-border-strong` or similar.
- React Flow hardcodes the attribution link color, so one selector under `.collab-root` sets it to `--collab-faint`. The rule uses a token, not a hex value.
- The ready shell adds `overflow-hidden`, and the canvas box is `absolute inset-0`, so React Flow's `height: 100%` fills the flex main and the page does not grow a scrollbar.
- Browsers expose `crypto.randomUUID()` only in secure contexts (HTTPS or `localhost`). This slice does not create ids. From S08, opening the app at a LAN IP over plain `http` would fail id creation. `localhost` and HTTPS are fine. Render's Node version is still unconfirmed from S06. This slice runs the module in the browser, and the server does not import it yet.

Concurrent files this slice did not write were left as they stood: `context/1-project-overview.md`, `context/specs/00-build-plan.md`, `server/readme.md`, the untracked S06 spec, `server/src/shared/`, and `server/test/canvasOps.test.js`. No commit, push, branch, or S08 work.

**Review (Claude):**

- Diff scope matches the spec's Design list: `package.json`, `vite.config.js`, `Collaborate.jsx`, `collaborate.css`, `ProjectCard.jsx`, the rewritten `WorkspacePage.jsx`, and the five new files. No server, chat, or blog changes. The lockfile is gitignored in this repo, so its absence from the diff is expected.
- Store matches the spec: latest-wins load with a reset that bumps the counter, `dispatch` as the only canonical write (viewer guard, shared `applyOps`, toast on reject, `version` untouched), display rebuilds that keep `selected`/`measured` and never reuse canonical objects, and change handlers that keep only `select`/`position`/`dimensions` (edges: `select`). `selectCanEdit` is the single edit gate for S20.
- Canvas matches: module-level `nodeTypes`/`edgeTypes`, `ReactFlowProvider`, no `fitView` prop, viewer read-only props, custom zoom pill, stylesheet imported inside the chunk.
- Re-ran root `npm run build`: React Flow class names and the shared module's strings appear only in `WorkspacePage-*.js` (199.7 kB), not in the entry or the dashboard's `Collaborate-*.js`. The entry grew about 60 bytes, which is Vite's preload map naming the new chunk files, not code. `cd server && npm test`: 104 pass.
- Re-ran the import greps: nothing outside `Collaborate.jsx` (and `App.jsx`'s lazy route) reaches `src/collaborate/`, no chat or blog imports, `@xyflow/react` only under `src/collaborate/`. No `window.` hook, `__workspaceStore`, or `console.log` left in collaborate code.
- Deviations accepted: `--collab-grid` is the right token for dots (it already existed for this purpose); the attribution selector uses a token; `overflow-hidden` plus `absolute inset-0` is the correct way to pin React Flow's `height: 100%` inside a flex column. The error card's retry calls `loadWorkspace` instead of reloading the page, which is better than the spec.
- Note for the user: the run created and then revoked Clerk sessions and temporarily added a viewer member on the live database, cleaned up per Q2.
- Still open: Render's Node version (19+), needed once S13 imports the module on the server.

Approved — 2026-11-03

Committed — 2026-11-04 as `a7e9d6d`, together with S06.

### S08 — Shape panel + drop

**Implementer:** Codex

**Changed:**

- `src/collaborate/lib/shapeDrag.js`: lowercase drag type and a pure node builder using shared ids, sizes, and neutral colors. Unknown shapes return null; positions retain their fractions and validation stays in `applyOps`.
- `src/collaborate/components/canvas/ShapePanel.jsx`: six draggable divs in shared shape order, accessible toolbar/title text, and off-screen dashed ghosts sized at the current zoom with centered hotspots. Below sm the pill sits above the controls.
- `src/collaborate/components/canvas/WorkspaceCanvas.jsx`: callback-based drag/drop handlers accept only the custom type for owners/editors, convert screen coordinates once through React Flow, and dispatch one `node.add`. The panel uses the existing edit selector. All existing props, node-type comments, and viewport behavior are preserved.

The canvas remains local only and empty on every load until S13/S15. Fallback boxes and missing-type warnings remain expected until S09. No store, server, dependency, stylesheet, or environment-file changes.

**Verified (2026-11-04):**

- PASS: root `npm run build`, 4246 modules, existing large-chunk warning only. Workspace `WorkspacePage-b0jE8n9M.js` is 202,847 bytes; dashboard `Collaborate-B-L4rHX9.js` is 20,227 bytes; entry `index-rzCDkqDp.js` is 577,748 bytes. The drag type and panel text occur only in the workspace chunk. React Flow CSS remains `WorkspacePage-BnuhLJ6X.css` (15.87 kB).
- PASS: `cd server; npm test`: 104 passed, no failed/skipped tests.
- PASS: external temporary Vite/Playwright harness rendered the actual WorkspaceCanvas, ShapePanel, shared module, and workspace store in installed Chromium 1228. Only the harness supplied the role and initial ready state; no REST, Clerk session, membership, or database was mocked into a claimed live integration. A Vite-only in-memory transform exposed React Flow's instance for measurements, and the external harness exposed the store. No hook was written into repository source.
- PASS: 24 DOM-dispatched drops: all six shapes at each of four viewports. Every drop added exactly one canonical node with the shared default size, type shape, correct shape, empty label, and neutral fill/text. `getViewport()` was identical before and after all 24 drops. The cursor targets, in rectangle/diamond/circle/pill/cylinder/hexagon order, were `(430,300)`, `(480,330)`, `(530,360)`, `(580,390)`, `(630,420)`, `(680,450)`. Measured centers matched these targets with the maximum absolute coordinate errors below (pixels):

| Viewport x, y, zoom | Maximum center x error | Maximum center y error |
| --- | ---: | ---: |
| 0, 0, 1 | 0 | 0 |
| 0, 0, 0.2 | 0.000030518 | 0.000015259 |
| 0, 0, 2 | 0 | 0 |
| 137, -83, 1.3 | 0.000030518 | 0.000030518 |

- PASS: two additional native mouse drags, grabbing a rectangle off-center and dropping at `(950,200)` at zoom 1 and zoom 2. Both added exactly one node whose measured center was `(950,200)`.
- PASS (programmatic ghost contract): intercepted `DataTransfer.setDragImage` during dragstart for all six shapes at zoom 1 and zoom 2. Each laid-out element was the shared width/height times zoom, with dashed borders and a hotspot of width/2, height/2. For example, rectangle footprints were 160×80 with hotspot 80,40 and 320×160 with hotspot 160,80. This verifies the image element and arguments, not the OS-rendered drag bitmap.
- PASS: foreign text and file drops and an unknown shape added nothing and threw no page errors. Text's drop was not prevented. Switching the actual store to viewer removed the panel; custom-type dragover/drop was not prevented and added no node. Switching to editor restored the panel.
- PASS: with the temporary in-memory React Flow hook, set viewport to `{ x: -200000, y: 0, zoom: 1 }` and drop circle at `(500,400)`. The existing toast showed `Node position x must be a finite number between -100000 and 100000`, and the canonical node count stayed unchanged.
- PASS: 390×844 screenshot and DOM measurements. Shape pill: x=72, y=734, width=246, height=46; control pill: x=16, y=782, width=126, height=46. A 2px vertical gap, neither clipped, and scrolling element/client dimensions both 390×844. Screenshot visually inspected.
- PASS: every item has its title and sr-only label; no draggable button. Searches found no raw hex, chat/blog imports, click handlers, or touch handlers in the new files. No page errors in the controlled canvas checks.
- PASS: backend booted on temporary port 3008 and connected to the live 3dfolio database. `/health` and `/api/posts` returned 200. A separate regression render loaded the real Blog page/providers with the Clerk publishable key supplied through process environment, showed its heading and `No posts yet.`, and received a live posts API 200. The real Chat page/providers rendered its signed-out Continue gate. No database data was written.
- PASS: `git diff --check`. Implementation scope is the three Design files plus this tracker. The pre-existing untracked S08 spec and preceding tracker updates were preserved. Temporary verification scripts, Playwright dependency, measurements, and screenshots are under the OS temp directory, outside the repo; no production dev hooks or permanent test files were added.
- PENDING: real signed-in owner/editor and viewer windows, including a cross-window owner-to-viewer drag. Controlled role checks above exercise the components/store but do not establish live Clerk/membership behavior. No signed-in browser sessions were available.
- PENDING: visual inspection of the native ghost bitmap in Chrome at zoom 1 and 2, and Firefox's native ghost behavior (Firefox is not installed). The native mouse drags and ghost contract checks above do not establish that visual result.
- PENDING: two-account `/chat` DM round trip. The signed-out gate and boot/API checks do not replace it. No chat/server sources changed.

**Deviations:** No implementation scope or behavior deviations. Browser checks use an external controlled harness, with the live-account, OS ghost, and DM limitations stated above for review. No commit, push, branch, or S09 work.

**Review (Claude, 2026-11-04): No blocking findings.**

- Scope: the diff is the three Design files plus this tracker. `WorkspaceCanvas.jsx` gains only the imports, the two `useCallback` handlers, the `onDragOver`/`onDrop` props, and `{canEdit && <ShapePanel />}`. Existing props, the node-type comment, and the viewport behavior are untouched.
- Code matches the spec: `createShapeNode` rejects unknown shapes, uses the shared default size and neutral pair, and doesn't round. Both handlers bail out without `preventDefault` for viewers and foreign drags. The conversion goes through `screenToFlowPosition` once, with no manual rect offset. Items are `draggable` divs with a title and `sr-only` text. The six ghosts have literal radius classes and only inline width/height, and the zoom is read at drag start.
- Re-ran root `npm run build`: passes, existing large-chunk warning only. The drag type appears only in `WorkspacePage-b0jE8n9M.js` (202.85 kB). The entry `index-rzCDkqDp.js` (577.75 kB) and the dashboard `Collaborate-B-L4rHX9.js` (20.23 kB) are unchanged from S07. `cd server && npm test`: 104/104. `git diff --check` is clean. No raw hex, chat/blog imports, or click/touch handlers in the new files.
- Codex's measured centering (24 drops at four viewports, worst error 0.00003px) and the unchanged `getViewport()` are accepted.
- Nit, not required: the panel is a child of `<ReactFlow>`, so a drop released on the panel itself bubbles to the canvas and adds a node underneath it. Escape still cancels a drag. S29 can make the panel refuse drops if it matters.
- Live check (user, 2026-11-04): signed in as the owner on a local server and Vite (port 5174, process environment only) against the live `3dfolio` database, created a project, and dragged shapes onto the canvas. The ghost and the drops worked as specified. Not run: a real viewer window and Firefox.

Approved — 2026-11-04

Committed — 2026-11-05 as `7fb9533`, together with S09.

### S09 — Node rendering

**Implementer:** Codex

**Changed:**

- `src/collaborate/components/canvas/ShapeNode.jsx`: memoized, props-only renderer. Rectangle/pill/circle use CSS; diamond/hexagon/cylinder use the specified SVG geometry with stretched viewBoxes, non-scaling 1px strokes, and visible overflow. Labels use shape-specific inset layers, palette fill/text from data, newline preservation, wrapping, and clipping. Four shared handle ids always render and receive React Flow's derived `isConnectable` prop.
- `src/collaborate/components/canvas/WorkspaceCanvas.jsx`: registered ShapeNode in the module-level nodeTypes map, updated the fallback comment, and added ConnectionMode.Loose. All S08 drag/drop handlers, panel gating, and other existing props are preserved.
- `src/collaborate/collaborate.css`: added the two node-border tokens and scoped 8px handle rules, visible on hover only when connectable; reduced-motion removes the opacity transition.

Rendering only: no new dispatches, persistence, sockets, resize/delete behavior, or label/color editing. The canvas remains local only until S13–S15. S08 stays Approved and uncommitted; its ShapePanel and shapeDrag files were not touched.

**Spec correction (2026-11-04):** the original spec assumed Handle derives connectability automatically. The installed `@xyflow/react/dist/esm/index.mjs` defaults Handle's `isConnectable` to true; only NodeWrapper derives the node prop from nodesConnectable. A controlled viewer test exposed visible/connectable handles. The user authorized forwarding the node prop to every Handle, and Claude corrected `specs/09-node-rendering.md` during implementation. The final code follows that corrected spec and comments the reason. This is a spec correction, not a deviation.

**Verified (2026-11-04):**

- PASS: root `npm run build`, 4247 modules, existing large-chunk warning only. ShapeNode's cylinder geometry occurs only in `WorkspacePage-aHLkud94.js` (204,860 bytes). Entry `index-D0WXjAEy.js` is 577,748 bytes and dashboard `Collaborate-BUv40-kQ.js` is 20,227 bytes, both exactly the S08 sizes. Workspace CSS remains 15.87 kB; scoped Collaborate CSS is 1.63 kB. Tailwind utilities enter the existing global CSS as before; no config changed.
- PASS: `cd server; npm test`: 104 passed, no failures/skips. No server source changed afterward.
- PASS: temporary external Vite/Playwright harness rendered the actual WorkspaceCanvas and store in installed Chromium 1228. It supplied a controlled ready state/role and used in-memory Vite instrumentation to expose the React Flow instance; nothing was written into production source. Its node fixtures went through the real store's dispatch and shared applyOps. These component checks are not claimed as live Clerk/membership checks.
- PASS: dropped every shape at its default size at zoom 1 and 2 (12 drops). Each rendered the expected CSS/SVG body without fallback rendering or missing-type/key/prop warnings. Rect sizes equaled width×zoom and height×zoom, and every measured center exactly matched its drop point (maximum x/y error 0px). Targets, in rectangle/diamond/circle/pill/cylinder/hexagon order, were `(250,350)`, `(630,350)`, `(1010,350)`, `(1390,350)`, `(1770,350)`, `(2150,350)`. Viewport values stayed identical before/after every drop.
- PASS: dispatched all six shapes at 40×40, 400×60, 60×400, and 300×300 (24 nodes). DOM rects matched the supplied sizes; SVG viewBox, preserveAspectRatio, overflow, and vector-effect attributes match the spec. All SVG strokes computed to 1px, including zoom-2 checks on the wide diamond, hexagon, and cylinder. Inspected the full odd-size screenshot and the three zoom-2 screenshots: shapes stretch correctly, cylinder rim remains distinct, and pointed corners are unclipped.
- PASS: 24 label/color fixtures cover all eight palette pairs with short labels, two lines separated by a newline, and 200-character unbroken labels. Computed fill and text colors match the exact shared palette pair. Newlines display on separate lines; long text wraps and exceeds the available layer height while the layer clips it. The label span has min-w-0 so long words can shrink and wrap in the flex layer. Cylinder label top is exactly 24% of node height. Inspected the palette/label screenshot.
- PASS: every fixture retained four 8×8 handles with ids top/right/bottom/left at the midpoint of the corresponding bounding-box side. Owner handles have opacity 0 off-hover and 1 on-hover; switching the controlled role to viewer keeps all four DOM elements, removes connectable, and yields opacity 0 on-hover. For a 300×220 node at `(30,86)` the handle centers were `(180,86)`, `(330,196)`, `(180,306)`, `(30,196)`. Fill computed to rgb(157,92,255) and border to rgb(4,3,15). Reduced-motion computed transition duration to 0s.
- PASS: click selection changes the CSS border and SVG stroke from rgba(255,255,255,0.1) to rgba(255,255,255,0.35); a pane click restores both. Ctrl-click selected a rectangle and diamond together and both displayed the selected border.
- CHECKLIST MISMATCH: Shift-click did not retain both nodes; only the second remained selected. The installed React Flow defaults multiSelectionKeyCode to Control on Windows (Meta on macOS), and Shift is its selectionKeyCode for box selection. The spec also forbids changing other ReactFlow props. The existing keyboard configuration is preserved; see Q6 below. This does not affect rendering two selected nodes or the successful Ctrl-click check.
- PASS: no hex literals or chat/blog imports in ShapeNode or WorkspaceCanvas; ShapeNode has no store import, event handler, resizer, toolbar, nodrag, or nopan. All 17 existing tokens compare unchanged with the pre-S09 snapshot, the total is now 19, and both new values exactly match 3-ui-context.md.
- PASS: `npm run dev` in server booted on temporary port 3009 and connected to the live 3dfolio database. `/health` returned 200. A regression render of the real Blog page/providers showed its heading and `No posts yet.` using a live posts API 200; the real Chat page/providers rendered the signed-out Continue gate. Public Clerk configuration and API origin were process environment only. No application data or users were written.
- PASS: no browser page exceptions or node-type/key/prop warnings. Existing router future-flag and Clerk development-key notices occurred in regression pages; the temporary harness's missing favicon returned 404. No new production warnings.
- PASS: `git diff --check`. Snapshot comparisons confirm ShapePanel.jsx, shapeDrag.js, the S08 spec, and Claude's 3-ui-context.md are unchanged, and S08 drag/drop handlers are byte-for-byte unchanged. Implementation changes are only the three Design files plus this tracker. Claude's concurrent S09 spec correction is preserved. No temporary hook remains in repository source.
- PENDING LIVE CHECKS: signed-in owner/viewer browser verification with real project membership, and a two-account `/chat` DM/typing/presence round trip. Controlled role checks and chat's signed-out gate do not establish those results. No signed-in sessions were available to this run.

Verification scripts, fixtures, JSON measurements, and screenshots are outside the repo at the OS temp directory `codex-s09-verify`. Stopped only the temporary API/Vite processes created for this slice; existing ports 3000, 5173, and 5174 were left alone.

**Deviations:** None in implementation; follows the corrected isConnectable spec. The Shift-click checklist mismatch and outstanding live checks are recorded above. No commit, push, branch, or S10 work.

**Review (Claude, 2026-11-04): No blocking findings.**

- Scope: `ShapeNode.jsx` is new, and `WorkspaceCanvas.jsx` and `collaborate.css` are edited, plus this tracker. Against S08's approved version, `WorkspaceCanvas.jsx` gains only the `ShapeNode` import, `nodeTypes = { shape: ShapeNode }` with the shortened comment, and `connectionMode={ConnectionMode.Loose}`. S08's files are unchanged.
- Code matches the corrected spec: the per-shape CSS and SVG bodies with the exact geometry, `preserveAspectRatio="none"`, `overflow="visible"`, `non-scaling-stroke`, and the commented reason. Label layers use axis-relative insets. Fill and text colors come only from `data`, with no hex literals. All four handles always render from `HANDLE_IDS` and receive the node's `isConnectable`. The props-only component is wrapped in `memo`, with no store import. The CSS adds the two tokens with exact values, 8px handles visible only on hover when `connectable`, and a reduced-motion override.
- The `min-w-0` on the label span is a sensible addition: without it a long unbroken word can't shrink inside the flex layer and wrap.
- The Shift-click item was a spec error (Q6, resolved). Corrected in the spec. Codex's Ctrl-click check is the right one.
- Re-ran root `npm run build`: passes, existing warning only. Entry `index-D0WXjAEy.js` 577.75 kB and dashboard `Collaborate-BUv40-kQ.js` 20.23 kB are unchanged from S08. Workspace `WorkspacePage-aHLkud94.js` is 204.86 kB (+2.0 kB). `cd server && npm test`: 104/104. `git diff --check` is clean.
- Not run live: a signed-in owner and viewer. This slice changes rendering only (no auth, data, or socket paths), and Codex's controlled role checks cover the handle gating. The user can look at it on the running 5174 dev server before committing.

Approved — 2026-11-04

Committed — 2026-11-05 as `7fb9533`, together with S08.

### S10 — Move, resize, delete as ops

**Implementer:** Grok

**Changed:**

- `src/collaborate/store/useWorkspaceStore.js`: drag, resize, and delete go through one `dispatch`. `commitNodePositions` sends one `node.update` per node whose position changed. `commitNodeResize` sends one update with position, width, and height. `deleteElements` removes nodes first and skips an `edge.remove` when `node.remove` already drops that edge, using the stored endpoints rather than the callback's. A viewer, a failed `applyOps`, or a missing resize target restores `rfNodes` and `rfEdges` from the canonical canvas and leaves `version` alone. `toDisplayNodes` keeps `measured` only while it still matches the canonical size, and replaces it when it does not, so a rejected size cannot stay on screen. The dimensions change NodeResizer emits after `onResizeEnd` (`resizing: false`, no `setAttributes`) is rewritten to the canonical size with `setAttributes: true`. `onNodesChange` still ignores `remove`.
- `src/collaborate/components/canvas/WorkspaceCanvas.jsx`: `onNodeDragStop` commits the third argument, which is every node that gesture moved, including a selection drag. There is no `onSelectionDragStop`. `onDelete` commits the validated batch. Editors get Backspace and Delete; viewers get `deleteKeyCode={null}`. Drop handling, loose connection mode, zoom limits, and the other React Flow props are unchanged.
- `src/collaborate/components/canvas/ShapeNode.jsx`: a selected editable node shows `NodeResizer` with the shared 40 and 2000 limits, `keepAspectRatio={false}`, and the collaborate handle and line classes. `onResizeEnd` commits that gesture. The resizer sits after the body and before the four connection handles, which still receive `isConnectable`.
- `src/collaborate/collaborate.css`: under `.collab-root .react-flow__node-shape`, handles are 8px circles in the selected-node border color with a 1px background-colored border, and lines are dashed in that same color. Border width is left to React Flow so a line stays one pixel on one side. No new tokens and no global `.react-flow__resize-control` override.

The canvas stays local. Nothing is saved, broadcast, or undone. No new files, dependencies, or server changes.

**Verified (2026-11-05):**

- PASS: root `npm run build`, 4247 modules, existing large-chunk warning only. Entry `index-BQVAGZLu.js` is 577.75 kB and dashboard `Collaborate-DMHB7IDR.js` is 20.23 kB, the same displayed sizes as S09. Their hashes changed because they name the new lazy chunks. Workspace `WorkspacePage-D6o3PbDq.js` is 208.10 kB (S09 was 204.86 kB). The added weight is NodeResizer plus the gesture commits. Collaborate CSS `Collaborate-Dkj5MLae.css` is 1.96 kB (S09 was 1.63 kB) because `collaborate.css` is imported by the route shell; the resize rules live there. Workspace CSS stays 15.87 kB. `collab-resize-handle` appears in the workspace JS and the Collaborate CSS chunk only, not in the entry.
- PASS: `cd server && npm test`: 104 passed, no failures or skips. No server source changed.
- PASS: `git diff --check`. The implementation diff is the four files above plus this tracker. `context/specs/10-move-resize-delete.md` was already untracked and was not edited. No production hook (`window.__flow` or similar) remains under `src`.
- PASS: external temporary Vite/Playwright harness on port 5191 rendered the real WorkspaceCanvas and store in Chromium 1228. The harness supplied the role and ready state. An in-memory Vite transform exposed the React Flow instance for viewport control, and the harness wrapped `dispatch` and `toast.error`. Nothing was written into the repo. These are controlled component checks, not live Clerk membership checks.
- PASS: single drag at zoom 1 (`dx` 90, `dy` 40), zoom 2 (`dx` 80, `dy` -30), and viewport `{137, -83, 1.3}` (`dx` 70, `dy` 55). During the drag, canonical state did not change and `rfNodes` did. Release dispatched one `node.update` whose patch key is `position`. Display matched canonical afterward, the node stayed selected, and a later `node.add` left it in place. `version` stayed 7. Installed React Flow starts the drag only after the pointer moves more than 1px and then anchors to that later point, so the committed point is about 1–2 screen pixels short of the full pointer travel (zoom 1 ended at 308,219 rather than 310,220; zoom 2 at 259.5,165.5 rather than 260,165). The store does not round; it stores the position React Flow reports, including fractions. A click with no movement dispatched nothing.
- PASS: Ctrl-click selected three different shapes and one drag dispatched three position updates. Shift-drag box selection did the same. Relative offsets stayed 280px apart. No second commit came from a selection callback.
- PASS: all six shapes resized from the bottom-right and top-left handles at zoom 1 and zoom 2. During the gesture only the display changed. Release dispatched one update with `position`, `width`, and `height`. The opposite corner stayed within 1.25px. A bottom-right rectangle move of 36 by 22 landed on 196×102. A top-left move of 28 by 18 landed on position (208,178) and 132×62. Circles became non-square. A later add did not reset the geometry. A 40×40 circle dragged inward stayed 40×40 with no dispatch. A small node at zoom 0.3 dragged outward clamped to 2000×2000 in one update. Clicking a handle without moving dispatched nothing.
- PASS: the initial add was the only dispatch across measurement, pane click, Ctrl-clicks, pane pan, wheel zoom, and Fit to screen.
- PASS: Backspace and Delete each removed one selected node. Delete removed a three-node selection in one dispatch of three `node.remove` ops. An empty selection dispatched nothing.
- PASS: cascade fixture. Deleting node A together with edges AB and BC, including untrusted callback endpoints, dispatched `node.remove A` and `edge.remove BC` only. B and C remained and no edges remained. An edge-only delete of BC, then a delete of both B and C, each succeeded with no `Edge not found` toast.
- PASS: a 50-node move and a 50-node delete each succeeded. A 51-node move and a 51-node delete each made one rejected dispatch, toasted `Too many changes at once`, changed nothing canonical, restored the display, and left `version` at 7. The 51 nodes were seeded in batches of at most 50.
- PASS: an out-of-range position (`x` 100050) and an out-of-range resize (`x` 100001, 90×70) were rejected with the shared position error. The following `resizing: false` dimensions change could not put 90×70 or `resizing: true` back. Selection survived and the display returned to 160×80 at (12,18), including `measured`. A real drag of a node at `x` 99940 past the position limit was rejected the same way and the display snapped back.
- PASS (controlled roles): a viewer had no `.collab-resize-handle`. Dragging and both delete keys dispatched nothing. Direct `commitNodePositions`, `commitNodeResize`, and `deleteElements` returned false, left the canonical node at (220,200) 160×80, and cleared the attempted display geometry. Editor and owner each committed a position and could move it back. This sets `role` on the store. It does not sign in or load a membership.
- PASS: a native mouse drag from the rectangle in the shape panel dropped one rectangle whose measured center was exactly (500,300). The selected border computed to `rgba(255, 255, 255, 0.35)`. The connection handle on hover was 8px at opacity 1. The resize handle was 8×8, background `rgba(255, 255, 255, 0.35)`, border `1px solid rgb(4, 3, 15)`, and the line was dashed at 1px.
- PASS: screenshot of six shapes at odd sizes, all selected. Dashed resize outlines and corner handles sit on the box. The diamond point, hexagon corners, and cylinder rim are not cut off. The three SVG nodes computed `overflow: visible` and `preserveAspectRatio="none"`. The narrow rectangle's label stacks one letter per line because that fixture is 40px wide. No page errors. The only console warning was the harness favicon 404.
- PASS: `npm run dev` equivalent, `node src/index.js`, on temporary port 3010. Log lines were `Server is up and running on PORT: 3010` and `MongoDB connected` to `3dfolio`. No Mongoose warning. Clerk's development-instance telemetry line appeared on the authenticated requests. `/health` and `/api/posts` returned 200. The posts payload had 0 posts.
- PASS: temporary Vite on port 5192, with the public Clerk key and `VITE_API_URL` supplied only to that process. `/blog` showed the heading "Notes on code, design, and building for the web.", "Recent Posts", and "No posts yet." `/chat` showed the signed-out gate: heading "ajfm88 Chat" and the Continue button. No page errors. Ports 3000, 5173, and 5174 were not used.
- PASS: two-account chat at the socket and message API, using two already-synced users. Sessions were created for this run and revoked afterward. Both sockets appeared in `getOnlineUsers`. A `typing` emit was delivered to the other account with `isTyping: true`. `POST /api/messages/send/:id` returned 201 and the other socket received `newMessage` with that text. The message was then deleted. Counts of `users`, `projects`, `canvases`, `projectmessages`, and `messages` were unchanged. No `users` document was written. This is not a signed-in browser walkthrough of the chat UI; the signed-out gate above does not, by itself, prove delivery. The socket round trip does.

**Deviations:** None in implementation. Drag commits the position React Flow reports after its 1px drag threshold, so the pointer and the stored point can differ by about 1–2 screen pixels. Coordinates are not rounded. Controlled role checks are not live membership checks. No commit, push, branch, or S11 work.

**Review (Codex, 2026-11-05): No blocking findings.**

- Implementation scope matches the four allowed collaborate files plus this tracker. The existing untracked S10 spec is preserved. Drawing geometry, drop handling, lazy routing, shared operation semantics, dependencies, and server code are unchanged.
- Drag-stop uses the full third callback argument and dispatches one deduplicated batch of changed positions. Resize uses final callback geometry, shared size limits, and selected/editable controls. Deletion filters cascaded edges using canonical endpoints, dispatches once, and ignores React Flow's remove notifications. Both delete keys are gated by editability.
- Independently exercised the actual workspace store through Vite's SSR module loader, without repository test files or live database writes. Passed: display-only dragging, fractional final positions, rejected resize followed by the final dimensions notification, measurement restoration, preserved selection, 50/51-node move and delete boundaries, cascade filtering, duplicate ids, untrusted callback endpoints, viewer action guards, and unchanged version. Confirmed the installed resizer calls onResizeEnd before its final dimensions notification.
- Re-ran root `npm run build`: passes with the existing large-chunk warning only. Entry 577.75 kB, dashboard 20.23 kB, workspace 208.10 kB; scoped Collaborate CSS 1.96 kB. Re-ran server `npm test`: 104 passed, zero failures/skips. `git diff --check` passes. No production debug hooks, console logging, raw hex literals, or chat/blog imports in the changed JavaScript files.
- Grok's browser/visual and API/socket regression results above are implementation evidence, not checks independently repeated during this review. Real signed-in owner/viewer workspace checks and a signed-in chat UI walkthrough remain unverified; controlled roles and socket delivery cover narrower paths. These limits do not block this local canvas slice, which changes no authentication, membership, server, or chat code.

Approved — 2026-11-05. No implementation changes requested. No commit, push, branch, or S11 work.

### S11 — Labels and colors

**Implementer:** Grok

**Changed** (on top of the approved, uncommitted S10 baseline):

- `src/collaborate/store/useWorkspaceStore.js`: imports `NODE_COLORS`. `setNodeLabel` and `setNodeColor` recheck `selectCanEdit`. A viewer restores the display, returns false, and shows no toast. A missing node returns false with no dispatch and no toast. An unchanged label, or a color whose fill and text already equal the named pair, returns true with no dispatch. Anything else dispatches exactly one `node.update`. The label patch is only `data.label`, and empty strings, spaces, and newlines are kept. The color patch is only `data.color` and `data.textColor` from the shared pair. An unknown or non-string palette name returns false. A non-string label or a label past 200 characters still reaches `applyOps`, toasts the shared error, and leaves the accepted canvas and version unchanged. S10 geometry and deletion stay.
- `src/collaborate/components/canvas/ShapeNode.jsx`: the node owns only whether the editor is open. A capture-phase double-click on the body or label opens it and stops native zoom. Handles, resize controls, the color toolbar, and the open textarea do not start or reset a session. A viewer does not stop the event, so double-click still zooms. Losing edit permission closes the editor without saving. A selection change does not. While editing, the toolbar and resizer are hidden, the same `LABEL_LAYERS` stay mounted even for an empty label, and the four handles remain with `isConnectable={false}`.
- `src/collaborate/components/canvas/NodeLabelEditor.jsx` (new): uncontrolled textarea, `maxLength={NODE_LABEL_MAX}`, accessible name "Node label", and `nodrag nopan nowheel nokey`. A finished ref is set before commit or close, so Enter's following blur cannot dispatch twice and Escape's following blur cannot turn a cancel into a save. Composition (`isComposing` or keyCode 229) does not commit. Shift+Enter inserts a newline. Enter and blur commit once. Escape discards. Enter and Escape return focus to `.react-flow__node` with `preventScroll: true`. Blur leaves focus where the browser put it. Unmount discards the draft and does not dispatch.
- `src/collaborate/components/canvas/ColorToolbar.jsx` (new): `NodeToolbar` at `Position.Top`, offset 12, with no `isVisible` prop. Eight buttons in `NODE_COLORS` order. Fill and the active border are inline `pair.fill` and `pair.text`. The group is named "Node colors". Each button is `aria-pressed` and labelled `"<name> node color"`. The toolbar carries `nokey` and stops pointer, mouse, click, and key events so Delete, Backspace, and arrows do not reach the canvas. Enter and Space still activate the focused button once.
- `src/collaborate/collaborate.css` and `src/collaborate/components/canvas/WorkspaceCanvas.jsx`: unchanged by S11. Their uncommitted diffs are the approved S10 resize rules and gesture wiring. Existing utilities were enough. No new tokens.
- `context/3-ui-context.md`: unchanged by S11. The working tree already had the spec author's one-line ColorToolbar clarification. Left as found.

The canvas stays local. Nothing is saved, broadcast, or undone. No new dependencies or server changes. Version stays client-unchanged.

**Verified (2026-11-05):**

- PASS: root `npm run build`, 4249 modules, existing large-chunk warning only (7.20s). Measured afterward: entry `index-9HKzmLV0.js` is 577,748 bytes (577.75 kB) and dashboard `Collaborate-C8cJ_ShB.js` is 20,227 bytes (20.23 kB), the same displayed sizes as S10. The hashes differ because the lazy chunk names changed. Workspace `WorkspacePage-i9XVhMV-.js` is 213,229 bytes (213.23 kB; Vite gzip 69.28 kB), 5.13 kB above S10's 208.10 kB. Collaborate CSS `Collaborate-Dkj5MLae.css` is 1,963 bytes (1.96 kB) and the same hash as S10, because S11 added no CSS. Workspace CSS `WorkspacePage-BnuhLJ6X.css` stays 15.87 kB. `collab-label-editor`, `collab-color-toolbar`, `setNodeLabel`, and `setNodeColor` occur in the workspace chunk only.
- PASS: `cd server; npm test`: 104 passed, 0 failed, 0 skipped (274ms on the closing run). No server source changed.
- PASS: `git diff --check` (CRLF warnings only, exit 0). No `window.__flow` and no `console.log` under `src/collaborate`. No palette hex literals in `ColorToolbar.jsx`, `NodeLabelEditor.jsx`, or `ShapeNode.jsx`.
- PASS: external temporary Vite/Playwright harness in StrictMode on `127.0.0.1:5193` rendered the real WorkspaceCanvas and store in Chromium 1228. An in-memory Vite transform exposed the React Flow instance. The harness wrapped `dispatch` and `toast.error`. Nothing was written into the repo. Roles were set on the store. These are controlled component checks, not live Clerk membership checks.
- PASS: double-click on all six shapes, empty and labeled, at zoom 1, zoom 2, and a panned viewport `{x:-50, y:35, zoom:1}`: 18 empty opens and 18 labeled opens, plus body clicks outside the label on the inset shapes. Opening the editor dispatched nothing and left geometry and the viewport unchanged. A viewer, seeded as owner and then demoted, still zoomed on double-click and showed no textarea, toolbar, or resize handles.
- PASS: Enter commits once, restores node focus without scrolling, and the following blur does not dispatch again. A pane click and Tab each commit once and leave focus where that gesture put it. Escape discards, including when a click follows. Closing an unchanged draft dispatches nothing. Empty, whitespace, and newline labels round-trip. Shift+Enter stays open and does not save. A paste stops at 200 characters. Direct invalid labels toast `Node label must be 200 characters or fewer` and `Node label must be text` and leave version 7. HTML is stored as literal text. A 200-character label wraps inside the node; the label layer's overflow is hidden.
- PASS: IME composition Enter, `compositionend`, keyCode 229, and Escape during composition do not save. A later plain Enter saves once (`AB`).
- PASS: keys, clipboard, mouse selection, and wheel inside the textarea do not pan, zoom, move, or delete the node.
- PASS: unmounting the workspace while a dirty editor is open (`Hello!LEAK`) does not commit. Demoting to viewer, removing the node, and resetting the workspace each discard the draft with no commit. Promoting back to owner does not reopen that draft. Direct viewer calls and missing-id calls to `setNodeLabel` and `setNodeColor` return false, leave the canvas unchanged, and show no toast.
- PASS: all eight palette pairs on a labeled rectangle and a labeled diamond. A changed pair dispatches one update whose patch is only `data.color` and `data.textColor`. Computed body fill and label color match the pair. `aria-pressed` matches. Edges, selection, version, and the label stay. Choosing the already active pair dispatches nothing. A Neutral fill with Blue text has zero pressed swatches, and choosing Neutral repairs both fields in one op. A custom `#112233` / `#445566` pair presses no swatch, and choosing Green sets both fields. An unknown name, a non-string, and a missing id return false with no extra dispatch and no toast. A color change does not overwrite a label edited in the same session.
- PASS: the toolbar is a portaled glass pill inside `.react-flow__renderer`, hidden unless exactly one node is selected, because `isVisible` is not passed. Swatches stay about 20px at zoom 0.5, 1, and 2 and after a pan. The focus outline uses `--collab-accent`. Delete, Backspace, and arrows do nothing while a swatch is focused. After focus returns to the canvas, Delete removes only the selected node. Enter and Space on a swatch call `setNodeColor` once. The active swatch and Space on it dispatch nothing. While editing, the editing node keeps four handles and none are `connectable`. Hovered connection handles fade to opacity 1 after the existing 150ms transition.
- PASS: S10 regression on the same harness. Measurement, pan, wheel, and Fit to screen add no label or color op. Single drags at zoom 1 (`+80,+40`), zoom 2 (`+40,+24`), and zoom 1.3 panned (`+36,+22`). Ctrl multi-drag of three nodes by `(48,36)`. Top-left resize `+28,+18`. Backspace and Delete each send one `node.remove`. A rejected resize (`x` 100001, 90×70) followed by `resizing: false` leaves the canonical 160×80, restores `measured`, and keeps selection and version 7. A native drop from the rectangle tool adds one rectangle. This run did not repeat S10's 51-op, 2000px max, or cascade fixtures.
- PASS: inspected the eight palette screenshots and the multiline and 200-character shots. Neutral through Teal each show that pair's fill and "CSS" text color, with one active ring on that pair's swatch. The multiline shot shows "one" over "two", centered, with the editor closed and the toolbar and resize handles visible. The 200-character shot is wrapped rows of Y painted inside the dashed border.
- PASS: temporary API on port 3010 and Vite on port 5194. Boot logged `Server is up and running on PORT: 3010` and `MongoDB connected to 3dfolio`. `/health` and `/api/posts` returned 200. The posts payload had 0 posts. `/blog` showed "Notes on code, design, and building for the web.", "Recent Posts", and "No posts yet." `/chat` showed the signed-out gate: "ajfm88 Chat" and Continue. No page errors. No projects, canvases, messages, or users were written, so there was nothing to clean up. Ports 3000, 5173, and 5174 were not used. The harness and both temporary processes were stopped afterward.
- The signed-out `/chat` gate and the public posts read are not a socket or message-API round trip and not a signed-in chat walkthrough. S11 changes no server, chat, or blog code. S10's two-account socket check remains the last delivery evidence.

**Deviations:** None in implementation. A pane click deselects through React Flow; the label op does not rewrite selection, and Enter leaves the node selected. Drag commits the position React Flow reports after its 1px threshold, which is the approved S10 behavior. The harness warning that edge type "link" is missing belongs to S12. Controlled role checks are not live membership checks.

**Review (Codex, 2026-11-05): No blocking findings.**

- Reviewed against the S11 spec and the approved S10 working-tree baseline. The two new components and narrow node-data actions match the allowed scope. S10's geometry/deletion actions, resize CSS, and WorkspaceCanvas wiring are preserved. The supplied specs and UI-context clarification are unchanged by implementation.
- Re-ran root `npm run build`: passes, existing large-chunk warning only. Entry 577.75 kB, dashboard 20.23 kB, workspace 213.23 kB; Collaborate CSS remains 1.96 kB with the S10 hash. The global Tailwind utility stylesheet grows from 60.29 to 60.97 kB for the new utility classes; no stylesheet/configuration changes were made for S11. Server `npm test`: 104 passed, zero failures/skips. `git diff --check` passes. No debug hooks, console logging, raw palette literals, or chat/blog imports in the three changed/new node UI components.
- Independently ran a temporary in-memory Vite/Playwright harness with the actual WorkspaceCanvas, components, and store under StrictMode on port 5195. Passed: native double-click opens a focused/text-selected editor without zoom; draft changes stay local; Enter commits once with the exact label-only patch and restores node focus; Escape followed by blur cancels; pane blur commits once; palette patches contain only both color fields; active reselect is a no-op; Delete/Backspace/arrows on a focused swatch do not affect the canvas; a draft survives an unrelated color action; permission loss discards and regrant does not reopen; composition Enter does not submit; invalid labels/palette names reject without accepted-state changes; version stays 7. No page errors. Closed the review browser/server; no repository harness files or live database writes.
- The remaining all-shape, palette screenshot, clipboard, and S10 regression evidence is Grok's recorded verification, not independently repeated in full during review. Live authenticated membership checks and a signed-in chat UI walkthrough remain unverified; the review harness uses controlled roles. No authentication, membership, server, blog, or chat code changes in S11, so those limits do not block this slice.

Approved — 2026-11-05. No implementation changes requested. S10 remains Approved. No commit, push, branch, or S12 work.

### S12 — Edges

**Implementer:** Grok

**Changed** (on top of `050c1a8`; the supplied spec and UI-context edits were already in the tree and were not rewritten):

- `src/collaborate/store/useWorkspaceStore.js`: `connectNodes` dispatches one `edge.add` with a fresh `createEdgeId()`, the two handles normalized with `?? null`, type `link`, and an empty label. It does not spread the connection object. `setEdgeLabel` dispatches one `edge.update` whose patch is only `data.label`, skips an unchanged label, and leaves a missing edge missing. A viewer restores the display and returns false with no toast. `selectEdge` is display-only: the label portal is not inside the edge wrapper, so a plain click selects that edge and clears the other selection, and Ctrl/Cmd flips it, through the existing `onNodesChange` / `onEdgesChange` select path. `toDisplayEdges` adds `markerEnd: { type: ArrowClosed, color: "var(--collab-edge)" }` on the display edge only. S10 geometry and deletion are unchanged. Version is still not bumped.
- `src/collaborate/components/canvas/LinkEdge.jsx` (new): smooth-step between different nodes, using the label point `getSmoothStepPath` returns. A self-loop uses `selfLoopGeometry` and the live node box from `useInternalNode`. `BaseEdge` gets the resolved marker URL and `interactionWidth={20}`. No second hit path. Double-click is capture-phase on the path group and the pill. A viewer does not stop it. The editor does not reset on a second double-click. Empty labels draw no pill.
- `src/collaborate/components/canvas/EdgeLabelEditor.jsx` (new): same commit rules as the node editor. `maxLength` is `EDGE_LABEL_MAX` (100). Enter and blur save once. Escape discards. Shift+Enter inserts a newline. Composition does not commit. Enter and Escape return focus to the edge wrapper with `preventScroll`. A finished ref plus an `isConnected` blur guard stop a removed field from saving, including under StrictMode.
- `src/collaborate/lib/edgePath.js` (new): render-only. Different sides walk the shorter exterior of the box expanded by 36px, with a 16px fillet. The same side, including coincident anchors, is an outward cubic. Null or non-finite input does not throw or emit `NaN`.
- `src/collaborate/components/canvas/WorkspaceCanvas.jsx`: module-level `edgeTypes = { link: LinkEdge }`, `onConnect` calls `connectNodes`, and the drag preview is a smooth step at 1.5px in `--collab-edge`. Loose mode, delete keys, drag/drop, and the other canvas props stay.
- `src/collaborate/collaborate.css`: `--collab-edge` and `--collab-edge-selected` on `.collab-root, .collab-portal`, and the React Flow stroke variables for the edge, the selected edge, and the connection line. Width is 1.5. The arrow keeps the resting token.

`ShapeNode.jsx`, `NodeLabelEditor.jsx`, `ColorToolbar.jsx`, `server/src/shared/canvasOps.js`, and the server are unchanged. No new dependency. The canvas is still local: nothing is saved, broadcast, or undone.

**Verified (2026-11-06):**

- PASS: root `npm run build`, 4252 modules, existing large-chunk warning only (10.53s). Entry `index-CwkP3kRZ.js` is 577,748 bytes (577.75 kB) and dashboard `Collaborate-B5cWnSZr.js` is 20,227 bytes (20.23 kB), the same displayed sizes as S11. Workspace `WorkspacePage-4UIw_C-l.js` is 221,156 bytes (221.16 kB; gzip 71.79 kB), up from S11's 213,229 bytes. Collaborate CSS `Collaborate-CJGlWSl_.css` is 2,255 bytes (2.26 kB), up from 1,963 bytes. Workspace CSS `WorkspacePage-BnuhLJ6X.css` stays 15,869 bytes (15.87 kB) and the same hash. Global `index-BvxZxvMy.css` is 61,125 bytes (61.13 kB). `collab-edge-editor`, `connectNodes`, `setEdgeLabel`, and `Edge label` occur in the workspace chunk only, not in the entry, dashboard, chat, or blog chunks.
- PASS: `cd server; npm test`: 104 passed, 0 failed, 0 skipped. No server source changed.
- PASS: `git diff --check` (CRLF warnings only, exit 0). No production `window.__flow` or `console.log` in the edge files. No chat or blog imports.
- PASS: an external temporary Vite/Playwright harness in StrictMode on `127.0.0.1:5196` rendered the real WorkspaceCanvas and store in installed Google Chrome. An in-memory transform exposed `setViewport`. The harness wrapped `dispatch` and `toast.error`. Nothing was written into the repo. Roles were set on the store. These are controlled component checks, not live Clerk membership checks.
- PASS: all 16 handle pairs, both directions. Zoom 1 and a panned viewport `{x:-50, y:35, zoom:1}` used a rectangle and a diamond at the original spacing. Zoom 2 used the same shapes closer together so every handle stayed inside the 1280px viewport. Each completion dispatched one `edge.add` with a fresh id, the right handles, type `link`, and `data.label ""`. Stored edges had no `markerEnd`, `style`, or `selected`. Version stayed 7. An abandoned drag dispatched nothing. During a node drag the path changed and the only content op was `node.update`.
- PASS: viewer and non-record `connectNodes` return false with no toast and no op. A missing endpoint and a bad handle toast and leave the edge count and version 7. Null and undefined handles are stored as null. Three parallel right-to-left edges keep different ids. Seeding 600 edges and connecting once more toasts the 600 limit, leaves 600 edges, and leaves version 7. Demoting to viewer during a drag, before mouseup, creates nothing.
- PASS: resting stroke computed to `rgba(255, 255, 255, 0.4)` at 1.5px. The interaction path's `stroke-width` is 20. An empty label draws no pill. The closed arrow element is present. A selected edge's computed stroke differs from an unselected one. The multiline pill shows `hello` over `world` with `white-space: pre-wrap`. Canonical edges still have no marker or style. No missing-link-edge warning and no page error. The only console error was a 404 with no URL, the harness favicon.
- PASS: six distinct-side self-loops, a same-side loop, and a null-handle loop produced finite paths. Their label anchors sat at least 20px outside the node box. The same-side loop followed a move and a resize with no edge op. It could be labelled and deleted. A native drag from top to right on one node created one self-loop. A drag from a handle back to itself created nothing. A separate geometry script checked 12 side pairs, a coincident-anchor clearance of 48, and a finite null-input path.
- PASS: double-click on the path opens the editor once, selects the edge, and does not change the viewport transform. Enter commits one `edge.update` of `data.label` only and returns focus to the edge. An unchanged blur does not dispatch. Shift+Enter plus Tab stores a multiline label. Escape discards, and the following blur does not save. Empty text removes the pill. A paste stops at 100. Direct 101-character and non-string labels toast and leave version 7. A missing id returns false. IME Enter (`isComposing`, keyCode 229, `compositionend`) does not commit. Backspace, arrows, Ctrl+Z, and Ctrl+C stay in the editor and do not delete the edge. Wheel and ArrowUp over the editor do not change the viewport.
- PASS: demoting to viewer closes the editor without saving, and promoting back does not reopen it. A viewer double-click does not open an editor. Unmount with a dirty draft does not save. Deleting the edge or its node while the draft is dirty dispatches no `edge.update`. `resetWorkspace` drops the draft and dispatches nothing.
- PASS: Delete and Backspace each remove one selected edge and leave both nodes, one `edge.remove` each. Deleting a node with an incident edge dispatches only `node.remove` and the edge is gone. A mixed selection of node A and edge B-C dispatches `node.remove:a,edge.remove:bc` once; the edge that touched A is cascaded and not repeated. A viewer keyboard Delete and a direct `deleteElements` do nothing and show no toast. A path click selects the edge and dispatches no op.
- PASS: parallel edges share one path `d` and keep different ids. That overlap is the specified limitation. In the selected-edge screenshot the two strokes occupy the same pixels, so only one line is visible; the computed selected stroke is still the brighter token, and the pill belongs to the selected edge.
- PASS: regressions on the same harness. Top-left resize commits a larger size and a smaller position in one `node.update`. A `resizing: false` dimensions change of 12×12 settles the display back to the canonical 40×40 and dispatches nothing. All six shapes render, CSS for rectangle/pill/circle and SVG for the other three, four handles each. A synthetic hexagon drop adds one `n_` node. Ctrl multi-drag commits both nodes in one batch. Node-label Enter, Escape, and pane blur still end on `Blurred`. The Blue swatch sets `#10233D` / `#52A8FF` and keeps the label. Delete while the Red swatch is focused removes nothing.
- PASS: inspected `css-svg.png` (rectangle to hexagon, light arrow, no pill), `selected-label.png` (`hello` / `world` on the pill, arrow into the hexagon), and `self-loop.png` (exterior curves and arrows, labels outside the box). Eight loops on one node crowd their pills together. That is the fixture, not a lane layout.
- PASS: temporary API on port 3010. Boot logged `Server is up and running on PORT: 3010` and `MongoDB connected to 3dfolio`. No Mongoose deprecation line. `/health` returned `{ ok: true }`. `GET /api/posts` returned 200 with `posts` length 0. No project, canvas, message, or user was written.
- PASS, with a limit: temporary app Vite on port 5197. `VITE_API_URL` for that process was `http://127.0.0.1:3010` (no `/api` suffix). The public Clerk key was supplied from `CLERK_PUBLISHABLE_KEY` and was not printed. `/blog` showed "Notes on code, design, and building for the web.", the category links, and Sign in. `/chat` showed the signed-out gate: "ajfm88 Chat" and Continue. No message was sent. The blog's `/posts` requests from origin `127.0.0.1:5197` were blocked by CORS because `CLIENT_URL` has no local origin, so the browser did not render "No posts yet." The direct `GET /api/posts` read is the empty-list evidence. This is not a signed-in walkthrough and not a socket round trip. S10 recorded the last two-account delivery check. S12 changes no server, chat, or blog code.

**Deviations:** None in implementation. Parallel edges overlap on purpose. React Flow still refuses a drag that starts and ends on the same handle; two different handles on one node connect. Drag commits the position React Flow reports after its 1px threshold, which is the approved S10 behavior. Controlled role checks are not live membership checks. The temporary blog origin is not in `CLIENT_URL`, so the in-browser post list was not verified. No commit, push, branch, or S13 work.

**S06 carry-forward:** closed. Shared validation is unchanged. Self-loops draw outside the node. Parallel edges keep their own ids and may overlap.

**Review (Codex, 2026-11-06): No blocking findings.**

- Reviewed the tracked diff and all three new implementation files against `context/specs/12-edges.md` and baseline `050c1a8`. Scope matches the allowed files. S10 geometry/deletion, S11 node UI, shared validation, server code, dependencies, and supplied planning documents are preserved. Arrows stay display-only; edge mutations use the shared operation pipeline and current-state role gate.
- Independently re-ran root `npm run build`: passes, 4252 modules, existing large-chunk warning only. Entry 577.75 kB, dashboard 20.23 kB, workspace 221.16 kB, Collaborate CSS 2.26 kB, workspace CSS 15.87 kB. Server `npm test`: 104 passed, zero failures/skips. `git diff --check` passes with line-ending notices only.
- Independently ran an external in-memory Vite/Playwright harness under StrictMode on port 5198 with the actual WorkspaceCanvas and store. Passed: native path and label double-click open without zoom; draft stays local; Enter sends one exact label-only op and restores edge focus; Escape cancels; pane blur commits once; permission loss discards and regrant stays closed; IME Enter does not submit; deleting an edited edge causes no stale save; text Backspace is isolated and canvas Delete removes only the edge. No browser page exceptions. The only console error was the temporary harness favicon 404.
- Independently checked store no-ops, missing-edge handling, invalid endpoint/handle/over-limit-label rejection, parallel fresh ids, display/canonical marker separation, viewer create/label/delete guards, single-op node cascade, and unchanged version. Sampled 64 self-loop geometries (all 16 side pairs at 40x40, 160x80, 2000x40, and 40x2000): finite nonzero paths, with sampled points outside node interiors. These controlled role checks are not live Clerk membership checks. The external review script is in the OS temp directory as `review12.mjs`; no harness files or instrumentation were added to the repository, and the review browser/server were closed.
- Grok's all-handle native connection matrix, screenshots, remaining regression checks, and configured API boot are recorded implementation evidence, not independently repeated in full. Signed-in membership/chat walkthroughs and the in-browser blog post list remain unverified as described above. S12 changes no authentication, server, chat, or blog code; these limits do not block this local canvas slice. Parallel overlap is the specified limitation.

Approved — 2026-11-06. No implementation changes requested. No commit, push, branch, or S13 work.

### S13 — Workspace join and leave

**Spec (Codex, 2026-11-06):** `context/specs/13-workspace-join-leave.md`. Baseline is the approved, uncommitted S12 tree on HEAD `050c1a8`. Codex reviews this slice.

**Scope:** server room registry and rejection-safe serial queues, membership-checked lazy snapshot loading, join/leave/disconnecting handlers, stable tab identity, store-owned client join/rejoin/retry cleanup, and focused registry/socket race tests. `context/2-architecture.md` records the lifecycle and response clarifications. Socket identity, existing DM handlers, shared canvas rules, and S12 canvas UI remain unchanged.

**Staged behavior:** S13 loads the saved snapshot. Edits stay on this client until S15. Reconnect loads that saved snapshot again and replaces the local edits. No commit/sync events, remote ops, previews, participant broadcasts, turn state, chat, or durable edit saves were added.

**S13-only files.** The starting tree already had uncommitted S12 and the supplied planning docs. Those are not S13 work: `context/2-architecture.md`, `context/3-ui-context.md`, `context/specs/12-edges.md`, `context/specs/13-workspace-join-leave.md`, `src/collaborate/collaborate.css`, `src/collaborate/components/canvas/WorkspaceCanvas.jsx`, `EdgeLabelEditor.jsx`, `LinkEdge.jsx`, and `src/collaborate/lib/edgePath.js`. `useWorkspaceStore.js` contains both the S12 actions and the S13 socket lifecycle.

S13 added `server/src/lib/workspaceRooms.js`, `server/src/sockets/workspace.socket.js`, `server/test/workspaceRooms.test.js`, `server/test/workspace.socket.test.js`, and `src/collaborate/lib/tabId.js`. S13 edited `server/src/lib/socket.js` (import and `registerWorkspaceHandlers` immediately after `registerChatHandlers`), `server/src/lib/safeHandler.js` (comment only; wrapper unchanged), `server/readme.md`, `src/collaborate/store/useWorkspaceStore.js`, `src/collaborate/routes/WorkspacePage.jsx`, and this tracker. `git diff --stat` on the tracked S13 files before this note was 362 insertions and 52 deletions across those six tracked paths. `useWorkspaceStore.js` is the large one because the S12 action diff is in the same file.

**Verified:**

- Registry and queue: `node --test --test-concurrency=1` from `server/`. 126 tests, 126 pass, 0 fail, duration 302.6589 ms. That is the previous 104 plus 22 S13 tests: 3 queue, 6 registry, 13 socket. Covered order, isolation, poison recovery, shared loader, independent projects, failed-init retry, socket idempotence, two tabs for one user, lease protection, cancelled acquisition, and stale release. These are source tests with stubs. They are not live Clerk membership.
- Socket protocol, same run: malformed payload, bad id before bad tab, outsider / missing project / unreadable role never upsert and return only `Project not found`, trusted identity, success shape, normalization, cached join rechecks membership, one lazy canvas, 11000 versus other write errors, at-most-once ack, and the lifecycle races (leave A during join A, join B beating join A, strict-mode join/leave/join, disconnect during init, lease held across `socket.join`, adapter failure, denied replacement, two users).
- `node --check` passed for `workspaceRooms.js`, `workspace.socket.js`, `socket.js`, and `safeHandler.js`.
- `git diff --check` passed. Git printed the usual LF-to-CRLF notices only.
- Client build on disk: Vite 7.3.5, 4253 modules. Entry `index-BSVFRPG9.js` 577,748 bytes, gzip 181,009. Dashboard `Collaborate-CYyRUzav.js` 20,227 bytes, gzip 6,014. Workspace `WorkspacePage-C5GI_fQg.js` 224,302 bytes, gzip 72,854 (S12 was 221,156 / gzip 71,790). Workspace CSS `WorkspacePage-BnuhLJ6X.css` 15,869 bytes, same hash as S12. Collaborate CSS `Collaborate-CJGlWSl_.css` 2,255 bytes. Global `index-BvxZxvMy.css` 61,125 bytes, gzip 11,676. The existing large-chunk warning is unchanged. No new dependency.
- Browser/store, temporary Vite on port 5198, system Chrome headless, StrictMode, fake socket, no Clerk session: 33 checks, 0 failures. Seeded node "Saved" and labelled self-loop "goes" render with stored version 4, a display arrow marker, no canonical marker, fresh selection, and no `/projects` REST call. Local connect, label, move, resize, rename, Blue (`#10233D`), and delete succeed, leave version 4, and emit no `canvas:*` events. Disconnect clears role and content and refuses edits. Reconnect restores the saved snapshot over those local edits. Viewer has no resize controls and cannot connect. Missing access shows "It may have been deleted, or you don't have access." Generic failure, malformed success, and timeout show Try again. Retry keeps the latest ack. A late ack for project A cannot replace project B. Socket replacement ignores the old ack and does not buffer a leave while disconnected. Route exit emits one new leave; a second cleanup emits none. Sign-out emits no leave while disconnected and clears the role. Reload reuses `collab:tabId`; an invalid stored id is replaced and then reused. This is a harness, not a signed-in browser session.
- `getTabId` was also checked in Node with a fresh module per case: reuse, invalid replacement, uppercase canonicalization, and a storage throw that stays stable.
- Configured API, temporary server on port 3010 only, database name `3dfolio`, host redacted. Boot line: `Server is up and running on PORT: 3010` and `MongoDB connected: [host] / 3dfolio`. `GET /health` returned `{ ok: true }`. Two already-synced accounts, Clerk Backend API sessions created for this run and revoked afterward. No User document was written. No chat message was stored.
- Live owner join of a project with no canvas created one canvas, version 0, empty nodes and edges, role `owner`, `participants: []`, `turn: null`. A second socket for the same account saw version 0 and the canvas count stayed 1.
- Live seeded canvas version 7, label `Fixture`, edge label `saved-edge`. The stored document also had a dangling edge. Both sockets received one edge and version 7. The stored document still had 2 edges and version 7. Room connections were 2 and members 1. Leave dropped one connection. Disconnecting the last socket evicted the room.
- A bad project id returned `{ ok: false, message: "Project not found" }` even with a bad tab id. A valid id with a bad tab returned `Invalid workspace request`. The second account joining a project it does not belong to got only `ok` and `message: "Project not found"`, and that project still had no canvas.
- The temporary server was stopped and started again. Rejoin returned version 7, `Fixture`, `saved-edge`, and one edge.
- `GET /api/posts` on that server returned 200, `{ posts: [], hasMore: false }`. No local origin is in `CLIENT_URL`, so this was a direct read, not the blog page.
- Chat on that same temporary server: two owner sockets produced `getOnlineUsers` with length 1 (one user, two sockets). A `typing` emit from the owner was delivered to the second account with `isTyping: true`. Nothing was written to `messages`. This is not the production deployment and not the chat UI.

**Cleanup:** fixture projects `6aee5fb7342e1f019b2d2cdd` (seeded), `6aee5fb7342e1f019b2d2cde` (lazy), and `6aee5fb7342e1f019b2d2cdf` (closed). The first delete looked in `canvases`. This Mongoose model uses the collection `canvas`, so those two documents were still there. A follow-up delete removed both. Afterward: 0 projects named `S13`, 0 matching canvas documents, 0 documents left in `canvas`, 0 `projectmessages`. Both sessions revoked.

**Deviations:** `registerWorkspaceHandlers` takes optional registry and deps arguments so tests can inject a finder. Named ESM exports cannot be stubbed with `mock.method`. `socket.js` calls it as `registerWorkspaceHandlers(io, socket)`. Each room gets its own `writeQueue` and S13 does not use it. The client binds in `useEffect`. Sign-out removes every socket listener before `disconnect`, so the workspace disconnect listener does not run; the route cleanup runs after paint and does not emit `workspace:leave` once the socket is already disconnected. The harness measured that gap.

**Limitations:** Local edits are not saved or broadcast. A reconnect replaces them with the server snapshot until S15. The registry is one process's memory. Role and socket unit tests are controlled stubs. The browser pass is a fake socket. The live pass is authenticated sockets to a temporary server, not a signed-in walkthrough of `/collaborate` or `/chat`. The blog page was not opened from a local origin.

**End of day, 2026-11-06:** S12 is Approved and uncommitted. S13 is ready for Codex. HEAD is `050c1a8`. No commit, push, or branch. No S14 work was started. Temporary Vite on 5198 and the API on 3010 were closed. Harnesses under Temp were removed.

**Review (Codex, 2026-11-06): Changes requested.**

Independently re-ran root `npm run build` (4253 modules; existing large-chunk warning only; workspace 224.30 kB, entry 577.75 kB), all 126 server tests (zero failures/skips), `node --check` on the four affected server modules, and `git diff --check`. All passed. Reviewed the S13 source, server tests, lifecycle specification, and narrow changes to registration/page code. Existing passing tests do not cover the two failure cases below.

1. **P2 — Roll back a partially completed adapter join.** `server/src/sockets/workspace.socket.js:186` sets `adapterJoined` only after awaiting `socket.join`. If the adapter adds the project room and then throws/rejects, the flag remains false and finally skips rollback. Independently reproduced with the actual handler, stubbed model reads, and a fake adapter that adds the room before rejecting: ack was Unable to open workspace and the registry was evicted, but the socket still belonged to `project:<id>`. With no activeProjectId, later leave/disconnect registry logic cannot repair that failed join's adapter membership. Ensure every attempted join that fails/cancels cleans up possible partial adapter membership while preserving the per-user room. Extend the existing adapter-failure test to add the room before throwing and assert both registry and adapter cleanup, plus a successful subsequent join.

2. **P2 — Dispose the previous client binding before replacing it.** `src/collaborate/store/useWorkspaceStore.js:246` overwrites activeBinding without disposing its previous owner. Binding a new still-connected socket before calling the old disposer leaves two old listeners registered and sends no leave on the old socket. Calling the old disposer afterward removes its listeners but returns at the ownership guard without leaving its old subscription. Independently reproduced against the real store loaded through Vite SSR with two connected fake sockets: two old listeners before the old disposer, zero afterward, but zero workspace:leave emits on the old socket in both cases. An older pending join can therefore finish server-side while its ack is ignored client-side. Retire the old binding while it still owns its resources before installing the new one, or provide equivalent socket-specific cleanup. Verify live-socket replacement and same-socket/same-project replacement before old cleanup; later/double old disposers must not reset or leave the new binding. Disconnected old sockets must still emit no buffered leave.

The reproduction script was external (`review13-boundaries.mjs` in the OS temp directory), made no live database reads/writes or external messages, and closed its Vite server. Its dependency-scan shutdown notice was harness teardown, not a production build failure. No application/test files were edited during review. Grok's browser harness and authenticated socket integration remain implementation evidence and were not independently repeated. S12 remains Approved. S13 is not approved; stop here for today with these findings recorded. No commit, push, branch, or S14 work.

**Fixes (Grok, 2026-11-06), ready for review again.**

1. Partial adapter join. `runJoin` marks the project-room attempt before `await socket.join`. If that call adds `project:<id>` and then rejects, `finally` still calls `socket.leave` for that room. The per-user room is not named. The existing adapter-failure test now adds the room before throwing. It asserts `joinedBeforeError`, registry eviction, a leave for the project room, the per-user room still present, and a later join that succeeds and subscribes again.

2. Binding replacement. `bindWorkspace` disposes the active binding before installing the next one, while the old binding still owns its socket. A connected socket emits `workspace:leave` for its project and drops its named listeners. A later or second call of the old disposer sees `disposed` and does not reset the store or leave the new socket. A disconnected old socket still emits nothing.

**Regression for these fixes:**

- Server `npm test`: 126 pass, 0 fail, duration 306.9545 ms. The socket count stays 13; the adapter test was extended, not added.
- `node --check` passed for `workspaceRooms.js`, `workspace.socket.js`, `socket.js`, and `safeHandler.js`.
- `git diff --check` passed. Git printed the usual LF-to-CRLF notices only.
- Root `npm run build`: Vite 7.3.5, 4253 modules, 7.59s, existing large-chunk warning only. Entry `index-B1ZU_nZ3.js` 577,748 bytes, gzip 181,017. Workspace `WorkspacePage-BYBP_-5_.js` 224,329 bytes, gzip 72,862. Workspace CSS `WorkspacePage-BnuhLJ6X.css` 15,869 bytes, same hash as before this fix.
- Client binding check, Vite SSR of the real store, fake sockets, temp script removed afterward: a new connected socket bound before the old disposer leaves the old project once, drops both old listeners, ignores the old ack, and stays loading. Calling that old disposer twice adds no leave and does not reset the new binding. Rebinding the same connected socket to the same project leaves once, keeps one connect listener and one disconnect listener, starts a second join, and the first disposer does not leave again or reset. The second disposer then leaves once and returns to idle; a further call does not leave. An old socket set disconnected before replacement, and a socket that was never connected, emit no `workspace:leave`. The dependency-scan notice on SSR shutdown is harness teardown.

S12 is still Approved and uncommitted. HEAD is `050c1a8`. No commit, push, or branch. No S14 work. The earlier live API and browser harness results still stand; this pass did not repeat them. Local edits remain unsaved until S15.

**Re-review (Codex, 2026-11-06): Approved.**

- Both prior findings are resolved. The adapter attempt is marked before awaiting join, so a rejection after subscription enters project-room rollback. The extended server regression actually adds the room before throwing, then verifies registry eviction, project-room removal, per-user-room preservation, and a successful later join. The client retires the previous binding while it still owns its resources, before installing its replacement.
- Independently ran the actual store through Vite SSR with connected/disconnected fake sockets. Passed: replacement before old disposal removes both old listeners and emits exactly one leave only when connected; stale acknowledgements cannot replace current state; a later/double old disposer cannot reset/leave the new binding; same-socket/same-project replacement retains exactly one listener pair and the newer ack; disconnected replacements emit no buffered join/leave. This was a controlled store check, not a signed-in browser walkthrough. The external script `review13-recheck.mjs` in the OS temp directory added no repository instrumentation, made no live database calls, and closed its Vite server.
- Independently re-ran all 126 server tests: zero failures/skips, including the strengthened adapter regression. The root production build passes (4253 modules; existing large-chunk warning only); workspace `WorkspacePage-BYBP_-5_.js` is 224,329 bytes, gzip 72,862. Entry remains 577,748 bytes; workspace CSS remains 15,869 bytes. Syntax checks on the four affected server modules and `git diff --check` pass (line-ending notices only).
- No further implementation changes requested. The earlier review and Grok's recorded integration evidence remain applicable; live sockets and full signed-in browser flows were not repeated for these narrow corrections. S12 remains Approved. Local edits still do not persist until S15. No application/test changes were made during re-review.

Approved — 2026-11-06. End of day: S12 and S13 approved and uncommitted, HEAD `050c1a8`; no commit, push, branch, or S14 planning/implementation. Stop here as requested.

### S29 — Mobile and accessibility

**Carry-forward from S08:** the shape panel is HTML5 drag-only. Add touch and keyboard/click alternatives in S29; no such handlers were added in S08.

### S29 — Hardening pass

**Carry-forward from S08:** shapes are added only by mouse drag and drop (HTML5 drag events). Touch drop and a keyboard way to add a shape are not built. S29's mobile and accessibility items should decide both.

## Open Questions

- **Q6. Multi-select key in the S09 checklist.** S09 asks for Shift-click, but installed React Flow uses Ctrl-click on Windows / Meta-click on macOS by default; Shift is box selection. S09 also says every other canvas prop stays unchanged. Rendering and Ctrl-click multi-selection pass. Claude should correct the checklist or explicitly spec a different multiSelectionKeyCode in a later slice; S09 did not change keyboard behavior. *Resolved 2026-11-04 (Claude): keep React Flow's defaults.* The checklist was wrong. Multi-select is Ctrl-click on Windows and Cmd-click on macOS, and Shift-drag is box select. The S09 spec is corrected, and S10's multi-select drag check uses the same keys.
- **Q1. What happens to `/chat`?** *Resolved 2026-11-02, refined 2026-11-03: scheduled for deletion.* `/chat` is generic (a thousand apps have DMs) and doesn't set this app apart. Project chat (S23–S24) becomes the only chat. `/chat` stays untouched and working through S30 (goal 6, invariant 10), then post-launch slices remove it. **One exception the user named:** if `/chat` code proves useful for the collaborate route, keep that part (S23–S24 copy and adapt its patterns per invariant 9, so this is about server pieces like presence and the media upload path). Decide what survives when the removal slices are planned. S30 adds no navbar link for it.
- **Q2. Which database do local test runs write to?** *Resolved 2026-11-01: the live database.* The user chose it, and `server/.env` holds the values Render uses. Slice verification must clean up its test data (projects, canvases, and later project messages) and never write `users` documents.
- **Q3. Lane assignment.** Which agent takes server-lane vs client-lane slices, and whether slices run in parallel (separate git worktrees) or strictly in sequence. *Default: sequential, S01 → S30.*
- **Q4. Should a `/collaborate` socket count as online in `/chat`?** *Resolved 2026-11-02: accept it.* Every authenticated socket registers chat presence, so a user with only `/collaborate` open shows online in `/chat` until `/chat` is retired (Q1). No server change. The presence note in S04's `useSessionStore.js` stays.
- **Q5. Retire `/blog` too?** *Resolved 2026-11-03: yes, scheduled for deletion.* Same reason as `/chat`: a blog doesn't set this app apart. `/blog` keeps working, unchanged, through S30 (goal 6, invariant 10). Post-launch slices then remove the blog client (`src/blog/`, `src/pages/Blog.jsx`, its route and navbar link) and the server's post and comment routes, controllers, and models, plus their Clerk webhook cascades. The shared pieces stay because `/collaborate` uses them: Clerk auth, `protectRoute`, `/auth/check`, the `User` model and webhook, ImageKit, and multer. Invariant 9 (collaborate never imports from `src/blog/`) already keeps that removal clean. Whether to keep blog posts in the database (export first) is decided when the removal slices are planned.

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
- Outside `/collaborate`, not fixed: `src/main.jsx` renders in `React.StrictMode`, and chat's `connectSocket` guards on `socket?.connected`. A socket that's still connecting isn't connected yet, so StrictMode's double-run effects can make two overlapping `checkAuth` calls open two sockets in dev. Production doesn't double-run effects. The S04 spec has collaborate guard on the socket's existence instead.
