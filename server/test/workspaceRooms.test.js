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

  it("retains an existing room without loading and evicts only after release", async () => {
    const registry = createWorkspaceRegistry();
    assert.equal(registry.retain("missing"), null);

    const created = await registry.acquire("p1", async () => canvas(6));
    registry.addConnection("p1", "socket-a", member("user-1"));
    created.release();

    let loaded = 0;
    const held = registry.retain("p1");
    assert.equal(held.room.canvas.version, 6);
    registry.removeConnection("p1", "socket-a");
    assert.equal(registry.getRoom("p1"), held.room);
    await registry.acquire("p1", async () => {
      loaded += 1;
      return canvas(0);
    }).then((extra) => extra.release());
    assert.equal(loaded, 0);
    assert.equal(registry.getRoom("p1"), held.room);

    held.release();
    held.release();
    assert.equal(registry.getRoom("p1"), null);
    assert.equal(registry.retain("p1"), null);
  });

  it("snapshots connected users once, in order, as fresh copies", async () => {
    const registry = createWorkspaceRegistry();
    assert.deepEqual(registry.getParticipants("missing"), []);

    const handle = await registry.acquire("p1", async () => canvas(1));
    const ada = "64b0000000000000000000aa";
    const grace = "64b0000000000000000000bb";
    registry.addConnection("p1", "tab-a", {
      userId: ada,
      tabId: "tab-1",
      role: "owner",
      fullName: "Ada",
      img: "https://cdn.example/a.png",
      email: "hidden@example.com",
    });
    registry.addConnection("p1", "tab-a2", {
      userId: ada,
      tabId: "tab-2",
      role: "editor",
      fullName: "Ada Lovelace",
      img: "",
    });
    registry.addConnection("p1", "tab-g", {
      userId: grace,
      tabId: "tab-3",
      role: "viewer",
      fullName: undefined,
      img: null,
    });
    registry.getRoom("p1").members.set("64b0000000000000000000ff", {
      role: "owner",
      fullName: "Ghost",
      img: "",
    });
    registry.addConnection("p1", "tab-bad", {
      userId: "64b0000000000000000000cc",
      tabId: "tab-4",
      role: "admin",
      fullName: "Nope",
      img: "",
    });

    const first = registry.getParticipants("p1");
    assert.deepEqual(first, [
      { userId: ada, fullName: "Ada Lovelace", img: "", role: "editor" },
      { userId: grace, fullName: "", img: "", role: "viewer" },
    ]);
    assert.equal(JSON.stringify(first).includes("hidden@"), false);
    assert.equal(JSON.stringify(first).includes("Ghost"), false);
    assert.equal(JSON.stringify(first).includes("Nope"), false);

    first[0].fullName = "Hacked";
    first.push({ userId: "64b0000000000000000000dd", fullName: "Extra", img: "", role: "owner" });
    const second = registry.getParticipants("p1");
    assert.notEqual(first[0], second[0]);
    assert.equal(second[0].fullName, "Ada Lovelace");
    assert.equal(second.length, 2);
    assert.equal(registry.getRoom("p1").members.get(ada).fullName, "Ada Lovelace");

    assert.equal(registry.removeConnection("p1", "tab-a"), true);
    assert.deepEqual(registry.getParticipants("p1").map((person) => person.userId), [ada, grace]);
    assert.equal(registry.removeConnection("p1", "tab-a2"), true);
    assert.deepEqual(registry.getParticipants("p1").map((person) => person.userId), [grace]);
    assert.equal(registry.removeConnection("p1", "tab-g"), true);
    assert.equal(registry.removeConnection("p1", "tab-bad"), true);
    assert.deepEqual(registry.getParticipants("p1"), []);
    handle.release();
    assert.deepEqual(registry.getParticipants("p1"), []);
  });
});
