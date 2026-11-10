# S20 review: Changes requested

**Reviewer:** Claude · **Date:** 2026-11-09 · **Implementer:** Grok · **Reviewed:** uncommitted working tree on HEAD `f6ecdbd`

**Verdict.** The production code is correct and needs no change. `workspace.socket.js`, `workspaceRooms.js`, `socket.js`, and the `useWorkspaceStore.js` line are identical to the design Claude tested. The migrated tests match too. Three small items remain: one test that cannot fail, one missing test, and readme lines the spec forgot to name.

## Independent verification

| Check | Result |
| --- | --- |
| `cd server && npm test` | Finishes on its own: 200 of 200 |
| Sync, participants, cursor, `canvasPreview` | 13, 6, 69, 39, all passing |
| Root `npm run build` | Passes. `WorkspacePage-Dwi4jAD6.js` 248.97 kB, gzip 80.18 kB |
| Claude's 14 end-to-end scenarios against this code | 14 of 14 |
| 23 bugs injected one at a time into `workspace.socket.js` | 20 caught by the repo's tests |

Browser and two-account checks were not run, as expected until S21.

## Findings

### 1. P2: The reclaim permission test cannot fail

`server/test/turn.socket.test.js`, `lets only the owner reclaim...`. The editor who attempts the reclaim is already the holder, and a holder's reclaim is a no-op whether or not it has permission. With the permission check removed from the handler, the test still passes.

The production check is correct, and Claude's scenario proves it. But a permission rule has to be guarded in the repo.

Fix: replace these lines:

```js
    const before = turnEmits(io).length;

    await editor.handler("turn:reclaim")({ projectId });
    assert.equal(turnEmits(io).length, before);
```

with:

```js
    const waiting = createSocket(id(), "waiting");
    attach(io, waiting, calls, registry);
    await join(waiting, projectId, "123e4567-e89b-41d3-a456-426614174002");
    const before = turnEmits(io).length;

    await waiting.handler("turn:reclaim")({ projectId });
    assert.equal(turnEmits(io).length, before);
```

### 2. P3: A turn event naming a different project is not tested

Nothing proves that the payload's project is what gets checked. The spec did not list this case, so it is a spec gap and not an error in the implementation.

Fix: add directly above `refuses every commit and preview except the holding tab`:

```js
  it("ignores a turn event for a project the socket has not joined", async () => {
    const userId = id();
    const projectId = id();
    const calls = stub(() => "editor");
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const socket = createSocket(userId, "editor");
    attach(io, socket, calls, registry);
    await join(socket, projectId, TAB);

    await socket.handler("turn:request")({ projectId: id() });
    assert.equal(turnEmits(io).length, 0);
    assert.equal(registry.getRoom(projectId).turn.holder, null);
  });
```

### 3. P3: Stale readme lines

Grok was right to flag these and leave them, because section 7 of the spec did not name them. In `server/readme.md`:

- Replace `Until turn enforcement, two editors can commit at once; the loser resyncs instead of merging.` with `Only the tab holding the turn can commit, and a commit refused during a hand-off resyncs instead of merging.`
- Replace `Until turn enforcement arrives in a later slice, an owner or editor connection may commit.` with `Only the tab holding the turn may commit.`
- In the `test/` structure tree, directly above the `turns.test.js` line, add this with its `#` aligned to its neighbors: `│   ├── turn.socket.test.js           # Turn events, enforcement, grace, idle, and the sweeper`

## Not a finding

The remaining injected bug removed the `isRecord` guard in `onTurn`. It survived because a bad payload then throws inside `safeHandler`, which logs it, so nothing observable changes. Keep the guard: the code standards require validating before use.

## Allowed files

`server/test/turn.socket.test.js`, `server/readme.md`, and `context/6-progress-tracker.md`. No production code or other test changes.

Claude tried findings 1 and 2 on a throwaway copy: the file passed 15 of 15, and the two bugs that had survived are now caught.

## Verification

- [ ] `cd server && npm test` finishes on its own: 201 of 201, 0 cancelled.
- [ ] `git diff --check` passes.

## Handoff prompt

```text
Read context/specs/20-turn-events-review.md. Mark S20 In progress in context/6-progress-tracker.md.
Make only its three fixes, using its code and text as written, and change only its allowed files. Do not
change production code. Run its verification, mark S20 Ready for review with a note that reports the real
test output, and stop. Do not commit, push, branch, or start S21.
```
