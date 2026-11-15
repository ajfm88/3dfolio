# Slice 29a — Socket rate limits and the invariant audit

**Execution status (2026-11-14): Todo.** Spec written; implementation not started.

**Lane** server (plus an audit that reads client code and changes none of it) · **Depends on** S28 (Committed, `efb06d9`) · **Unblocks** S29b, then S30

**Spec author** Claude Fable 5.2 · **Implementer** Grok · **Reviewer** Nemotron, assigned by the user on 2026-11-14

## Why S29 is split

The build plan's S29 mixes a server lane (rate limiter, handler sweep) with a client lane (mobile, accessibility, UI states). `5-ai-workflow-rules.md` says a slice that cannot be verified end to end in one session is too broad and the spec author splits it. So:

- **S29a (this spec):** the per-socket rate limiter, two small fixes the sweep already found, and the written invariant audit that the build plan makes S29's done condition.
- **S29b (not specified yet):** mobile, accessibility and UI states. Its outline is in `00-build-plan.md`. Do not start it.

## Baseline and scope

Read AGENTS.md, the six context files in order, HANDOFF.md, and this spec. Planning HEAD is `efb06d9` (commit 70) with a clean tree apart from today's planning documents. Recheck `git status` and `git log -3` before starting.

Baseline measured while planning: `cd server && npm test` passes **304**. The eleven root client suites were last recorded at **280** (259 across the ten older suites, plus membershipUi 21); they were not rerun for planning.

What this slice does:

1. Adds `server/src/lib/rateLimit.js`, a pure token bucket.
2. Applies it per socket to eleven workspace events in `workspace.socket.js`.
3. Makes two small fixes in the same file (section 4).
4. Writes the invariant audit into the progress tracker (section 6).

**No client code changes.** No new socket event, no payload change, no new collection, route, dependency or environment variable. No change to `/blog` or `/chat` behavior. `chat.socket.js` and `lib/socket.js` are not edited.

Mark S29a In progress, implement, run the verification, mark Ready for review with a slice note, and stop. Never commit, push, branch or deploy.

## Allowed files

| File | Work |
| --- | --- |
| `server/src/lib/rateLimit.js` | **New.** Pure token bucket and the limits table |
| `server/src/sockets/workspace.socket.js` | Limiter wiring, the `finally` fix, one comment |
| `server/test/rateLimit.test.js` | **New.** Unit tests for the pure module |
| `server/test/rateLimit.socket.test.js` | **New.** Wiring tests with the fake socket harness |
| `server/readme.md` | Rate limit documentation (section 7) |
| `context/2-architecture.md` | Limits table, boundaries tree wording, checkpoint line |
| `context/6-progress-tracker.md`, `context/HANDOFF.md` | Status, slice note, the audit |

Everything else stays unchanged, including every existing test file. If the work seems to need another file, or an existing test fails, stop and record an open question in the tracker instead of editing it.

## 1. `server/src/lib/rateLimit.js`

Pure, in the style of `lib/turns.js`: no imports, no timers, no clock reads, no I/O, and it never mutates its arguments.

```js
export const RATE_LIMITS = Object.freeze({
  join: 3, commit: 20, sync: 5, preview: 30, cursor: 30, typing: 5, turn: 5,
});

export function createBucket(rate, now)      // → { tokens: rate, updatedAt: now }
export function takeToken(bucket, rate, now) // → { allowed: boolean, bucket }
```

Each number is both the refill rate in tokens per second and the bucket's capacity, so a quiet socket can burst one second's worth.

`takeToken` rules, in order:

1. If `rate` is not a finite number greater than 0, return `{ allowed: false, bucket }` with the bucket it was given. An unknown limit fails closed.
2. If `bucket` is not a plain object with finite numeric `tokens` and `updatedAt`, treat it as `createBucket(rate, now)`.
3. If `now` is not a finite number, use `bucket.updatedAt` as the time. No refill happens.
4. `elapsed = max(0, now - bucket.updatedAt)`. A clock that goes backwards refills nothing.
5. `tokens = min(rate, bucket.tokens + elapsed * rate / 1000)`.
6. If `tokens >= 1`: allowed, and the new bucket holds `tokens - 1`. Otherwise refused, and the new bucket holds `tokens`.
7. The returned bucket is always a **new** object with `updatedAt = max(bucket.updatedAt, now)`.

`sync` (5 per second) is not in the build plan's list. It is added here because `canvas:sync` reads the database on every call; the build plan entry is updated to match.

## 2. Wiring in `workspace.socket.js`

**Configuration through `deps`.** `registerWorkspaceHandlers(io, socket, roomRegistry, deps)` already takes a `deps` object.

- Add `rateLimits: RATE_LIMITS` and `now: () => Date.now()` to `defaultDeps`.
- The limiter reads `deps.rateLimits`. **When it is absent or not an object, nothing is limited.** Every existing socket test passes its own `deps` without `rateLimits`, and several fire more than five events inside a second, so they keep working without edits. Production registers through `lib/socket.js`, which passes no `deps`, so production always limits. Say this in a comment next to the check.
- The limiter's clock is `deps.now` when it is a function, otherwise `Date.now`. This clock is used **only** for rate limiting. Turn, activity and join timestamps keep calling `Date.now()` exactly as they do now.

**Bucket storage.** Add `buckets: new Map()` to the object `getLifecycle` creates. Keys are the seven bucket names above, never anything from a payload. The lifecycle lives in a `WeakMap` keyed by the socket, so buckets disappear with the socket and no cleanup code is needed.

**One helper.** Something equivalent to:

```js
function allowEvent(socket, deps, name) {
  const limits = deps?.rateLimits;
  if (!limits || typeof limits !== "object") return true;
  const state = getLifecycle(socket);
  const now = typeof deps.now === "function" ? deps.now() : Date.now();
  const rate = limits[name];
  const result = takeToken(state.buckets.get(name) ?? createBucket(rate, now), rate, now);
  state.buckets.set(name, result.bucket);
  return result.allowed;
}
```

**Event to bucket.**

| Event | Bucket | Limit per second |
| --- | --- | --- |
| `workspace:join` | `join` | 3 |
| `canvas:commit` | `commit` | 20 |
| `canvas:sync` | `sync` | 5 |
| `canvas:preview` | `preview` | 30 |
| `cursor:move`, `cursor:leave` | `cursor` (shared) | 30 |
| `project:typing` | `typing` | 5 |
| `turn:request`, `turn:release`, `turn:cancel`, `turn:reclaim` | `turn` (shared) | 5 |
| `workspace:leave`, `disconnecting` | none | never limited |

`workspace:leave` and `disconnecting` are never limited: dropping one would leave a connection in a room it has left.

**Where the check runs.** Inside the existing `safeHandler(...)` wrapper for each event, **before** the handler function is called and therefore before any payload validation, lifecycle change, registry read or database call. Every call spends a token, valid payload or not. Keep one `socket.on` per event and keep every handler function's signature and body as it is; only the thirteen registration lines at the bottom of the file change (eleven gain the check).

**What a refused call does.**

- `canvas:preview`, `cursor:move`, `cursor:leave`, `project:typing` and the four `turn:*` events: return. Nothing is relayed, no turn activity is recorded, no turn state changes.
- `workspace:join`, `canvas:commit`, `canvas:sync`: if `ack` is a function, answer `{ ok: false, message: "Too many requests" }` through the existing `replyTo(socket, ack, event)` helper, so a dead socket or a throwing ack is handled the way it already is. If `ack` is not a function, return. Add the constant next to the other failure constants.
- A refused `workspace:join` must **not** touch the lifecycle: no generation bump, no `intent` change. A join already in flight on that socket still completes and still acks success.
- A refused `canvas:commit` or `canvas:sync` takes no room lease and enters no write queue.
- **Never log a refusal.** A flood must not become a log flood.

**Why no client change is needed.** The client already handles each refusal: an unknown join failure shows the existing error card with Try again; a commit rejected without a canvas goes through the existing `canvas:sync` recovery; previews, cursors and typing are already sent at most every 50 ms, 50 ms and 2 s. An unmodified client reaches a limit only by switching projects four times inside one second, which lands on the Try again card. That is accepted.

## 3. Things that stay true

- Identity still comes only from `socket.data.userId`.
- `canWrite`, `joinedConnection`, the commit pipeline, the S27 hooks and the turn sweeper are not edited.
- Buckets are per socket, not per user. A user with several tabs gets one set per tab, and a reconnect starts with full buckets. That is accepted: each new socket pays for a verified Clerk handshake first.
- Single-instance assumption: buckets live in this process, like rooms and turns.

## 4. Two fixes from the sweep

Both are in `workspace.socket.js`. Make exactly these and nothing else.

1. **Socket index cleanup in a `finally`** (note 3 in `27-live-membership-enforcement-review.md`). In the `disconnecting` registration, the index entry is deleted only if `onDisconnecting` returns. Wrap it so the delete runs even when `onDisconnecting` throws, still only when the index holds that same socket object. The error still reaches `safeHandler` and is logged once.
2. **Stale comment above `onTyping`.** It says the cached role "is enough until S27". S27 is in: the cached role is now updated live by `onMemberChanged`. Reword the comment to say that. No code change.

## 5. Tests

No live MongoDB, Clerk or network. Each suite must finish on its own under `cd server && npm test`.

**`server/test/rateLimit.test.js`** (direct imports, no mocks), at least:

1. `RATE_LIMITS` is frozen and holds exactly the seven values in section 1.
2. A new bucket allows exactly `rate` calls at the same `now`, and refuses the next one.
3. Refill is proportional: with rate 5, after a drained bucket, 200 ms later exactly one call is allowed; 199 ms later none is.
4. Refill never exceeds capacity: after a long idle (an hour), exactly `rate` calls pass.
5. A refused call does not push the bucket below zero or delay recovery: drain, call ten more times at the same `now`, then one full interval later one call passes.
6. `now` going backwards, `NaN` and `Infinity` refill nothing and never throw.
7. An invalid rate (`0`, negative, `NaN`, `undefined`, a string) is refused and returns the bucket it was given.
8. A malformed bucket (`null`, an array, missing fields, non-finite fields) behaves like a new one.
9. Inputs are never mutated: pass a frozen bucket through allowed and refused calls.

**`server/test/rateLimit.socket.test.js`**: copy the fake network and `world` helpers from `cursor.socket.test.js` into the new file (do not import from another test file). Register sockets with `deps` that include the usual `findProjectForMember` and `roleOf` stubs **plus** `rateLimits` and a controllable `now`. At least:

1. **Join.** Three joins in the same instant are processed normally; the fourth acks `{ ok: false, message: "Too many requests" }`. The refused call makes no `findProjectForMember` call.
2. **Refused join leaves the lifecycle alone.** Stall a join at `findProjectForMember`, spend the remaining join tokens, send one refused join, then release the stall: the first join still acks `ok: true`.
3. **Commit.** With the holder joined and a small `commit` limit injected (for example 2): two commits save, the third acks `Too many requests`, `Canvas.updateOne` ran exactly twice, and no `canvas:ops` was broadcast for the third.
4. **Sync.** Beyond the limit, the ack is `Too many requests` and the stubbed membership read is not called again.
5. **Preview.** With the holder joined: calls up to the limit reach the other socket; calls beyond it relay nothing and do not move the turn's `lastActivity`.
6. **Cursor shares one bucket.** Spend the whole `cursor` bucket on `cursor:move`; a `cursor:leave` in the same instant relays nothing. Advance `now` by one interval; one more event relays.
7. **Typing.** Beyond the limit nothing is relayed.
8. **Turn shares one bucket.** Spend the `turn` bucket; a further `turn:request` produces no `turn:state`. Advance `now`; it works again.
9. **Never limited.** After every bucket is drained, `workspace:leave` still removes the connection and `disconnecting` still cleans up.
10. **Buckets are per socket.** Draining socket A's cursor bucket does not stop socket B (same user, second socket) from relaying.
11. **No ack function.** A refused `workspace:join`, `canvas:commit` and `canvas:sync` sent without an ack do not throw.
12. **No log on refusal.** Mock `console.error`; refusals of each kind log nothing.
13. **Disabled without configuration.** A socket registered with `deps` that has no `rateLimits` relays 100 `cursor:move` events in one instant.
14. **Production default limits.** Register a socket with no `deps` argument (and a fresh registry). Send four `workspace:join` calls whose `projectId` is invalid, so no database is touched: three ack `Project not found`, the fourth acks `Too many requests`.
15. **Index cleanup in `finally`.** Make `registry.removeConnection` throw for a joined socket, fire `disconnecting`, and show the socket is no longer reachable by a later `onProjectDeleted` or `onMemberChanged` (no emit to it, no throw). If this cannot be observed without a production test hook, say so in the slice note and verify by reading.

Existing suites must pass **unchanged**: 304 before, 304 plus the new tests after.

## 6. The invariant audit

The build plan's done condition for S29: every invariant in `2-architecture.md` is confirmed in the progress file, line by line, with file references. Do this **after** the code changes, against the final working tree.

Add a section `### S29a — Invariant audit` to the tracker with one row per invariant, 1 to 10: the invariant, `Holds` or `Gap`, and the evidence as `path:line` references you opened and read. Do not write a reference you did not check. Use the checks below as the minimum.

| # | Minimum evidence |
| --- | --- |
| 1 | Every handler in `workspace.socket.js` takes the user from `readUserId(socket)` / `socket.data.userId`; every controller under `/api/projects` takes it from `req.user`. Search for `payload.userId`, `body.userId`, `req.body.user` and report the hits (expected: none used as identity). |
| 2 | For each of the 14 routes in `project.route.js`: the query that scopes it to the caller (`findProjectForMember`, `{ _id, owner }`, or the invitation `$elemMatch`), and the write filter that repeats it. |
| 3 | Every canvas write and preview path reaches `canWrite`; list the call sites. `Canvas.updateOne` has exactly one caller. |
| 4 | Server: `applyOps` is the only producer of what `runCommit` saves. Client: search `src/collaborate/components` for direct writes to `rfNodes`, `rfEdges` or `canvas` (expected: none; components call store actions). |
| 5 | The saved `nodes`/`edges` come from `applied.canvas`; loads go through `normalizeCanvas`; `canvasSnapshot` whitelists the ack. |
| 6 | Presence, cursors, previews, typing, turns and rate buckets are never passed to a model; projects, canvas and messages are never served from memory without a database read at join. |
| 7 | Every `socket.on` in `workspace.socket.js` and `chat.socket.js`, and `io.on` in `socket.js`, is wrapped in `safeHandler`; every acked handler checks `typeof ack === "function"`. |
| 8 | Search `src` (outside `src/collaborate/`) for imports from `collaborate/`: only `src/pages/Collaborate.jsx`. Search for `@xyflow/react` outside `src/collaborate/`: none. Run `npm run build` and record the entry chunk, the `Collaborate` chunk and the `WorkspacePage` chunk names and sizes; confirm `@xyflow` text appears only in the workspace chunk. |
| 9 | Search `src/collaborate/` and `src/pages/Collaborate.jsx` for imports from `src/chat/` or `src/blog/`: none. (`components/chat/` inside collaborate is its own folder and is not a hit.) |
| 10 | Not verifiable by reading. Record whether `/blog` and `/chat` were actually opened in a browser. If not, write **not run**. |

Below the invariant table, add a **handler sweep** table with one row per workspace event (all thirteen registrations): `safeHandler`, payload validation, joined check, permission check, ack check, rate bucket. Each cell is a `path:line` reference or `n/a` with a reason.

**If the audit finds a gap that is not one of the two fixes in section 4, do not fix it.** Mark the row `Gap`, describe it under Open Questions, and finish the slice. The spec author decides what happens next.

Three things the spec author already found and is **not** asking you to change. Copy them into the audit as known, accepted items:

- The central error handler in `server/src/index.js` returns `err.message` on a 500. It is shared with `/blog` and `/chat` and is a protected file (Q7 in the tracker).
- REST has no rate limit. A member can post project messages and uploads as fast as the server answers. Members are invited by the owner, so this is accepted for launch (Q7).
- Socket.io's default 1 MB message size applies to `canvas:commit`. The 50-op cap and field-by-field sanitizing bound what is stored, not what is parsed. Changing it means editing `lib/socket.js`, which also serves `/chat`.

## 7. Documentation

- `server/readme.md`, Socket.io section: add a short "Rate limits" paragraph and table after the Client to Server notes (the seven buckets, which events share one, burst equals one second, per socket, in memory, lost on restart, `workspace:leave` never limited). Add `"Too many requests"` to the sentences that list join and canvas failure messages. Say that refused events without an ack are dropped silently.
- `context/2-architecture.md`: add the seven limits to the Limits table; in System Boundaries change the `rateLimit.js` line and the sentence under the tree from planned to implemented, and add `rateLimit` and `rateLimit.socket` to the test list; update the checkpoint line at the top.
- Tracker: S29a row status, the slice note (what changed, verification with counts, deviations), and the audit from section 6.
- HANDOFF: current point, what was and was not run.

## Verify when done

- [ ] `cd server && npm test` passes and exits on its own. Report the total (baseline 304).
- [ ] No existing test file is modified (`git diff --stat` shows only the allowed files).
- [ ] Each of the eleven root client suites passes in its own command, unchanged: `node --test test/<suite>.test.mjs` for canvasHistory, canvasPreview, canvasShortcuts, cursorPresence, membershipUi, participants, projectChat, projectChatUi, turnRobustness, turnState, workspaceSync. Report each count (recorded baseline 280 in total).
- [ ] `npm run build` passes at the repo root with no new warnings; chunk names and sizes are in the audit.
- [ ] `git diff --check` passes.
- [ ] `rateLimit.js` has no imports and no `Date.now`.
- [ ] Every test case in section 5 exists, or the slice note says why one could not be written as specified.
- [ ] The audit has ten invariant rows and thirteen handler rows, each with references that were opened.
- [ ] The server boots with `npm run dev` if an environment is configured, and is stopped again. Do not write live data. Record what was and was not run.
- [ ] Browser checks of `/blog`, `/chat` and `/collaborate` are recorded as **not run** unless actually performed.

## Review checklist (for the reviewer)

Rerun every command above yourself; do not rely on the slice note. Then check:

1. `rateLimit.js` matches section 1 rule by rule, including the fail-closed invalid rate and the non-mutating return.
2. The limiter check is the first thing each of the eleven registrations does, and `workspace:leave` and `disconnecting` have none.
3. A refused join cannot change `generation` or `intent` (read `onJoin`: the bump must be unreachable on a refused call).
4. Limiting is off only when `deps.rateLimits` is missing, and `lib/socket.js` still calls `registerWorkspaceHandlers(io, socket)` with no `deps`.
5. No handler body, payload shape, event name or existing constant changed. The diff in `workspace.socket.js` should be the import, the constant, `defaultDeps`, the `buckets` field, the helper, the registrations, the `finally`, and one comment.
6. No refusal path logs.
7. Open at least one reference per audit row and confirm it says what the row claims. Reject the slice if any reference is wrong or invented.
8. No file outside the allowed list changed; no existing test was edited.
