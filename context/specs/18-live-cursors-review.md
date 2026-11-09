# S18 review — Approved

## Final review — Approved (Codex, 2026-11-08)

No remaining S18 code findings. The final selector correction matches both `.collab-color-toolbar` and `.react-flow__node-toolbar`, including panel padding/gaps and descendants. The regression's fake closest matcher now handles class selectors and still permits pane/node/edge movement.

Independently reran the client cursor suite: **69/69 pass**, and the server cursor suite: **7/7 pass**. An in-memory pre-fix comparison removed just the two new selectors without changing any files: all three toolbar targets reproduced the prior failure, while the corrected predicate blocked all three and the pointer-handler factory emitted only leave events. This confirms the regression distinguishes the fix from the prior implementation.

Production build passes: 4261 modules, workspace `WorkspacePage-Bw_vH8rk.js` 248.59 kB (gzip 80.06 kB), existing large-chunk warning. Whitespace check passes with line-ending notices. The prior review's participants/sync results and bounded server baseline remain the latest evidence for those unchanged paths; they were not rerun for this selector-only follow-up.

Approval is for the S18 code change against the accepted pending baseline. Browser/two-account/live-server/authenticated smoke checks remain unverified. S17 still awaits separate review; S16 still has its independently recorded setup failure and server timeout. This does not approve earlier slices or imply a fully passing project suite. Original implementation was Grok; the user identifies Claude Sonnet as the correction implementer. No application/test edits, live data changes, commits, branches, or S19 work during review. Historical findings below are closed and retained for context.

## Re-review — one remaining correction (Codex, 2026-11-08)

The user identifies **Claude Sonnet** as the correction implementer. The original eight findings below are historical: findings 1–5, 7, and 8 are addressed by the corrected source and independently passing focused tests. Finding 6 is mostly corrected, but the color-toolbar padding/gaps remain unfiltered. S18 stays Changes requested for this specific remaining issue; do not redo the already-corrected work.

**P2 — Ignore the actual node color toolbar's chrome.** `src/collaborate/lib/cursorPresence.js:116` matches buttons, editable controls, `data-collab-chrome`, and `role=toolbar`. The actual panel in `src/collaborate/components/canvas/ColorToolbar.jsx:20` uses `role=group` and class `collab-color-toolbar`; neither it nor React Flow's node-toolbar wrapper matches those selectors. Swatch buttons are ignored, but moving over the panel's padding or the gaps between swatches still calls moveCursor. This is the same floating-panel case requested in original finding 6.

An independent reproduction using the actual panel's tag/attributes and the exported pointer-handler factory returned `colorToolbarPaddingBlocked: false` and a move event at (100,150), instead of leave. The library's NodeToolbar portal mounts into `.react-flow__renderer`, inside the canvas wrapper, so the wrapper's containment check does not exclude it.

**Correction:** Match the existing color-toolbar class (or its actual React Flow toolbar ancestor) in BLOCKED_SELECTOR and add a regression for the panel padding/gap target and a nested descendant. Preserve pane/node/non-editing edge movement. This can be fixed in the already-allowed cursorPresence.js and cursor test files; there is no need to change ColorToolbar.jsx or broaden the production scope.

**Scope reconciliation:** The added CanvasControls.jsx data attribute and workspaceSync.test.mjs API-origin initialization are minimal, justified parts of the pointer-filter/self-identity correction and are accepted for this review. No permission request or revert is needed for those edits. They do not authorize unrelated changes.

**Independent checks:** Client cursor suite 68/68 pass; server cursor suite 7/7 pass; participants 5/5 and workspaceSync 12/12 pass. The two latter commands ran in separate processes concurrently; a port-24678 warning appeared, but neither was cancelled in this run. The bounded server suite reproduces 164 tests, 163 passed, zero failed, one cancelled at the existing S16 preview timeout. Build passes (4261 modules; workspace 248.54 kB, gzip 80.06 kB; existing large-chunk warning). git diff --check passes with line-ending notices. The prior canvasPreview setup failure remains recorded separately and was not rerun during this correction review. Browser/two-account/live-server/authenticated blog/chat checks remain unverified. No application/test code was changed during review.

Return Ready for review after this remaining filter correction and its regression pass. Preserve pending S17 and unrelated S16 work. No S19, commits, pushes, or branches.

---

## Original review (historical; superseded by the re-review above)

**Reviewer:** Codex · **Date:** 2026-11-08 · **Implementer:** Grok

Reviewed against `18-live-cursors.md`, the current source, and the pending S17 baseline. No application or test code was changed during review. S17 remains Ready for review; S16 remains Changes requested. S18 is not approved.

The failures are not all mock limitations. The implementation has independent coordinate, validation, identity, lifecycle, and relay bugs. Fix only the following S18 findings and their regressions, then return Ready for review. Preserve the existing S17 work and the unrelated S16 findings. No S19, commits, pushes, or branches.

## 1. P1 — Correct cursor projection and mount the measurement target

Files: `PresenceCursors.jsx:32`, `PresenceCursors.jsx:46`, `cursorPresence.js:32`.

The custom helper computes flow * zoom + pan and then subtracts the container's screen offset. Flow * zoom + pan is already relative to the React Flow container; subtracting the offset makes the cursor wrong below the navbar or anywhere the canvas is not at screen origin. Independent reproduction: flow (100,100), viewport (0,0,1), overlay rect left 20/top 56 returns (80,44); the correct local point, when the flow and overlay containers coincide, is (100,100).

Use React Flow's actual `useReactFlow().flowToScreenPosition` to obtain client coordinates, then subtract the overlay rect once, as specified. The installed React Flow implementation explicitly adds its DOM rect to the transformed flow point. Tests currently assert the wrong formula and therefore pass without proving correct placement. Keep any projection helper testable without redefining the library conversion incorrectly.

The overlay initially returns null for an empty cursor map, so the mount-only effect sees `containerRef.current === null` and never installs its ResizeObserver. When the first cursor later appears, that effect does not rerun. Keep the measurement target mounted or attach the observer when the actual element becomes available, with cleanup. Verify first cursor after an empty mount, nonzero navbar/container offsets, distinct sender/receiver viewports, resize, and zoom 0.2/1/2. Anchor the SVG pointer tip to the projected point; translating the whole pointer-plus-name group by -50% makes the tip depend on the badge size. Keep controls above a non-interactive overlay.

## 2. P1 — Validate inbound events and read self identity from the session store

File: `useWorkspaceStore.js:413–453`.

The move listener checks only typeof x/y === number, so NaN, Infinity, and points outside POSITION_MAX enter cursor state. The failing malformed-input test reproduces NaN entering the actual store. Reuse the pure validation at the listener boundary, and validate/canonicalize the user id before membership checks. Server validation does not replace the client validation required by the spec.

The workspace state has no authUser. Reading `state.authUser?._id` means self suppression never works, and outgoing movement schedules an expiry for an empty id. Use `useSessionStore.getState().authUser?._id` for Mongo self identity, and do not schedule a received-cursor expiry for outgoing movement. The failing self test sets the correct session store; it is not a lowercase-id fixture problem.

The leave listener also lacks the ready/connected/joined-connection guards used by movement. Apply the same binding/socket/project/status checks to both listeners. Test malformed numeric/user-id cases, self from a second tab, old connection ids, disconnected sockets, and leave events during loading/error. Recovery while still ready remains allowed.

## 3. P1 — Clear departed cursors and handle failure lifecycle transitions

Files: `useWorkspaceStore.js:368–386`, binding lifecycle helpers.

onPresence only replaces participants; it does not remove departed users from cursors or cancel their expiry. The renderer hides unknown names, but stale state/timers survive, and a rapid rejoin can redisplay an old point. Filter cursor state and cancel timers whenever an accepted roster removes users. Keep points for users still present after a duplicate-tab leave or profile update.

There is no binding-owned status subscription or equivalent cleanup for error/notFound reached through the sync helper. emptyWorkspace clears serialized state but leaves expiry timers and a pending cursor throttle armed. Disconnected retry also omits cursor-controller/throttle cleanup. Clear both controller timers and pending sends on every required lifecycle transition, preserving cursors only for canvas-only recovery in a still-ready workspace. Keep workspaceSync.js unchanged.

Add real store regressions for presence departure, same-user still present, retry while disconnected, failed join, sync failure/notFound, and later rejoin. Verify timer counts and outgoing events, not only an empty state after dispose.

## 4. P1 — Recheck the owning binding at actual emission and gate leave

Files: `useWorkspaceStore.js:333–338`, `useWorkspaceStore.js:819–850`, `disposeBinding`.

The cursor throttle callback reads whichever binding is globally active, rather than verifying its own captured binding/attempt/connection. It does not recheck ready status, role, or project at emission time. For example, schedule a trailing point, fail recovery into error on the same connection, then advance the clock: it can still send. Capture the owning epoch and revalidate it when the throttled callback runs. Old work must not be forwarded on a replacement binding.

moveCursor currently has no valid-role check; leaveCursor can emit while joining/loading because joinedConnectionId is assigned at join start. Validate all-role participation rights and ready/live-joined state independently of edit rights, and cancel pending movement before deciding whether leave may emit. Preserve recovery sends. Route disposal must send a final volatile cursor:leave before workspace:leave when currently joined/connected; the current disposer emits only workspace:leave. Add regressions with a working volatile socket mock and an actually scheduled trailing movement.

## 5. P2 — Repair the leading throttle and expiry cancellation/token checks

Files: `throttle.js:4`, `cursorPresence.js:54–75`.

lastCallTime still starts at 0, so first movement at fake clock 0 schedules 50ms instead of running immediately. Independent reproduction returned calls=0 and scheduled=[50]. The test named first call runs immediately passes only because its fake setTimeout executes inline, masking the delay. Track an uninvoked state explicitly. Keep the corrected trailing timestamp and timer-id-0 handling, and test minimum spacing with a deterministic queued clock.

The expiry controller checks timer handles by truthiness. A timer id of 0 is neither cancelled on refresh nor on leave. Expiry callbacks have no token/generation check, so a superseded callback can remove a newer point and its timer-map entry. Independent reproduction with a first timer id of 0, refresh, then the old callback expired the user with no cancellation recorded. Check handle presence explicitly and ignore callbacks that no longer own the current expiry. clearAll/dispose must invalidate callbacks as well as cancelling handles. Tests should simulate cancellation correctly and separately invoke a superseded callback to verify the ownership guard.

## 6. P2 — Filter pointer targets by ancestors and ignore touch

File: `WorkspaceCanvas.jsx:17–24`, `WorkspaceCanvas.jsx:69–93`.

Checking only event.target.tagName misses SVG/path/span descendants of buttons and the empty area of floating panels. Movement over zoom icons and shape/toolbar chrome can publish a diagram cursor rather than clearing it. Use appropriate closest/ancestor checks for interactive elements and floating controls/panels, without excluding diagram nodes or edge labels when not editing.

Ignore touch pointer events, and pass `{ snapToGrid: false }` explicitly to screenToFlowPosition. Keep all existing node drag/drop/selection callbacks intact. Add regressions for nested icons inside buttons, panel chrome, editable descendants, pane/node/edge movement, and touch input. Do not treat a passing pure coordinate helper test as verification of the wrapper callbacks.

## 7. P1 — Replace the ineffective test harness paths and missing assertions

Files: `server/test/cursor.socket.test.js`, `test/cursorPresence.test.mjs`.

The server suite does not exercise a successful join. Its join helper registers server listeners, then resolves a gate used by a client-style socket.handler that the server never calls; it never invokes the registered workspace:join handler with a real ack. Several calls also pass io as the helper's role argument. The no-query test finds no room, and the cleanup accesses non-existent workspaceRegistry.rooms. These are more than propagation gaps. Use the real registered join event, a fresh createWorkspaceRegistry per test, mocked Canvas/User lookups, and assert successful ack/room authority before testing relays. Exercise owner/editor/viewer separately, a second receiving socket, sender exclusion, and another project. Fix deferred join gates in the correct order and instrument model access after joining.

The client socket mock must support volatile.emit and record the volatile flag. Use one faithful fake clock whose clearTimeout actually cancels scheduled callbacks. The tests under fake clock expiry currently neither inject/advance a clock nor assert 9999/10000ms; they read getState().activeBinding, which is not exposed, and silently skip the optional branch. The cleanup case tests only dispose despite its name listing retry/disconnect/error/notFound. Replace these misleading passes with actual clock/state/event assertions for each lifecycle.

Add the missing userColor fixed vectors, invalid-input fallback, cursor rendering, and projection/viewport regressions from the spec. `userColor('not-an-id')` currently returns the second palette color, not the specified first-color fallback. Validate the id before hashing and cover it. Keep existing S17 rendering/image/focus behavior intact.

## 8. P2 — Exclude the sending socket on the server and correct the docs

File: `workspace.socket.js:927–953` (cursor move/leave emit sites).

Both handlers currently use io.to(room).volatile.emit, which includes the sender. The required relay is socket.to(room).volatile.emit. Use it for both events, preserve authenticated identity and all-role authority, and prove another tab receives while the sender does not. This is an implementation defect even after fixing the server harness.

The architecture and implementation notes claim behaviors which the source does not provide: first-at-zero throttle, roster pruning, self suppression, terminal-state timer cleanup, route-exit leave, and correct projection. Replace the claims with evidence after correction. Keep earlier implementation notes as historical only if explicitly superseded. Do not describe client input validation/self failures as test infrastructure gaps or report 9/12 for a suite with five failing tests.

## Independent verification

- Root `node --test test/cursorPresence.test.mjs`: 51 tests, 37 passed, 14 failed, no cancellations.
- Server `node --test --test-timeout=8000 test/cursor.socket.test.js`: 12 tests, 7 passed, 5 failed, plus an after-hook TypeError accessing workspaceRegistry.rooms.clear().
- Root participants + workspaceSync suites: 17 passed, no failures; concurrent harness startup printed WebSocket port 24678 already in use. That diagnostic is not a browser check.
- Full server suite with the 8s test timeout: fails with the new cursor assertion/cleanup failures and the already-recorded S16 canvas preview test timeout. The reported all-server 0-failure result was not reproduced.
- Root canvasPreview suite still fails during setup with undefined throttleModule; zero tests execute. This remains the separate S16 baseline issue.
- Root production build passes: 4261 modules, workspace 247.62 kB (gzip 79.62 kB), existing large-chunk warning. git diff --check passes with line-ending notices.
- Small independent Vite-module reproductions confirmed the first-at-zero delay, wrong nonzero-offset projection, invalid color fallback, and stale timer-id-0 expiry described above.
- Browser/two-account checks, live server boot, and authenticated blog/chat smoke checks were not performed during this review. No live database fixtures were created.

## Handoff to Grok

Fix the S18 findings in this review and add the named regressions. Preserve S17 and unrelated S16 work. Re-run focused cursor tests, participants/sync tests, the bounded server suite, build, and diff checks. Report every failure accurately, separating the existing S16 baseline from new cursor failures. Update the tracker and return S18 Ready for review for Codex. Do not start S19 or commit anything.
