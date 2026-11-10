# S16 corrections: drag and resize previews

**Implementer:** Nemotron 3 Ultra · **Reviewer:** Claude · **Planned:** 2026-11-09 · **Baseline:** HEAD `f6ecdbd` (commit 65)

Read `AGENTS.md`, the six context files, `specs/16-drag-resize-previews.md`, and this file. This file is the complete list of work. It closes the eight findings in the 2026-11-07 review in `6-progress-tracker.md`. Where this file and that review differ, this file wins, because S17 and S18 changed the code after the review was written.

Set S16 to In progress, make these changes, run the verification, set S16 to Ready for review with a slice note, and stop. No S17 corrections, S19, commits, pushes, or branches.

## Status of the design

Claude applied every production change below, and the server test changes, to a throwaway copy of HEAD and ran the suites there. Server: 164 of 164, no cancellations. Sync 12/12, cursor 69/69, participants 5/5. Eight store scenarios matching section 6 passed. Use the code as written. If something does not apply cleanly, stop and record it instead of improvising.

Browser behavior was not tested and still needs the two-session check if sessions are available.

## Allowed files

| File | Work |
| --- | --- |
| `src/collaborate/lib/canvasPreview.js` | Injectable clock, `onExpire` callback |
| `src/collaborate/store/useWorkspaceStore.js` | One display rebuild path, lifecycle clearing, listener guards, drag signature |
| `server/src/sockets/workspace.socket.js` | The relay call only |
| `server/test/canvas.socket.test.js` | Preview block only (the `describe("canvas:preview")` at about line 1095) |
| `test/canvasPreview.test.mjs` | Repair the suite and add store regressions |
| `server/readme.md` | One sentence |
| `context/6-progress-tracker.md` | Status and slice note |

**Do not edit** `WorkspaceCanvas.jsx`, `ShapeNode.jsx`, `throttle.js` (S18 already fixed the first-call-at-zero bug), `workspaceSync.js`, `canvasOps.js`, or any cursor or participant code. No new dependencies.

## 1. `canvasPreview.js`: expiry must repaint and be testable

Add above the controller and change its signature:

```js
const PREVIEW_TTL_MS = 3000;
const defaultClock = {
  setTimeout: (fn, delay) => setTimeout(fn, delay),
  clearTimeout: (id) => clearTimeout(id),
};

export function createPreviewOverlayController({ onExpire = () => {}, clock = defaultClock } = {}) {
```

Use `clock.clearTimeout` in `clearOverlay` and `clearAllOverlays`. Replace the timer block in `upsertOverlay` with:

```js
    if (existing !== undefined) clock.clearTimeout(existing);
    const timer = clock.setTimeout(() => {
      // A superseded timer must not expire the newer sample that replaced it.
      if (timers.get(id) !== timer) return;
      timers.delete(id);
      overlays.delete(id);
      onExpire(id);
    }, PREVIEW_TTL_MS);
```

## 2. `useWorkspaceStore.js`: one way to build display nodes

Add these two helpers directly above `const DISPLAY_NODE_CHANGES`:

```js
// Every display rebuild goes through here. Overlays are reconciled against the
// canonical change first, so a committed move cannot be painted over and a
// label edit cannot wipe another node's in-progress preview.
function displayNodes(binding, nextNodes, previousCanonical, priorDisplay) {
  const controller = binding?.previewController;
  if (!controller) return toDisplayNodes(nextNodes, priorDisplay);
  controller.onCanonicalNodesChange(previousCanonical, nextNodes);
  return controller.applyOverlays(toDisplayNodes(nextNodes, priorDisplay));
}

function clearPreviews(binding) {
  binding.previewThrottle?.cancel();
  binding.previewController?.clearAllOverlays();
}
```

Replace `syncDeps.toDisplayNodes` with:

```js
  // workspaceSync computes the display before it installs the canvas, so get()
  // still returns the previous canonical graph here. recovering is true for the
  // whole of a recovery, including its snapshot publish, so a replaced graph
  // can never inherit a preview from the one before it.
  toDisplayNodes: (nodes, previous) => {
    const binding = activeBinding;
    if (binding?.sync?.recovering) clearPreviews(binding);
    return displayNodes(binding, nodes, syncDeps.get().canvas.nodes, previous);
  },
```

In `restoreDisplay`, set `rfNodes` to `displayNodes(activeBinding, state.canvas.nodes, state.canvas.nodes, state.rfNodes)`.

In `dispatch`, delete `const previousCanonicalNodes = ...`, delete `const binding = activeBinding;`, and delete the `if (binding && binding.previewController) { ... }` block after `set`. Build the display inside `set`:

```js
    set({
      canvas,
      rfNodes: displayNodes(activeBinding, canvas.nodes, state.canvas.nodes, state.rfNodes),
      rfEdges: toDisplayEdges(canvas.edges, state.rfEdges),
    });
```

In `bindWorkspace`, create the controller with a repaint callback:

```js
    const previewController = createPreviewOverlayController({
      onExpire: () => {
        if (activeBinding !== binding || binding.disposed) return;
        set((state) => ({
          rfNodes: displayNodes(binding, state.canvas.nodes, state.canvas.nodes, state.rfNodes),
        }));
      },
    });
```

Replace the body of the `previewThrottle` callback. It must check its own binding, as the cursor throttle does, and recheck edit rights when it fires:

```js
      previewThrottle: throttle(({ projectId, nodes }) => {
        if (activeBinding !== binding || binding.disposed) return;
        if (projectId !== binding.projectId || !selectCanEdit(get())) return;
        binding.socket.volatile.emit("canvas:preview", { projectId, nodes });
      }, 50),
```

Change the status subscription so every non-ready transition clears previews. Joining, retrying, disconnecting, and failed recovery all pass through a non-ready status, so this one place covers them:

```js
    binding.unsubscribe = useWorkspaceStore.subscribe((state) => {
      if (state.status !== "ready") {
        clearBindingCursors(binding);
        clearPreviews(binding);
      }
    });
```

In the `onPreview` listener, add the same connection rule `canvas:ops` uses, immediately after the first binding check:

```js
        const live = binding.socket;
        if (!live?.connected || live.id !== binding.sync?.joinedConnectionId) return;
```

Still in `onPreview`, delete `const previousCanonical = state.canvas.nodes;` and the `onCanonicalNodesChange` call, and paint with:

```js
        set((current) => ({
          rfNodes: displayNodes(binding, current.canvas.nodes, current.canvas.nodes, current.rfNodes),
        }));
```

## 3. `useWorkspaceStore.js`: the drag signature

React Flow calls `onNodeDrag(event, node, nodes)`. Today the store loops over the event, which throws on every drag sample. `WorkspaceCanvas` already passes the handler straight through, so fix the store:

```js
  onNodeDrag: (_event, _node, nodes) => {
    if (!Array.isArray(nodes)) return;
    const state = get();
    if (!selectCanEdit(state)) return;
```

Leave the rest of that action unchanged.

## 4. `workspace.socket.js` and `server/readme.md`

In `onPreview`, change only the emit target. `by`, the payload, and the `try/catch` stay:

```js
    socket.to(roomName(projectId)).volatile.emit("canvas:preview", {
```

In `server/readme.md` (about line 341), replace the sentence `Previews and turns are not part of this protocol yet.` with:

`Previews are a volatile relay with no ack and no persistence, and each client drops an overlay 3 seconds after its last sample. Turn holding is not part of this protocol yet (S20).`

## 5. `server/test/canvas.socket.test.js`, preview block only

This file has **two** `createSocket` functions. Change only the inner one, in the `canvas:preview` block (about line 1127). The outer one keeps its `socket.to must not be used for commits` guard, and that guard must stay.

Add `relays: [],` beside `emits: [],` and replace its `to()` line:

```js
        to(room) {
          const call = { room, volatile: false };
          const operator = {
            get volatile() {
              call.volatile = true;
              return operator;
            },
            emit(event, payload) {
              if (event !== "canvas:preview") throw new Error("socket.to is only for previews");
              socket.relays.push({ room: call.room, event, payload, volatile: call.volatile });
            },
          };
          return operator;
        },
```

Update the assertions:

- **Valid drag relay test:** assert `io.emits.length === 0` and `sender.relays.length === 1`, then read `sender.relays[0]` for `event`, `volatile`, `room`, `payload.by`, and `payload.nodes`. Remove the `except` assertion.
- **Second tab test:** assert `sender.relays.length === 1`, its room is `project:<projectId>`, and `otherTab.relays.length === 0`.
- **`Canvas.updateOne` test:** replace its last two assertions with `sender.relays.length === 1` and `sender.relays[0].volatile === true`. Keep the `updateOneCalls` and `canvas:ops` assertions.
- **Rejection tests** (viewer, non-member, bad id, over 50, duplicate, non-finite, partial size): `assert.equal(<socket>.relays.length, 0)` alongside the existing `io.emits` check.

Replace the body of `leave and delayed rejoin invalidate authority before queued detach`, from the `joinAck` declaration to the end of the test, with the following. The old version awaited a join whose database lookup it had not released yet, which is why it hung. It also wrongly expected a leave of a *different* project to remove authority.

```js
      const preview = () => socket.handler("canvas:preview")({ projectId, nodes: [{ id: "n1", position: { x: 1, y: 1 } }] });
      const joinAck = ackCapture();
      const joining = socket.handler("workspace:join")({ projectId, tabId: TAB }, joinAck);
      await settle();
      gates[0].resolve(projectDoc(projectId, userId, "owner"));
      await joining;
      assert.equal(joinAck.calls[0].ok, true);

      deferLookups = false;
      await socket.handler("workspace:leave")({ projectId: otherProject });
      await preview();
      assert.equal(socket.relays.length, 1);

      deferLookups = true;
      const rejoinAck = ackCapture();
      const rejoining = socket.handler("workspace:join")({ projectId, tabId: TAB_B }, rejoinAck);
      await settle();
      assert.equal(rejoinAck.calls.length, 0);
      await preview();
      assert.equal(socket.relays.length, 1);

      const leaving = socket.handler("workspace:leave")({ projectId });
      await settle();
      await preview();
      assert.equal(socket.relays.length, 1);

      gates[1].resolve(projectDoc(projectId, userId, "owner"));
      await rejoining;
      await leaving;
      assert.deepEqual(rejoinAck.calls, [{ ok: false, message: "Workspace request superseded" }]);
      assert.equal(registry.getRoom(projectId), null);
```

## 6. `test/canvasPreview.test.mjs`

**Repair the setup.** `describe` bodies run before `before` hooks, which is why the suite crashes.

- Declare `let throttle; let createPreviewOverlayController; let POSITION_MAX; let NODE_SIZE_MIN;` beside the existing `let` lines.
- Assign them at the end of the `before` hook. Delete the three `const { ... } = ...Module` lines at about line 44.
- In the sanitize block, replace `const controller = createPreviewOverlayController();` with `let controller;` and `beforeEach(() => { controller = createPreviewOverlayController(); });`. Import `beforeEach`.
- Set `process.env.VITE_API_URL ||= "http://127.0.0.1:3000/api";` at the top of the file, because the store imports the session store.

**Fix the assertions the crash was hiding.** Both fail as soon as the suite runs:

- `rejects empty array`: an empty list returns `ok: false`. Rename it `ignores an empty list` and assert `ok === false`, with `applied.length === 0`.
- `calls inside window collapse to newest args`: rewrite it on a fake clock with no real timers. Call `first` at time 1000 (it runs at once), call `second` and `third` at 1010, fire the scheduled timer, and assert two calls, the last with `third`.

**Fix tests that do not test their name:**

- `cancel prevents trailing call` cancels before anything is scheduled. Call once, call again inside the window so a timer exists, assert the timer exists, cancel, and assert the function ran once.
- Add `first call at clock 0 runs immediately`, using a clock whose `now` returns 0.
- Controllers in the overlay tests must use a fake clock. No test may wait 50ms or 3s of real time, or leave a real 3s timer running.

**Add store regressions** that use the real `useWorkspaceStore` loaded in `before`. Copy `createSocket` (with `volatile`) and `createFakeClock` from `test/cursorPresence.test.mjs`. Install the fake clock inside each test that needs it and restore it in `finally`, so Vite keeps real timers. Start from a joined `ready` store with two nodes, `n1` and `n2`.

| # | Scenario | Required result |
| --- | --- | --- |
| 1 | `onNodeDrag(event, node, nodes)` with display fields on the node | One volatile `canvas:preview` with only `{ id, position }` |
| 2 | Same call with 51 nodes | Nothing emitted |
| 3 | Viewer calls `onNodeDrag` | Nothing emitted |
| 4 | Two quick drag samples, then `commitNodePositions` | Trailing sample never emitted |
| 5 | Preview for `n1`, advance 2999ms, new sample, advance 2999ms | Display shows the newest sample |
| 6 | Continue 5, advance 1ms more | Display returns to canonical. `canvas` and `version` unchanged |
| 7 | Previews on `n1` and `n2`, remote label `node.update` on `n1` | Both overlays stay |
| 8 | Continue 7, remote position `node.update` on `n1` | `n1` shows the committed position. `n2` keeps its overlay |
| 9 | Preview on `n2`, local `setNodeLabel` on `n1` | `n2` keeps its overlay |
| 10 | Preview on `n2`, local `commitNodePositions` on `n2` | `n2` shows the committed position |
| 11 | Preview on `n2`, `commitNodeResize("missing", {})` | `n2` keeps its overlay |
| 12 | Preview on `n2`, then a version-gap `canvas:ops` starts recovery | `syncStatus` is `syncing` and `n2` is back at canonical |
| 13 | Pending trailing sample, recovery starts, advance 60ms | No further `canvas:preview` |
| 14 | Preview while `syncStatus` is `syncing` | Display unchanged |
| 15 | Preview after `socket.id` changes, and with `connected = false` | Ignored |
| 16 | Preview, then `retryWorkspace()` and a fresh join | Overlay gone |
| 17 | Preview, then `disconnect`; preview, then dispose | Overlays gone and no timer fires later |
| 18 | Preview with `by` equal to the signed-in user | Still applied, for the sender's other tab |

## Verification

Run each client suite in its own command, because Vite harnesses collide on port 24678.

- [ ] `node --test test/canvasPreview.test.mjs`: every test passes, zero cancelled.
- [ ] `node --test test/workspaceSync.test.mjs`, `test/participants.test.mjs`, `test/cursorPresence.test.mjs`: 12, 5, and 69 still pass.
- [ ] `cd server && npm test` **finishes on its own**, with 0 failed and 0 cancelled, at least 164 tests.
- [ ] Root `npm run build` passes with only the existing large-chunk warning. Record the workspace chunk size.
- [ ] `git diff --check` passes. `git diff --stat` shows only the allowed files.
- [ ] `grep -n "except(socket.id)" server/src/sockets/workspace.socket.js` finds nothing.
- [ ] Browser, only if two signed-in sessions are available: drag and resize in one, watch the other glide and land. Otherwise write that it was not run. Do not create live database fixtures.

Report every failure exactly as it appeared. In the last review, a claimed passing run could not be reproduced.

## Handoff prompt

```text
Read AGENTS.md and every file it lists, then context/specs/16-drag-resize-previews.md and
context/specs/16-drag-resize-previews-corrections.md. Mark S16 In progress in
context/6-progress-tracker.md. Make exactly the corrections file's changes, using its code as written,
and touch only its allowed files. Run its verification, mark S16 Ready for review with a slice note
that reports real test output, and stop. Do not commit, push, branch, or start S17 corrections or S19.
```
