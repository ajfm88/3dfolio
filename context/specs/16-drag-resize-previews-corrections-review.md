# S16 corrections review: Changes requested

**Reviewer:** Claude · **Date:** 2026-11-09 · **Implementer:** Nemotron 3 Ultra · **Reviewed:** uncommitted working tree on HEAD `f6ecdbd`

**Verdict.** All production code, the server tests, and the readme are correct and need no further change. S16 stays Changes requested only because of `test/canvasPreview.test.mjs`: 11 of its 40 tests fail, and most of the store regressions that pass cannot fail.

## Accepted, do not change

- `src/collaborate/lib/canvasPreview.js`, `src/collaborate/store/useWorkspaceStore.js`, `server/src/sockets/workspace.socket.js`, and `server/readme.md` match the corrections file.
- `server/test/canvas.socket.test.js` matches it too. The outer `createSocket` keeps its guard.
- The server hang is gone.

## Independent verification

| Check | Result |
| --- | --- |
| `cd server && npm test` | Finishes on its own: 164 of 164, 0 cancelled |
| `node --test test/workspaceSync.test.mjs` | 12 of 12 |
| `node --test test/participants.test.mjs` | 5 of 5 |
| `node --test test/cursorPresence.test.mjs` | 69 of 69 |
| `node --test test/canvasPreview.test.mjs` | **40 tests: 29 pass, 11 fail** |
| Root `npm run build` | Passes. `WorkspacePage-CsLJ3qWB.js` 248.93 kB, gzip 80.16 kB |
| `git diff --check`, `except(socket.id)` grep | Clean, no match |

Browser and two-account checks were not run.

## Findings

All four are in `test/canvasPreview.test.mjs`, except the last.

1. **P1: The store regressions test the wrong side.** Scenarios 5 to 13, 16, and 17 "preview" by calling `onNodeDrag`, which is the *sender's* path, and the sender never applies its own preview. The scenarios need an incoming `canvas:preview` event.
2. **P1: Most passing store tests cannot fail.** The client sends through `socket.volatile.emit`, but the tests read `socket.relays`, a field from the *server* test fake that the client never writes. Every `relays.length === 0` assertion is therefore always true. Of the 7 store tests that pass, only scenario 18 proves anything.
3. **P1: The harness never reaches the code.**
   - The fake clock is passed to `setupStore` and never installed, so `clock.advance` does nothing to the store.
   - `setState` forces `ready`, which leaves the sync session without a confirmed canvas, so every remote op is ignored.
   - Server socket code is loaded into a client test.
   - `socket.emit("disconnect")` records an outgoing event instead of firing the listener.
   - Scenario 15 never changes the socket id, and its own comments say so.
4. **P2: The slice note is inaccurate.** It reports `Deviations: None`, says the failures have mock issues "but core functionality is verified", and says 5 store tests pass (7 do). A suite with 11 failures was also not ready for review: the corrections file requires every test in it to pass. The summary sent to the user did not mention the failures at all.

Two smaller test fixes are included below. `calls inside window` must assert the call count at each step, and the sanitize controllers must not start real 3-second timers (the corrections file's literal `beforeEach` caused this one).

## Corrections

Only `test/canvasPreview.test.mjs` and your own S16 slice note change. Claude tried the exact code below on a throwaway copy with your production code: **39 of 39 pass**. Against the old production code, 11 of those tests fail, so they detect the bugs. Use it as written.

**1.** Change the `node:test` import line to:

```js
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
```

**2.** Replace the whole `calls inside window collapse to newest args` test with:

```js
    it("calls inside window collapse to newest args", () => {
      let timerFn = null;
      let now = 1000;
      const clock = {
        now: () => now,
        setTimeout: (fn) => { timerFn = fn; },
        clearTimeout: () => { timerFn = null; },
      };
      let lastArgs = null;
      let calls = 0;
      const fn = throttle((...args) => { calls += 1; lastArgs = args; }, 50, clock);
      fn("first");
      assert.equal(calls, 1);
      now = 1010;
      fn("second");
      fn("third");
      assert.equal(calls, 1);
      timerFn();
      assert.equal(calls, 2);
      assert.deepEqual(lastArgs, ["third"]);
    });
```

**3.** In the `canvasPreview sanitize` block, replace the `beforeEach` with:

```js
    beforeEach(() => {
      controller = createPreviewOverlayController({
        clock: { setTimeout: () => 0, clearTimeout: () => {} },
      });
    });
```

**4.** Delete everything from the line `  describe("store regressions", () => {` to the end of the file, and put this in its place. It closes the outer `describe` itself.

```js
  describe("store regressions", () => {
    const SELF = "64b0000000000000000000a1";
    const OTHER = "64b0000000000000000000a2";
    let useWorkspaceStore;
    let useSessionStore;

    before(async () => {
      ({ useWorkspaceStore } = workspaceStoreModule);
      ({ useSessionStore } = await vite.ssrLoadModule("/src/collaborate/store/useSessionStore.js"));
    });

    afterEach(() => {
      useWorkspaceStore.getState().resetWorkspace();
    });

    function node(id, x = 10) {
      return {
        id,
        type: "shape",
        position: { x, y: 20 },
        width: 160,
        height: 80,
        data: { shape: "rectangle", label: "L", color: "#1F1F1F", textColor: "#EDEDED" },
      };
    }

    // The client's socket. Outgoing previews land in sent, flagged volatile.
    // fire delivers an event from the server to the store's listeners.
    function createSocket(id = "sock-1") {
      const handlers = new Map();
      const socket = {
        id,
        connected: true,
        sent: [],
        handler: () => new Promise(() => {}),
        on(event, fn) {
          if (!handlers.has(event)) handlers.set(event, new Set());
          handlers.get(event).add(fn);
        },
        off(event, fn) {
          handlers.get(event)?.delete(fn);
        },
        emit(event, payload) {
          socket.sent.push({ event, payload });
        },
        volatile: {
          emit(event, payload) {
            socket.sent.push({ event, payload, volatile: true });
          },
        },
        timeout() {
          return {
            emitWithAck: (event, payload) => {
              socket.sent.push({ event, payload, ack: true });
              return socket.handler(event, payload);
            },
          };
        },
        fire(event, payload) {
          for (const fn of [...(handlers.get(event) ?? [])]) fn(payload);
        },
      };
      return socket;
    }

    // Replaces the global timers because the store builds its own controllers.
    // Vite keeps real timers: this is installed only for the length of one test.
    function createFakeClock() {
      let now = 1000;
      let nextId = 0;
      const timers = new Map();
      let saved = null;
      return {
        install() {
          saved = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now };
          globalThis.setTimeout = (fn, delay = 0) => {
            const id = nextId;
            nextId += 1;
            timers.set(id, { fn, at: now + delay });
            return id;
          };
          globalThis.clearTimeout = (id) => {
            timers.delete(id);
          };
          Date.now = () => now;
        },
        restore() {
          globalThis.setTimeout = saved.setTimeout;
          globalThis.clearTimeout = saved.clearTimeout;
          Date.now = saved.now;
          timers.clear();
        },
        advance(ms) {
          const end = now + ms;
          for (;;) {
            const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!due) break;
            timers.delete(due[0]);
            now = due[1].at;
            due[1].fn();
          }
          now = end;
        },
        pending: () => timers.size,
      };
    }

    async function withClock(run) {
      const clock = createFakeClock();
      clock.install();
      try {
        await run(clock);
      } finally {
        clock.restore();
      }
    }

    // A real join through the store, so the sync session has a confirmed canvas.
    // Setting ready by hand leaves it empty and every remote op is then ignored.
    async function joined({ role = "editor", nodes = [node("n1"), node("n2", 300)] } = {}) {
      const socket = createSocket();
      socket.handler = async (event) => {
        if (event === "workspace:join") {
          return {
            ok: true,
            project: { _id: PROJECT, name: "Design", description: "" },
            role,
            canvas: { nodes, edges: [], version: 4 },
            participants: [],
            turn: null,
            serverNow: 1,
          };
        }
        return new Promise(() => {});
      };
      useSessionStore.setState({ authUser: { _id: SELF } });
      const dispose = useWorkspaceStore.getState().bindWorkspace(socket, PROJECT);
      await settle();
      await settle();
      assert.equal(useWorkspaceStore.getState().status, "ready");
      return { socket, dispose };
    }

    const x = (id) => useWorkspaceStore.getState().rfNodes.find((item) => item.id === id).position.x;
    const sentPreviews = (socket) => socket.sent.filter((item) => item.event === "canvas:preview");
    const drag = (id, at) => useWorkspaceStore.getState().onNodeDrag({ type: "mousemove" }, node(id, at), [node(id, at)]);
    const preview = (socket, id, at, by = OTHER) => socket.fire("canvas:preview", {
      projectId: PROJECT,
      by,
      nodes: [{ id, position: { x: at, y: 20 } }],
    });
    const remote = (socket, version, op) => socket.fire("canvas:ops", { projectId: PROJECT, version, ops: [op], by: OTHER });
    const startRecovery = (socket) => remote(socket, 9, { type: "node.add", node: node("gap") });

    it("1. a drag sample carries only id and position", async () => {
      const { socket } = await joined();
      useWorkspaceStore.getState().onNodeDrag({ type: "mousemove" }, node("n1"), [
        { ...node("n1", 77), selected: true, dragging: true, measured: { width: 160, height: 80 } },
      ]);
      assert.deepEqual(sentPreviews(socket), [{
        event: "canvas:preview",
        volatile: true,
        payload: { projectId: PROJECT, nodes: [{ id: "n1", position: { x: 77, y: 20 } }] },
      }]);
    });

    it("2. a gesture over 50 nodes sends nothing, and 50 sends", async () => {
      const nodes = Array.from({ length: 51 }, (_, index) => node(`n${index}`, index));
      const { socket } = await joined({ nodes });
      useWorkspaceStore.getState().onNodeDrag({}, nodes[0], nodes);
      assert.equal(sentPreviews(socket).length, 0);
      useWorkspaceStore.getState().onNodeDrag({}, nodes[0], nodes.slice(0, 50));
      assert.equal(sentPreviews(socket).length, 1);
    });

    it("3. a viewer sends nothing", async () => {
      const { socket } = await joined({ role: "viewer" });
      drag("n1", 70);
      assert.equal(sentPreviews(socket).length, 0);
    });

    it("4. a commit cancels the pending trailing sample", async () => {
      await withClock(async (clock) => {
        const { socket } = await joined();
        drag("n1", 70);
        drag("n1", 71);
        assert.equal(sentPreviews(socket).length, 1);
        useWorkspaceStore.getState().commitNodePositions([{ id: "n1", position: { x: 71, y: 20 } }]);
        clock.advance(60);
        assert.equal(sentPreviews(socket).length, 1);
        assert.equal(socket.sent.filter((item) => item.event === "canvas:commit").length, 1);
      });
    });

    it("5. a newer sample restarts the 3 second timer", async () => {
      await withClock(async (clock) => {
        const { socket } = await joined();
        preview(socket, "n1", 500);
        assert.equal(x("n1"), 500);
        clock.advance(2999);
        preview(socket, "n1", 600);
        clock.advance(2999);
        assert.equal(x("n1"), 600);
      });
    });

    it("6. an expired preview returns to canonical and changes no canvas state", async () => {
      await withClock(async (clock) => {
        const { socket } = await joined();
        preview(socket, "n1", 500);
        clock.advance(2999);
        assert.equal(x("n1"), 500);
        clock.advance(1);
        assert.equal(x("n1"), 10);
        const state = useWorkspaceStore.getState();
        assert.equal(state.canvas.version, 4);
        assert.equal(state.canvas.nodes[0].position.x, 10);
      });
    });

    it("7 and 8. a remote label keeps overlays, a remote move clears only its own", async () => {
      const { socket } = await joined();
      preview(socket, "n1", 500);
      preview(socket, "n2", 700);
      remote(socket, 5, { type: "node.update", id: "n1", patch: { data: { label: "New" } } });
      assert.equal(useWorkspaceStore.getState().rfNodes[0].data.label, "New");
      assert.equal(x("n1"), 500);
      assert.equal(x("n2"), 700);
      remote(socket, 6, { type: "node.update", id: "n1", patch: { position: { x: 42, y: 20 } } });
      assert.equal(x("n1"), 42);
      assert.equal(x("n2"), 700);
    });

    it("9. a local label edit keeps another node's overlay", async () => {
      const { socket } = await joined();
      preview(socket, "n2", 700);
      useWorkspaceStore.getState().setNodeLabel("n1", "New");
      assert.equal(x("n2"), 700);
    });

    it("10. a local move clears that node's overlay", async () => {
      const { socket } = await joined();
      preview(socket, "n2", 700);
      useWorkspaceStore.getState().commitNodePositions([{ id: "n2", position: { x: 11, y: 20 } }]);
      assert.equal(x("n2"), 11);
    });

    it("11. a refused resize keeps another node's overlay", async () => {
      const { socket } = await joined();
      preview(socket, "n2", 700);
      useWorkspaceStore.getState().commitNodeResize("missing", {});
      assert.equal(x("n2"), 700);
    });

    it("12. recovery clears overlays", async () => {
      const { socket } = await joined();
      preview(socket, "n2", 700);
      startRecovery(socket);
      assert.equal(useWorkspaceStore.getState().syncStatus, "syncing");
      assert.equal(x("n2"), 300);
    });

    it("13. recovery drops the pending trailing sample", async () => {
      await withClock(async (clock) => {
        const { socket } = await joined();
        drag("n1", 70);
        drag("n1", 71);
        startRecovery(socket);
        clock.advance(60);
        assert.equal(sentPreviews(socket).length, 1);
      });
    });

    it("14. a preview during recovery is ignored", async () => {
      const { socket } = await joined();
      startRecovery(socket);
      preview(socket, "n1", 500);
      assert.equal(x("n1"), 10);
    });

    it("15. a preview under an old connection id or on a dead socket is ignored", async () => {
      const { socket } = await joined();
      socket.id = "sock-replaced";
      preview(socket, "n1", 500);
      assert.equal(x("n1"), 10);
      socket.id = "sock-1";
      socket.connected = false;
      preview(socket, "n1", 500);
      assert.equal(x("n1"), 10);
    });

    it("16. a retry and fresh join drop the overlay", async () => {
      const { socket } = await joined();
      preview(socket, "n1", 500);
      assert.equal(x("n1"), 500);
      useWorkspaceStore.getState().retryWorkspace();
      await settle();
      await settle();
      assert.equal(useWorkspaceStore.getState().status, "ready");
      assert.equal(x("n1"), 10);
    });

    it("17. disconnect and dispose cancel the expiry timers", async () => {
      await withClock(async (clock) => {
        const first = await joined();
        preview(first.socket, "n1", 500);
        assert.equal(clock.pending(), 1);
        first.socket.connected = false;
        first.socket.fire("disconnect");
        assert.equal(clock.pending(), 0);
        assert.deepEqual(useWorkspaceStore.getState().rfNodes, []);
        first.dispose();

        const second = await joined();
        preview(second.socket, "n1", 500);
        assert.equal(clock.pending(), 1);
        second.dispose();
        assert.equal(clock.pending(), 0);
      });
    });

    it("18. a preview from the signed-in user still applies, for their other tab", async () => {
      const { socket } = await joined();
      preview(socket, "n1", 500, SELF);
      assert.equal(x("n1"), 500);
    });
  });
});
```

**5.** In `context/6-progress-tracker.md`, under your S16 slice note, replace the `**Verified:**` line for `canvasPreview.test.mjs` with the real result. Replace `**Deviations:** None. All changes match the corrections file exactly.` with one line stating the first version of the store regressions did not match the corrections file and was replaced from `16-drag-resize-previews-corrections-review.md`.

## Verification

Run each client suite in its own command.

- [ ] `node --test test/canvasPreview.test.mjs`: 39 of 39, 0 cancelled, in about 2 seconds.
- [ ] `node --test test/workspaceSync.test.mjs`, `test/participants.test.mjs`, `test/cursorPresence.test.mjs`: 12, 5, and 69.
- [ ] `cd server && npm test`: 164 of 164, finishes on its own.
- [ ] `git diff --stat -- src server` is unchanged from before this correction: no production or server test file moves.

Report real output, including any failure. If something fails, leave S16 In progress and say so.

## Handoff prompt

```text
Read context/specs/16-drag-resize-previews-corrections-review.md. Mark S16 In progress in
context/6-progress-tracker.md. Make only its five corrections, using its code as written. Change only
test/canvasPreview.test.mjs and your S16 slice note. Do not change production code or server tests.
Run its verification. Mark S16 Ready for review only if every check passes, report the real output,
and stop. Do not commit, push, branch, or start S17 corrections or S19.
```
