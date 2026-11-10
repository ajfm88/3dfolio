import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import Canvas from "../src/models/canvas.model.js";
import User from "../src/models/user.model.js";
import * as projectAccess from "../src/lib/projectAccess.js";
import { createWorkspaceRegistry } from "../src/lib/workspaceRooms.js";
import { registerWorkspaceHandlers, sweepTurns } from "../src/sockets/workspace.socket.js";

const TAB = "123e4567-e89b-41d3-a456-426614174000";
const TAB_B = "123e4567-e89b-41d3-a456-426614174001";
const TAB_C = "123e4567-e89b-41d3-a456-426614174002";
const PUBLIC_KEYS = ["graceUntil", "holder", "holderSince", "idleDeadline", "projectId", "queue", "serverNow"];

const restores = [];

afterEach(() => {
  while (restores.length > 0) restores.pop()();
});

function query(result) {
  const thenable = {
    select() { return thenable; },
    lean() { return Promise.resolve(result); },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return thenable;
}

function id() {
  return new mongoose.Types.ObjectId().toString();
}

function node(nodeId = "n1", label = "Saved") {
  return {
    id: nodeId,
    type: "shape",
    position: { x: 10, y: 40 },
    width: 160,
    height: 80,
    data: { shape: "rectangle", label, color: "#1F1F1F", textColor: "#EDEDED" },
  };
}

function addOp(nodeId, label = "New") {
  return { type: "node.add", node: node(nodeId, label) };
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

function canvasDoc() {
  return {
    _id: id(),
    project: id(),
    nodes: [],
    edges: [],
    version: 0,
  };
}

function emptyTurn(serverNow) {
  return {
    holder: null,
    holderSince: null,
    queue: [],
    idleDeadline: null,
    graceUntil: null,
    serverNow,
  };
}

function createSocket(userId, socketId = "socket-1") {
  const handlers = new Map();
  const socket = {
    id: socketId,
    connected: true,
    data: { userId },
    rooms: new Set([socketId, userId]),
    relays: [],
    on(event, handler) { handlers.set(event, handler); },
    async join(room) { socket.rooms.add(room); },
    async leave(room) { socket.rooms.delete(room); },
    to(room) {
      const call = { room, except: [], volatile: false };
      const operator = {
        except(socketId) {
          call.except.push(socketId);
          return operator;
        },
        get volatile() {
          call.volatile = true;
          return operator;
        },
        emit(event, payload) {
          socket.relays.push({
            room: call.room,
            except: [...call.except],
            volatile: call.volatile,
            event,
            payload,
          });
        },
      };
      return operator;
    },
  };
  socket.handler = (event) => handlers.get(event);
  return socket;
}

function createIo() {
  const emits = [];
  const io = {
    emits,
    to(room) {
      const call = { room, except: [], volatile: false };
      const operator = {
        except(socketId) {
          call.except.push(socketId);
          return operator;
        },
        emit(event, payload) {
          emits.push({
            room: call.room,
            except: [...call.except],
            volatile: call.volatile,
            event,
            payload,
          });
        },
        get volatile() {
          call.volatile = true;
          return operator;
        },
      };
      return operator;
    },
  };
  return io;
}

function ackCapture() {
  const calls = [];
  const ack = (body) => { calls.push(structuredClone(body)); };
  ack.calls = calls;
  return ack;
}

function turnEmits(io) {
  return io.emits.filter((item) => item.event === "turn:state");
}

function stub(roleFor) {
  const calls = { writes: [] };
  mock.method(User, "findById", () => query({ fullName: "Ada", img: "" }));
  restores.push(() => User.findById.mock.restore());
  mock.method(Canvas, "findOneAndUpdate", () => query(canvasDoc()));
  restores.push(() => Canvas.findOneAndUpdate.mock.restore());
  mock.method(Canvas, "findOne", () => query(canvasDoc()));
  restores.push(() => Canvas.findOne.mock.restore());
  mock.method(Canvas, "updateOne", (...args) => {
    calls.writes.push(args);
    return Promise.resolve({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
  });
  restores.push(() => Canvas.updateOne.mock.restore());
  calls.findProjectForMember = (projectId, userId) => {
    const role = roleFor(userId);
    if (!role) return Promise.resolve(null);
    return Promise.resolve(projectDoc(projectId, userId, role));
  };
  return calls;
}

function attach(io, socket, calls, registry) {
  registerWorkspaceHandlers(io, socket, registry, {
    findProjectForMember: (...args) => calls.findProjectForMember(...args),
    roleOf: projectAccess.roleOf,
  });
}

async function join(socket, projectId, tabId) {
  const ack = ackCapture();
  await socket.handler("workspace:join")({ projectId, tabId }, ack);
  assert.equal(ack.calls[0].ok, true, ack.calls[0]?.message);
  return ack.calls[0];
}

function preview(projectId, x = 1) {
  return { projectId, nodes: [{ id: "n1", position: { x, y: 2 } }] };
}

describe("turn events", { concurrency: false }, () => {
  it("puts the empty public turn on the join ack and emits no turn:state", async () => {
    const userId = id();
    const projectId = id();
    const calls = stub(() => "owner");
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const socket = createSocket(userId, "solo");
    attach(io, socket, calls, registry);

    const body = await join(socket, projectId, TAB);

    assert.deepEqual(body.turn, emptyTurn(body.serverNow));
    assert.equal(turnEmits(io).length, 0);
  });

  it("grants a request once and ignores the repeat", async () => {
    const userId = id();
    const projectId = id();
    const calls = stub(() => "editor");
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const socket = createSocket(userId, "editor");
    attach(io, socket, calls, registry);
    await join(socket, projectId, TAB);

    await socket.handler("turn:request")({ projectId });
    const granted = turnEmits(io);
    assert.equal(granted.length, 1);
    const record = granted[0];
    assert.equal(record.room, `project:${projectId}`);
    assert.deepEqual(record.except, []);
    assert.equal(record.volatile, false);
    assert.equal(record.event, "turn:state");
    assert.deepEqual(Object.keys(record.payload).sort(), PUBLIC_KEYS);
    assert.equal(record.payload.projectId, projectId);
    assert.deepEqual(record.payload.holder, { userId, tabId: TAB });
    assert.equal(record.payload.holderSince, record.payload.serverNow);
    assert.deepEqual(record.payload.queue, []);
    assert.equal(record.payload.idleDeadline, null);
    assert.equal(record.payload.graceUntil, null);
    assert.equal(typeof record.payload.serverNow, "number");

    await socket.handler("turn:request")({ projectId });
    assert.equal(turnEmits(io).length, 1);
  });

  it("ignores a viewer, a socket that never joined, and malformed payloads", async () => {
    const viewerId = id();
    const projectId = id();
    const calls = stub((userId) => (userId === viewerId ? "viewer" : null));
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const viewer = createSocket(viewerId, "viewer");
    const stranger = createSocket(id(), "stranger");
    attach(io, viewer, calls, registry);
    attach(io, stranger, calls, registry);
    await join(viewer, projectId, TAB);

    await assert.doesNotReject(async () => {
      await viewer.handler("turn:request")({ projectId });
      await stranger.handler("turn:request")({ projectId });
      await viewer.handler("turn:request")(null);
      await viewer.handler("turn:request")({});
      await viewer.handler("turn:request")({ projectId: "not-an-id" });
      await viewer.handler("turn:request")(4);
      await viewer.handler("turn:release")(null);
      await viewer.handler("turn:cancel")({});
      await viewer.handler("turn:reclaim")(4);
      await stranger.handler("turn:release")({ projectId: "bad" });
    });
    assert.equal(turnEmits(io).length, 0);
  });

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

  it("refuses every commit and preview except the holding tab", async () => {
    const holderId = id();
    const otherId = id();
    const projectId = id();
    const calls = stub((userId) => (userId === holderId || userId === otherId ? "editor" : null));
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const holder = createSocket(holderId, "holder");
    const secondTab = createSocket(holderId, "second");
    const other = createSocket(otherId, "other");
    attach(io, holder, calls, registry);
    attach(io, secondTab, calls, registry);
    attach(io, other, calls, registry);
    await join(holder, projectId, TAB);

    const denied = ackCapture();
    await holder.handler("canvas:commit")({ projectId, baseVersion: 0, ops: [addOp("n2")] }, denied);
    assert.deepEqual(denied.calls, [{ ok: false, message: "You cannot edit this canvas" }]);
    assert.equal(calls.writes.length, 0);

    await holder.handler("turn:request")({ projectId });
    const saved = ackCapture();
    await holder.handler("canvas:commit")({ projectId, baseVersion: 0, ops: [addOp("n2")] }, saved);
    assert.deepEqual(saved.calls, [{ ok: true, version: 1 }]);
    assert.equal(calls.writes.length, 1);

    await join(secondTab, projectId, TAB_B);
    await join(other, projectId, TAB_C);
    const secondAck = ackCapture();
    const otherAck = ackCapture();
    await secondTab.handler("canvas:commit")({ projectId, baseVersion: 1, ops: [addOp("n3")] }, secondAck);
    await other.handler("canvas:commit")({ projectId, baseVersion: 1, ops: [addOp("n4")] }, otherAck);
    assert.equal(secondAck.calls[0].message, "You cannot edit this canvas");
    assert.equal(otherAck.calls[0].message, "You cannot edit this canvas");
    assert.equal(calls.writes.length, 1);

    await secondTab.handler("canvas:preview")(preview(projectId, 3));
    await other.handler("canvas:preview")(preview(projectId, 4));
    assert.equal(secondTab.relays.length, 0);
    assert.equal(other.relays.length, 0);
    await holder.handler("canvas:preview")(preview(projectId, 5));
    assert.equal(holder.relays.length, 1);
    assert.equal(holder.relays[0].event, "canvas:preview");
    assert.equal(holder.relays[0].volatile, true);
    assert.equal(holder.relays[0].room, `project:${projectId}`);
    assert.equal(holder.relays[0].payload.by, holderId);
  });

  it("hands the turn to the next queued tab on release", async () => {
    const firstId = id();
    const secondId = id();
    const thirdId = id();
    const projectId = id();
    const calls = stub(() => "editor");
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const first = createSocket(firstId, "first");
    const second = createSocket(secondId, "second");
    const third = createSocket(thirdId, "third");
    attach(io, first, calls, registry);
    attach(io, second, calls, registry);
    attach(io, third, calls, registry);
    await join(first, projectId, TAB);
    await join(second, projectId, TAB_B);
    await join(third, projectId, TAB_C);
    await first.handler("turn:request")({ projectId });
    await second.handler("turn:request")({ projectId });
    await third.handler("turn:request")({ projectId });

    await first.handler("turn:release")({ projectId });
    const handed = turnEmits(io).at(-1).payload;
    assert.deepEqual(handed.holder, { userId: secondId, tabId: TAB_B });
    assert.deepEqual(handed.queue, [{ userId: thirdId, tabId: TAB_C }]);

    const refused = ackCapture();
    await first.handler("canvas:commit")({ projectId, baseVersion: 0, ops: [addOp("n2")] }, refused);
    assert.equal(refused.calls[0].message, "You cannot edit this canvas");
    assert.equal(calls.writes.length, 0);
    const saved = ackCapture();
    await second.handler("canvas:commit")({ projectId, baseVersion: 0, ops: [addOp("n3")] }, saved);
    assert.deepEqual(saved.calls, [{ ok: true, version: 1 }]);
    assert.equal(calls.writes.length, 1);
  });

  it("lets only the owner reclaim, then cancel drops a queued tab", async () => {
    const editorId = id();
    const ownerId = id();
    const projectId = id();
    const calls = stub((userId) => (userId === ownerId ? "owner" : "editor"));
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const editor = createSocket(editorId, "editor");
    const owner = createSocket(ownerId, "owner");
    attach(io, editor, calls, registry);
    attach(io, owner, calls, registry);
    await join(editor, projectId, TAB);
    await join(owner, projectId, TAB_B);
    await editor.handler("turn:request")({ projectId });
    await owner.handler("turn:request")({ projectId });
    const waiting = createSocket(id(), "waiting");
    attach(io, waiting, calls, registry);
    await join(waiting, projectId, "123e4567-e89b-41d3-a456-426614174002");
    const before = turnEmits(io).length;

    await waiting.handler("turn:reclaim")({ projectId });
    assert.equal(turnEmits(io).length, before);

    await owner.handler("turn:reclaim")({ projectId });
    const taken = turnEmits(io).at(-1).payload;
    assert.deepEqual(taken.holder, { userId: ownerId, tabId: TAB_B });
    assert.deepEqual(taken.queue, [{ userId: editorId, tabId: TAB }]);
    assert.deepEqual(Object.keys(taken.queue[0]).sort(), ["tabId", "userId"]);

    await editor.handler("turn:cancel")({ projectId });
    assert.deepEqual(turnEmits(io).at(-1).payload.queue, []);
    assert.deepEqual(turnEmits(io).at(-1).payload.holder, { userId: ownerId, tabId: TAB_B });
  });

  it("keeps the turn through grace when the same tab rejoins", async () => {
    let now = 5_000_000;
    mock.method(Date, "now", () => now);
    restores.push(() => Date.now.mock.restore());
    const userId = id();
    const watcherId = id();
    const projectId = id();
    const calls = stub((current) => (current === userId ? "owner" : "viewer"));
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const holder = createSocket(userId, "holder");
    const watcher = createSocket(watcherId, "watcher");
    attach(io, holder, calls, registry);
    attach(io, watcher, calls, registry);
    await join(holder, projectId, TAB);
    await join(watcher, projectId, TAB_B);
    await holder.handler("turn:request")({ projectId });

    now = 5_010_000;
    holder.connected = false;
    await holder.handler("disconnecting")();
    const grace = turnEmits(io).at(-1).payload;
    assert.equal(typeof grace.graceUntil, "number");
    assert.equal(grace.graceUntil, now + 20000);
    assert.equal(grace.idleDeadline, null);
    assert.deepEqual(grace.holder, { userId, tabId: TAB });

    const again = createSocket(userId, "again");
    attach(io, again, calls, registry);
    now = 5_012_000;
    const body = await join(again, projectId, TAB);
    assert.deepEqual(body.turn.holder, { userId, tabId: TAB });
    assert.equal(body.turn.graceUntil, null);
    const cleared = turnEmits(io).at(-1);
    assert.equal(cleared.event, "turn:state");
    assert.equal(cleared.payload.graceUntil, null);
    assert.deepEqual(cleared.payload.holder, { userId, tabId: TAB });

    const saved = ackCapture();
    await again.handler("canvas:commit")({ projectId, baseVersion: 0, ops: [addOp("n2")] }, saved);
    assert.deepEqual(saved.calls, [{ ok: true, version: 1 }]);
  });

  it("starts grace when the holder leaves and someone else remains", async () => {
    let now = 6_000_000;
    mock.method(Date, "now", () => now);
    restores.push(() => Date.now.mock.restore());
    const userId = id();
    const watcherId = id();
    const projectId = id();
    const calls = stub((current) => (current === userId ? "editor" : "editor"));
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const holder = createSocket(userId, "holder");
    const watcher = createSocket(watcherId, "watcher");
    attach(io, holder, calls, registry);
    attach(io, watcher, calls, registry);
    await join(holder, projectId, TAB);
    await join(watcher, projectId, TAB_B);
    await holder.handler("turn:request")({ projectId });

    now = 6_004_000;
    await holder.handler("workspace:leave")({ projectId });
    const grace = turnEmits(io).at(-1).payload;
    assert.equal(grace.graceUntil, now + 20000);
    assert.equal(grace.idleDeadline, null);
    assert.deepEqual(grace.holder, { userId, tabId: TAB });
    assert.notEqual(registry.getRoom(projectId), null);
  });

  it("sweeps grace at the deadline and idle for the next holder", async () => {
    let now = 7_000_000;
    mock.method(Date, "now", () => now);
    restores.push(() => Date.now.mock.restore());
    const ownerId = id();
    const editorId = id();
    const waiterId = id();
    const projectId = id();
    const calls = stub((userId) => (userId === ownerId ? "owner" : "editor"));
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const holder = createSocket(ownerId, "holder");
    const next = createSocket(editorId, "next");
    const third = createSocket(waiterId, "third");
    attach(io, holder, calls, registry);
    attach(io, next, calls, registry);
    attach(io, third, calls, registry);
    await join(holder, projectId, TAB);
    await join(next, projectId, TAB_B);
    await join(third, projectId, TAB_C);
    await holder.handler("turn:request")({ projectId });
    now = 7_001_000;
    await next.handler("turn:request")({ projectId });
    now = 7_002_000;
    await third.handler("turn:request")({ projectId });

    now = 7_003_000;
    holder.connected = false;
    await holder.handler("disconnecting")();
    const before = turnEmits(io).length;
    const graceUntil = now + 20000;
    sweepTurns(io, registry, graceUntil - 1);
    assert.equal(turnEmits(io).length, before);
    sweepTurns(io, registry, graceUntil);
    const handed = turnEmits(io).at(-1).payload;
    assert.deepEqual(handed.holder, { userId: editorId, tabId: TAB_B });
    assert.deepEqual(handed.queue, [{ userId: waiterId, tabId: TAB_C }]);
    assert.equal(handed.graceUntil, null);
    const idleDeadline = graceUntil + 120000;
    assert.equal(handed.idleDeadline, idleDeadline);

    const afterGrace = turnEmits(io).length;
    sweepTurns(io, registry, idleDeadline - 1);
    assert.equal(turnEmits(io).length, afterGrace);
    sweepTurns(io, registry, idleDeadline);
    const lost = turnEmits(io).at(-1).payload;
    assert.deepEqual(lost.holder, { userId: waiterId, tabId: TAB_C });
    assert.deepEqual(lost.queue, []);
  });

  it("removes a queued tab when that tab disconnects", async () => {
    const holderId = id();
    const queuedId = id();
    const projectId = id();
    const calls = stub(() => "editor");
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const holder = createSocket(holderId, "holder");
    const queued = createSocket(queuedId, "queued");
    attach(io, holder, calls, registry);
    attach(io, queued, calls, registry);
    await join(holder, projectId, TAB);
    await join(queued, projectId, TAB_B);
    await holder.handler("turn:request")({ projectId });
    await queued.handler("turn:request")({ projectId });
    assert.deepEqual(turnEmits(io).at(-1).payload.queue, [{ userId: queuedId, tabId: TAB_B }]);

    queued.connected = false;
    await queued.handler("disconnecting")();
    const next = turnEmits(io).at(-1).payload;
    assert.deepEqual(next.queue, []);
    assert.deepEqual(next.holder, { userId: holderId, tabId: TAB });
    assert.equal(next.graceUntil, null);
  });

  it("starts grace only when the last copy of a tab disconnects", async () => {
    let now = 8_000_000;
    mock.method(Date, "now", () => now);
    restores.push(() => Date.now.mock.restore());
    const userId = id();
    const otherId = id();
    const projectId = id();
    const calls = stub(() => "editor");
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const first = createSocket(userId, "first");
    const copy = createSocket(userId, "copy");
    const other = createSocket(otherId, "other");
    attach(io, first, calls, registry);
    attach(io, copy, calls, registry);
    attach(io, other, calls, registry);
    await join(first, projectId, TAB);
    await join(copy, projectId, TAB);
    await join(other, projectId, TAB_C);
    await first.handler("turn:request")({ projectId });
    const before = turnEmits(io).length;

    now = 8_010_000;
    first.connected = false;
    await first.handler("disconnecting")();
    assert.equal(turnEmits(io).length, before);

    now = 8_011_000;
    copy.connected = false;
    await copy.handler("disconnecting")();
    const grace = turnEmits(io).at(-1).payload;
    assert.equal(turnEmits(io).length, before + 1);
    assert.equal(grace.graceUntil, now + 20000);
    assert.equal(grace.idleDeadline, null);
    assert.deepEqual(grace.holder, { userId, tabId: TAB });
  });

  it("publishes activity on a 5 second gap and the sweeper uses the later unpublished deadline", async () => {
    let now = 10_000;
    mock.method(Date, "now", () => now);
    restores.push(() => Date.now.mock.restore());
    const holderId = id();
    const waiterId = id();
    const projectId = id();
    const calls = stub(() => "editor");
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const holder = createSocket(holderId, "holder");
    const waiter = createSocket(waiterId, "waiter");
    attach(io, holder, calls, registry);
    attach(io, waiter, calls, registry);
    await join(holder, projectId, TAB);
    await join(waiter, projectId, TAB_B);
    await holder.handler("turn:request")({ projectId });
    now = 11_000;
    await waiter.handler("turn:request")({ projectId });
    const waiting = turnEmits(io).length;

    now = 12_000;
    await holder.handler("canvas:preview")(preview(projectId, 1));
    assert.equal(turnEmits(io).length, waiting);

    now = 16_000;
    await holder.handler("canvas:preview")(preview(projectId, 2));
    const published = turnEmits(io).at(-1).payload;
    assert.equal(turnEmits(io).length, waiting + 1);
    assert.equal(published.idleDeadline, 16_000 + 120000);
    assert.deepEqual(published.holder, { userId: holderId, tabId: TAB });

    now = 18_000;
    const saved = ackCapture();
    await holder.handler("canvas:commit")({ projectId, baseVersion: 0, ops: [addOp("n2")] }, saved);
    assert.deepEqual(saved.calls, [{ ok: true, version: 1 }]);
    assert.equal(turnEmits(io).length, waiting + 1);

    const realDeadline = 18_000 + 120000;
    sweepTurns(io, registry, 16_000 + 120000);
    sweepTurns(io, registry, realDeadline - 1);
    assert.equal(turnEmits(io).length, waiting + 1);
    sweepTurns(io, registry, realDeadline);
    const handed = turnEmits(io).at(-1).payload;
    assert.deepEqual(handed.holder, { userId: waiterId, tabId: TAB_B });
    assert.deepEqual(handed.queue, []);
    assert.equal(handed.serverNow, realDeadline);
  });

  it("does not publish activity while nobody is waiting", async () => {
    let now = 20_000;
    mock.method(Date, "now", () => now);
    restores.push(() => Date.now.mock.restore());
    const userId = id();
    const projectId = id();
    const calls = stub(() => "owner");
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const socket = createSocket(userId, "solo");
    attach(io, socket, calls, registry);
    await join(socket, projectId, TAB);
    await socket.handler("turn:request")({ projectId });
    const before = turnEmits(io).length;

    now += 60_000;
    await socket.handler("canvas:preview")(preview(projectId));
    assert.equal(turnEmits(io).length, before);
    assert.equal(registry.getRoom(projectId).turn.queue.length, 0);
  });

  it("discards the turn when the last connection leaves", async () => {
    const userId = id();
    const projectId = id();
    const calls = stub(() => "owner");
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const socket = createSocket(userId, "solo");
    attach(io, socket, calls, registry);
    await join(socket, projectId, TAB);
    await socket.handler("turn:request")({ projectId });
    assert.deepEqual(turnEmits(io).at(-1).payload.holder, { userId, tabId: TAB });
    const before = turnEmits(io).length;

    await socket.handler("workspace:leave")({ projectId });
    assert.equal(registry.getRoom(projectId), null);
    assert.equal(turnEmits(io).length, before);

    const fresh = createSocket(userId, "fresh");
    attach(io, fresh, calls, registry);
    const body = await join(fresh, projectId, TAB);
    assert.deepEqual(body.turn, emptyTurn(body.serverNow));
    assert.equal(body.turn.holder, null);
    assert.equal(turnEmits(io).length, before);
  });
});
