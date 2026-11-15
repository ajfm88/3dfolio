# Slice 29a — Socket rate limits and the invariant audit: Review

**Reviewer:** Nemotron · **Date:** 2026-11-14 · **Verdict:** Approved

## Summary

All verification commands rerun independently. The implementation matches the spec exactly. No code changes requested.

---

## Verification Results

| Command | Result |
| --- | --- |
| `cd server && npm test` | **328 passed**, 0 failed (baseline 304 + 24 new). Duration 2.23s. Exited on its own. |
| `node --test test/workspaceSync.test.mjs` | 13 passed |
| `node --test test/canvasPreview.test.mjs` | 39 passed |
| `node --test test/canvasShortcuts.test.mjs` | 44 passed |
| `node --test test/cursorPresence.test.mjs` | 69 passed |
| `node --test test/membershipUi.test.mjs` | 21 passed |
| `node --test test/participants.test.mjs` | 6 passed |
| `node --test test/projectChat.test.mjs` | 14 passed |
| `node --test test/projectChatUi.test.mjs` | 5 passed |
| `node --test test/turnRobustness.test.mjs` | 28 passed |
| `node --test test/turnState.test.mjs` | 10 passed |
| **Client total** | **280 passed**, unchanged |
| `npm run build` | Passed in 7.80s, 4281 modules, Vite 7.3.5. Existing chunk-size warning only |
| `git diff --check` | Exit 0 (LF-to-CRLF notices on pre-dirty planning files only) |
| `npm run dev` (server) | Boots on port 3000, MongoDB connected to `3dfolio`, `GET /health` → 200 `{"ok":true}` |

Build chunks recorded in the audit: entry `index-B-dpQHOJ.js` 577.78 kB (gzip 181.04 kB), `Collaborate-D3lM2CLX.js` 23.44 kB (gzip 6.80 kB), `WorkspacePage-DO_jLZM3.js` 313.85 kB (gzip 98.78 kB). `xyflow` text appears only in the workspace chunk.

---

## Review Checklist (from spec)

### 1. `rateLimit.js` matches section 1 rule by rule

**Verified.** Opened `server/src/lib/rateLimit.js`:

- `RATE_LIMITS` is `Object.freeze` with exactly the seven values (join:3, commit:20, sync:5, preview:30, cursor:30, typing:5, turn:5) — lines 6–14.
- `createBucket(rate, now)` returns `{ tokens: rate, updatedAt: now }` — line 24–26.
- `takeToken` rules in order:
  1. Invalid rate (≤0, non-finite, NaN, string) → `{ allowed: false, bucket }` with **the same bucket** (fail closed) — lines 29–31.
  2. Missing/malformed bucket → treated as `createBucket(rate, now)` — lines 33–38.
  3. Invalid `now` (non-finite) → uses `bucket.updatedAt`, no refill — lines 40–42.
  4. `elapsed = max(0, now - bucket.updatedAt)` — line 43.
  5. `tokens = min(rate, bucket.tokens + elapsed * rate / 1000)` — line 44.
  6. `tokens >= 1` → allowed, new bucket with `tokens - 1`; else refused, new bucket with `tokens` — lines 45–50.
  7. Returned bucket is **new object** with `updatedAt = max(bucket.updatedAt, time)` — lines 49–52.
- No imports, no `Date.now`, no timers, no I/O, no mutation of inputs — confirmed by reading the file and the `module boundary` test.

### 2. Limiter check is first in each of the eleven registrations; `workspace:leave` and `disconnecting` have none

**Verified.** Opened `server/src/sockets/workspace.socket.js` registrations (lines 1213–1297):

| Event | Registration line | `allowEvent` call line |
| --- | --- | --- |
| `workspace:join` | 1218 | 1219 |
| `canvas:commit` | 1230 | 1231 |
| `canvas:sync` | 1238 | 1239 |
| `canvas:preview` | 1246 | 1247 |
| `cursor:move` | 1251 | 1252 |
| `cursor:leave` | 1256 | 1257 |
| `project:typing` | 1261 | 1262 |
| `turn:request` | 1266 | 1267 |
| `turn:release` | 1271 | 1272 |
| `turn:cancel` | 1276 | 1277 |
| `turn:reclaim` | 1281 | 1282 |
| `workspace:leave` | 1226 | **none** |
| `disconnecting` | 1290 | **none** |

Each limited event calls `allowEvent` **before** the handler (`onJoin`, `onCommit`, etc.). The two un-limited events have no `allowEvent` call.

### 3. A refused join cannot change `generation` or `intent`

**Verified.** In `onJoin` (line 614), the `generation` bump is at line 643 (`state.generation += 1`). This line is only reached when `allowEvent` returns `true` at line 1219. A refused join returns early at lines 1219–1222 and never enters `onJoin`. The `intent` is set at line 645, also unreachable. The test "leaves an in-flight join alone when a later join is refused" (rateLimit.socket.test.js:223–254) confirms the stalled join still completes.

### 4. Limiting is off only when `deps.rateLimits` is missing; `lib/socket.js` passes no `deps`

**Verified.** `allowEvent` at lines 1202–1211:

```js
const limits = deps?.rateLimits;
if (!limits || typeof limits !== "object") return true;
```

A missing or non-object `rateLimits` returns `true` (unlimited). The comment at lines 1198–1201 explains this. `server/src/lib/socket.js` (not edited) calls `registerWorkspaceHandlers(io, socket)` with no `deps` argument, so production always limits. The test "relays when the caller omits rateLimits" (rateLimit.socket.test.js:489–502) and "uses the production join limit when no deps are passed" (504–524) verify this.

### 5. No handler body, payload shape, event name, or existing constant changed

**Verified.** `git diff server/src/sockets/workspace.socket.js` shows only:
- Import of `createBucket, RATE_LIMITS, takeToken` (line 20)
- `TOO_MANY` constant (line 32)
- `buckets: new Map()` in lifecycle (line 278)
- `defaultDeps` adds `rateLimits: RATE_LIMITS` and `now: () => Date.now()` (lines 76–81)
- `allowEvent` helper (lines 1202–1211)
- Eleven registrations gain the `allowEvent` check (lines 1219, 1231, 1239, 1247, 1252, 1257, 1262, 1267, 1272, 1277, 1282)
- `disconnecting` wraps index delete in `finally` (lines 1290–1296)
- Comment above `onTyping` updated (line 1121)

No handler body, payload validation, event name, or pre-existing constant was modified.

### 6. No refusal path logs

**Verified.** Refused paths:
- Lines 1219–1222: returns early, no log
- Lines 1231–1234: returns early, no log
- Lines 1239–1242: returns early, no log
- Lines 1247–1248: returns `undefined`, no log
- Lines 1252–1253: returns `undefined`, no log
- Lines 1257–1258: returns `undefined`, no log
- Lines 1262–1263: returns `undefined`, no log
- Lines 1267–1268: returns `undefined`, no log
- Lines 1272–1273: returns `undefined`, no log
- Lines 1277–1278: returns `undefined`, no log
- Lines 1282–1283: returns `undefined`, no log

The test "does not log a refusal" (rateLimit.socket.test.js:453–487) mocks `console.error` and asserts zero calls across all refusal types.

### 7. Audit rows — opened at least one reference per row, confirmed each

**Verified.** Read the invariant audit in `context/6-progress-tracker.md` (lines 135–150) and the handler sweep (lines 152–168). Opened each cited file and line:

**Invariant 1** — Identity from server: `readUserId` at workspace.socket.js:110 and call sites 936, 966, 1042, 1095, 1126, 1147, 1169; `socket.data.userId` at 634; chat.socket.js:15; handshake at socket.js:44; controllers use `req.user` at project.controller.js:47, projectMember.controller.js:47, projectMessage.controller.js:76, projectMessage.middleware.js:10. Search for `payload.userId`, `body.userId`, `req.body.user` — no matches. ✅

**Invariant 2** — Scoped queries and write filters: All 14 routes in project.route.js:31–44 behind `protectRoute` at line 27. Each route's read scope and write filter repeat the authority (owner, member, or invitation `$elemMatch`). `findProjectForMember` is the `$or` owner/member query at projectAccess.js:60. ✅

**Invariant 3** — `canWrite` at workspace.socket.js:176; commit reaches it at 759; preview at 1047; `Canvas.updateOne` has one caller at 810. ✅

**Invariant 4** — `runCommit` saves `applied.canvas` from `applyOps` at 786, 814. Client components read `rfNodes`/`rfEdges` from store (WorkspaceCanvas.jsx:20), call `dispatch` for edits (73), no direct assignment to `rfNodes`, `rfEdges`, or `canvas`. ✅

**Invariant 5** — Saved fields from applied canvas (814). Loads through `normalizeCanvas` at 221, 263. `canvasSnapshot` whitelists only stored fields (137). ✅

**Invariant 6** — Buckets on socket lifecycle (278). Previews, cursors, typing, turns emitted, not passed to models (1049, 1102, 1132, 1177). Join reads project (499), user (513), canvas (252). Message history is `ProjectMessage.find` after membership check (projectMessage.controller.js:45). ✅

**Invariant 7** — Every `socket.on` in workspace.socket.js (1218, 1226, 1230, 1238, 1246, 1251, 1256, 1261, 1266, 1271, 1276, 1281, 1290) and chat.socket.js (27, 53) wrapped in `safeHandler`. `io.on` in socket.js:56. Acked handlers check `typeof ack === "function"` at 615, 920, 954 and refusal paths at 1220, 1232, 1240. ✅

**Invariant 8** — Outside `src/collaborate/`, only `src/pages/Collaborate.jsx` imports from `collaborate/` (lines 9, 11, 12, 13, 17). `@xyflow/react` only under `src/collaborate/`. Build chunks match audit. ✅

**Invariant 9** — No imports from `src/chat/` or `src/blog/` in `src/collaborate/` or `Collaborate.jsx`. `WorkspacePage.jsx:5` imports `../components/chat/ProjectChatPanel.jsx` (collaborate's own folder). ✅

**Invariant 10** — Not run (recorded as "not run"). ✅

**Handler sweep** — All 13 registrations have `safeHandler`, payload validation, joined check, permission, ack, and rate bucket columns with correct `path:line` references. Verified each cell against the source. ✅

**Known accepted items (Q7)** — Copied into audit at lines 170–173:
- 500 handler returns `err.message` (index.js:52, protected)
- REST has no rate limit
- Socket.io 1 MB default message size applies to `canvas:commit`

### 8. No file outside allowed list changed; no existing test edited

**Verified.** `git diff --stat` shows only:
- Added: `server/src/lib/rateLimit.js`, `server/test/rateLimit.test.js`, `server/test/rateLimit.socket.test.js`
- Modified: `server/src/sockets/workspace.socket.js`, `server/readme.md`, `context/2-architecture.md`, `context/6-progress-tracker.md`, `context/HANDOFF.md`
- Planning files already dirty before this slice: `AGENTS.md`, `context/5-ai-workflow-rules.md`, `context/specs/00-build-plan.md` (not edited by this slice)
- Spec file `context/specs/29a-rate-limits-invariant-audit.md` is new/untracked

No existing test file was modified (`git diff --stat` shows no changes to pre-existing `server/test/*.test.js` or `test/*.test.mjs`).

---

## Deviations Noted (from slice note, accepted)

1. The in-flight join test spends the two remaining join tokens on calls with no ack function. Those calls enter `onJoin` and return before it bumps `generation`. The fourth call is refused, does not call `findProjectForMember`, and the stalled join still acknowledges `ok: true`. This matches the spec's "stalled join still acks success" requirement.

2. Index cleanup observed without a new production hook: `removeConnection` throws once, `disconnecting` logs through `safeHandler` and does not escape, later `onMemberChanged`/`onProjectDeleted` do not call `socket.leave` or `socket.emit` on the dropped socket. `onMemberChanged` still emits via `io.to(socketId)` before index lookup; `onProjectDeleted` emits to the project room. Those broadcasts don't consult the index. The test "drops the socket index when disconnect cleanup throws" (rateLimit.socket.test.js:526–555) confirms the index is cleaned.

3. The three Q7 items are accepted and unchanged.

---

## Verdict

**Approved.** The implementation satisfies every requirement in the spec, the invariants hold with verified evidence, all tests pass, the build passes, and no files outside the allowed list were changed. No code changes requested.