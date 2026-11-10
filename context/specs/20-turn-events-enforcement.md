# Slice 20: Turn events and enforcement

**Lane:** server, plus one client line · **Depends on:** S14, S16, S19 · **Unblocks:** S21, S27

**Implementer:** Grok · **Reviewer:** Claude

## Goal and baseline

Connect the S19 turn rules to the workspace sockets. After this slice the server refuses canvas commits and previews from every tab except the one holding the turn.

Read `AGENTS.md`, the six context files (especially **Turn rules** and **Turn events** in `2-architecture.md`), `specs/19-turn-state-machine.md`, and this spec.

Baseline: HEAD `f6ecdbd` plus the Approved, uncommitted S16, S17, and S19 work in the working tree. Preserve all of it. Capture the starting diff so S20 stays separate.

Set S20 to In progress, implement this slice only, run the verification, set it to Ready for review with a slice note, and stop. No S21 work, commits, pushes, or branches.

**Expected gap until S21.** There is no button to request a turn until S21, while the client's own edit gate is still role-based. In a browser, an edit attempt after this slice is refused by the server, toasts `You cannot edit this canvas`, and rejoins. That is correct for S20. Do not soften it and do not build any UI.

## Design check

Claude applied the production changes and test migration below to a throwaway copy and ran the server suite: the 186 existing tests plus 14 end-to-end turn scenarios, 200 of 200 passing. Use the code as written. If something does not apply cleanly, stop and record it instead of improvising. The client line and a live server were not exercised.

## Allowed files

| File | Work |
| --- | --- |
| `server/src/lib/workspaceRooms.js` | `turn` fields on the room, `listRooms()` |
| `server/src/sockets/workspace.socket.js` | Enforcement, turn events, publication, sweeper |
| `server/src/lib/socket.js` | Import and start the sweeper, nothing else (named here as the protected-file rule requires) |
| `src/collaborate/store/useWorkspaceStore.js` | One line in `classifyJoin`, nothing else |
| `server/test/canvas.socket.test.js` | Migration below |
| `server/test/workspace.socket.test.js` | Migration below |
| `server/test/turn.socket.test.js` | New |
| `test/workspaceSync.test.mjs` | One test that a join with an object `turn` is accepted |
| `server/readme.md` | Turn events and rules |
| `context/6-progress-tracker.md` | Status and slice note |

No dependencies, configuration, schema, or other files. Do not change `turns.js`.

## 1. `workspaceRooms.js`

Add at the top of the file:

```js
import { createTurnState } from "./turns.js";
```

In `ensureInit`, add to the room object after `writeQueue: createSerialQueue(),`:

```js
          turn: createTurnState(),
          turnPublishedAt: 0,
```

Add above the registry's `return`, and include `listRooms` in the returned object:

```js
  // A snapshot, so the sweeper can hand off turns while rooms come and go.
  function listRooms() {
    const open = [];
    for (const [projectId, entry] of rooms) {
      if (entry.room) open.push([projectId, entry.room]);
    }
    return open;
  }
```

## 2. `socket.js`

Import `startTurnSweeper` alongside `registerWorkspaceHandlers`, and call `startTurnSweeper(io);` immediately before the `export` line.

## 3. `workspace.socket.js`

Add the import after the `workspaceRooms.js` import:

```js
import {
  cancelRequest,
  expire,
  reclaimTurn,
  recordActivity,
  releaseTurn,
  requestTurn,
  tabLeft,
  tabRejoined,
  toPublic,
} from "../lib/turns.js";
```

Add above `const OBJECT_ID`:

```js
const TURN_SWEEP_MS = 5000;
const ACTIVITY_PUBLISH_MS = 5000;
```

**`canWrite`.** Replace the comment above it and the last two lines of its body:

```js
// Edit rights follow the connection object stored on the room, not a payload
// and not a lookalike with the same fields. Being an owner or editor is not
// enough: this exact tab has to hold the turn.
```

```js
  const member = room.members?.get(connection.userId);
  if (!member || projectAccess.can(member.role, "edit") !== true) return false;
  const holder = room.turn?.holder;
  return Boolean(holder)
    && holder.userId === connection.userId
    && holder.tabId === connection.tabId;
```

**Helpers.** Add directly above `detach`:

```js
function tabOf(connection) {
  return { userId: connection.userId, tabId: connection.tabId };
}

function publishTurn(io, projectId, room, now) {
  room.turnPublishedAt = now;
  try {
    io.to(roomName(projectId)).emit("turn:state", { projectId, ...toPublic(room.turn, now) });
  } catch (error) {
    logHandler("turn:state", error);
  }
}

// Every turn change goes through here. The pure rules return the object they
// were given when nothing changed, so a no-op never reaches the room.
function setTurn(io, projectId, room, next, now) {
  if (next === room.turn) return;
  room.turn = next;
  publishTurn(io, projectId, room, now);
}

// Commits and previews reset the idle clock on every call. Only someone
// waiting can see that clock, and a preview arrives every 50ms, so the room
// hears about it at most once per interval.
function noteActivity(io, projectId, room, connection, now) {
  const next = recordActivity(room.turn, tabOf(connection), now);
  if (next === room.turn) return;
  room.turn = next;
  if (next.queue.length === 0 || now - room.turnPublishedAt < ACTIVITY_PUBLISH_MS) return;
  publishTurn(io, projectId, room, now);
}

// A duplicated browser tab can copy its tab id, so one departure does not mean
// the tab is gone while another connection still carries that identity.
function tabStillConnected(room, connection) {
  for (const current of room.connections.values()) {
    if (current.userId === connection.userId && current.tabId === connection.tabId) return true;
  }
  return false;
}

// The connection is read first because removal forgets it. An evicted room has
// nobody left to tell, and its turn state went with it.
function removeFromRoom(io, registry, projectId, socketId) {
  const room = registry.getRoom(projectId);
  const connection = room?.connections.get(socketId);
  const removed = registry.removeConnection(projectId, socketId);
  if (!removed) return;
  publishPresence(io, registry, projectId);
  if (!connection || registry.getRoom(projectId) !== room || tabStillConnected(room, connection)) return;
  const now = Date.now();
  setTurn(io, projectId, room, tabLeft(room.turn, tabOf(connection), now), now);
}
```

**Use `removeFromRoom` at all three removal sites.** After this, `registry.removeConnection` is called only inside that helper.

`detach` begins:

```js
  removeFromRoom(io, registry, projectId, socketId);
  if (state.activeProjectId === projectId) state.activeProjectId = null;
```

Keep its adapter-leave line. `rollback` in `runJoin` begins:

```js
    // Entering the adapter room is not a connection. Announce only the socket
    // that was actually stored, and never a different member of the room.
    removeFromRoom(io, registry, projectId, socketId);
    if (state.activeProjectId === projectId) state.activeProjectId = null;
    if (state.joinedGeneration === generation) state.joinedGeneration = null;
    attached = false;
```

`onDisconnecting` ends with `removeFromRoom(io, registry, projectId, socketId);` in place of its last two lines.

**Join.** Replace the block from `const participants` through `publishPresence` inside the room queue:

```js
      const participants = registry.getParticipants(projectId);
      const now = Date.now();
      const turn = tabRejoined(handle.room.turn, { userId, tabId }, now);
      reply({
        ok: true,
        project: projectSummary(project),
        role,
        canvas,
        participants,
        turn: toPublic(turn, now),
        serverNow: now,
      });
      publishPresence(io, registry, projectId);
      setTurn(io, projectId, handle.room, turn, now);
```

**Commit.** In `runCommit`, directly after the `try/catch` around the `canvas:ops` broadcast and still inside the outer `try`:

```js
    noteActivity(io, captured.projectId, room, captured.connection, Date.now());
```

**Preview.** At the end of `onPreview`, after its `try/catch`:

```js
  noteActivity(io, projectId, joined.room, joined.connection, Date.now());
```

**Handlers and sweeper.** Add directly above `registerWorkspaceHandlers`:

```js
// Turn events carry no ack: the answer is the turn:state that follows. The
// rules run synchronously, so two requests cannot interleave inside one.
function onTurn(io, socket, registry, payload, transition) {
  if (!isRecord(payload)) return;
  if (typeof payload.projectId !== "string" || !OBJECT_ID.test(payload.projectId)) return;
  const projectId = payload.projectId.toLowerCase();
  const userId = readUserId(socket);
  if (!userId) return;
  const joined = joinedConnection(socket, registry, projectId, userId);
  if (!joined) return;
  const member = joined.room.members.get(userId);
  if (!member) return;
  const now = Date.now();
  const next = transition(joined.room.turn, tabOf(joined.connection), member.role, now);
  setTurn(io, projectId, joined.room, next, now);
}

// One room failing must not stop the others from being swept.
export function sweepTurns(io, registry = workspaceRegistry, now = Date.now()) {
  for (const [projectId, room] of registry.listRooms()) {
    try {
      setTurn(io, projectId, room, expire(room.turn, now), now);
    } catch (error) {
      logHandler("turn:sweep", error);
    }
  }
}

// Unref keeps a test run or a shutdown from waiting on this timer.
export function startTurnSweeper(io, registry = workspaceRegistry) {
  const timer = setInterval(() => sweepTurns(io, registry), TURN_SWEEP_MS);
  timer.unref();
  return () => clearInterval(timer);
}
```

Register inside `registerWorkspaceHandlers`, before the `disconnecting` comment:

```js
  socket.on("turn:request", safeHandler("turn:request", (payload) => (
    onTurn(io, socket, roomRegistry, payload, (turn, tab, role, now) => requestTurn(turn, tab, can(role, "edit") === true, now))
  )));

  socket.on("turn:release", safeHandler("turn:release", (payload) => (
    onTurn(io, socket, roomRegistry, payload, (turn, tab, role, now) => releaseTurn(turn, tab, now))
  )));

  socket.on("turn:cancel", safeHandler("turn:cancel", (payload) => (
    onTurn(io, socket, roomRegistry, payload, (turn, tab) => cancelRequest(turn, tab))
  )));

  socket.on("turn:reclaim", safeHandler("turn:reclaim", (payload) => (
    onTurn(io, socket, roomRegistry, payload, (turn, tab, role, now) => reclaimTurn(turn, tab, can(role, "reclaim") === true, now))
  )));
```

## 4. `useWorkspaceStore.js`

In `classifyJoin`, change `&& ack.turn === null` to the line below. Without it every join fails. `null` stays accepted so a client deployed ahead of the server still works. The store does not keep the value until S21.

```js
    && (ack.turn === null || isRecord(ack.turn))
```

## 5. Migrating existing tests

These tests assumed any editor could write. Change only what is listed.

**`server/test/canvas.socket.test.js`**

| Where | Change |
| --- | --- |
| Both `createIo` functions | Add `turns: [],` to the `io` object. In `emit`, after the `presence:update` branch, add `else if (event === "turn:state") io.turns.push(record);` before the `emits` push, so existing counts stay correct |
| Both `joinAs` helpers | After the `ok` assertion: `await socket.handler("turn:request")({ projectId });` |
| `canWrite` unit test | Add `turn: { holder: { userId: "user-1", tabId: "tab-1" } }` to `room`, and `turn: room.turn` to `other`. After the `other` assertion, assert `false` for a holder with `tabId: "tab-2"`, for `holder: null`, and for `room.turn = undefined`. Keep the rest |
| `serializes two writers...` | Rename to `serializes two commits and reloads when the compare-and-set misses`. Send the `second` commit and the final `retry` commit from `socketA`. A second writer cannot exist now, and the test is about the queue |
| `drops queued work when the caller leaves...` | After `assert.notEqual(current.writeQueue, queue);` add `await socket.handler("turn:request")({ projectId });` |
| `syncs the queued cache for a viewer...` | After the owner's join assertion add `await owner.handler("turn:request")({ projectId });` |
| `drops a finished join's authority...` | After the `restoredAck` version assertion add `await socket.handler("turn:request")({ projectId });` |
| `leave and delayed rejoin invalidate authority...` (preview block) | After `assert.equal(joinAck.calls[0].ok, true);` add `await socket.handler("turn:request")({ projectId });` |

**`server/test/workspace.socket.test.js`:** replace `assert.equal(body.turn, null);` with a `deepEqual` against `{ holder: null, holderSince: null, queue: [], idleDeadline: null, graceUntil: null, serverNow: body.serverNow }`.

**`test/workspaceSync.test.mjs`:** add one test that a join ack with `turn` set to the empty public object reaches status `ready`.

## 6. New tests: `server/test/turn.socket.test.js`

Use real `workspace:join` and turn handlers through `registerWorkspaceHandlers`, a fresh `createWorkspaceRegistry()` per test, and mocked `User.findById`, `Canvas.findOneAndUpdate`, and `Canvas.updateOne`. No database. Fake `io` must record `room`, `except`, `volatile`, event, and payload. Fake sockets need a working `socket.to(room).volatile.emit`. Call `sweepTurns(io, registry, now)` directly, with no real waiting. Mock `Date.now` where times matter. `Canvas` and `User` mocks are restored after each test.

- [ ] Join ack carries the empty public turn and emits no `turn:state`.
- [ ] Request grants: one `turn:state` to `project:<id>` only, not volatile, no `except`, with exactly `projectId, holder, holderSince, queue, idleDeadline, graceUntil, serverNow`. Repeating the request emits nothing.
- [ ] A viewer, a socket that never joined, and malformed payloads (`null`, `{}`, bad id, a number) emit nothing and do not throw.
- [ ] With nobody holding, a commit is refused with `You cannot edit this canvas` and `updateOne` is not called. After a request, the holder commits. The same user's second tab and another editor are refused. Non-holder previews are not relayed. The holder's preview is.
- [ ] Release hands over in order. The old holder is then refused and the new holder can commit.
- [ ] An editor's `turn:reclaim` emits nothing. The owner's reclaim takes the turn, with the old holder at the front of the queue. `turn:cancel` removes a queued tab.
- [ ] Holder disconnects: `turn:state` has a numeric `graceUntil` and null `idleDeadline`. Joining on a new socket with the same user and tab: the ack shows that holder with null `graceUntil`, a `turn:state` clears it, and a commit succeeds.
- [ ] `workspace:leave` by the holder while another socket remains starts grace the same way.
- [ ] Sweeper: no emit at `graceUntil - 1`, hand-off at `graceUntil`. Then the next holder loses the turn at its `idleDeadline`.
- [ ] A queued tab that disconnects leaves the queue.
- [ ] Two connections with the same user and tab: the first disconnect emits nothing, and the last starts grace.
- [ ] Activity: with someone waiting and the clock mocked, a preview 1s after the last publish emits nothing, one 5s after emits a `turn:state` with the moved `idleDeadline`. A later unpublished commit still moves the real deadline, proved by the sweeper's exact hand-off time.
- [ ] Activity with nobody waiting emits nothing, even 60s later.
- [ ] The last connection leaving discards the room, and a fresh join sees no holder.

## 7. `server/readme.md`

- Client-to-server table: `turn:request`, `turn:release`, `turn:cancel`, `turn:reclaim`, each `{ projectId }`, no ack, with who may send.
- Server-to-client table: `turn:state` with its payload, not volatile, sent to the project room on every turn change, and activity updates at most every 5 seconds while someone waits.
- `workspace:join` ack: `turn` is now the public turn state.
- Add a short rules paragraph: only the holding tab may commit or preview, the 20-second grace, the 2-minute idle while someone waits, the 5-second sweep (so a hand-off can land up to 5 seconds late), and that state is in memory only and lost on restart.
- Replace the now-false lines: `Turn holding is not part of this protocol yet (S20).`, `Turn-holding is still S20.` in the `canvas:preview` row, and `Sent only by a joined editor/owner` in the client preview row (it is now the holder's tab).

## Decisions

Recorded in `2-architecture.md`. Do not choose differently.

- `workspace:leave` is treated like a disconnect, so a holder who navigates away keeps the turn for 20 seconds. S22 adds a best-effort release on tab close.
- **A holder alone in a project loses the turn on any drop.** The room empties, and the architecture discards an empty room. Rejoining makes the turn free again, so one click gets it back. Grace matters only when someone else is present.
- Turn events use the cached role, like previews. S27 keeps it live, and commits still refresh membership.
- A commit already past its `canWrite` check finishes even if the turn changes during the save. It was valid when it started, and the version check protects the next holder.

## Verification

Run each client suite in its own command.

- [ ] `cd server && npm test` finishes on its own with 0 failed and 0 cancelled. Report the total.
- [ ] `node --test test/workspaceSync.test.mjs`, `test/participants.test.mjs`, `test/cursorPresence.test.mjs`, `test/canvasPreview.test.mjs` pass.
- [ ] From `server/`, `npm run dev` boots with no error and connects to MongoDB. Do not write any data. Stop it afterward.
- [ ] Root `npm run build` passes with only the existing large-chunk warning. Record the workspace chunk size.
- [ ] `git diff --check` passes.
- [ ] `grep -n "registry.removeConnection" server/src/sockets/workspace.socket.js` shows one call, inside `removeFromRoom`.
- [ ] `grep -n "turn: null" server/src/sockets/workspace.socket.js` finds nothing.
- [ ] Browser: not applicable until S21, for the reason in the Expected gap note. Write that it was not run.

Report real output, including any failure. Mark Ready for review only if every check passes.

## Done when

Commits and previews from any tab but the holder's are refused by the server, even from a tampered client. Request, release, cancel, and reclaim work and broadcast. Grace and idle hand-offs happen through the sweeper.

## Handoff prompt

```text
Read AGENTS.md and every file it lists, then context/specs/19-turn-state-machine.md and
context/specs/20-turn-events-enforcement.md. Mark S20 In progress in context/6-progress-tracker.md.
Implement it exactly as specified, using its code as written and touching only its allowed files.
Preserve the uncommitted S16, S17, and S19 work. Run its verification, mark S20 Ready for review with a
slice note that reports real test output, and stop. Do not commit, push, branch, or start S21.
```
