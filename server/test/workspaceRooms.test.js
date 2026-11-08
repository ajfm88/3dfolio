import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createSerialQueue, createWorkspaceRegistry } from "../src/lib/workspaceRooms.js";

function defer() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function canvas(version) {
  return { nodes: [{ id: "n1" }], edges: [], version };
}

function member(userId, role = "editor") {
  return { userId, tabId: "tab-1", role, fullName: "Ada", img: "" };
}

describe("createSerialQueue", { concurrency: false }, () => {
  it("runs jobs in submission order, including async jobs", async () => {
    const enqueue = createSerialQueue();
    const order = [];
    const gate = defer();

    const first = enqueue(async () => {
      order.push("first-start");
      await gate.promise;
      order.push("first-end");
      return "first";
    });
    const second = enqueue(async () => {
      order.push("second");
      return "second";
    });

    await Promise.resolve();
    assert.deepEqual(order, ["first-start"]);
    gate.resolve();
    assert.equal(await first, "first");
    assert.equal(await second, "second");
    assert.deepEqual(order, ["first-start", "first-end", "second"]);
  });

  it("keeps later jobs running after a rejection and a synchronous throw", async () => {
    const enqueue = createSerialQueue();
    const seen = [];

    const rejected = enqueue(async () => {
      throw new Error("rejected");
    });
    const thrown = enqueue(() => {
      throw new Error("thrown");
    });
    const after = enqueue(async () => {
      seen.push("after");
      return "ok";
    });

    await assert.rejects(rejected, /rejected/);
    await assert.rejects(thrown, /thrown/);
    assert.equal(await after, "ok");
    assert.deepEqual(seen, ["after"]);
  });

  it("does not let one queue block another", async () => {
    const first = createSerialQueue();
    const second = createSerialQueue();
    const gate = defer();
    const blocked = first(() => gate.promise);
    const free = second(async () => "free");

    assert.equal(await free, "free");
    gate.resolve("later");
    assert.equal(await blocked, "later");
  });
});

describe("createWorkspaceRegistry", { concurrency: false }, () => {
  it("shares one loader and one room for the same project", async () => {
    const registry = createWorkspaceRegistry();
    let calls = 0;
    const gate = defer();
    const load = () => {
      calls += 1;
      return gate.promise;
    };

    const first = registry.acquire("p1", load);
    const second = registry.acquire("p1", load);
    await Promise.resolve();
    assert.equal(registry.getRoom("p1"), null);
    assert.equal(calls, 1);

    gate.resolve(canvas(3));
    const a = await first;
    const b = await second;
    assert.equal(a.room, b.room);
    assert.equal(registry.getRoom("p1"), a.room);
    assert.equal(a.room.canvas.version, 3);
    assert.equal(calls, 1);
    a.release();
    b.release();
    assert.equal(registry.getRoom("p1"), null);
  });

  it("initializes different projects independently", async () => {
    const registry = createWorkspaceRegistry();
    const entered = [];
    const gates = { a: defer(), b: defer() };
    const load = (projectId) => {
      entered.push(projectId);
      return gates[projectId].promise;
    };

    const pendingA = registry.acquire("a", load);
    const pendingB = registry.acquire("b", load);
    await Promise.resolve();
    assert.deepEqual(entered.sort(), ["a", "b"]);

    gates.b.resolve(canvas(2));
    const roomB = await pendingB;
    assert.equal(registry.getRoom("a"), null);
    assert.equal(roomB.room.canvas.version, 2);
    gates.a.resolve(canvas(1));
    const roomA = await pendingA;
    assert.equal(roomA.room.canvas.version, 1);
    assert.notEqual(roomA.room.writeQueue, roomB.room.writeQueue);
    roomA.release();
    roomB.release();
  });

  it("removes a failed init so a later acquire can retry", async () => {
    const registry = createWorkspaceRegistry();
    const calls = [];
    const load = async (projectId) => {
      calls.push(projectId);
      if (calls.length === 1) throw new Error("database down");
      return canvas(1);
    };

    await assert.rejects(registry.acquire("p1", load), /database down/);
    assert.equal(registry.getRoom("p1"), null);

    const handle = await registry.acquire("p1", load);
    assert.equal(handle.room.canvas.version, 1);
    assert.deepEqual(calls, ["p1", "p1"]);
    handle.release();
    assert.equal(registry.getRoom("p1"), null);
  });

  it("refreshes one socket in place and drops a member only with the last socket", () => {
    const registry = createWorkspaceRegistry();
    let release;
    return registry.acquire("p1", async () => canvas(0)).then((handle) => {
      release = handle.release;
      const first = member("user-1", "viewer");
      assert.equal(registry.addConnection("p1", "socket-a", first), true);
      assert.equal(registry.addConnection("p1", "socket-a", { ...first, role: "editor", fullName: "Ada Lovelace" }), true);
      assert.equal(registry.addConnection("p1", "socket-b", {
        ...first,
        tabId: "tab-2",
        role: "editor",
        fullName: "Ada Lovelace",
      }), true);

      const room = registry.getRoom("p1");
      assert.equal(room.connections.size, 2);
      assert.equal(room.members.size, 1);
      assert.equal(room.members.get("user-1").role, "editor");
      assert.equal(room.members.get("user-1").fullName, "Ada Lovelace");
      assert.equal(room.connections.get("socket-b").tabId, "tab-2");

      assert.equal(registry.removeConnection("p1", "socket-a"), true);
      assert.equal(registry.getRoom("p1").members.has("user-1"), true);
      assert.equal(registry.removeConnection("p1", "missing"), false);
      assert.equal(registry.removeConnection("p1", "socket-b"), true);
      release();
      assert.equal(registry.getRoom("p1"), null);
      assert.equal(registry.removeConnection("p1", "socket-b"), false);
    });
  });

  it("keeps a room while a lease is open and evicts it after the lease is released", async () => {
    const registry = createWorkspaceRegistry();
    const first = await registry.acquire("p1", async () => canvas(4));
    registry.addConnection("p1", "socket-a", member("user-1"));
    first.release();

    const second = await registry.acquire("p1", async () => {
      throw new Error("loader should not run again");
    });
    registry.removeConnection("p1", "socket-a");
    assert.equal(registry.getRoom("p1")?.canvas.version, 4);

    second.release();
    assert.equal(registry.getRoom("p1"), null);
  });

  it("drops a cancelled acquisition and ignores a stale release after replacement", async () => {
    const registry = createWorkspaceRegistry();
    const cancelled = await registry.acquire("p1", async () => canvas(1));
    const release = cancelled.release;
    release();
    assert.equal(registry.getRoom("p1"), null);

    const replacement = await registry.acquire("p1", async () => canvas(9));
    registry.addConnection("p1", "socket-next", member("user-2"));
    release();
    registry.removeConnection("p1", "socket-old");
    assert.equal(registry.getRoom("p1").canvas.version, 9);
    assert.equal(registry.getRoom("p1").connections.has("socket-next"), true);

    replacement.release();
    registry.removeConnection("p1", "socket-next");
    assert.equal(registry.getRoom("p1"), null);
  });
});
