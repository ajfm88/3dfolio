# Slice 21: Turn UI and read-only mode

**Lane:** client · **Depends on:** S20 · **Unblocks:** S22

**Implementer:** Grok · **Reviewer:** Claude

## Goal and baseline

Restore browser editing through explicit turn controls. Render the server's turn, let eligible tabs request/release/cancel/reclaim it, and allow new canvas edits only from the holding tab.

Read `AGENTS.md` and the six context files in order, then `specs/19-turn-state-machine.md`, `specs/20-turn-events-enforcement.md`, and this spec. Inspect the current store, sync helper, canvas controls, node/edge editors, and existing test harnesses before editing.

Planning baseline: commit 66, `e09a624`, with a clean application working tree. This spec and its tracker update are planning changes. Capture the actual starting diff and preserve existing changes. S19 and S20 are approved and committed. The tracker previously left commit 66's hash pending; that is reconciled by this planning pass.

Set S21 to In progress, implement only this slice, verify it, mark Ready for review with evidence and limitations, and stop. No commits, pushes, branches, deployment, or S22 implementation.

This is a behavior contract based on source inspection, not replacement code or a claim that an implementation has been tested.

## Allowed files

| File | Work |
| --- | --- |
| `src/collaborate/store/useWorkspaceStore.js` | Turn state, lifecycle, selectors, actions, notification transition |
| `src/collaborate/lib/turnState.js` | New pure public-state validation and tab comparison helpers |
| `src/collaborate/lib/turnSound.js` | New local Web Audio chime |
| `src/collaborate/components/workspace/TurnBar.jsx` | New turn controls |
| `src/collaborate/routes/WorkspacePage.jsx` | Mount TurnBar over the canvas |
| `test/turnState.test.mjs` | New helper, store, action, and rendered-bar regressions |
| `test/workspaceSync.test.mjs` | Migrate edit-authorized fixtures; preserve existing assertions |
| `test/canvasPreview.test.mjs` | Migrate edit-authorized fixtures; preserve existing assertions |
| `test/participants.test.mjs` | Only fixture changes needed for the turn contract |
| `test/cursorPresence.test.mjs` | Only fixture changes needed for the turn contract |
| `context/2-architecture.md` | Update the historical S20 client gate sentence after the S21 corrections |
| `context/6-progress-tracker.md` | Status and implementation evidence |

No server, protocol, dependency, configuration, shared canvas-op, session-store, tab-id, or legacy feature changes. Existing canvas components already use `selectCanEdit`; use that common gate without rewriting their rendering. Use existing utilities and theme tokens; no CSS file change is needed. Do not edit `workspaceSync.js` in S21.

## 1. Public state and identity

Add `turn: null` to empty workspace state. Null means unknown/unavailable, never permission to edit. Keep the normalized public turn object once known:

```js
{ holder, holderSince, queue, idleDeadline, graceUntil, serverNow }
// holder: null or { userId, tabId }
// queue: [{ userId, tabId }]
```

`turnState.js` has no imports, browser access, timers, or mutation. Export `normalizeTurn(value)` (normalized object or null) and `sameTurnTab(left, right)` (boolean). Rebuild whitelisted fields; do not store a raw payload. Mongo user ids are 24 hex characters, tab ids UUID v4, both normalized lowercase. Use the formats already used by workspace sockets/tabId. Comparison requires both fields; missing tabs never compare equal.

Validation contract:

- Require a plain record and all six public fields. Holder is null or a valid tab; queue is an array of valid tabs, unique by userId plus tabId, with no holder duplicate. Different tabs of the same user are valid queue entries.
- `serverNow` is a finite nonnegative number. Each other time is null or a finite nonnegative number. Zero is valid.
- An empty holder requires an empty queue and null holderSince, idleDeadline, and graceUntil. A holder requires non-null holderSince. A graceUntil requires null idleDeadline. An empty queue requires null idleDeadline. A nonempty queue with a holder outside grace requires non-null idleDeadline.
- Do not compare deadlines against the browser clock, impose a timestamp freshness threshold, or reject equal serverNow values. S20 may publish multiple changes in the same millisecond. Ordered events on the current socket are applied in arrival order.
- Extra fields are ignored. Invalid messages never grant permission or erase the last valid state.

Capture `getTabId()` once on each binding as `binding.tabId` and send that exact value in every join for that binding. Do not mint another identity or change sessionStorage behavior. Self user id comes from the existing session store's Mongo `authUser._id`, never Clerk's string id or a display name.

Export `selectIsHolder(state)`: true only for a known holder matching the current authenticated Mongo user and binding.tabId, on the active, non-disposed, ready, connected, joined binding for this project. Role must be owner/editor. Missing authentication, mismatched project/connection, loading/error/notFound, and disconnect return false. This selector can remain true during canvas-only recovery; it describes ownership, not permission to dispatch.

Update `selectCanEdit` to retain every existing gate (including sync/recovery), and additionally require `selectIsHolder`. All existing mutation entry points and throttled preview callbacks must continue using that gate. Read-only users can still pan, zoom, select, see previews, and publish cursors.

## 2. Join, event, and cleanup lifecycle

`classifyJoin` must normalize the actual S20 turn object and return it. Keep accepting legacy `turn: null` as unknown/read-only because older fixtures exercise it. A malformed non-null turn makes the join invalid using existing error handling. Validate the separate ack.serverNow as before; turn.serverNow belongs to the public turn snapshot.

Register exactly one `turn:state` listener per binding and remove it by reference in the existing disposer. Apply the same active-binding, connected socket, joined connection id, and project checks as presence handling. Validate before storing. Never emit a turn event in response to receiving one.

Install the ack's normalized turn before `sync.onJoined` publishes ready state. The server samples the turn immediately before sending the ack. Turn packets received before the ack packet describe an earlier state, even if their timestamps match. Discard them. Turn packets received after the ack packet may arrive before its `emitWithAck().then(...)` continuation runs. Apply them after the join snapshot, in packet order. Do not clear the turn when the sync helper publishes a canvas-only recovery snapshot.

Keep `emitWithAck` and remove the turn buffer. When a valid event arrives while joining, queue a microtask with the current attempt and connection id. The ack continuation is already registered, so the deferred event runs before that continuation for an earlier packet and after it for a later packet. At delivery require the captured attempt and connection to still be current and the workspace to be ready for the matching project. Drop the event if any check fails. Apply live events in order, including when a previous turn event is deferred. Clear visible turn state through emptyWorkspace on new join, failure, timeout, retry, disconnect, disposal, or binding replacement. Preserve presence, cursor, preview, and sync behavior.

## 3. Actions

Expose `requestTurn()`, `releaseTurn()`, `cancelTurnRequest()`, and `reclaimTurn()` on the workspace store. They emit ordinary non-volatile `socket.emit(event, { projectId })`; S20 supplies no ack. Do not add timeout, pending spinner, optimistic holder/queue changes, or success toast on click. The server broadcasts the result; repeated requests are idempotent.

All actions synchronously recheck the owning active binding, ready state, connected matching joined socket, current project, authenticated user, known turn state, and role. Canvas-only recovery does not prevent turn actions.

| Action | Additional condition | Event |
| --- | --- | --- |
| Request | Owner/editor, neither holder nor queued as this exact tab | `turn:request` |
| Release | This exact tab holds the turn | `turn:release` |
| Cancel | This exact tab is queued | `turn:cancel` |
| Take control | Owner, not this exact holder, and somebody holds the turn | `turn:reclaim` |

An empty turn offers Request, including for the owner. A queued owner may Cancel or Take control. A different tab owned by the same user is still a different holder. Invalid/disallowed calls emit nothing. The server remains the authorization boundary.

## 4. TurnBar

Mount the new component in WorkspacePage's existing positioned main element as a sibling of WorkspaceCanvas. Keep it inside the collaborate route. Position top-center with `absolute left-1/2 top-4 z-20 -translate-x-1/2`, constrain width to the viewport, and allow text/buttons to wrap. Use a glass pill, existing border/backdrop styles, text-sm, and collab tokens. Mark the wrapper `data-collab-chrome` so cursor filtering treats the entire bar, including padding, as controls. Do not mount it inside the cursor overlay.

Read store selectors and actions; no component socket calls. Render:

| State | Text and controls |
| --- | --- |
| Unknown turn | `Loading turn…`, no action |
| Viewer, known turn | `View only`, holder context if any, no buttons |
| No holder, eligible | `Nobody is editing`, Request turn |
| This tab holds | `You're editing`, Release |
| Another tab of self holds | `Your other tab is editing`, Request turn or Cancel request if queued; owner also Take control |
| Another user holds | `<name> is editing`, Request turn or Cancel request if queued; owner also Take control |

Show the holder avatar with an empty alt when a nonempty img exists and a decorative initial fallback otherwise. Resolve names/images from participants, with the session profile as fallback for self, then `Unknown user`. Avoid broken empty-src images. Do not require a participant record to retain a valid turn; a holder in grace can be absent from the roster. When the holder has graceUntil, append `Reconnecting` to the holder context without a countdown.

Show queue length when nonzero (`1 waiting` / `N waiting`), and `Your position: N` (one-based) if this exact tab is queued. Show these for the holder and spectators too; viewers never have actions. A compact status text region uses `aria-live="polite"`; buttons stay outside that live region. Use native buttons with type=button, visible text, focus-visible styles, decorative lucide icons if useful. Read-only explanations remain visible while the canvas controls are hidden.

No idle countdown, connection banner, queue-name popover, audio setting, new avatar abstraction, or auto-request on workspace entry.

## 5. Gaining the turn

On an accepted live transition from not holding to holding this exact tab, call `toast.success("It's your turn")` and the local `playTurnSound()` exactly once. Do this in store transition handling so rerenders cannot replay it. Suppress duplicate snapshots, queue/activity updates, other-tab grants, rejected/stale events, and the join/rejoin snapshots themselves. A distinct grant packet sent after the ack can notify. A later genuine loss and new live grant may notify again.

`turnSound.js` copies/adapts the small Web Audio synthesis pattern in `src/chat/lib/notificationSound.js`; never import that file. Export `playTurnSound`. Construct AudioContext lazily, guard unavailable window/AudioContext, and contain constructor/resume/scheduling failures so unsupported audio cannot throw from turn handling. No audio files or dependencies. Browser autoplay restrictions may suppress sound; the toast remains the feedback. Verify the two-note behavior with mocked Web Audio and a browser when available.

## 6. Boundary with S22

This slice prevents new dispatches and previews once turn state removes permission. Cancel the outgoing preview throttle when this tab loses the turn, so its previous sample cannot send after a quick regrant. Existing label editor effects close drafts through selectCanEdit, and refused gesture completion restores canonical display through the existing actions. Do not rewrite gesture behavior.

S22 owns dropping already-queued unsent edits on turn loss, resynchronizing them, pagehide release, connection banners, and the idle countdown. Keep that handoff explicit. Do not change the sync pump, replay logic, or pending-commit rules here. A commit accepted earlier may settle after the turn changes; S20 still rejects any commit that starts without the turn. Until S22 the existing rejection/recovery path handles pending work. Do not describe S21 as completing reconnect/turn-loss robustness.

The existing sessionStorage identity can be copied by browser Duplicate Tab. S20 treats connections carrying the same userId/tabId as one tab identity. S21 must not invent new tab-id behavior. Verify distinct tabs by opening a fresh tab with a distinct sessionStorage identity; record this limitation rather than claim duplicate-tab isolation.

## 7. Automated verification

Use the existing Vite SSR + fake-socket harness, with hmr disabled. Run suites in separate commands. The new suite must drive real bind/join/listener/action paths, not manufacture ready state without a sync session. Use the existing rendered-client-snapshot pattern for TurnBar markup assertions and restore global patches. Always reset stores, restore toast/audio spies, dispose bindings, and close Vite.

Required regressions:

1. Normalization: empty and held public snapshots, zero timestamps, grace, queue, lowercase canonicalization, distinct tabs for one user, copied whitelisted fields; reject arrays/null/missing fields, invalid ids/times, duplicate queue tabs, holder-in-queue, impossible empty/grace/deadline shapes. Inputs remain unchanged.
2. Known empty join is ready/read-only; legacy null join is ready/read-only; malformed turn join fails closed. A held join grants editing only for matching user AND tab with owner/editor role and a live joined binding. Viewer, missing auth, different user, different tab, wrong project, old connection, and recovery cannot edit. Holder remains identifiable during canvas recovery.
3. Fire a valid turn event, then resolve the join ack with a different turn and the same serverNow. The ack wins. Also resolve the ack and synchronously fire subsequent events before its promise continuation runs. The ack publishes first and the subsequent events apply in order. Include a malformed event and check failures, retry, route change, disconnect, and obsolete callbacks. Cleanup removes turn listeners while preserving unrelated listeners.
4. Live grant/release/cancel/reclaim snapshots update UI state; unrelated project, malformed snapshot, disconnected/replaced binding and connection mismatch are ignored. No event echo. Canvas-only sync preserves turn and accepts subsequent valid turn events.
5. Each action emits the exact event and project-only payload once when allowed. Disallowed roles/states/holder/queue combinations emit nothing. Test owner takeover from another tab of self, queued-owner takeover, and action availability during canvas-only recovery.
6. Actual dispatch and preview send succeed for the holder. New dispatches and trailing previews after a live loss emit no commit/preview. Lose and regain the turn within the 50 ms throttle window and verify the old sample never sends. Cursors and remote ops still work when not holding. Do not assert S22's queue-drain behavior.
7. One toast/chime per genuine live self grant; none on join/rejoin snapshots, duplicate/activity updates, other-tab grant, or stale event. Loss then grant notifies again. Count attempts with a throwing AudioContext constructor when Vite exposes a read-only export. Separately mock Web Audio to prove synthesis and failure containment, including rejected resume and constructor throws.
8. Render every TurnBar row in section 4, including viewer, unknown holder profile, missing avatar, queue position by exact tab, recovery while holding, owner buttons, live region, and chrome marker. Rendered markup checks do not establish pointer/keyboard behavior; use the browser checklist below for that.

Migrate old edit-authorized fixtures instead of weakening the gate: load useSessionStore from the same Vite instance, seed a Mongo self identity, read tabId from the captured workspace:join payload, and give that tab the public holder state. Preserve empty/null turns in tests specifically exercising unknown/empty joins and read-only cursor/presence behavior. Preserve prior sync assertions; distinguish the new turn toast from the existing `Canvas re-synced` assertions. No production test-only bypasses.

Run and record exact outcomes:

```text
node --test test/turnState.test.mjs
node --test test/workspaceSync.test.mjs
node --test test/canvasPreview.test.mjs
node --test test/participants.test.mjs
node --test test/cursorPresence.test.mjs
npm test                         (from server/)
npm run build                    (from repository root)
git diff --check
```

S20's recorded baseline is server 201, sync 13, previews 39, participants 6, cursor 69. These are historical results, not tests run by this planning pass. No existing test may be removed or disabled. New counts can grow. Separate existing Vite shutdown diagnostics/chunk-size warnings from new failures. Boot the server per workflow and stop only the process you started.

## 8. Browser checklist and delivery

- Two synced accounts in a project: owner requests, edits all six shapes, drags/resizes, labels/colors, connects/labels/deletes edges and nodes; the other account sees committed edits and previews.
- The editor requests and sees queue position; owner releases; editor gets the toast and, when audio is allowed, chime; owner becomes read-only. Cancel removes the waiting tab. Owner Take control works while queued and unqueued.
- A distinct fresh tab of the same user is read-only while the first holds. Its exact-tab queue position is correct. A viewer can watch, pan/zoom/select and move their cursor, with no editing controls or turn buttons.
- Losing a turn while a label editor is open closes its draft and prevents a blur commit. A gesture ending after loss cannot introduce a new edit. No hidden toolbar, resize, drop, connect or Delete/Backspace path mutates from a non-holder.
- Bar buttons work by keyboard with visible focus. At 320px the bar wraps within the canvas without horizontal overflow; pan/zoom outside it still works. Pointer movement over its padding/buttons does not publish a canvas cursor.
- Reload/rejoin restores the server's turn without a duplicate toast/chime. Do not claim S22 offline grace/countdown behavior was completed. Smoke-check `/blog` and `/chat` per workflow.

Local server configuration targets the live database. Use only authorized test accounts and collaborate test records, clean up created project/canvas data, and never write User documents. Do not invent a second account or change environment files. If browser/accounts are unavailable, run all independent automated checks, explicitly record the unverified items, and leave the slice Ready for review with those limitations; do not call it approved or launch-ready.

Update the tracker with files changed, commands/results, deviations, browser evidence, and the S22 carry-forward. Stop for review. No next slice.
