# Slice 18: Live cursors

**Lane:** both · **Depends on:** S17 (Approved or Committed)

**Implementer:** Grok · **Reviewer:** Codex

## Goal, baseline, and stopping point

Other people in the same project see a colored cursor and name badge while you move over the canvas. Flow coordinates travel over the wire, so the cursor stays on the right canvas point when either person pans or zooms. Viewers have cursors too. Cursors are ephemeral: leaving the canvas, departing from presence, or receiving no movement for 10 seconds removes them.

Read AGENTS.md and the six context files, this spec, and the current S17 implementation before coding. Codex is the reviewer for this slice. This is the last slice requested for today: return S18 Ready for review and stop. Do not plan or implement S19.

Planning baseline (2026-11-08): HEAD `cc1f681` plus the uncommitted S17 implementation, including `participants.js`, `ParticipantStack.jsx`, `test/participants.test.mjs`, and `test/ssrRender.js`. S17 is Ready for review, not Approved. S16 remains Changes requested with known preview test failures. This planning document approves neither slice. Normally complete S17 review before S18 implementation; if the user explicitly assigns S18 against the pending baseline, record that instruction and preserve its status instead of claiming approval.

Capture the starting diff and untracked-file list. Preserve all earlier work and add only S18 changes. Do not reset, stash, overwrite, commit, push, or create branches. No dependency/configuration changes, database fixtures, new REST routes, collections, cursor persistence, invitations, turns, or other features.

## Allowed files

| File | Work |
| --- | --- |
| `server/src/sockets/workspace.socket.js` | Register and authorize the two cursor relays using existing join authority |
| `server/test/cursor.socket.test.js` | New deterministic relay/authorization/no-write tests |
| `src/collaborate/lib/userColor.js` | Pure deterministic user-color mapping |
| `src/collaborate/lib/cursorPresence.js` | Cursor payload validation, expiry controller, and testable coordinate projection helper |
| `src/collaborate/lib/throttle.js` | Only the narrow corrections necessary for the existing throttle to meet the shared 50ms contract below |
| `src/collaborate/store/useWorkspaceStore.js` | Cursor actions, per-binding throttle/controller/listeners, lifecycle and roster cleanup |
| `src/collaborate/components/canvas/WorkspaceCanvas.jsx` | Canvas pointer tracking and mount the cursor overlay inside the existing provider |
| `src/collaborate/components/canvas/PresenceCursors.jsx` | Pointer/name overlay subscribed to viewport changes |
| `src/collaborate/components/workspace/ParticipantStack.jsx` | Add the same deterministic user color to each visible avatar's ring |
| `test/cursorPresence.test.mjs` | Pure helper, throttle, actual-store, and small rendering regressions |
| `test/ssrRender.js` | Extend existing test-only renderer exports only if required |
| `server/readme.md` | Cursor events, permissions, expiry, multi-tab behavior, and no persistence |
| `context/2-architecture.md` | S18 behavior/status paragraph when implemented |
| `context/6-progress-tracker.md` | S18 status and evidence |

Existing server test helpers may be read/copied into the new test; do not refactor old suites. Do not edit `workspaceSync.js`, `canvasOps.js`, registry membership, preview overlays/handlers, canvas mutation callbacks, or S17 participant normalization. Correcting the shared throttle is explicitly allowed because S18 reuses it; document that limited overlap with the S16 review. Do not fix other S16 findings under S18.

## Wire and server

Use exactly the architecture's existing events. Client to server, volatile and without ack:

```js
socket.volatile.emit("cursor:move", { projectId, x, y });
socket.volatile.emit("cursor:leave", { projectId });
```

Server to other sockets in the joined project, also volatile:

```js
socket.to(`project:${projectId}`).volatile.emit("cursor:move", {
  projectId, userId, x, y,
});
socket.to(`project:${projectId}`).volatile.emit("cursor:leave", {
  projectId, userId,
});
```

Register both through `safeHandler`. Validate a plain-record payload and a 24-character hex project id; canonicalize project ids. Movement requires finite numeric x and y with absolute values at most shared `POSITION_MAX`. Reject null, arrays, NaN, infinities, numeric strings, and out-of-bounds points. Strip extras. Ignore a callback if supplied; do not ack or throw for bad input.

Use authenticated `socket.data.userId`, never a payload user id. Both handlers synchronously require the existing completed-join authority (`joinedConnection`): current generation, active project, connected socket, adapter-room membership, and matching registered connection. Use `can(member.role, "chat")`, which includes owners, editors, and viewers. Do not use `canWrite` or turn/edit rights.

No membership/profile lookup, room acquire/retain, serial write queue, timers, database access, cached cursor coordinates, or canvas/presence broadcast is needed. Leave/rejoin/disconnect invalidates cursor-send authority exactly as it invalidates commit authority. A leave for another project does not invalidate the current one. Preserve existing canvas and participant lifecycle handling.

## Coordinates and pointer handling

Track mouse movement over the canvas's wrapper, including over nodes and edges. Use wrapper pointer handlers and ignore touch input; touch cursors and keyboard cursor simulation are out of scope. Do not rely only on pane movement, which misses nodes.

Convert `event.clientX/clientY` with `screenToFlowPosition({ x, y }, { snapToGrid: false })` inside the existing ReactFlowProvider. That API already accounts for the canvas rect and viewport transform. Do not subtract the rect first or snap the result. Pass only the converted point to a store action such as `moveCursor(point)`; components never emit sockets directly.

Ignore movement originating in inputs, textareas, contenteditable elements, buttons, and floating controls/panels; moving into those areas clears any previously published cursor by calling the leave action. Moving back over the canvas can publish again. Use event target/closest checks local to the wrapper; do not change canvas editing events, preventDefault, pointer capture, native dragging, or the viewport.

Wrapper pointer leave/cancel calls `leaveCursor()`. A leave cancels pending movement before emitting, so a trailing point cannot recreate a cursor after leaving. Repeated leave calls without a new accepted movement do not need another emit. Do not emit on pan/zoom alone or manufacture movement from a saved screen position. The stored point means a location on the diagram.

## Store send, receive, and cleanup

Add `cursors: {}` to emptyWorkspace, keyed by canonical Mongo userId, with entries containing only `{ x, y, lastSeen }`. Receive time is local and never sent on the wire. Names and roles come from the S17 participants array, not from cursor payloads.

Sending is allowed for every project role while status is ready and the binding has a live matching joined socket. Canvas-only recovery (`syncStatus === "syncing"`) does not block cursors or presence; loading/rejoining and error/notFound states do. Do not reuse `selectCanEdit`. Validate points before scheduling and re-check binding identity, join attempt, socket id, current project/status/role immediately before an actual throttled emit. A callback captured by a retired binding must never use the newer active binding's socket.

Use one cursor throttle per binding, separate from the preview throttle. Reuse `throttle(fn, 50, clock)`. Correct its current first-call-at-zero and missing trailing invocation-time bookkeeping so all actual emissions are at least 50ms apart, including a new call immediately after a trailing emit. First movement runs immediately on a quiet fresh throttle; calls inside a window collapse to the latest arguments. Use `timerId !== null`, so a fake timer id of 0 is valid. `cancel()` drops a pending call and cannot invoke it later. Use an injectable clock for tests, and preserve the preview caller's API. No new throttle implementation or extra package.

Register one listener each for cursor:move and cursor:leave on a binding, and remove those exact functions on disposal. Incoming events require the active, non-disposed, connected, joined socket and matching project, plus ready status. Accept them during canvas-only recovery. Ignore events received before the join ack is installed rather than buffering them; subsequent movement refreshes ephemeral state.

Validate inbound records and ids before use; canonicalize ids; validate coordinates with the server bounds. Strip extras and ignore an unknown user not in the current participant roster. Suppress self by the current Mongo authUser._id, including events from that account's other tabs. Do not use a Clerk id. A malformed event causes no toast, dispatch, sync, partial update, or socket emit.

A valid move replaces that user's entry and restarts its expiry for 10,000ms after receipt. A valid leave removes it immediately and cancels its expiry. Every accepted presence snapshot removes cursors for users no longer present, including when the latest buffered roster is installed after a join. A profile/role update for a still-present user preserves their point and lets the UI use the new name.

Keep timers in a binding-owned controller outside serialized state. Its clock (`now`, setTimeout, clearTimeout) and change callback must be injectable. Per-user timeouts or one earliest-expiry timeout are both acceptable; no polling. Expiry must publish the changed cursor map, not just delete an internal entry. A superseded callback cannot expire a newer point or update a retired workspace.

New join/retry, disconnect, reset, disposal, binding replacement, and transitions to error/notFound clear cursor state, expiry timers, and trailing sends. Ensure sync-originated empty-workspace transitions also clear the controller; if needed use a binding-owned store subscription with exact cleanup. Do not edit the S15 sync helper. A successful canvas-only snapshot preserves still-valid cursors. A connected route exit can emit a final volatile cursor:leave before the existing workspace:leave; disconnected paths emit nothing. Do not create a socket or reconnect solely to send leave.

## Overlay, colors, and multiple tabs

Render PresenceCursors as a sibling overlay over ReactFlow inside the existing provider and a known positioned canvas wrapper. Subscribe with `useViewport()` so remote points reproject whenever the local viewport changes, even with no new network event. For each point call `flowToScreenPosition`; its output is client/screen coordinates. Subtract the overlay container's current bounding rect exactly once to get local absolute coordinates. Keep this projection in a small testable helper in cursorPresence.js. It must also work when the canvas starts below the navbar or the container moves/resizes. Use the current rect when rendering/reprojecting; account for container resize without retaining a stale offset, e.g. a ResizeObserver with cleanup. No independent zoom scaling of the pointer/name badge.

The overlay is clipped to the canvas, absolutely positioned, and pointer-events-none throughout. It must not block selection, edge connections, dragging, panning, controls, or label editing. Keep controls above it. Use a small SVG pointer (code-native) and a compact text-sm name badge; no image assets or new fonts. Render names as React text, use trimmed fullName or `Unknown user`, and truncate long names. Mark the decorative cursor overlay aria-hidden, since the accessible participant stack already identifies users; do not announce continuous movement.

`userColor(userId)` must produce the same palette color on every client, after lowercasing a valid id. Use a documented deterministic hash (e.g. start at 0, for each character hash = (hash * 31 + charCode) >>> 0, then hash % palette.length). The palette is exactly the eight colors in 3-ui-context.md: `#FF6B6B`, `#4ECDC4`, `#45B7D1`, `#96CEB4`, `#FFEAA7`, `#DDA0DD`, `#F7DC6F`, `#85C1E9`. Keep these literals only in userColor.js. Invalid input uses the first color. Inline color styles may originate from this helper; other chrome uses existing tokens. Use the same color on the user's existing participant avatar border/ring; preserve initials, image-error handling, overflow, focus labels, and self filtering.

The protocol is per user, not per tab. Display one latest accepted cursor per other user. Movement from either tab replaces it, and cursor:leave from either tab clears it until the next movement. Closing one tab while another remains does not produce a presence departure; a silent point can therefore remain until its 10s expiry. Last-tab departure removes it via presence. Do not add socket ids, tab ids, sequence numbers, or server aggregation to change those semantics.

## Verification

Use node:test, mocked model access, fake sockets, deferred joins, and fake clocks. No real 50ms/10s waits and no live database fixtures. Load Vite SSR modules in before hooks before destructuring them. Use the S17 actual-store harness and test/ssrRender.js for small markup checks. Installed React Flow declarations confirm the conversion options; no library or dependency changes are needed.

- [ ] Server: owner/editor/viewer movement and leave relay to the project except sender, volatile, with authenticated userId and stripped payload. A same-user second socket remains an eligible recipient.
- [ ] Server: invalid envelopes/ids/coordinates, outsider, unjoined socket, wrong project, stale generation, disconnected socket, same-project leave before queued detach, and delayed rejoin all relay nothing and invoke no callback. Different-project leave preserves current authority. Resolve deferred gates before awaiting joins; use a bounded test timeout.
- [ ] Server: cursor events do not query models, create/retain a room, enqueue writes, mutate canvas/version, or emit canvas/presence events. Existing joins can perform their usual initial lookups/upsert; reset instrumentation after joining.
- [ ] Throttle: leading emission with clock 0, timer id 0, latest trailing arguments, cancel with an actually scheduled timer, and minimum 50ms spacing across leading/trailing/subsequent emissions. Confirm preview callers retain API compatibility; do not repair their unrelated tests.
- [ ] Actual store: viewer sends, recovery sends, leading/trailing points emit only normalized flow fields, leave cancels a scheduled point, loading/disconnected/old binding/id/attempt never sends, and reconnect does not replay a queued point.
- [ ] Actual store: valid move/leave, unknown user/self suppression, malformed input, wrong project/connection, ignored pre-ack movement, and one listener per binding with exact disposal. Assert no graph/version, commit queue, sync, toast, or durable write changes.
- [ ] Fake clock: move replaces point; at 9999ms it remains and at 10000ms it disappears from rendered store state. A second move restarts expiry; an old timeout cannot remove it. Leave/departure clears it; another tab remaining in presence does not count as departure. Disposal/reset/retry/disconnect/error/notFound clear timers and state; recovery preserves valid points.
- [ ] Projection: use nonzero container left/top, nonzero pan, and zoom 0.2/1/2. Verify screen-to-flow output is sent without extra rect subtraction and flow-to-screen output subtracts the overlay rect once. Viewport changes must trigger projection without another movement event. Test distinct sender/receiver viewports.
- [ ] Color/rendering: canonical/case-equivalent ids give the same palette color on cursor and avatar; fixed hash vectors prevent an accidental algorithm change. Names are escaped, blank names fall back, cursor layer ignores pointer events, and self never renders.
- [ ] Run root `node --test test/cursorPresence.test.mjs`, `node --test test/participants.test.mjs`, and `node --test test/workspaceSync.test.mjs`. From server run `node --test --test-timeout=8000 test/cursor.socket.test.js`, then `node --test --test-timeout=8000`.
- [ ] Run root `node --test test/canvasPreview.test.mjs`, `npm run build`, and `git diff --check`. Record all outcomes, including known S16 setup failure/deadlock rather than calling a partial pass clean. Record bundle sizes and existing/new warnings. Recheck baseline status if it changes before implementation.
- [ ] Browser, if two existing authenticated accounts are available: move over pane/nodes/edges, use viewer role, vary pan/zoom independently, and check navbar/container offsets. Leave/re-enter, cover controls/inputs, close the last tab, stay still for 10s, and reconnect. Verify the overlay never captures interaction and cursors do not cross projects. Mark unavailable checks unverified; do not create live fixtures for this check.
- [ ] Follow the workflow's server boot and blog/chat smoke checks where sessions are available; distinguish unauthenticated route loading from authenticated functionality checks.
- [ ] Document wire/permission/10s expiry/multi-tab behavior and update the tracker with S18 changed files, counts, actual failures, limitations, and any narrow throttle correction. Keep S16 and S17 review statuses accurate. Return Ready for review and stop for Codex; no S19 or commits.

## Copyable implementation prompt

Read AGENTS.md and the six context files, then `context/specs/18-live-cursors.md`. Implement S18 only. Grok implements and Codex reviews. Preserve the existing uncommitted S17 work and capture the starting diff. Respect the dependency/status notes, and do not mark earlier slices approved yourself. Mark S18 In progress, implement the spec, run its verification, then mark Ready for review with evidence and any outstanding baseline failures. This is the last slice for today: stop after S18. Do not plan/start S19, fix unrelated S16 findings, commit, push, or create branches.
