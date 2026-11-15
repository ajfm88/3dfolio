import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import mongoose from "mongoose";

import Canvas from "../src/models/canvas.model.js";
import User from "../src/models/user.model.js";
import * as projectAccess from "../src/lib/projectAccess.js";
import { createWorkspaceRegistry } from "../src/lib/workspaceRooms.js";
import {
  onMemberChanged,
  onProjectDeleted,
  registerWorkspaceHandlers,
} from "../src/sockets/workspace.socket.js";

const TAB = "123e4567-e89b-41d3-a456-426614174000";
const TAB_B = "123e4567-e89b-41d3-a456-426614174001";
const TOO_MANY = { ok: false, message: "Too many requests" };

function id() {
  return new mongoose.Types.ObjectId().toString();
}

function defer() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

function query(result) {
  const thenable = {
    select() { return thenable; },
    lean() { return Promise.resolve(result); },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return thenable;
}

function projectDoc(projectId, userId, role) {
  if (role === "owner") {
    return { _id: projectId, name: "Design", description: "Notes", owner: userId, members: [] };
  }
  return {
    _id: projectId,
    name: "Design",
    description: "Notes",
    owner: id(),
    members: [{ user: userId, role }],
  };
}

function addOp(nodeId) {
  return {
    type: "node.add",
    node: {
      id: nodeId,
      type: "shape",
      position: { x: 10, y: 40 },
      width: 160,
      height: 80,
      data: { shape: "rectangle", label: "New", color: "#1F1F1F", textColor: "#EDEDED" },
    },
  };
}

function preview(projectId, x) {
  return { projectId, nodes: [{ id: "n1", position: { x, y: 2 } }] };
}

// One fake network. socket.to(room).volatile.emit delivers to every other
// socket whose adapter rooms include the room, never to the sender.
function createNetwork() {
  const sockets = [];
  const ioEmits = [];
  const io = {
    ioEmits,
    to(room) {
      const call = { room, except: [] };
      const operator = {
        except(socketId) {
          call.except.push(socketId);
          return operator;
        },
        emit(event, payload) {
          ioEmits.push({ room, event, payload, except: [...call.except] });
        },
        get volatile() { return operator; },
      };
      return operator;
    },
  };

  function createSocket(userId, socketId) {
    const handlers = new Map();
    const socket = {
      id: socketId,
      connected: true,
      data: { userId },
      rooms: new Set([socketId, userId]),
      received: [],
      joinGate: null,
      emits: [],
      on(event, handler) { handlers.set(event, handler); },
      async join(room) {
        if (socket.joinGate) await socket.joinGate.promise;
        socket.rooms.add(room);
      },
      async leave(room) { socket.rooms.delete(room); },
      emit(...args) { socket.emits.push(args); },
      to(room) {
        return {
          volatile: {
            emit(event, payload) {
              for (const other of sockets) {
                if (other === socket || !other.rooms.has(room)) continue;
                other.received.push({ event, payload, volatile: true });
              }
            },
          },
          emit() { throw new Error("workspace relays must be volatile"); },
        };
      },
    };
    socket.handler = (event) => handlers.get(event);
    sockets.push(socket);
    return socket;
  }

  return { io, createSocket };
}

describe("workspace rate limits", { concurrency: false }, () => {
  const restores = [];

  afterEach(() => {
    while (restores.length > 0) restores.pop()();
  });

  function installClock(start = 1_000_000) {
    let now = start;
    const original = Date.now;
    Date.now = () => now;
    restores.push(() => { Date.now = original; });
    return {
      now: () => now,
      advance(ms) { now += ms; },
    };
  }

  function world(rolesByUser, limits, { omitLimits = false } = {}) {
    const calls = { find: 0, canvasWrite: 0 };
    mock.method(User, "findById", () => query({ fullName: "Ada", img: "" }));
    restores.push(() => User.findById.mock.restore());
    mock.method(Canvas, "findOneAndUpdate", () => query({ nodes: [], edges: [], version: 3 }));
    restores.push(() => Canvas.findOneAndUpdate.mock.restore());
    mock.method(Canvas, "findOne", () => query({ nodes: [], edges: [], version: 3 }));
    restores.push(() => Canvas.findOne.mock.restore());
    mock.method(Canvas, "updateOne", () => {
      calls.canvasWrite += 1;
      return Promise.resolve({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    });
    restores.push(() => Canvas.updateOne.mock.restore());

    const clock = installClock();
    const registry = createWorkspaceRegistry();
    const network = createNetwork();
    const deps = {
      findProjectForMember: (projectId, userId) => {
        calls.find += 1;
        const role = rolesByUser.get(userId);
        return Promise.resolve(role ? projectDoc(projectId, userId, role) : null);
      },
      roleOf: projectAccess.roleOf,
      now: clock.now,
    };
    if (!omitLimits) deps.rateLimits = limits;

    function connect(userId, socketId, { bare = false } = {}) {
      const socket = network.createSocket(userId, socketId);
      if (bare) registerWorkspaceHandlers(network.io, socket, registry);
      else registerWorkspaceHandlers(network.io, socket, registry, deps);
      return socket;
    }

    async function join(socket, projectId, tabId = TAB) {
      const acks = [];
      await socket.handler("workspace:join")({ projectId, tabId }, (body) => acks.push(body));
      return acks[0];
    }

    return { calls, clock, registry, network, deps, connect, join };
  }

  function received(socket, event) {
    return socket.received.filter((entry) => entry.event === event);
  }

  function turnEmits(network) {
    return network.io.ioEmits.filter((entry) => entry.event === "turn:state");
  }

  it("processes three joins and refuses the fourth before membership is read", async () => {
    const userId = id();
    const projectId = id();
    const w = world(new Map([[userId, "owner"]]), { join: 3 });
    const socket = w.connect(userId, "s-owner");
    const acks = [];
    for (let i = 0; i < 3; i += 1) {
      acks.push(await w.join(socket, projectId));
    }
    const refused = [];
    const findsBefore = w.calls.find;
    await socket.handler("workspace:join")({ projectId, tabId: TAB }, (body) => refused.push(body));

    assert.equal(acks.every((ack) => ack.ok === true), true);
    assert.deepEqual(refused, [TOO_MANY]);
    assert.equal(w.calls.find, findsBefore);
  });

  it("leaves an in-flight join alone when a later join is refused", async () => {
    const userId = id();
    const projectId = id();
    const w = world(new Map([[userId, "owner"]]), { join: 3 });
    const gate = defer();
    w.deps.findProjectForMember = () => {
      w.calls.find += 1;
      return gate.promise.then(() => projectDoc(projectId, userId, "owner"));
    };
    const socket = w.connect(userId, "s-owner");
    const acks = [];
    const pending = socket.handler("workspace:join")(
      { projectId, tabId: TAB },
      (body) => acks.push(body),
    );
    await settle();
    assert.equal(w.calls.find, 1);

    // A second valid join would supersede the one that is waiting. These two
    // spend the remaining tokens and return inside onJoin before it bumps the
    // generation, because they have no acknowledgement function.
    await socket.handler("workspace:join")({ projectId, tabId: TAB });
    await socket.handler("workspace:join")({ projectId, tabId: TAB });
    const refused = [];
    await socket.handler("workspace:join")({ projectId, tabId: TAB }, (body) => refused.push(body));

    assert.deepEqual(refused, [TOO_MANY]);
    assert.equal(w.calls.find, 1);
    gate.resolve();
    await pending;
    assert.equal(acks[0].ok, true, acks[0]?.message);
  });

  it("acks a commit past the limit without saving or broadcasting", async () => {
    const userId = id();
    const projectId = id();
    const w = world(new Map([[userId, "owner"]]), { join: 5, commit: 2, turn: 5 });
    const socket = w.connect(userId, "s-owner");
    const watcher = w.connect(userId, "s-watch");
    assert.equal((await w.join(socket, projectId, TAB)).ok, true);
    assert.equal((await w.join(watcher, projectId, TAB_B)).ok, true);
    await socket.handler("turn:request")({ projectId });

    const saved = [];
    await socket.handler("canvas:commit")(
      { projectId, baseVersion: 3, ops: [addOp("n2")] },
      (body) => saved.push(body),
    );
    await socket.handler("canvas:commit")(
      { projectId, baseVersion: 4, ops: [addOp("n3")] },
      (body) => saved.push(body),
    );
    const opsBefore = w.network.io.ioEmits.filter((entry) => entry.event === "canvas:ops").length;
    const refused = [];
    await socket.handler("canvas:commit")(
      { projectId, baseVersion: 5, ops: [addOp("n4")] },
      (body) => refused.push(body),
    );

    assert.deepEqual(saved.map((body) => body.ok), [true, true]);
    assert.deepEqual(refused, [TOO_MANY]);
    assert.equal(w.calls.canvasWrite, 2);
    assert.equal(w.network.io.ioEmits.filter((entry) => entry.event === "canvas:ops").length, opsBefore);
  });

  it("refuses a sync past the limit without another membership read", async () => {
    const userId = id();
    const projectId = id();
    const w = world(new Map([[userId, "owner"]]), { join: 5, sync: 2 });
    const socket = w.connect(userId, "s-owner");
    assert.equal((await w.join(socket, projectId)).ok, true);
    const findsAfterJoin = w.calls.find;

    const acks = [];
    await socket.handler("canvas:sync")({ projectId }, (body) => acks.push(body));
    await socket.handler("canvas:sync")({ projectId }, (body) => acks.push(body));
    const findsAfterAllowed = w.calls.find;
    await socket.handler("canvas:sync")({ projectId }, (body) => acks.push(body));

    assert.equal(acks[0].ok, true);
    assert.equal(acks[1].ok, true);
    assert.deepEqual(acks[2], TOO_MANY);
    assert.ok(findsAfterAllowed > findsAfterJoin);
    assert.equal(w.calls.find, findsAfterAllowed);
  });

  it("drops previews past the limit and does not move lastActivity", async () => {
    const userId = id();
    const projectId = id();
    const w = world(new Map([[userId, "owner"]]), { join: 5, preview: 2, turn: 5 });
    const holder = w.connect(userId, "s-holder");
    const watcher = w.connect(id(), "s-watcher");
    // Join reads deps at event time, so the watcher can be a viewer even
    // though the socket was registered before this replacement.
    w.deps.findProjectForMember = (requested, requester) => {
      w.calls.find += 1;
      const role = requester === userId ? "owner" : "viewer";
      return Promise.resolve(projectDoc(requested, requester, role));
    };
    assert.equal((await w.join(holder, projectId, TAB)).ok, true);
    assert.equal((await w.join(watcher, projectId, TAB)).ok, true);
    await holder.handler("turn:request")({ projectId });
    w.clock.advance(50);

    await holder.handler("canvas:preview")(preview(projectId, 1));
    await holder.handler("canvas:preview")(preview(projectId, 2));
    const activity = w.registry.getRoom(projectId).turn.lastActivity;
    w.clock.advance(50);
    await holder.handler("canvas:preview")(preview(projectId, 3));

    assert.equal(received(watcher, "canvas:preview").length, 2);
    assert.equal(received(holder, "canvas:preview").length, 0);
    assert.equal(w.registry.getRoom(projectId).turn.lastActivity, activity);
  });

  it("shares one cursor bucket between move and leave", async () => {
    const userId = id();
    const projectId = id();
    const w = world(new Map([[userId, "owner"]]), { join: 5, cursor: 2 });
    const sender = w.connect(userId, "s-sender");
    const watcher = w.connect(userId, "s-watcher");
    assert.equal((await w.join(sender, projectId, TAB)).ok, true);
    assert.equal((await w.join(watcher, projectId, TAB_B)).ok, true);

    await sender.handler("cursor:move")({ projectId, x: 1, y: 2 });
    await sender.handler("cursor:move")({ projectId, x: 3, y: 4 });
    await sender.handler("cursor:leave")({ projectId });
    assert.equal(received(watcher, "cursor:move").length, 2);
    assert.equal(received(watcher, "cursor:leave").length, 0);

    w.clock.advance(1000);
    await sender.handler("cursor:leave")({ projectId });
    assert.equal(received(watcher, "cursor:leave").length, 1);
  });

  it("drops typing past the limit", async () => {
    const userId = id();
    const projectId = id();
    const w = world(new Map([[userId, "owner"]]), { join: 5, typing: 1 });
    const sender = w.connect(userId, "s-sender");
    const watcher = w.connect(userId, "s-watcher");
    assert.equal((await w.join(sender, projectId, TAB)).ok, true);
    assert.equal((await w.join(watcher, projectId, TAB_B)).ok, true);

    await sender.handler("project:typing")({ projectId, isTyping: true });
    await sender.handler("project:typing")({ projectId, isTyping: false });
    assert.equal(received(watcher, "project:typing").length, 1);
  });

  it("shares one turn bucket across turn events", async () => {
    const userId = id();
    const projectId = id();
    const w = world(new Map([[userId, "owner"]]), { join: 5, turn: 2 });
    const socket = w.connect(userId, "s-owner");
    assert.equal((await w.join(socket, projectId)).ok, true);

    await socket.handler("turn:request")({ projectId });
    await socket.handler("turn:release")({ projectId });
    const published = turnEmits(w.network).length;
    assert.equal(published, 2);
    await socket.handler("turn:request")({ projectId });
    assert.equal(turnEmits(w.network).length, published);

    w.clock.advance(1000);
    await socket.handler("turn:request")({ projectId });
    assert.equal(turnEmits(w.network).length, published + 1);
  });

  it("still leaves and disconnects after every bucket is drained", async () => {
    const userId = id();
    const projectId = id();
    const otherId = id();
    const limits = { join: 1, commit: 1, sync: 1, preview: 1, cursor: 1, typing: 1, turn: 1 };
    const w = world(new Map([[userId, "owner"]]), limits);
    const leaving = w.connect(userId, "s-leave");
    assert.equal((await w.join(leaving, projectId)).ok, true);
    await leaving.handler("canvas:commit")({ projectId: "nope" }, () => {});
    await leaving.handler("canvas:sync")({ projectId: "nope" }, () => {});
    await leaving.handler("canvas:preview")({ projectId: "nope" });
    await leaving.handler("cursor:move")({ projectId: "nope" });
    await leaving.handler("project:typing")({ projectId: "nope" });
    await leaving.handler("turn:request")({ projectId: "nope" });
    await leaving.handler("workspace:join")({ projectId: "nope" }, () => {});

    await leaving.handler("workspace:leave")({ projectId });
    assert.equal(w.registry.getRoom(projectId), null);

    const dropping = w.connect(userId, "s-drop");
    w.clock.advance(1000);
    assert.equal((await w.join(dropping, otherId)).ok, true);
    await dropping.handler("disconnecting")();
    assert.equal(w.registry.getRoom(otherId), null);
  });

  it("keeps a second socket's bucket when the first is drained", async () => {
    const userId = id();
    const projectId = id();
    const w = world(new Map([[userId, "owner"]]), { join: 5, cursor: 1 });
    const first = w.connect(userId, "s-a");
    const second = w.connect(userId, "s-b");
    const watcher = w.connect(userId, "s-c");
    assert.equal((await w.join(first, projectId, TAB)).ok, true);
    assert.equal((await w.join(second, projectId, TAB_B)).ok, true);
    assert.equal((await w.join(watcher, projectId, "123e4567-e89b-41d3-a456-426614174002")).ok, true);

    await first.handler("cursor:move")({ projectId, x: 1, y: 1 });
    await first.handler("cursor:move")({ projectId, x: 2, y: 2 });
    const before = received(watcher, "cursor:move").length;
    await second.handler("cursor:move")({ projectId, x: 3, y: 3 });
    assert.equal(received(watcher, "cursor:move").length, before + 1);
  });

  it("does not throw when a refused acked event has no ack function", async () => {
    const userId = id();
    const projectId = id();
    const w = world(new Map([[userId, "owner"]]), { join: 1, commit: 1, sync: 1, turn: 5 });
    const socket = w.connect(userId, "s-owner");
    assert.equal((await w.join(socket, projectId)).ok, true);
    await socket.handler("turn:request")({ projectId });
    await socket.handler("canvas:commit")(
      { projectId, baseVersion: 3, ops: [addOp("n2")] },
      () => {},
    );
    await socket.handler("canvas:sync")({ projectId }, () => {});

    await socket.handler("workspace:join")({ projectId, tabId: TAB });
    await socket.handler("canvas:commit")({ projectId, baseVersion: 4, ops: [addOp("n3")] });
    await socket.handler("canvas:sync")({ projectId });
  });

  it("does not log a refusal", async () => {
    const userId = id();
    const projectId = id();
    const limits = { join: 1, commit: 1, sync: 1, preview: 1, cursor: 1, typing: 1, turn: 1 };
    const w = world(new Map([[userId, "owner"]]), limits);
    const socket = w.connect(userId, "s-owner");
    const watcher = w.connect(userId, "s-watcher");
    assert.equal((await w.join(socket, projectId, TAB)).ok, true);
    assert.equal((await w.join(watcher, projectId, TAB_B)).ok, true);
    await socket.handler("canvas:commit")({ projectId, baseVersion: 3, ops: [addOp("n2")] }, () => {});
    await socket.handler("canvas:sync")({ projectId }, () => {});
    await socket.handler("canvas:preview")(preview(projectId, 1));
    await socket.handler("cursor:move")({ projectId, x: 1, y: 1 });
    await socket.handler("project:typing")({ projectId, isTyping: true });
    await socket.handler("turn:request")({ projectId });

    const errors = [];
    const original = console.error;
    console.error = (...args) => { errors.push(args); };
    restores.push(() => { console.error = original; });

    await socket.handler("workspace:join")({ projectId, tabId: TAB }, () => {});
    await socket.handler("canvas:commit")({ projectId, baseVersion: 4, ops: [addOp("n3")] }, () => {});
    await socket.handler("canvas:sync")({ projectId }, () => {});
    await socket.handler("canvas:preview")(preview(projectId, 2));
    await socket.handler("cursor:move")({ projectId, x: 2, y: 2 });
    await socket.handler("cursor:leave")({ projectId });
    await socket.handler("project:typing")({ projectId, isTyping: false });
    await socket.handler("turn:release")({ projectId });
    await socket.handler("turn:cancel")({ projectId });
    await socket.handler("turn:reclaim")({ projectId });
    await socket.handler("turn:request")({ projectId });

    assert.deepEqual(errors, []);
  });

  it("relays when the caller omits rateLimits", async () => {
    const userId = id();
    const projectId = id();
    const w = world(new Map([[userId, "owner"]]), null, { omitLimits: true });
    const sender = w.connect(userId, "s-sender");
    const watcher = w.connect(userId, "s-watcher");
    assert.equal((await w.join(sender, projectId, TAB)).ok, true);
    assert.equal((await w.join(watcher, projectId, TAB_B)).ok, true);

    for (let i = 0; i < 100; i += 1) {
      await sender.handler("cursor:move")({ projectId, x: i, y: 1 });
    }
    assert.equal(received(watcher, "cursor:move").length, 100);
  });

  it("uses the production join limit when no deps are passed", async () => {
    const userId = id();
    const registry = createWorkspaceRegistry();
    const network = createNetwork();
    const socket = network.createSocket(userId, "s-default");
    registerWorkspaceHandlers(network.io, socket, registry);

    const acks = [];
    const payload = { projectId: "not-an-id", tabId: TAB };
    for (let i = 0; i < 4; i += 1) {
      socket.handler("workspace:join")(payload, (body) => acks.push(body));
    }
    await settle();

    assert.deepEqual(acks, [
      { ok: false, message: "Project not found" },
      { ok: false, message: "Project not found" },
      { ok: false, message: "Project not found" },
      TOO_MANY,
    ]);
  });

  it("drops the socket index when disconnect cleanup throws", async () => {
    const userId = id();
    const projectId = id();
    const w = world(new Map([[userId, "owner"]]), { join: 5 });
    const socket = w.connect(userId, "s-owner");
    assert.equal((await w.join(socket, projectId)).ok, true);

    let leaveCalls = 0;
    const originalLeave = socket.leave.bind(socket);
    socket.leave = async (room) => {
      leaveCalls += 1;
      return originalLeave(room);
    };
    let thrown = false;
    w.registry.removeConnection = () => {
      if (!thrown) {
        thrown = true;
        throw new Error("remove failed");
      }
      return false;
    };

    await socket.handler("disconnecting")();
    onMemberChanged(w.network.io, projectId, userId, null, w.registry);
    onProjectDeleted(w.network.io, projectId, w.registry);

    assert.equal(thrown, true);
    assert.equal(leaveCalls, 0);
    assert.equal(socket.emits.length, 0);
  });
});
