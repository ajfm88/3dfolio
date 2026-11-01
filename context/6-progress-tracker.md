# Progress Tracker

Update this file after every meaningful implementation change. It records the **actual** state of `/collaborate`, not the intended state.

## Current Phase

- Phase A: Server foundation (S01 approved, awaiting commit)

## Current Goal

- Commit S01, then S02: Project + Canvas models, access helpers, test harness (spec to be written by Claude).

## Completed

- S01: Split socket handlers by feature (approved 2026-10-31, not yet committed).

## In Progress

- None.

## Next Up

- S02 → S03 (server). S04 is independent and can run in parallel. See `specs/00-build-plan.md`.

## Slice Status

Status values: `Todo` · `In progress` · `Ready for review` · `Changes requested` · `Approved` · `Committed`

| # | Slice | Lane | Depends on | Spec | Status | Implementer | Commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | Split socket handlers by feature | server | — | ✓ | Approved | Codex | |
| S02 | Project + Canvas models, access helpers, test harness | server | S01 | | Todo | | |
| S03 | Project REST API | server | S02 | | Todo | | |
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

## Open Questions

- **Q1. What happens to `/chat`?** It stays untouched until S30. The options are: keep 1:1 DMs alongside project chat, or retire `/chat` in follow-up slices after launch. *Default: keep it.* Needed before S30.
- **Q2. Which database do local test runs write to?** The current setup points local development at the live API and Atlas database. Collaborate only adds `projects`, `canvases`, and `projectmessages`, so testing against the live database is low-risk. A separate dev database would need the `users` collection copied over, because the Clerk webhook only syncs to the live one. *Default: live database.* Needed before S03.
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

- S01 installed `server/node_modules`. A local `server/.env` is still absent; configure the documented database and Clerk values before runtime QA. Protected environment files were not edited.
- Render's free tier is kept awake by an external cron hitting `/health` every 10 minutes (see `server/readme.md`). Sockets still drop on deploys and restarts, which is what the S13 rejoin and S22 grace handling exist for.
- `/collaborate` stays dark-launched (URL only, no navbar link) until S30.
