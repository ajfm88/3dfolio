# Slice 23 — Project messages API and typing relay

**Lane** server · **Depends on** S13 (Committed) · **Unblocks** S24

**Implementer** Grok · **Reviewer** Codex, assigned by the user

## Baseline and scope

Read `AGENTS.md`, the six context files in order, this spec, and the existing project routes, DM media helper, and workspace lifecycle before editing. Planning baseline: clean working tree at `43eb732` (commit 67), with S21 and S22 committed. Record the actual implementation baseline and preserve later user changes.

Build the durable project-chat backend: paged history, text/image/video sends, a room-scoped message broadcast, typing relay, and message deletion when an owner deletes a project. All three roles may chat without holding a turn or joining a socket room for REST requests. S24 adds the client. S27 adds live membership enforcement and the Clerk deletion cascade. S29 adds rate limiting. Do not implement those slices now.

Mark S23 In progress, implement only this slice, run verification, mark Ready for review with evidence and limitations, and stop. Never commit, push, create branches, or deploy.

## Allowed files

| File | Work |
| --- | --- |
| `server/src/models/projectMessage.model.js` | New durable model |
| `server/src/lib/projectMessages.js` | New pure input, pagination, and response-shaping helpers and constants |
| `server/src/controllers/projectMessage.controller.js` | New history and send handlers |
| `server/src/middleware/projectMessage.middleware.js` | New project chat authorization and project-only upload error handling |
| `server/src/routes/project.route.js` | Wire two message routes under existing protectRoute |
| `server/src/controllers/project.controller.js` | Delete project messages in the existing delete cascade |
| `server/src/lib/imagekit.js` | Add the folder parameter only; preserve the default DM behavior |
| `server/src/sockets/workspace.socket.js` | Register typing using existing completed-join authority |
| `server/test/projectMessages.test.js` | Pure helpers and model validation |
| `server/test/projectMessage.api.test.js` | REST/middleware/controller/cascade behavior with isolated dependencies |
| `server/test/projectTyping.socket.test.js` | Typing authority, validation, and scope |
| `server/test/imagekit.test.js` | Folder parameter and default DM upload regressions |
| `server/readme.md` | Endpoint, event, model, media, and deletion documentation |
| `context/2-architecture.md`, `context/6-progress-tracker.md` | Record actual implementation and evidence |

No new dependencies or manifest changes. Existing client files, shared canvas semantics, chat routes/controllers/models, auth and shared upload middleware, socket bootstrap, webhook, and environment files remain protected. Tests may use small dependency-injected factories in the named new modules; do not add a general service framework or modify third-party modules. If another file is necessary, record why before expanding scope.

## 1. Model and wire resource

`ProjectMessage`, collection `projectmessages`, uses timestamps, required ObjectId refs `project` → Project and `sender` → User, and String fields `text`, `image`, `video` defaulting to empty strings. Text is at most 2,000 characters. Require nonblank text or one media URL; never accept two media kinds on a saved message. Use database-free async schema validation tests.

Use the compound index `{ project: 1, createdAt: -1, _id: -1 }`. The `_id` tie-breaker is a deliberate refinement of the original architecture index, needed for paging messages saved in the same millisecond. No other index is needed in S23.

Every REST message and message-event resource has exactly:

```js
{
  _id, project,
  sender: { _id, fullName, img }, // null if the referenced user no longer exists
  text, image, video, createdAt, updatedAt
}
```

IDs serialize as strings, dates as ISO timestamps, absent content as empty strings. Populate sender with `_id fullName img` only; do not expose email, Clerk ids, or other user fields. Whitelist the outer resource too, excluding `__v`. The POST resource and event resource must match the GET shape. Never populate the project resource or disclose its members.

## 2. REST access and middleware order

Reuse `findProjectForMember` and `can(roleOf(project, req.user._id), "chat")`. Invalid id, missing project, and non-member return `404 { message: "Project not found" }`; no message query or upload runs. A known role without chat permission gets 403. Authentication remains the existing router-level protectRoute (401 for signed out).

Authorize before validating message-specific query/body details and before invoking `upload.single("media")`. The new authorization middleware can attach its trusted project result to the request for the controller. Do not accept identity or access from request body fields.

Routes stay in `project.route.js`, below `router.use(protectRoute)`:

- `GET /:id/messages`: project chat authorization, history handler.
- `POST /:id/messages`: project chat authorization, project upload wrapper, send handler.

Reuse the unchanged memory upload middleware (image/video, one `media` file, max 25 MB). The project-only wrapper maps its parsing/rejection errors to 400 `{ message }`, including oversized files, unsupported MIME, wrong file field, and multiple files. Shared `/chat` error behavior must not change. Do not mount a router or change middleware in `index.js`.

## 3. History and lossless paging

`GET /api/projects/:id/messages?before=<ISO>&beforeId=<id>&limit=50`

- First page: omit both cursors; default limit 50. Accept a single decimal integer string from 1 to 50. Reject invalid, repeated, array, or object limit values with 400; do not silently clamp or parse a numeric prefix.
- Optional `before` is a single canonical UTC ISO timestamp (`new Date(value).toISOString() === value`). Invalid dates and nonscalar/repeated values return 400.
- Optional `beforeId` is a single 24-hex ObjectId string and requires `before`. Canonicalize to lowercase. It is a tie-breaker value, not a message lookup. No cursor query may read a different project.
- With both cursor fields, filter within this project by `createdAt < before` OR (`createdAt === before` AND `_id < beforeId`). With only `before`, use strict `createdAt < before` for compatibility with the build-plan URL.
- Query newest first: `{ createdAt: -1, _id: -1 }`, fetch `limit + 1`, derive hasMore, remove the extra row, then reverse the retained page. The returned page is oldest first in this same total order.

Return 200:

```js
{
  messages: [/* whitelisted resources, oldest first */],
  hasMore: true, // whether the extra row existed
  nextCursor: { before: "2026-11-11T12:00:00.000Z", beforeId: "..." }
}
```

`nextCursor` is derived from the oldest returned row only when hasMore is true; otherwise it is null. Empty pages return `messages: []`, `hasMore: false`, `nextCursor: null`. S24 must send both fields from nextCursor. This additive `beforeId` and envelope contract resolves the original plan's timestamp-only ambiguity; it does not replace `before` with an opaque cursor or change any socket payload.

## 4. Send and broadcast

`POST /api/projects/:id/messages` accepts JSON text-only or multipart with optional text and one `media` attachment. Whitelist content: body-supplied `_id`, project, sender, timestamps, image/video URLs, and other fields never become stored identity or media. URLs come only from an uploaded file.

- Missing text means empty text. Present text must be a string (reject null, numbers, arrays, objects, and duplicate multipart text fields). Check the supplied length against 2,000 before trimming outer whitespace. Preserve internal newlines.
- Require trimmed nonempty text or an attachment. A media-only message is valid; text plus media is valid. Invalid text is still 400 when a file is present. Validate text before contacting ImageKit.
- No media means no ImageKit check or call. For media, missing configuration returns the existing 503 sentence `Media upload is not configured`, with no message save or broadcast.
- Change the shared helper to `uploadChatMedia(file, folder = "/chat")`, and pass the parameter to the existing ImageKit upload. Project messages call it with `/collaborate`. Leave file-name generation, lazy initialization, return value, and the existing one-argument DM caller unchanged.
- Set project from the authorized route project and sender from req.user. Assign only the returned upload URL to `image` or `video` based on the accepted file MIME.
- After a slow media upload, recheck membership before saving. A removed member or deleted project gets 404 and no message insert/broadcast. Do not claim this removes every concurrent-delete race: cross-collection transactions and live deletion coordination are outside S23. Record this boundary in the architecture.
- Await successful persistence, populate/shape the result, then emit the non-volatile event `io.to("project:<canonicalId>").emit("project:message", { projectId, message })`. Broadcast to every tab in that workspace, including the sender's socket and their other tabs. Do not emit to per-user rooms or a global room. REST sending does not require a socket or create a workspace room.
- Return 201 with `{ message }`, using the identical resource as the event. S24 deduplicates its REST result and realtime echo by `_id`.

Validation, upload, and save failures produce no broadcast; upload/save operational errors reach the existing Express 5 error handler. No retries or duplicate-message prevention protocol is added. ImageKit files can be orphaned if a later save/access check fails, as with the existing media pipeline; do not add a cleanup service or persist ImageKit file ids in this slice.

## 5. Typing relay

In `registerWorkspaceHandlers`, add `project:typing` through safeHandler. Payload must be a plain record with valid string projectId and an actual boolean isTyping. Unknown fields are ignored. Derive userId from the authenticated socket and canonicalize projectId exactly as the cursor handlers do.

Use `joinedConnection` and the trusted cached member role with `can(role, "chat")`. Match the completed join generation, active project, live socket, adapter room, and registry connection; checking only socket.rooms is insufficient. Every role can type, independent of canvas turn or recovery. Invalid or unauthorized packets are silently dropped, with no ack.

Relay only `{ projectId, userId, isTyping }` through `socket.to(room).volatile.emit("project:typing", ...)`. Exclude the sending socket but allow its other tabs. No DB queries/writes, room acquisition, queue jobs, turn activity updates, typing state/timers, or unrelated broadcasts. A stale leave naming another project does not revoke the current project's authority. S24 expires indicators after 5 seconds; S29 adds throttling protection.

## 6. Project deletion and documentation

Extend the existing owner-only delete handler to await `ProjectMessage.deleteMany({ project: project._id })` after the guarded project deletion and before returning success, alongside Canvas deletion. Missing messages are fine. Non-owner, missing, and outsider paths must not delete messages. Update the old S23/S27 cascade comment to reflect reality. Room eviction, workspace:removed, and Clerk user deletion stay in S27.

Update server/readme in the same slice: structure, both routes and envelopes, query validation and both cursor fields, POST JSON/multipart examples, status codes, sender projection, new collection/index, typing and message event tables, `/collaborate` media folder and shared 25 MB limit, and project-delete cascade. Keep planned and implemented behavior distinct.

## 7. Automated verification contract

Use node:test and installed dependencies only. Isolate models, uploads, and emission with stubs or narrow dependency injection; controller tests must exercise production handlers, not reproduce their logic. Tests must not contact MongoDB, Clerk, or ImageKit, create users, or read environment secrets. Restore stubs and close any temporary listeners in cleanup. If testing the actual multipart middleware, use installed Express and Node HTTP/fetch/FormData on a loopback ephemeral port; authentication can be a local test fixture outside production code.

- Helpers/model: required refs, content rules, defaults, 2,000/2,001 boundaries, invalid body types, media-only, string whitelisting, sender projection, correct collection/index, date/id/limit parsing, and input nonmutation.
- History: all three roles; outsider/invalid/missing id yields 404 before query-specific errors; exact project filter; 50 default and smaller pages; correct chronological result; empty/final page envelopes. A dataset with more than a page of identical timestamps, followed through returned cursors, returns every id exactly once, including when a new later message arrives between pages. Assert the actual query predicates/order/limit and response shaping.
- Sending: JSON, multipart image/video, text+media, no-turn viewer, whitespace/empty body, duplicate text fields, ignored forged identities and URLs. Verify membership precedes upload; invalid text prevents ImageKit; missing config gives 503 only for media; upload/save failure emits nothing; delayed upload followed by access loss prevents insert. Persist-before-broadcast ordering and identical POST/event shape are required.
- Transport: project broadcast includes sending/other tabs in that room and excludes another project and per-user-only sockets. Test real middleware rejection for wrong file field, multiple files, unsupported MIME and >25 MB as 400 on project requests; verify no save/upload/broadcast.
- Deletion: owner removes only that project's messages; no message delete on rejected project deletion; failure of message cleanup cannot return success.
- ImageKit: intercept the SDK upload without real network; one-argument call uses `/chat`, explicit call uses `/collaborate`, both preserve the helper's returned URL and file MIME. Keep default behavior under test without editing the DM handler.
- Typing: true/false from every role, spoofed userId stripped, uppercase project canonicalization, no own echo, other-tab delivery, cross-project exclusion. Reject malformed payloads and nonboolean values, unjoined/outsider/disconnected sockets, immediate post-leave sends, and sends during a pending rejoin/replacement. Stale leave for another project preserves authority. No model, queue, canvas, presence, or turn changes.

Run all server tests with `npm test` in server/. Run each existing root client suite separately, sequentially (their Vite harnesses share a port): workspaceSync, canvasPreview, participants, cursorPresence, turnState, turnRobustness (`node --test test/<name>.test.mjs`). Run root `npm run build` and `git diff --check`. Record counts and warnings; existing assertions must stay intact.

## 8. Runtime checks and completion

- Boot server with existing configuration, confirm MongoDB connection and GET /health 200, and stop only the process you started. No config changes or secret output.
- With available synced accounts and a shared fixture, verify REST history/send as owner and viewer, outsider 404, two sockets receiving message/typing in one project, isolation from another project, paged reload, and owner deletion cleanup. Clean up only test-owned projects/canvases/projectmessages. Never create or edit users to manufacture accounts or access.
- Check real attachment send where practical; otherwise explicitly record SDK coverage as stubbed. Do not claim the live media path was verified from the 503 or a fake upload alone. No automatic live uploads are required just to exercise the helper.
- Check `/blog` loading and `/chat` DM, typing, presence, and attachment regression with available sessions. If browser tools/accounts are unavailable, record those checks as unverified, carry shared-project checks to S26/S28, and retain launch limitations. Automated endpoint/socket coverage enables code review; it does not establish browser QA.
- Tracker: list changed files, baseline, each check and evidence, deviations, and deferred checks. Leave S23 Ready for review, never Approved. S24 and all other tracks stay untouched.

## Grok handoff

Read AGENTS.md and its six context files, then this spec. Implement S23 only, using the allowed files and contracts above. Mark In progress first; run the listed verification; mark Ready for review with evidence and stop. Codex will review the diff and rerun tests. Do not commit, push, create branches, or deploy.
