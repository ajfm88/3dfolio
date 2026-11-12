# Slice 22 — Turn robustness

**Lane** client · **Depends on** S21 · **Unblocks** S25

**Implementer** Grok · **Reviewer** Claude by default

## Baseline and scope

Read `AGENTS.md`, the six context files in order, this spec, and S21's final review. S21 is approved in the working tree on top of commit 66 (`e09a624`) at planning time. It may be committed by the time implementation starts. Record the actual baseline and preserve all S21 changes. Mark S22 In progress, implement the named files, verify, then mark Ready for review. The user handles commits.

S22 adds turn-loss canvas recovery, connection feedback and retry, best-effort release on page exit, and the holder's idle countdown. Use the existing S20 protocol and server rules. S23 and later slices remain separate.

| Allowed file | Work |
| --- | --- |
| `src/collaborate/store/useWorkspaceStore.js` | Turn-loss hook, connection lifecycle and timer, pagehide listener, turn receipt time |
| `src/collaborate/lib/workspaceSync.js` | Discard unsent work and reuse recovery, guard the commit pump |
| `src/collaborate/lib/turnState.js` | Pure countdown calculation and formatting |
| `src/collaborate/components/workspace/ConnectionBanner.jsx` | New connection status strip |
| `src/collaborate/components/workspace/TurnBar.jsx` | Holder countdown |
| `src/collaborate/routes/WorkspacePage.jsx` | Show the banner during workspace loading and reconnect |
| `test/turnRobustness.test.mjs` | New store, clock, and UI regressions |
| `test/turnState.test.mjs`, `test/workspaceSync.test.mjs` | Adjust fixtures only where S22 requires it and retain existing assertions |
| `context/2-architecture.md`, `context/6-progress-tracker.md` | Record the implemented lifecycle, scope, status, and evidence |

Keep the existing dependencies, database, server handlers, tab id, role rules, and existing S21 packet-order and chime behavior.

## 1. Pending edits when a turn ends

Distinguish `sync.pending` (batches never sent) from `sync.commit` (at most one emitted commit with an uncertain result). Detect turn loss only from an accepted live turn update that takes ownership away from the authenticated user and this binding's tab. Use S21's existing exact-tab transition and cancel the outgoing preview there. Publish the new turn before any recovery publishes or sends, so further edits are gated immediately.

| Work at live turn loss | Behavior |
| --- | --- |
| No pending batches and no in-flight commit | Update turn and cancel the preview. No canvas sync or toast. |
| Only an in-flight commit | Let it settle through the existing ack or recovery path. A server-accepted edit is valid even if its ack follows the handoff. |
| One or more pending batches, with or without an in-flight commit | Drop the pending batches immediately, notify once with `Your turn ended before some edits could be sent`, and enter the existing `beginRecovery` path. |

In the last case, invalidate the old in-flight callback as part of recovery, replace optimistic state with the last confirmed graph while syncing, and request `canvas:sync` on the current joined connection. The server serializes commits and reads on the same room queue. Install its authoritative snapshot, including any previously emitted commit the server accepted. Preserve version floors, remote-event handling, error routing, and one outstanding sync. Retain the existing `Canvas re-synced` toast on a successful recovery. Discarded batches never return to the queue. A new grant during recovery updates the turn and can notify per S21, while editing remains disabled until the snapshot is installed.

Add the existing `selectCanEdit` gate to the sync controller's injected dependencies and recheck it in `pump` before taking batches from `pending` or emitting. This covers ack-driven pumping as well as dispatch. Preserve normal batching and commit ack semantics. The turn-loss path owns dropping the queue, so a blocked pump alone should leave state alone.

On disconnect, keep the existing invalidation of the workspace, overlays, pending work, and old callbacks. Before invalidation, if `pending` or `commit` exists, show one `Connection lost. Some edits may not have been saved` toast for that loss. Reconnect from a fresh join acknowledgement. The snapshot is authoritative and the client does not resubmit either unsent or uncertain edits. A clean disconnect has no toast. The connection banner handles status feedback.

## 2. Connection banner and retries

Keep the current loading/ready/error/notFound model. During disconnect and rejoin the old canvas, turn, and role are cleared as they are today. The loading layout shows connection feedback without exposing stale edit controls or private project content. Add a full-width warning-tinted `ConnectionBanner` below the workspace navbar, using the existing collaborate theme and `role="status"`. The loading layout should use the same workspace shell when a notice is visible, with the spinner centered in the remaining space. Keep normal access-denied and error cards.

Use one binding-owned timer and a small notice value in store state. The timer callbacks must check active binding, attempt, and loading status before publishing. Clear the timer and notice on ready, failure, notFound, retry, disconnect, disposal, or binding replacement before starting any new notice for that transition. Scope listeners to the binding and remove them by reference.

| Transition | Notice |
| --- | --- |
| Initial connection/join or manual retry | Spinner first. Show `Waking the server…` after 3 seconds of loading. A connection followed by its first join uses the same loading interval. |
| Connection drops after the workspace was ready | Show `Reconnecting…` immediately while the socket redials. Keep it through the rejoin unless the connected rejoin itself takes 3 seconds, then show `Waking the server…`. |
| Join succeeds or canvas-only recovery is running on a live joined connection | No connection notice. Keep the existing canvas sync state separate. |
| Connection stops retrying (`socket.active === false`) | Clear notice and show the existing error/retry card. Handle a terminal `connect_error`, a terminal disconnect, and binding an already inactive disconnected socket. |

Transient connect errors let Socket.IO retry. Use the current retry action for terminal errors. If the bound socket is disconnected and inactive, reset loading feedback and call `socket.connect()` once so Clerk's auth callback runs again. If it is disconnected and already active, let its current connection attempt continue. A connected retry starts a fresh join. Never start a timer or emit for an obsolete binding. Keep the existing join ack timeout and status handling. Keep the generic UI error copy and avoid exposing socket error internals.

## 3. Release on pagehide

Register one `pagehide` listener per active binding in the store and remove it on disposal. Treat both persisted and non-persisted pagehide as an opportunity to release. At event time require `selectIsHolder` on this binding's current ready project and live joined connection. This works while canvas-only recovery is running because turn ownership is independent of edit permission. Emit `{ projectId }` on `turn:release` with the socket's volatile channel. The normal Release button retains its ordinary emit.

Page exit release is best effort. Never reconnect, wait for an ack, or retry it. With the installed Socket.IO client, a volatile emit can still enter `sendBuffer` if the heartbeat expires while the transport is writable. If this exact pagehide payload was buffered during the emit, remove only that newly buffered `turn:release` packet synchronously. Identify it by its event and the unique payload object passed to this call. Keep unrelated packets. If the socket or volatile channel is unavailable, skip release. The server's existing grace behavior remains the fallback. A temporary network drop does not trigger pagehide by itself.

## 4. Idle countdown

Pair each accepted turn snapshot with a local monotonic receipt time (`performance.now()`), sampled at packet receipt before deferral or when handling the join ack. Install or clear the pair together. Preserve it across canvas-only recovery and leave S21 ordering intact. Equal `serverNow` values still represent distinct packets. Each accepted packet supplies its own sample.

Calculate in a pure helper using `max(0, ceil((idleDeadline - serverNow - max(0, localNow - receiptTime)) / 1000))` and format as `m:ss`. Read the monotonic clock for elapsed time and derive the remaining time on every tick. A throttled browser timer catches up on its next tick. Display the countdown only when this tab holds the turn, there is a queue head, and `idleDeadline` is set outside grace. Use the queue head's participant name or `Someone`, and display `Sam is waiting — passes in 0:45 unless you edit`. Keep the ticking text outside the polite live region. The holder continues to see the countdown during canvas-only recovery.

Use a component effect for ticks and clean it up when the countdown is hidden or the component unmounts. Recompute from every accepted snapshot, including activity updates and changes to the queue head. Clamp at `0:00` and leave authority to the server. The client neither releases nor transfers the turn at zero. Only server state changes edit rights.

## 5. Verification and handoff

Use existing Vite SSR and fake-socket patterns. Restore clocks, event listeners, and any React/window patches. Add focused tests covering:

1. Loss with unsent batches and an in-flight commit. Observe an immediate rollback, one loss notice, one sync request, a late ack having no effect, and a snapshot restoring a server-accepted edit without resending it or any dropped batch. Also cover a snapshot where the interrupted commit did not land.
2. Loss with only an in-flight commit preserves a successful ack and emits no extra sync. An idle loss sends no canvas traffic. A quick regrant during recovery keeps edits gated and later starts from the recovered version. Late remote ops, binding replacement, and sync failures still use the existing recovery/error rules.
3. Disconnect with outstanding work warns once, invalidates old callbacks, rejoins from the server snapshot, and emits no duplicate commit. Clean reconnect preserves or loses the turn according to the ack and stays silent. Verify the banner at 2,999 and 3,000 ms, reconnecting and slow rejoin, terminal vs transient errors, retry, and timer/listener cleanup after route change or obsolete ack.
4. Pagehide releases only for the exact live holder. Cover an eligible holder in canvas recovery, a viewer, a distinct same-user tab, disconnected and obsolete bindings, transport drop or buffering, and cleanup that leaves unrelated packets/listeners intact. Existing button release still uses the ordinary channel.
5. Countdown rounds and clamps correctly, uses a monotonic clock independent of wall-clock skew, updates for activity and queue head changes, and hides for grace, empty queue, and non-holder. Verify zero causes no socket action. Render the banner copy and holder countdown with the expected accessibility semantics.

Run `node --test test/turnRobustness.test.mjs`, then the existing `turnState`, `workspaceSync`, `canvasPreview`, `participants`, and `cursorPresence` suites, each in its own command. Run `npm test` from `server/`, `npm run build` at the repo root, and `git diff --check`. Run the API boot and `/health` checks per workflow. Record commands, results, and any existing warnings.

If a browser and an existing account are available, check initial loading, reconnect feedback, and the retry path. The shared-project walkthrough is deferred until S26/S28 provide in-app membership and sharing. Carry forward these scenarios for that walkthrough: brief DevTools offline while someone else remains in the room, a queued editor receiving the turn after pagehide or grace expiry, idle countdown and activity reset, and interrupted edits recovering without duplicates. Keep this evidence separate from automated tests. Mark any browser checks still outstanding in the tracker and return S22 to Ready for review.
