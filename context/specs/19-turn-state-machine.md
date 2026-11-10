# Slice 19: Turn state machine

**Lane:** server (pure) · **Depends on:** none · **Unblocks:** S20

**Implementer:** Grok · **Reviewer:** Claude

## Goal and baseline

Build the pure rules for who holds the editing turn, as one module with no timers, sockets, database, or imports. S20 wires it to sockets and the sweeper. Nothing calls this module in S19, so no behavior changes for any user.

Read `AGENTS.md`, the six context files (especially **Turn rules** in `2-architecture.md`), and this spec.

Baseline: HEAD `f6ecdbd` plus the Approved, uncommitted S16 and S17 corrections in the working tree. Preserve all of it. Capture the starting diff so S19 stays separate.

Set S19 to In progress, implement this slice only, run the verification, set it to Ready for review with a slice note, and stop. No S20 work, commits, pushes, or branches.

## Allowed files

| File | Work |
| --- | --- |
| `server/src/lib/turns.js` | New pure module |
| `server/test/turns.test.js` | New tests |
| `server/readme.md` | One line in the `lib/` tree and one in the `test/` tree, aligned with their neighbors. Turn events and rules are documented in S20 |
| `context/6-progress-tracker.md` | Status and slice note |

No other files, dependencies, or configuration. `2-architecture.md` already has the rules below, including the decisions made for this spec.

## Module rules

- **No imports at all.** Do not import `projectAccess.js`: it loads Mongoose. The caller passes permission as a boolean, so the permission table stays in one place.
- No timers, no `Date.now()`, no randomness, no I/O. Every function that needs the time takes `now` (milliseconds).
- **Never mutate inputs.** Tests deep-freeze every state they pass in.
- **A call that changes nothing returns the same object it received** (`next === state`). S20 uses this to broadcast only on real changes, so it is part of the contract.
- Store only `userId` and `tabId` from a tab, never the caller's object or its other fields.
- A malformed tab is a no-op: not an object, `null`, or `userId`/`tabId` not a non-empty string. The same applies to a `userId` argument that is not a non-empty string.
- Compare tabs by both `userId` and `tabId`. One user's two tabs are different tabs.
- Comments follow the repo's voice: why, not what, in full sentences. No commented-out code.

## State

```js
{
  holder: { userId, tabId } | null,
  holderSince: number | null,
  lastActivity: number | null,
  graceUntil: number | null,
  queue: [{ userId, tabId, queuedAt }],
}
```

Two invariants hold after every function:

- With no holder, the queue is empty and the three timestamps are `null`.
- The queue holds only connected tabs, so nothing ever has to skip a dead entry.

## Exports

`GRACE_MS = 20000`, `IDLE_MS = 120000`, and these functions. **Tab** means `{ userId, tabId }`.

"Grant" means `holder` is that tab, `holderSince` and `lastActivity` are `now`, and `graceUntil` is `null`. "Pass on" means grant to the first queue entry and remove it from the queue. With an empty queue, pass on returns the empty state.

| Function | Behavior |
| --- | --- |
| `createTurnState()` | The empty state |
| `requestTurn(state, tab, canEdit, now)` | No-op unless `canEdit === true`. No-op if the tab holds or is queued. Grant if there is no holder. Otherwise append with `queuedAt: now`. A holder in grace still counts as a holder |
| `releaseTurn(state, tab, now)` | No-op unless the tab holds. Pass on |
| `cancelRequest(state, tab)` | Remove the tab from the queue. No-op if it is not queued |
| `reclaimTurn(state, tab, canReclaim, now)` | No-op unless `canReclaim === true`. No-op if the tab holds. Remove the tab from the queue and grant to it. A connected previous holder goes to the front of the queue with `queuedAt: now`. A previous holder in grace is dropped. With no holder, this is a plain grant |
| `tabLeft(state, tab, now)` | If the tab holds: set `graceUntil = now + GRACE_MS`, or no-op if already in grace. If queued: remove it. Otherwise no-op |
| `tabRejoined(state, tab, now)` | If the tab holds and is in grace: `graceUntil = null` and `lastActivity = now`. Otherwise no-op. A queued tab that left has lost its place and must request again |
| `recordActivity(state, tab, now)` | If the tab holds, is not in grace, and `now > lastActivity`: `lastActivity = now`. Otherwise no-op |
| `revokeEditRights(state, userId, now)` | Remove **all** of that user's tabs from the queue. If that user holds, pass on to the first remaining entry. No-op if the user appears nowhere |
| `expire(state, now)` | See below |
| `toPublic(state, now)` | See below |

**`expire`.** In order:

1. No holder: no-op.
2. In grace: pass on if `now >= graceUntil`, otherwise no-op. **Idle never fires during grace.**
3. Not in grace: pass on if an idle deadline exists and `now >= idleDeadline`, otherwise no-op.

An idle holder is not re-queued. One call makes at most one hand-off.

**Idle deadline.** It exists only with a holder, no grace, and a non-empty queue:

`Math.max(lastActivity, queue[0].queuedAt) + IDLE_MS`

**`toPublic`** returns a new object sharing nothing with the state, with exactly these keys:

```js
{ holder, holderSince, queue, idleDeadline, graceUntil, serverNow: now }
```

`holder` is `{ userId, tabId }` or `null`. Each `queue` entry is `{ userId, tabId }` only, with no `queuedAt`. `lastActivity` is not exposed. `projectId` is not included, because S20 adds it.

## Decisions the architecture left open

These are recorded in `2-architecture.md`. Do not choose differently.

- **Grace beats idle.** A holder who drops briefly keeps the turn even if the idle deadline passes meanwhile. Otherwise a short network loss could cost the turn, against success criterion 5.
- **Rejoining counts as activity,** so a holder who returns is not removed by the next sweep.
- **Reclaim during grace drops the old holder.** The queue holds only connected tabs.
- **`recordActivity` is added** to the build plan's list, because commits and previews must reset the idle clock and the module owns that field.

## Tests: `server/test/turns.test.js`

Use `node:test` and `node:assert/strict`, importing only `../src/lib/turns.js`. Deep-freeze every state passed in. Use exact timestamps and real boundaries, and assert `next === state` wherever a no-op is listed. Tabs: `A {a, a1}`, `A2 {a, a2}`, `B {b, b1}`, `C {c, c1}`.

- [ ] **Constants and empty state.** `toPublic(createTurnState(), 5)` equals all nulls, an empty queue, and `serverNow: 5`.
- [ ] **Request.** Free turn grants. A holder or queued tab re-requesting is a no-op. A second tab of the same user queues separately. FIFO order. `canEdit` of `false` is refused both when free and when held, which is the viewer case. Malformed and `null` tabs are no-ops.
- [ ] **Release.** Non-holder no-op. Hands off in queue order and sets a new `holderSince`. The last release gives the empty state.
- [ ] **Cancel.** Removes the tab. No-op for an unqueued tab and for the holder.
- [ ] **Skipping a disconnected entry.** A, then B and C queued. B leaves. A releases. C holds.
- [ ] **Reclaim.** Refused without permission. With A holding and B, C queued, C reclaiming at 100 gives holder C, queue `[A, B]`, and `idleDeadline` 120100. No-op for the current holder. Plain grant when free. During grace with B queued, C reclaiming gives holder C, queue `[B]`, and `graceUntil` null.
- [ ] **Grace.** `tabLeft` at 1000 gives `graceUntil` 21000 and `idleDeadline` null. A second `tabLeft` is a no-op. `expire` at 20999 is a no-op. `expire` at 21000 passes to the next tab and sets `holderSince` 21000. With nobody queued it gives the empty state.
- [ ] **Rejoin.** At 5000 within that grace: keeps the turn, clears grace, `idleDeadline` becomes 125000 with someone queued. No-op when not in grace, for another tab, and after the turn has passed on.
- [ ] **Idle starts at the first queue join.** A granted at 0, `expire` at `10 * IDLE_MS` with no queue is a no-op. B queues at 500000: deadline 620000, no-op at 619999, passes to B at 620000. A is not re-queued.
- [ ] **Activity.** With B queued as above, `recordActivity` by A at 600000 moves the deadline to 720000. No-op for a non-holder, for an equal or earlier `now`, and during grace.
- [ ] **Grace beats idle.** A granted at 0 and B queued at 0. A leaves at 119990. `expire` at 120000 is a no-op. `expire` at 139990 passes to B.
- [ ] **Queue head changes.** B queued at 100 and C at 200 gives deadline 120100. Cancelling B gives 120200. Cancelling C too gives null.
- [ ] **Revoke.** With A holding and A2, B, C queued: revoking `a` gives holder B and queue `[C]`. Revoking `b` keeps holder A with queue `[A2, C]`. Unknown user is a no-op. Revoking a sole holder gives the empty state.
- [ ] **Public shape.** Exact key sets for the object and for queue entries. Mutating the returned object leaves later `toPublic` output unchanged. Extra fields on a tab argument are not stored.
- [ ] **Invariant.** After a scripted sequence using every function, no holder always means an empty queue and null timestamps.

## Verification

- [ ] From `server/`: `node --test test/turns.test.js` passes.
- [ ] `cd server && npm test` finishes on its own with 0 failed and 0 cancelled. The existing 164 still pass.
- [ ] `grep -n "import\|require(\|Date.now\|setTimeout\|setInterval\|Math.random" server/src/lib/turns.js` finds nothing outside comments.
- [ ] `node --check server/src/lib/turns.js` passes.
- [ ] Root `npm run build` passes with only the existing large-chunk warning.
- [ ] `git diff --check` passes. Your new work is confined to the allowed files.

Report real output, including any failure. Mark Ready for review only if every check passes.

## Handed to S20, not done here

- Pass `can(role, "edit") === true` and `can(role, "reclaim") === true` as the booleans.
- Spread `projectId` into `toPublic` for `turn:state`.
- A duplicated browser tab can copy its `tabId` (see `server/readme.md`), so call `tabLeft` only when no other connection in the room has that same `userId` and `tabId`.
- Broadcast only when `next !== state`. `recordActivity` changes state on every commit and preview, so S20 must decide how often those are broadcast.
- `classifyJoin` in `useWorkspaceStore.js` rejects any join whose `ack.turn` is not `null`. S20 has to change it.

## Handoff prompt

```text
Read AGENTS.md and every file it lists, then context/specs/19-turn-state-machine.md. Mark S19 In progress
in context/6-progress-tracker.md. Implement it exactly as specified, touching only its allowed files.
Preserve the uncommitted S16 and S17 work. Run its verification, mark S19 Ready for review with a slice
note that reports real test output, and stop. Do not commit, push, branch, or start S20.
```
