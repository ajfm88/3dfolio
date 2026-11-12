# S21 review

**Status:** Changes requested · **Reviewer:** Codex

## Findings

1. **High — An older turn packet can override the join snapshot.** `useWorkspaceStore.js` chooses `bufferedTurn ?? result.turn`. The S20 server reads `room.turn` after joining the adapter room and immediately before it sends the ack. A same-project retry can also receive turn broadcasts while still attached to the room. A turn packet sent before the ack may therefore describe an older holder. I reproduced this in the real store harness with matching `serverNow` values. The ack assigned the turn to this tab, but the store kept the earlier remote holder. The inverse can show edit controls for a tab that already lost the turn. The original S21 spec required the buffer precedence, so this finding corrects the spec as well as the implementation. Follow the updated join-order contract in `21-turn-ui-read-only.md`. Test both packet orders, including a turn packet after the ack that arrives before its promise continuation. Keep join snapshots silent and preserve the separate presence behavior.

2. **Medium — An outgoing preview can cross into a new turn.** The throttle rechecks current permission when it fires, but a live turn loss leaves its queued sample in place. I extended the existing fake-clock test to send a leading preview, queue a trailing one, lose and regain the turn, and advance 80 ms. Two previews were emitted where only the leading preview was expected. Cancel the outgoing throttle on exact-tab turn loss and add the failing sequence to the suite. Already queued canvas commits remain covered by S22.

3. **Test coverage and cleanup.** The recovery cases use a `canvas:sync` promise that never resolves. Complete a recovery in the fake-socket test and assert that publishing its snapshot preserves the latest turn. Capture an obsolete turn listener and invoke it after replacing the binding to exercise the handler's ownership guard, in addition to testing listener removal. Restore the React `useSyncExternalStore` patch in teardown, as the S21 spec requires. The AudioContext mock is appropriate given Vite's read-only SSR export.

4. **Documentation.** The final sentence of the S20 section in `context/2-architecture.md` still describes the old role-only client. The corrected spec now names the file. Rewrite that sentence as a description of the gap between S20 and S21, and record the S21 client gate and ordered turn handling once corrected.

## Verification

- Independent rerun passed 201 server tests, 10 turn-state tests, 13 workspace sync tests, 39 preview tests, 6 participant tests, and 69 cursor tests. Each client suite ran in its own command.
- The production build passed and produced `WorkspacePage-B7YlCVIh.js` at 257.38 kB, 82.54 kB gzip, with the existing chunk-size warning. `git diff --check` passed with LF-to-CRLF notices.
- The two targeted reproductions failed against the submitted implementation as described above. The temporary test copies were removed.
- Server boot and `/health` are reported by the implementer. The review did not repeat the live database connection or run browser, two-account, `/blog`, or `/chat` checks.

Apply the corrections in the updated S21 spec and this review. Rerun the verification, add the results and any browser limitations to the tracker, and return S21 to Ready for review.

## Second review

The corrections cover the original acknowledgement and preview reproductions, recovery completion, obsolete listeners, teardown, and the architecture note. The independent rerun passed all 338 tests, the production build with its existing chunk warning, and `git diff --check`. Browser and two-account verification remains open.

**Changes requested.** `onTurn` publishes immediately once the store is ready, even if an earlier packet is still waiting in a microtask from the same join. A newer packet can overtake that packet and leave the store showing an older holder. A focused fake-socket reproduction resolves the join ack, schedules delivery of packet B in a microtask, then delivers packet A synchronously. The socket receives A before B. The ack continuation runs before B and marks the store ready. B publishes immediately, then deferred A overwrites it. Both packets can carry the same `serverNow`. This was reproduced at the store boundary. Browser transport timing was not tested.

Check `binding.inFlight` before the ready fast path and defer packets for the active join until its existing `finally` clears the attempt. Preserve the checks in `deferTurn` and require the matching project on the ready fast path as well. Add the mixed delivery schedule above to the existing join-order test and assert that the ack, A, and B are published in that order. The focused check passed with this change in a temporary copy. Apply this correction to `useWorkspaceStore.js` and `test/turnState.test.mjs`, then rerun verification and update the tracker.

## Final code review

**Approved.** The listener checks the active join before the ready fast path and scopes the fast path to the current project. The mixed delivery regression passes with the submitted correction and fails with the old branch order in a temporary copy, where B publishes before A. The original preview, recovery, and cleanup checks also pass.

The independent rerun passed all 338 automated tests, the production build with the existing chunk warning, and `git diff --check`. The implementer reported a successful API boot and health check. Browser and two-account verification remain open for launch readiness.
