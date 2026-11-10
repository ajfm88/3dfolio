# S17 review: Changes requested

**Reviewer:** Claude · **Date:** 2026-11-09 · **Implementer:** Grok · **Corrections:** Nemotron 3 Ultra · **Code reviewed at:** HEAD `f6ecdbd` (commit 65, which also contains S18)

Reviewed against `17-participants.md`, the invariants in `2-architecture.md`, and `4-code-standards.md`. S17 was committed without a review; this is that review.

**Verdict.** No functional defect in the server or store. The roster, lifecycle, ordering, pre-ack buffering, and validation all match the spec. Four small items remain: one accessibility fix and three checks the spec's checklist requires but the tests do not make. S17 is Changes requested until those land.

## Correct as built

- `getParticipants` deduplicates by user, sorts, whitelists fields, and returns fresh copies. A cached member with no connection is never listed.
- Snapshot, ack, and broadcast run in one synchronous stretch after attach, inside the room write queue. Presence adds no database query.
- Every removal publishes after the registry change and before the adapter leave, and only when a connection was really removed. Leave, disconnect, project switch, denied replacement, and eviction (empty roster) are all handled.
- `normalizeParticipants` rejects a list as a whole, including ids that differ only by case.
- The store buffers a pre-ack snapshot for the current attempt only. The listener checks binding, live socket, connection id, and project, and is removed by reference. Every lifecycle exit clears the roster, and canvas recovery leaves it alone.
- `ParticipantStack` hides self, keeps store order, shows five plus `+N`, falls back to initials, and resets a failed image when the URL changes.
- `server/readme.md` documents the join roster and `presence:update`. The one stale sentence there (about line 341) belongs to S16 and is fixed in the S16 corrections.

## Independent verification (2026-11-09)

| Check | Result |
| --- | --- |
| `node --test test/participants.test.mjs` | 5 of 5 |
| `node --test test/workspaceSync.test.mjs` | 12 of 12 |
| `node --test test/cursorPresence.test.mjs` | 69 of 69 |
| `node --test --test-timeout=8000` in `server/` | 164 tests: 163 pass, 0 fail, 1 cancelled (the known S16 preview test) |
| `node --test test/canvasPreview.test.mjs` | Setup crash, 0 tests (S16) |
| Root `npm run build` | Passes, existing large-chunk warning only |

**Not verified:** every browser item in the spec. That covers two accounts in separate browsers, a real tab close, failed-image fallback, native tooltips, keyboard focus, and the 320px width. Real two-account use has not happened for S16, S17, or S18. Do this walk before S20.

## Findings

### 1. P3: The accessible labels are not reliably exposed

`src/collaborate/components/workspace/ParticipantStack.jsx`. `aria-label` is set on a plain `span` and `div`. Those have the generic role, where ARIA does not allow a name, so screen readers may ignore it. A focused avatar with a photo would then announce at most the name from `alt`, never the role, which misses the spec's accessible label.

Fix: add `role="img"` to the avatar `span` and to the overflow `span`. Add `role="group"` to the outer `div`. Change nothing else in that file.

### 2. P3: Duplicate rosters are not tested

The spec requires duplicates to be rejected atomically. The code does this, but no test exercises it.

Fix, in `test/participants.test.mjs`, at the end of the first test:

- A join ack with `person(ADA, ...)` and `person(ADA.toUpperCase(), ...)` ends with status `error` and an empty roster.
- On a joined store, a `presence:update` with those two entries leaves the same `participants` array in place.

### 3. P3: An event under an old connection id is not tested

The spec lists it. The disconnected-socket path is covered, but a connected socket whose id changed is not.

Fix: add a test. Join, keep a reference to `participants`, set `socket.id = "sock-new"`, fire a valid `presence:update`, and assert the same array is still in place.

### 4. P3: Disconnect during a join does not assert presence

The spec lists it. `releases a room when the socket disconnects during canvas initialization` in `server/test/workspace.socket.test.js` already builds this exact scenario but never looks at presence.

Fix: add `assert.equal(presenceEmits(calls).length, 0);` after `assert.equal(ack.calls.length, 0);` in that test. `presenceEmits` is a function declaration in the same `describe`, so it is in scope.

## Not findings

- **Rollback after attach** cannot happen in practice. Nothing can run between `addConnection` and the stale check that follows it, because both are synchronous. No test is needed.
- **320px width.** The spec's no-page-overflow rule holds, because the header is `overflow-hidden`. By estimate, with six or more other people at 320px the header needs about 25px more than it has, so the role badge would be clipped. Check it during the browser walk. Decide then whether S29 should handle it.
- **Initials and emoji.** `words[0][0]` splits a surrogate pair, so a name beginning with an emoji shows a broken glyph. It is cosmetic and outside this correction.

## Allowed files

| File | Work |
| --- | --- |
| `src/collaborate/components/workspace/ParticipantStack.jsx` | Finding 1 only |
| `test/participants.test.mjs` | Findings 1, 2, 3. Also assert `role="group"` and `role="img"` appear in the existing markup test |
| `server/test/workspace.socket.test.js` | Finding 4 only |
| `context/6-progress-tracker.md` | Status and correction note |

Claude tried findings 1 to 3 on a throwaway copy of HEAD: the participant suite passed 6 of 6. The single assertion in finding 4 was not tried.

## Verification

- [ ] `node --test test/participants.test.mjs`: 6 of 6.
- [ ] From `server/`: `node --test --test-timeout=8000 test/workspaceRooms.test.js test/workspace.socket.test.js` passes.
- [ ] Root `npm run build` passes. `git diff --check` passes. `git diff --stat` shows only the allowed files.

## Handoff prompt

Give this only after the S16 corrections are Approved, in a new session.

```text
Read AGENTS.md and every file it lists, then context/specs/17-participants.md and
context/specs/17-participants-review.md. Mark S17 In progress in context/6-progress-tracker.md.
Fix only the four findings, touching only the review's allowed files. Run its verification, mark S17
Ready for review with a note that reports real test output, and stop. Do not commit, push, branch,
or start S19.
```
