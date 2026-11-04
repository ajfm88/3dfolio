# Progress Tracker

Update this file after every meaningful implementation change. It records the **actual** state of `/collaborate`, not the intended state.

## Current Phase

- Phase C: Canvas. S06 and S07 approved 2026-11-03, awaiting one combined commit. Phases A and B are committed: S01 as `421a99a`, S02 + S03 as `06716fa`, S04 + S05 as `7ad4bbb`.

## Current Goal

- Commit S06 + S07 together (user decision, 2026-11-03). Then S08 (shape panel + drop), whose spec Claude writes next.

## Completed

- S01: Split socket handlers by feature (approved 2026-10-31, committed 2026-11-01 as `421a99a`).
- S02: Project + Canvas models, access helpers, test harness (approved 2026-11-01, committed 2026-11-01 as `06716fa`, together with S03).
- S03: Project REST API (approved 2026-11-01, committed 2026-11-01 as `06716fa`, together with S02).
- S04: `/collaborate` route shell + session (approved 2026-11-02, committed 2026-11-02 as `7ad4bbb`, together with S05).
- S05: Projects dashboard (approved 2026-11-02, committed 2026-11-02 as `7ad4bbb`, together with S04).

## In Progress

- None.

## Next Up

- S08 (shape panel + drop), then S09 (node rendering). Specs are written by Claude just before each slice. See `specs/00-build-plan.md`.

## Slice Status

Status values: `Todo` · `In progress` · `Ready for review` · `Changes requested` · `Approved` · `Committed`

| # | Slice | Lane | Depends on | Spec | Status | Implementer | Commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | Split socket handlers by feature | server | — | ✓ | Committed | Codex | `421a99a` |
| S02 | Project + Canvas models, access helpers, test harness | server | S01 | ✓ | Committed | Codex | `06716fa` |
| S03 | Project REST API | server | S02 | ✓ | Committed | Grok | `06716fa` |
| S04 | `/collaborate` route shell + session | client | — | ✓ | Committed | Codex | `7ad4bbb` |
| S05 | Projects dashboard | client | S03, S04 | ✓ | Committed | Codex | `7ad4bbb` |
| S06 | Shared canvas ops module | server | S02 | ✓ | Approved | Grok | |
| S07 | Canvas foundation | client | S05, S06 | ✓ | Approved | Grok | |
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

### S12 — Edges

**Carry-forward from S06:** S06 allows self-loops and parallel edges; decide how `LinkEdge` draws them, or add a rule to `canvasOps.js` through a spec change.

## Open Questions

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
