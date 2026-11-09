import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import Canvas from "../src/models/canvas.model.js";
import User from "../src/models/user.model.js";
import * as projectAccess from "../src/lib/projectAccess.js";
import { createWorkspaceRegistry } from "../src/lib/workspaceRooms.js";
import { canWrite, registerWorkspaceHandlers } from "../src/sockets/workspace.socket.js";
import { NODE_LABEL_MAX } from "../src/shared/canvasOps.js";

const TAB = "123e4567-e89b-41d3-a456-426614174000";
const TAB_B = "123e4567-e89b-41d3-a456-426614174001";

function defer() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
  return {
    type: "node.add",
    node: node(nodeId, label),
  };
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
    invites: [{ email: "hidden@example.com" }],
  };
}

function canvasDoc(version = 4, label = "Saved") {
  return {
    _id: id(),
    project: id(),
    nodes: [node("n1", label), { id: "", type: "shape" }],
    edges: [{ id: "e-missing", source: "gone", target: "n1", type: "link" }],
    version,
    updatedBy: id(),
    secret: "nope",
  };
}

function query(result) {
  const thenable = {
    select() { return thenable; },
    lean() { return Promise.resolve(result); },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return thenable;
}

function createSocket(userId, socketId = "socket-1") {
  const handlers = new Map();
  const socket = {
    id: socketId,
    connected: true,
    data: { userId },
    rooms: new Set([socketId, userId]),
    emits: [],
    joinGate: null,
    on(event, handler) { handlers.set(event, handler); },
    async join(room) {
      if (socket.joinGate) await socket.joinGate.promise;
      socket.rooms.add(room);
    },
    async leave(room) { socket.rooms.delete(room); },
    emit(...args) { socket.emits.push(args); },
    to() { throw new Error("socket.to must not be used for commits"); },
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
            event,
            payload,
            volatile: call.volatile,
          });
        },
        get volatile() {
          call.volatile = true;
          return operator;
        },
      };
      return operator;
    },
    emit(event, payload) {
      emits.push({ room: null, event, payload, global: true, volatile: false, except: [] });
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

function savedUpdate(version = 4) {
  return { acknowledged: true, matchedCount: 1, modifiedCount: 1, version };
}

describe("canWrite", () => {
  it("accepts only the room's own editor connection", () => {
    const connection = { userId: "user-1", tabId: "tab-1" };
    const room = {
      connections: new Map([["socket-1", connection]]),
      members: new Map([["user-1", { role: "editor", fullName: "Ada", img: "" }]]),
    };
    assert.equal(canWrite(room, connection), true);
    room.members.get("user-1").role = "owner";
    assert.equal(canWrite(room, connection), true);
    room.members.get("user-1").role = "viewer";
    assert.equal(canWrite(room, connection), false);
    room.members.get("user-1").role = "editor";
    assert.equal(canWrite(room, { userId: "user-1", tabId: "tab-1" }), false);
    assert.equal(canWrite(room, null), false);
    assert.equal(canWrite(null, connection), false);
    const other = {
      connections: new Map([["socket-2", connection]]),
      members: room.members,
    };
    assert.equal(canWrite(other, connection), true);
    const foreign = { userId: "user-1", tabId: "tab-1" };
    room.connections.set("socket-9", foreign);
    assert.equal(canWrite({ connections: new Map(), members: room.members }, connection), false);
  });
});

describe("canvas commit and sync", { concurrency: false }, () => {
  const restores = [];

  afterEach(() => {
    while (restores.length > 0) restores.pop()();
  });

  function stub({ profile, canvasResult, findImpl, updateImpl, readImpl, userImpl } = {}) {
    const calls = { find: [], writes: [], reads: 0, user: 0 };
    const findProjectForMember = (...args) => {
      calls.find.push(args);
      if (findImpl) return findImpl(...args);
      return Promise.resolve(null);
    };

    mock.method(User, "findById", (...args) => {
      calls.user += 1;
      if (userImpl) return userImpl(...args);
      return query(profile ?? { fullName: "Ada", img: "" });
    });
    restores.push(() => User.findById.mock.restore());

    mock.method(Canvas, "findOneAndUpdate", () => query(canvasResult ?? canvasDoc()));
    restores.push(() => Canvas.findOneAndUpdate.mock.restore());

    mock.method(Canvas, "findOne", () => {
      calls.reads += 1;
      if (readImpl) return readImpl();
      return query(canvasResult ?? canvasDoc());
    });
    restores.push(() => Canvas.findOne.mock.restore());

    mock.method(Canvas, "updateOne", (...args) => {
      calls.writes.push(args);
      if (updateImpl) return updateImpl(...args);
      return Promise.resolve(savedUpdate());
    });
    restores.push(() => Canvas.updateOne.mock.restore());

    calls.findProjectForMember = findProjectForMember;
    return calls;
  }

  function attach(io, socket, calls, registry) {
    const rooms = registry ?? createWorkspaceRegistry();
    registerWorkspaceHandlers(io, socket, rooms, {
      findProjectForMember: (...args) => calls.findProjectForMember(...args),
      roleOf: projectAccess.roleOf,
    });
    return rooms;
  }

  async function settle() {
    await new Promise((resolve) => setImmediate(resolve));
  }

  async function joinAs(io, socket, calls, registry, projectId, role, tabId = TAB) {
    calls.findProjectForMember = (requested, requester) => {
      calls.find.push([requested, requester]);
      return Promise.resolve(projectDoc(requested, requester, role));
    };
    const ack = ackCapture();
    await socket.handler("workspace:join")({ projectId, tabId }, ack);
    assert.equal(ack.calls[0].ok, true, ack.calls[0]?.message);
    return registry.getRoom(projectId);
  }

  it("rejects a bad envelope before a write, including when the caller is joined", async () => {
    const userId = id();
    const projectId = id();
    const calls = stub({ canvasResult: canvasDoc(2) });
    const io = createIo();
    const socket = createSocket(userId);
    const registry = attach(io, socket, calls);
    const commit = (payload, ack) => socket.handler("canvas:commit")(payload, ack);
    const sync = (payload, ack) => socket.handler("canvas:sync")(payload, ack);

    await commit({ projectId, baseVersion: 0, ops: [addOp("n2")] });
    await commit(null);
    const missingAck = ackCapture();
    await commit(null, missingAck);
    await commit([], missingAck);
    const badId = ackCapture();
    await commit({ projectId: "nope", baseVersion: 0, ops: [addOp("n2")] }, badId);
    const badVersion = ackCapture();
    await commit({ projectId, baseVersion: 1.5, ops: [addOp("n2")] }, badVersion);
    const negative = ackCapture();
    await commit({ projectId, baseVersion: -1, ops: [addOp("n2")] }, negative);
    const unsafe = ackCapture();
    await commit({ projectId, baseVersion: Number.MAX_SAFE_INTEGER, ops: [addOp("n2")] }, unsafe);
    const empty = ackCapture();
    await commit({ projectId, baseVersion: 0, ops: [] }, empty);
    const tooMany = ackCapture();
    await commit({
      projectId,
      baseVersion: 0,
      ops: Array.from({ length: 51 }, (_, index) => addOp(`n${index}`)),
    }, tooMany);
    const notArray = ackCapture();
    await commit({ projectId, baseVersion: 0, ops: { type: "node.add" } }, notArray);
    const syncBad = ackCapture();
    await sync([], syncBad);
    const syncId = ackCapture();
    await sync({ projectId: "nope" }, syncId);

    assert.equal(calls.writes.length, 0);
    assert.equal(calls.reads, 0);
    assert.equal(calls.find.length, 0);
    assert.equal(io.emits.length, 0);
    assert.equal(registry.getRoom(projectId), null);
    assert.deepEqual(missingAck.calls[0], { ok: false, message: "Invalid canvas request" });
    assert.deepEqual(badId.calls, [{ ok: false, message: "Project not found" }]);
    assert.deepEqual(badVersion.calls, [{ ok: false, message: "Invalid canvas request" }]);
    assert.deepEqual(negative.calls, [{ ok: false, message: "Invalid canvas request" }]);
    assert.deepEqual(unsafe.calls, [{ ok: false, message: "Invalid canvas request" }]);
    assert.deepEqual(empty.calls, [{ ok: false, message: "Invalid canvas request" }]);
    assert.equal(empty.calls[0].message === "Nothing to apply", false);
    assert.deepEqual(tooMany.calls, [{ ok: false, message: "Invalid canvas request" }]);
    assert.equal(tooMany.calls[0].message === "Too many changes at once", false);
    assert.deepEqual(notArray.calls, [{ ok: false, message: "Invalid canvas request" }]);
    assert.deepEqual(syncBad.calls, [{ ok: false, message: "Invalid canvas request" }]);
    assert.deepEqual(syncId.calls, [{ ok: false, message: "Project not found" }]);

    await joinAs(io, socket, calls, registry, projectId, "owner");
    const joinedBad = ackCapture();
    await commit({ projectId: projectId.toUpperCase(), baseVersion: -1, ops: [] }, joinedBad);
    assert.deepEqual(joinedBad.calls, [{ ok: false, message: "Invalid canvas request" }]);
    assert.equal(calls.writes.length, 0);
    assert.equal(io.emits.length, 0);
    assert.equal(registry.getRoom(projectId).canvas.version, 2);
  });

  it("refuses viewers, outsiders, stale connections, and forged identity without a snapshot", async () => {
    const ownerId = id();
    const editorId = id();
    const viewerId = id();
    const projectId = id();
    const otherId = id();
    const roles = new Map([[ownerId, "owner"], [editorId, "editor"], [viewerId, "viewer"]]);
    const calls = stub({
      canvasResult: canvasDoc(3),
      findImpl: (requested, requester) => Promise.resolve(
        roles.has(requester) ? projectDoc(requested, requester, roles.get(requester)) : null,
      ),
    });
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const owner = createSocket(ownerId, "owner");
    const editor = createSocket(editorId, "editor");
    const viewer = createSocket(viewerId, "viewer");
    const stranger = createSocket(id(), "stranger");
    attach(io, owner, calls, registry);
    attach(io, editor, calls, registry);
    attach(io, viewer, calls, registry);
    attach(io, stranger, calls, registry);
    await owner.handler("workspace:join")({ projectId, tabId: TAB }, ackCapture());
    await editor.handler("workspace:join")({ projectId, tabId: TAB }, ackCapture());
    await viewer.handler("workspace:join")({ projectId, tabId: TAB }, ackCapture());

    const forged = ackCapture();
    await viewer.handler("canvas:commit")({
      projectId,
      baseVersion: 3,
      ops: [addOp("n2")],
      userId: ownerId,
      role: "owner",
      updatedBy: ownerId,
    }, forged);
    assert.deepEqual(forged.calls, [{ ok: false, message: "You cannot edit this canvas" }]);
    assert.equal(Object.hasOwn(forged.calls[0], "canvas"), false);

    const outside = ackCapture();
    await stranger.handler("canvas:commit")({
      projectId,
      baseVersion: 3,
      ops: [addOp("n2")],
    }, outside);
    assert.deepEqual(outside.calls, [{ ok: false, message: "Project not found" }]);

    const wrongProject = ackCapture();
    await owner.handler("canvas:commit")({
      projectId: otherId,
      baseVersion: 3,
      ops: [addOp("n2")],
    }, wrongProject);
    assert.deepEqual(wrongProject.calls, [{ ok: false, message: "Project not found" }]);
    assert.equal(registry.getRoom(otherId), null);

    const nameless = createSocket("not-a-user", "nameless");
    attach(io, nameless, calls, registry);
    const missingIdentity = ackCapture();
    await nameless.handler("canvas:sync")({ projectId }, missingIdentity);
    assert.deepEqual(missingIdentity.calls, [{ ok: false, message: "Project not found" }]);

    const room = registry.getRoom(projectId);
    const held = defer();
    const previous = calls.findProjectForMember;
    calls.findProjectForMember = (...args) => {
      calls.find.push(args);
      if (args[1] === ownerId) return held.promise;
      return previous(...args);
    };
    const replaced = ackCapture();
    const replacing = owner.handler("canvas:commit")({ projectId, baseVersion: 3, ops: [addOp("n2")] }, replaced);
    await settle();
    room.connections.set(owner.id, { userId: ownerId, tabId: TAB });
    held.resolve(projectDoc(projectId, ownerId, "owner"));
    await replacing;
    assert.deepEqual(replaced.calls, [{ ok: false, message: "Workspace request superseded" }]);
    assert.equal(Object.hasOwn(replaced.calls[0], "canvas"), false);
    calls.findProjectForMember = previous;

    roles.set(editorId, "viewer");
    const demoted = ackCapture();
    await editor.handler("canvas:commit")({ projectId, baseVersion: 3, ops: [addOp("n9")] }, demoted);
    assert.deepEqual(demoted.calls, [{ ok: false, message: "You cannot edit this canvas" }]);
    assert.equal(room.members.get(editorId).role, "viewer");

    roles.delete(viewerId);
    const removed = ackCapture();
    await viewer.handler("canvas:sync")({ projectId, userId: ownerId }, removed);
    assert.deepEqual(removed.calls, [{ ok: false, message: "Project not found" }]);
    assert.equal(Object.hasOwn(removed.calls[0], "canvas"), false);
    assert.equal(calls.writes.length, 0);
    assert.equal(io.emits.length, 0);
    assert.equal(room.canvas.version, 3);
  });

  it("saves one normalized batch, then acks and broadcasts only after the write", async () => {
    const userId = id();
    const projectId = id();
    const gate = defer();
    const calls = stub({
      canvasResult: canvasDoc(4),
      findImpl: (requested, requester) => Promise.resolve(projectDoc(requested, requester, "owner")),
      updateImpl: () => gate.promise.then(() => savedUpdate()),
    });
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const sender = createSocket(userId, "sender");
    const otherTab = createSocket(userId, "other-tab");
    attach(io, sender, calls, registry);
    attach(io, otherTab, calls, registry);
    const room = await joinAs(io, sender, calls, registry, projectId, "owner", TAB);
    await otherTab.handler("workspace:join")({ projectId, tabId: TAB_B }, ackCapture());
    const before = structuredClone(room.canvas);
    const order = [];
    const ack = (body) => {
      order.push("ack");
      ack.calls.push(body);
    };
    ack.calls = [];

    const pending = sender.handler("canvas:commit")({
      projectId: projectId.toUpperCase(),
      baseVersion: 4,
      ops: [{
        type: "node.add",
        updatedBy: id(),
        node: { ...node("n2", "Box"), selected: true, secret: "nope" },
      }],
      userId: id(),
      role: "viewer",
      updatedBy: id(),
    }, ack);
    await settle();
    assert.equal(calls.writes.length, 1);
    assert.deepEqual(room.canvas, before);
    assert.equal(ack.calls.length, 0);
    assert.equal(io.emits.length, 0);

    gate.resolve();
    await pending;
    assert.deepEqual(order, ["ack"]);
    assert.deepEqual(ack.calls, [{ ok: true, version: 5 }]);
    assert.equal(room.canvas.version, 5);
    assert.equal(room.canvas.nodes.some((item) => item.id === "n2"), true);
    assert.equal(room.canvas.nodes.some((item) => item.secret), false);
    const [filter, update] = calls.writes[0];
    assert.deepEqual(filter, { project: projectId, version: 4 });
    assert.equal(update.$inc.version, 1);
    assert.equal(update.$set.updatedBy, userId);
    assert.equal(update.$set.nodes.some((item) => item.id === "n2" && item.data.label === "Box"), true);
    assert.equal(Object.hasOwn(update.$set.nodes.find((item) => item.id === "n2"), "selected"), false);
    assert.equal(calls.writes[0].length, 2);
    assert.equal(io.emits.length, 1);
    const broadcast = io.emits[0];
    assert.equal(broadcast.room, `project:${projectId}`);
    assert.deepEqual(broadcast.except, ["sender"]);
    assert.equal(broadcast.event, "canvas:ops");
    assert.equal(broadcast.volatile, false);
    assert.equal(broadcast.global, undefined);
    assert.equal(broadcast.payload.by, userId);
    assert.equal(broadcast.payload.version, 5);
    assert.equal(broadcast.payload.ops[0].node.selected, undefined);
    assert.equal(broadcast.payload.ops[0].node.id, "n2");
    assert.equal(sender.emits.length, 0);
    assert.equal(otherTab.emits.length, 0);
  });

  it("leaves the graph unchanged when applyOps rejects the batch", async () => {
    const userId = id();
    const projectId = id();
    const calls = stub({
      canvasResult: canvasDoc(4),
      findImpl: (requested, requester) => Promise.resolve(projectDoc(requested, requester, "editor")),
    });
    const io = createIo();
    const socket = createSocket(userId);
    const registry = attach(io, socket, calls);
    const room = await joinAs(io, socket, calls, registry, projectId, "editor");
    const ack = ackCapture();
    await socket.handler("canvas:commit")({
      projectId,
      baseVersion: 4,
      ops: [addOp("n2", "Ok"), addOp("n2", "Again"), { type: "node.add", node: node("n3", "x".repeat(NODE_LABEL_MAX + 1)) }],
    }, ack);

    assert.equal(ack.calls[0].ok, false);
    assert.equal(ack.calls[0].message, "Node id is already used");
    assert.equal(ack.calls[0].canvas.version, 4);
    assert.equal(ack.calls[0].canvas.nodes.length, 1);
    assert.equal(room.canvas.version, 4);
    assert.equal(room.canvas.nodes.length, 1);
    assert.equal(calls.writes.length, 0);
    assert.equal(io.emits.length, 0);
  });

  it("serializes two writers and reloads when the compare-and-set misses", async () => {
    const userA = id();
    const userB = id();
    const projectId = id();
    const gate = defer();
    let writes = 0;
    const calls = stub({
      canvasResult: canvasDoc(4),
      findImpl: (requested, requester) => Promise.resolve(projectDoc(requested, requester, "owner")),
      updateImpl: () => {
        writes += 1;
        if (writes === 1) return gate.promise.then(() => savedUpdate());
        if (writes === 2) return Promise.resolve({ acknowledged: true, matchedCount: 0, modifiedCount: 0 });
        return Promise.resolve(savedUpdate());
      },
      readImpl: () => query(canvasDoc(9, "From database")),
    });
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const socketA = createSocket(userA, "a");
    const socketB = createSocket(userB, "b");
    attach(io, socketA, calls, registry);
    attach(io, socketB, calls, registry);
    await joinAs(io, socketA, calls, registry, projectId, "owner", TAB);
    await socketB.handler("workspace:join")({ projectId, tabId: TAB_B }, ackCapture());

    const firstAck = ackCapture();
    const secondAck = ackCapture();
    const first = socketA.handler("canvas:commit")({ projectId, baseVersion: 4, ops: [addOp("n2")] }, firstAck);
    const second = socketB.handler("canvas:commit")({ projectId, baseVersion: 4, ops: [addOp("n3")] }, secondAck);
    await settle();
    assert.equal(writes, 1);
    gate.resolve();
    await first;
    await second;

    assert.deepEqual(firstAck.calls, [{ ok: true, version: 5 }]);
    assert.equal(secondAck.calls[0].ok, false);
    assert.equal(secondAck.calls[0].message, "Canvas version mismatch");
    assert.equal(secondAck.calls[0].canvas.version, 5);
    assert.equal(writes, 1);
    assert.equal(io.emits.length, 1);

    const conflict = ackCapture();
    await socketA.handler("canvas:commit")({ projectId, baseVersion: 5, ops: [addOp("n4")] }, conflict);
    assert.equal(conflict.calls[0].message, "Canvas version mismatch");
    assert.equal(conflict.calls[0].canvas.version, 9);
    assert.equal(conflict.calls[0].canvas.nodes[0].data.label, "From database");
    assert.equal(Object.hasOwn(conflict.calls[0].canvas, "secret"), false);
    assert.equal(registry.getRoom(projectId).canvas.version, 9);
    assert.equal(io.emits.length, 1);

    const replay = ackCapture();
    const retry = ackCapture();
    await socketA.handler("canvas:commit")({ projectId, baseVersion: 4, ops: [addOp("n2")] }, replay);
    assert.equal(replay.calls[0].message, "Canvas version mismatch");
    assert.equal(replay.calls[0].canvas.version, 9);
    await socketB.handler("canvas:commit")({ projectId, baseVersion: 9, ops: [addOp("n5", "After")] }, retry);
    assert.deepEqual(retry.calls, [{ ok: true, version: 10 }]);
    assert.equal(registry.getRoom(projectId).canvas.nodes.filter((item) => item.id === "n5").length, 1);
    assert.equal(calls.writes.length, 3);
    assert.equal(io.emits.length, 2);
  });

  it("fails closed on a bad reload, then accepts a later fresh read", async () => {
    const userId = id();
    const projectId = id();
    const docs = [null, { ...canvasDoc(0), version: 1.5 }, canvasDoc(6, "Recovered")];
    let cursor = 0;
    const calls = stub({
      canvasResult: canvasDoc(1),
      findImpl: (requested, requester) => Promise.resolve(projectDoc(requested, requester, "owner")),
      updateImpl: () => Promise.resolve({ acknowledged: true, matchedCount: 0, modifiedCount: 0 }),
      readImpl: () => query(docs[cursor++]),
    });
    const io = createIo();
    const socket = createSocket(userId);
    const registry = attach(io, socket, calls);
    const room = await joinAs(io, socket, calls, registry, projectId, "owner");
    const original = room.canvas.nodes[0].data.label;
    const logged = console.error;
    console.error = () => {};
    try {
    const missing = ackCapture();
    await socket.handler("canvas:commit")({ projectId, baseVersion: 1, ops: [addOp("n2")] }, missing);
    assert.deepEqual(missing.calls, [{ ok: false, message: "Project not found" }]);
    assert.equal(Object.hasOwn(missing.calls[0], "canvas"), false);
    assert.equal(room.canvas.nodes[0].data.label, original);

    const malformed = ackCapture();
    await socket.handler("canvas:sync")({ projectId }, malformed);
    assert.deepEqual(malformed.calls, [{ ok: false, message: "Unable to sync canvas" }]);
    assert.equal(Object.hasOwn(malformed.calls[0], "canvas"), false);

    const recovered = ackCapture();
    await socket.handler("canvas:sync")({ projectId }, recovered);
    assert.equal(recovered.calls[0].ok, true);
    assert.equal(recovered.calls[0].canvas.version, 6);
    assert.equal(recovered.calls[0].canvas.nodes[0].data.label, "Recovered");
    assert.equal(calls.writes.length, 1);
    assert.equal(io.emits.length, 0);
    recovered.calls[0].canvas.nodes[0].data.label = "mutated";
    assert.equal(room.canvas.nodes[0].data.label, "Recovered");
    } finally {
      console.error = logged;
    }
  });

  it("refreshes after an ambiguous write and does not return the stale cache", async () => {
    const userId = id();
    const projectId = id();
    let phase = "throw";
    const calls = stub({
      canvasResult: canvasDoc(2, "Cached"),
      findImpl: (requested, requester) => Promise.resolve(projectDoc(requested, requester, "editor")),
      updateImpl: () => {
        if (phase === "throw") {
          phase = "persisted";
          return Promise.reject(new Error("socket hang up"));
        }
        if (phase === "persisted") return Promise.resolve(savedUpdate());
        return Promise.resolve({ acknowledged: false });
      },
      readImpl: () => {
        if (phase === "persisted") return query(canvasDoc(3, "Persisted"));
        if (phase === "fail-read") {
          return { lean: () => Promise.reject(new Error("read down")) };
        }
        return query(canvasDoc(3, "Persisted"));
      },
    });
    const io = createIo();
    const socket = createSocket(userId);
    const registry = attach(io, socket, calls);
    const room = await joinAs(io, socket, calls, registry, projectId, "editor");
    const logs = [];
    const original = console.error;
    console.error = (...args) => logs.push(args.join(" "));
    try {
      const failed = ackCapture();
      await socket.handler("canvas:commit")({ projectId, baseVersion: 2, ops: [addOp("n2")] }, failed);
      assert.deepEqual(failed.calls, [{ ok: false, message: "Unable to save canvas" }]);
      assert.equal(room.canvas.version, 2);
      assert.equal(io.emits.length, 0);
      assert.equal(logs.some((line) => line.includes("socket hang up")), true);

      phase = "fail-read";
      const stale = ackCapture();
      await socket.handler("canvas:sync")({ projectId }, stale);
      assert.deepEqual(stale.calls, [{ ok: false, message: "Unable to sync canvas" }]);
      assert.equal(Object.hasOwn(stale.calls[0], "canvas"), false);
      assert.equal(room.canvas.nodes[0].data.label, "Cached");

      phase = "persisted";
      const seen = ackCapture();
      await socket.handler("canvas:sync")({ projectId }, seen);
      assert.equal(seen.calls[0].canvas.version, 3);
      assert.equal(seen.calls[0].canvas.nodes[0].data.label, "Persisted");

      const oldBase = ackCapture();
      await socket.handler("canvas:commit")({ projectId, baseVersion: 2, ops: [addOp("n2")] }, oldBase);
      assert.equal(oldBase.calls[0].message, "Canvas version mismatch");
      const again = ackCapture();
      await socket.handler("canvas:commit")({ projectId, baseVersion: 3, ops: [addOp("n4", "Next")] }, again);
      assert.deepEqual(again.calls, [{ ok: true, version: 4 }]);
      assert.equal(io.emits.length, 1);
      assert.equal(room.canvas.nodes.some((item) => item.id === "n4"), true);

      phase = "unacked";
      const before = room.canvas.version;
      const unacked = ackCapture();
      await socket.handler("canvas:commit")({ projectId, baseVersion: before, ops: [addOp("n9")] }, unacked);
      assert.deepEqual(unacked.calls, [{ ok: false, message: "Unable to save canvas" }]);
      assert.equal(room.canvas.version, before);
      assert.equal(room.canvas.nodes.some((item) => item.id === "n9"), false);
      assert.equal(io.emits.length, 1);
    } finally {
      console.error = original;
    }
  });

  it("drops queued work when the caller leaves, and still publishes a save already in flight", async () => {
    const userId = id();
    const watcherId = id();
    const projectId = id();
    const projectB = id();
    const findGate = defer();
    const save = defer();
    let finds = 0;
    let deferSave = false;
    const calls = stub({
      canvasResult: canvasDoc(1),
      findImpl: (requested, requester) => {
        finds += 1;
        if (finds === 1) return Promise.resolve(projectDoc(requested, requester, "owner"));
        if (finds === 2) return findGate.promise;
        return Promise.resolve(projectDoc(requested, requester, requester === watcherId ? "editor" : "owner"));
      },
      updateImpl: () => (deferSave ? save.promise.then(() => savedUpdate()) : Promise.resolve(savedUpdate())),
    });
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const socket = createSocket(userId, "holder");
    attach(io, socket, calls, registry);
    const started = ackCapture();
    await socket.handler("workspace:join")({ projectId, tabId: TAB }, started);
    assert.equal(started.calls[0].ok, true);
    const room = registry.getRoom(projectId);
    const queue = room.writeQueue;

    const early = ackCapture();
    const queued = socket.handler("canvas:commit")({ projectId, baseVersion: 1, ops: [addOp("n2")] }, early);
    await settle();
    const laterAck = ackCapture();
    const later = socket.handler("canvas:commit")({ projectId, baseVersion: 1, ops: [addOp("n3")] }, laterAck);
    await socket.handler("workspace:leave")({ projectId });
    findGate.resolve(projectDoc(projectId, userId, "owner"));
    await queued;
    await later;
    assert.deepEqual(early.calls, [{ ok: false, message: "Workspace request superseded" }]);
    assert.deepEqual(laterAck.calls, [{ ok: false, message: "Workspace request superseded" }]);
    assert.equal(calls.writes.length, 0);
    assert.equal(registry.getRoom(projectId), null);

    const rejoin = ackCapture();
    await socket.handler("workspace:join")({ projectId, tabId: TAB }, rejoin);
    assert.equal(rejoin.calls[0].ok, true);
    const current = registry.getRoom(projectId);
    assert.notEqual(current.writeQueue, queue);
    deferSave = true;

    const inflightAck = ackCapture();
    const inflight = socket.handler("canvas:commit")({ projectId, baseVersion: 1, ops: [addOp("n8")] }, inflightAck);
    await settle();
    assert.equal(calls.writes.length, 1);
    const retained = registry.getRoom(projectId);
    socket.connected = false;
    await socket.handler("disconnecting")();
    assert.equal(registry.getRoom(projectId), retained);

    const joiner = createSocket(watcherId, "joiner");
    attach(io, joiner, calls, registry);
    const joinAck = ackCapture();
    const joining = joiner.handler("workspace:join")({ projectId, tabId: TAB_B }, joinAck);
    await settle();
    assert.equal(joinAck.calls.length, 0);
    assert.equal(registry.getRoom(projectId), retained);

    save.resolve();
    await inflight;
    await joining;
    assert.equal(inflightAck.calls.length, 0);
    assert.equal(joinAck.calls[0].ok, true);
    assert.equal(joinAck.calls[0].canvas.version, 2);
    assert.equal(joinAck.calls[0].canvas.nodes.some((item) => item.id === "n8"), true);
    assert.equal(registry.getRoom(projectId), retained);
    assert.equal(retained.writeQueue, current.writeQueue);
    assert.equal(io.emits.some((emit) => emit.event === "canvas:ops" && emit.except.includes("holder")), true);

    await joiner.handler("workspace:leave")({ projectId });
    assert.equal(registry.getRoom(projectId), null);
    assert.equal(registry.getRoom(projectB), null);
  });

  it("cancels a queued commit when the socket joins another project or rejoins", async () => {
    const userId = id();
    const projectA = id();
    const projectB = id();
    const gates = [];
    const calls = stub({
      canvasResult: canvasDoc(2),
      findImpl: () => {
        const gate = defer();
        gates.push(gate);
        return gate.promise;
      },
    });
    const io = createIo();
    const socket = createSocket(userId);
    const registry = attach(io, socket, calls);
    const joinAck = ackCapture();
    const joining = socket.handler("workspace:join")({ projectId: projectA, tabId: TAB }, joinAck);
    await settle();
    gates[0].resolve(projectDoc(projectA, userId, "owner"));
    await joining;

    const commitAck = ackCapture();
    const committing = socket.handler("canvas:commit")({
      projectId: projectA,
      baseVersion: 2,
      ops: [addOp("n2")],
    }, commitAck);
    await settle();
    const moved = ackCapture();
    const moving = socket.handler("workspace:join")({ projectId: projectB, tabId: TAB }, moved);
    await settle();
    gates[1].resolve(projectDoc(projectA, userId, "owner"));
    await settle();
    gates[2].resolve(projectDoc(projectB, userId, "editor"));
    await committing;
    await moving;
    assert.deepEqual(commitAck.calls, [{ ok: false, message: "Workspace request superseded" }]);
    assert.equal(moved.calls[0].ok, true);
    assert.equal(moved.calls[0].project._id, projectB);
    assert.equal(calls.writes.length, 0);
    assert.equal(socket.rooms.has(`project:${projectA}`), false);
    assert.equal(socket.rooms.has(`project:${projectB}`), true);

    const again = ackCapture();
    const recommit = socket.handler("canvas:commit")({
      projectId: projectB,
      baseVersion: 2,
      ops: [addOp("n7")],
    }, again);
    await settle();
    const rejoinAck = ackCapture();
    const rejoining = socket.handler("workspace:join")({ projectId: projectB, tabId: TAB_B }, rejoinAck);
    await settle();
    gates[3].resolve(projectDoc(projectB, userId, "editor"));
    await settle();
    gates[4].resolve(projectDoc(projectB, userId, "editor"));
    await recommit;
    await rejoining;
    assert.equal(rejoinAck.calls[0].ok, true);
    assert.deepEqual(again.calls, [{ ok: false, message: "Workspace request superseded" }]);
    assert.equal(calls.writes.length, 0);
    assert.equal(registry.getRoom(projectA), null);
  });

  it("keeps independent projects independent and still broadcasts when the ack throws", async () => {
    const userA = id();
    const userB = id();
    const projectA = id();
    const projectB = id();
    const gate = defer();
    const calls = stub({
      canvasResult: canvasDoc(1),
      findImpl: (requested, requester) => Promise.resolve(projectDoc(requested, requester, "owner")),
      updateImpl: (filter) => (
        filter.project === projectA
          ? gate.promise.then(() => savedUpdate())
          : Promise.resolve(savedUpdate())
      ),
    });
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const socketA = createSocket(userA, "a");
    const socketB = createSocket(userB, "b");
    attach(io, socketA, calls, registry);
    attach(io, socketB, calls, registry);
    await joinAs(io, socketA, calls, registry, projectA, "owner");
    await joinAs(io, socketB, calls, registry, projectB, "owner");

    const slow = socketA.handler("canvas:commit")({
      projectId: projectA,
      baseVersion: 1,
      ops: [addOp("n2")],
    }, ackCapture());
    await settle();
    const fastAck = ackCapture();
    await socketB.handler("canvas:commit")({ projectId: projectB, baseVersion: 1, ops: [addOp("n3")] }, fastAck);
    assert.deepEqual(fastAck.calls, [{ ok: true, version: 2 }]);
    assert.equal(registry.getRoom(projectB).canvas.nodes.some((item) => item.id === "n3"), true);
    gate.resolve();
    await slow;

    const throwing = () => { throw new Error("ack broke"); };
    const logs = [];
    const original = console.error;
    console.error = (...args) => logs.push(args.join(" "));
    try {
      const before = calls.writes.length;
      await socketB.handler("canvas:commit")({ projectId: projectB, baseVersion: 2, ops: [addOp("n4")] }, throwing);
      assert.equal(calls.writes.length, before + 1);
      assert.equal(io.emits.filter((emit) => emit.payload?.version === 3).length, 1);
      assert.equal(logs.some((line) => line.includes("ack broke")), true);
      assert.equal(registry.getRoom(projectB).canvas.version, 3);
    } finally {
      console.error = original;
    }
  });

  it("syncs the queued cache for a viewer and waits behind an in-flight commit", async () => {
    const ownerId = id();
    const viewerId = id();
    const projectId = id();
    const gate = defer();
    const calls = stub({
      canvasResult: canvasDoc(4, "Ready"),
      findImpl: (requested, requester) => Promise.resolve(
        projectDoc(requested, requester, requester === ownerId ? "owner" : "viewer"),
      ),
      updateImpl: () => gate.promise.then(() => savedUpdate()),
    });
    const io = createIo();
    const registry = createWorkspaceRegistry();
    const owner = createSocket(ownerId, "owner");
    const viewer = createSocket(viewerId, "viewer");
    attach(io, owner, calls, registry);
    attach(io, viewer, calls, registry);
    const ownerJoin = ackCapture();
    await owner.handler("workspace:join")({ projectId, tabId: TAB }, ownerJoin);
    assert.equal(ownerJoin.calls[0].ok, true);
    const viewerJoin = ackCapture();
    await viewer.handler("workspace:join")({ projectId, tabId: TAB_B }, viewerJoin);
    assert.equal(viewerJoin.calls[0].role, "viewer");
    const room = registry.getRoom(projectId);
    assert.equal(room.members.get(viewerId).role, "viewer");

    const pendingJoin = createSocket(viewerId, "pending");
    pendingJoin.joinGate = defer();
    attach(io, pendingJoin, calls, registry);
    const pendingAck = ackCapture();
    const joining = pendingJoin.handler("workspace:join")({ projectId, tabId: TAB }, pendingAck);
    await settle();
    const denied = ackCapture();
    await pendingJoin.handler("canvas:sync")({ projectId }, denied);
    assert.deepEqual(denied.calls, [{ ok: false, message: "Project not found" }]);
    pendingJoin.joinGate.resolve();
    await joining;

    const commitAck = ackCapture();
    const committing = owner.handler("canvas:commit")({
      projectId,
      baseVersion: 4,
      ops: [addOp("n2", "Live")],
    }, commitAck);
    const syncAck = ackCapture();
    const syncing = viewer.handler("canvas:sync")({ projectId, role: "owner" }, syncAck);
    await settle();
    assert.equal(syncAck.calls.length, 0);
    assert.equal(calls.writes.length, 1);
    gate.resolve();
    await committing;
    await syncing;

    assert.equal(syncAck.calls[0].ok, true);
    assert.equal(syncAck.calls[0].canvas.version, 5);
    assert.equal(syncAck.calls[0].canvas.nodes.some((item) => item.id === "n2"), true);
    assert.equal(Object.keys(syncAck.calls[0]).sort().join(), "canvas,ok");
    syncAck.calls[0].canvas.nodes[0].data.label = "changed";
    assert.equal(room.canvas.nodes[0].data.label, "Ready");
    assert.equal(calls.writes.length, 1);
    assert.equal(io.emits.length, 1);
    assert.deepEqual(io.emits[0].except, ["owner"]);
  });

  it("does not treat an in-flight join as authorization", async () => {
    const userId = id();
    const projectId = id();
    const gate = defer();
    let finds = 0;
    const calls = stub({
      canvasResult: canvasDoc(1),
      findImpl: () => {
        finds += 1;
        if (finds === 1) return gate.promise;
        return Promise.resolve(projectDoc(projectId, userId, "owner"));
      },
    });
    const io = createIo();
    const socket = createSocket(userId);
    const registry = attach(io, socket, calls);
    const joinAck = ackCapture();
    const joining = socket.handler("workspace:join")({ projectId, tabId: TAB }, joinAck);
    await settle();
    const tooSoon = ackCapture();
    await socket.handler("canvas:commit")({ projectId, baseVersion: 1, ops: [addOp("n2")] }, tooSoon);
    await socket.handler("canvas:sync")({ projectId });
    assert.deepEqual(tooSoon.calls, [{ ok: false, message: "Project not found" }]);
    assert.equal(calls.writes.length, 0);
    assert.equal(registry.getRoom(projectId), null);
    gate.resolve(projectDoc(projectId, userId, "owner"));
    await joining;
    assert.equal(joinAck.calls[0].ok, true);
    assert.equal(joinAck.calls[0].canvas.version, 1);
  });

  it("drops a finished join's authority on rejoin and leave before cleanup", async () => {
    const userId = id();
    const projectId = id();
    const otherProject = id();
    const gates = [];
    let deferLookups = true;
    const calls = stub({
      canvasResult: { _id: id(), project: projectId, nodes: [], edges: [], version: 0 },
      findImpl: () => {
        if (!deferLookups) return Promise.resolve(projectDoc(projectId, userId, "owner"));
        const gate = defer();
        gates.push(gate);
        return gate.promise;
      },
    });
    const io = createIo();
    const socket = createSocket(userId);
    const registry = attach(io, socket, calls);

    const joinAck = ackCapture();
    const joining = socket.handler("workspace:join")({ projectId, tabId: TAB }, joinAck);
    await settle();
    gates[0].resolve(projectDoc(projectId, userId, "owner"));
    await joining;
    assert.equal(joinAck.calls[0].ok, true);
    assert.equal(joinAck.calls[0].canvas.version, 0);

    deferLookups = false;
    await socket.handler("workspace:leave")({ projectId: otherProject });
    const stillAck = ackCapture();
    await socket.handler("canvas:sync")({ projectId }, stillAck);
    assert.equal(stillAck.calls[0].ok, true);
    assert.equal(stillAck.calls[0].canvas.version, 0);
    assert.equal(calls.writes.length, 0);

    deferLookups = true;
    const rejoinAck = ackCapture();
    const rejoining = socket.handler("workspace:join")({ projectId, tabId: TAB_B }, rejoinAck);
    await settle();
    assert.equal(rejoinAck.calls.length, 0);
    const duringSync = ackCapture();
    const duringCommit = ackCapture();
    await socket.handler("canvas:sync")({ projectId }, duringSync);
    await socket.handler("canvas:commit")({
      projectId,
      baseVersion: 0,
      ops: [addOp("n-during")],
    }, duringCommit);
    assert.deepEqual(duringSync.calls, [{ ok: false, message: "Project not found" }]);
    assert.deepEqual(duringCommit.calls, [{ ok: false, message: "Project not found" }]);
    assert.equal(Object.hasOwn(duringSync.calls[0], "canvas"), false);
    assert.equal(Object.hasOwn(duringCommit.calls[0], "canvas"), false);

    const leaving = socket.handler("workspace:leave")({ projectId });
    await settle();
    const afterSync = ackCapture();
    const afterCommit = ackCapture();
    await socket.handler("canvas:sync")({ projectId }, afterSync);
    await socket.handler("canvas:commit")({
      projectId,
      baseVersion: 0,
      ops: [addOp("n-after")],
    }, afterCommit);
    assert.deepEqual(afterSync.calls, [{ ok: false, message: "Project not found" }]);
    assert.deepEqual(afterCommit.calls, [{ ok: false, message: "Project not found" }]);
    assert.equal(calls.writes.length, 0);
    assert.equal(io.emits.length, 0);
    assert.equal(rejoinAck.calls.length, 0);
    assert.notEqual(registry.getRoom(projectId), null);

    gates[1].resolve(projectDoc(projectId, userId, "owner"));
    await rejoining;
    await leaving;
    assert.deepEqual(rejoinAck.calls, [{ ok: false, message: "Workspace request superseded" }]);
    assert.equal(registry.getRoom(projectId), null);
    assert.equal(socket.rooms.has(`project:${projectId}`), false);
    assert.equal(calls.writes.length, 0);
    assert.equal(io.emits.length, 0);

    deferLookups = false;
    const restoredAck = ackCapture();
    const restored = socket.handler("workspace:join")({ projectId, tabId: TAB }, restoredAck);
    await restored;
    assert.equal(restoredAck.calls[0].ok, true);
    assert.equal(restoredAck.calls[0].canvas.version, 0);

    const syncAck = ackCapture();
    await socket.handler("canvas:sync")({ projectId }, syncAck);
    assert.equal(syncAck.calls[0].ok, true);
    assert.equal(syncAck.calls[0].canvas.version, 0);
    const commitAck = ackCapture();
    await socket.handler("canvas:commit")({
      projectId,
      baseVersion: 0,
      ops: [addOp("n-restored")],
    }, commitAck);
    assert.deepEqual(commitAck.calls, [{ ok: true, version: 1 }]);
    assert.equal(calls.writes.length, 1);
    assert.equal(io.emits.length, 1);
    assert.equal(io.emits[0].event, "canvas:ops");
    assert.deepEqual(io.emits[0].except, [socket.id]);

    await socket.handler("workspace:leave")({ projectId });
    assert.equal(registry.getRoom(projectId), null);
    assert.equal(socket.rooms.has(`project:${projectId}`), false);
  });

  describe("canvas:preview", { concurrency: false }, () => {
    const restores = [];

    afterEach(() => {
      while (restores.length > 0) restores.pop()();
    });

    function stub({ profile, canvasResult, findImpl } = {}) {
      const calls = { find: [] };
      const findProjectForMember = (...args) => {
        calls.find.push(args);
        if (findImpl) return findImpl(...args);
        return Promise.resolve(null);
      };

      const userQuery = {
        select: () => userQuery,
        lean: () => Promise.resolve(profile ?? { fullName: "Ada", img: "" }),
      };
      mock.method(User, "findById", () => userQuery);
      restores.push(() => User.findById.mock.restore());

      const canvasQuery = {
        lean: () => Promise.resolve(canvasResult ?? { nodes: [], edges: [], version: 0 }),
      };
      mock.method(Canvas, "findOneAndUpdate", () => canvasQuery);
      restores.push(() => Canvas.findOneAndUpdate.mock.restore());

      calls.findProjectForMember = findProjectForMember;
      return calls;
    }

    function createSocket(userId, socketId = "socket-1") {
      const handlers = new Map();
      const socket = {
        id: socketId,
        connected: true,
        data: { userId },
        rooms: new Set([socketId, userId]),
        emits: [],
        joinGate: null,
        on(event, handler) { handlers.set(event, handler); },
        async join(room) {
          if (socket.joinGate) await socket.joinGate.promise;
          socket.rooms.add(room);
        },
        async leave(room) { socket.rooms.delete(room); },
        emit(...args) { socket.emits.push(args); },
        to() { throw new Error("socket.to must not be used for commits"); },
        volatile: {
          emit(event, payload) { socket.emits.push({ event, payload, volatile: true }); },
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
                event,
                payload,
                volatile: call.volatile,
              });
            },
            get volatile() {
              call.volatile = true;
              return operator;
            },
          };
          return operator;
        },
        emit(event, payload) {
          emits.push({ room: null, event, payload, global: true, volatile: false, except: [] });
        },
      };
      return io;
    }

    function attach(io, socket, calls, registry) {
      const rooms = registry ?? createWorkspaceRegistry();
      registerWorkspaceHandlers(io, socket, rooms, {
        findProjectForMember: (...args) => calls.findProjectForMember(...args),
        roleOf: projectAccess.roleOf,
      });
      return rooms;
    }

    async function joinAs(io, socket, calls, registry, projectId, role, tabId = TAB) {
      calls.findProjectForMember = (requested, requester) => {
        calls.find.push([requested, requester]);
        return Promise.resolve(projectDoc(requested, requester, role));
      };
      const ack = (body) => { ack.calls.push(body); };
      ack.calls = [];
      await socket.handler("workspace:join")({ projectId, tabId }, ack);
      assert.equal(ack.calls[0].ok, true, ack.calls[0]?.message);
      return registry.getRoom(projectId);
    }

    async function settle() {
      await new Promise((resolve) => setImmediate(resolve));
    }

    it("relays a valid drag preview as volatile, excludes sender, sets by to user id", async () => {
      const userId = id();
      const projectId = id();
      const calls = stub({ canvasResult: { nodes: [node("n1")], edges: [], version: 1 } });
      const io = createIo();
      const registry = createWorkspaceRegistry();
      const sender = createSocket(userId, "sender");
      const receiver = createSocket(id(), "receiver");
      const io2 = createIo();
      attach(io, sender, calls, registry);
      attach(io2, receiver, calls, registry);
      await joinAs(io, sender, calls, registry, projectId, "editor");
      await joinAs(io2, receiver, calls, registry, projectId, "editor");

      await sender.handler("canvas:preview")({
        projectId,
        nodes: [{ id: "n1", position: { x: 50, y: 60 } }],
      });

      await settle();

      assert.equal(io.emits.length, 1);
      const emit = io.emits[0];
      assert.equal(emit.event, "canvas:preview");
      assert.equal(emit.volatile, true);
      assert.equal(emit.room, `project:${projectId}`);
      assert.deepEqual(emit.except, ["sender"]);
      assert.equal(emit.payload.by, userId);
      assert.deepEqual(emit.payload.nodes, [{ id: "n1", position: { x: 50, y: 60 } }]);
      assert.equal(sender.emits.length, 0);
      assert.equal(receiver.emits.length, 0);
    });

    it("same user second tab receives preview", async () => {
      const userId = id();
      const projectId = id();
      const calls = stub({ canvasResult: { nodes: [node("n1")], edges: [], version: 1 } });
      const io = createIo();
      const registry = createWorkspaceRegistry();
      const sender = createSocket(userId, "sender");
      const otherTab = createSocket(userId, "other-tab");
      attach(io, sender, calls, registry);
      attach(io, otherTab, calls, registry);
      await joinAs(io, sender, calls, registry, projectId, "editor");
      await joinAs(io, otherTab, calls, registry, projectId, "editor", TAB_B);

      await sender.handler("canvas:preview")({
        projectId,
        nodes: [{ id: "n1", position: { x: 50, y: 60 } }],
      });

      await settle();

      assert.equal(io.emits.length, 1);
      const emit = io.emits[0];
      assert.deepEqual(emit.except, ["sender"]);
      assert.equal(otherTab.emits.length, 0);
    });

    it("viewer does not emit preview", async () => {
      const userId = id();
      const projectId = id();
      const calls = stub({ canvasResult: { nodes: [node("n1")], edges: [], version: 1 } });
      const io = createIo();
      const registry = createWorkspaceRegistry();
      const viewer = createSocket(userId, "viewer");
      attach(io, viewer, calls, registry);
      await joinAs(io, viewer, calls, registry, projectId, "viewer");

      await viewer.handler("canvas:preview")({
        projectId,
        nodes: [{ id: "n1", position: { x: 50, y: 60 } }],
      });

      await settle();

      assert.equal(io.emits.length, 0);
    });

    it("non-member does not emit preview", async () => {
      const userId = id();
      const projectId = id();
      const calls = stub({ canvasResult: { nodes: [node("n1")], edges: [], version: 1 } });
      const io = createIo();
      const registry = createWorkspaceRegistry();
      const outsider = createSocket(id(), "outsider");
      attach(io, outsider, calls, registry);

      await outsider.handler("canvas:preview")({
        projectId,
        nodes: [{ id: "n1", position: { x: 50, y: 60 } }],
      });

      await settle();

      assert.equal(io.emits.length, 0);
    });

    it("bad project id does not emit", async () => {
      const userId = id();
      const projectId = id();
      const calls = stub({ canvasResult: { nodes: [node("n1")], edges: [], version: 1 } });
      const io = createIo();
      const registry = createWorkspaceRegistry();
      const sender = createSocket(userId, "sender");
      attach(io, sender, calls, registry);
      await joinAs(io, sender, calls, registry, projectId, "editor");

      await sender.handler("canvas:preview")({
        projectId: "not-a-valid-id",
        nodes: [{ id: "n1", position: { x: 50, y: 60 } }],
      });

      await settle();

      assert.equal(io.emits.length, 0);
    });

    it("payload over 50 nodes does not emit", async () => {
      const userId = id();
      const projectId = id();
      const calls = stub({ canvasResult: { nodes: [node("n1")], edges: [], version: 1 } });
      const io = createIo();
      const registry = createWorkspaceRegistry();
      const sender = createSocket(userId, "sender");
      attach(io, sender, calls, registry);
      await joinAs(io, sender, calls, registry, projectId, "editor");

      const manyNodes = Array.from({ length: 51 }, (_, i) => ({ id: `n${i}`, position: { x: i, y: i } }));
      await sender.handler("canvas:preview")({
        projectId,
        nodes: manyNodes,
      });

      await settle();

      assert.equal(io.emits.length, 0);
    });

    it("duplicate id does not emit", async () => {
      const userId = id();
      const projectId = id();
      const calls = stub({ canvasResult: { nodes: [node("n1")], edges: [], version: 1 } });
      const io = createIo();
      const registry = createWorkspaceRegistry();
      const sender = createSocket(userId, "sender");
      attach(io, sender, calls, registry);
      await joinAs(io, sender, calls, registry, projectId, "editor");

      await sender.handler("canvas:preview")({
        projectId,
        nodes: [
          { id: "n1", position: { x: 10, y: 10 } },
          { id: "n1", position: { x: 20, y: 20 } },
        ],
      });

      await settle();

      assert.equal(io.emits.length, 0);
    });

    it("non-finite coordinate does not emit", async () => {
      const userId = id();
      const projectId = id();
      const calls = stub({ canvasResult: { nodes: [node("n1")], edges: [], version: 1 } });
      const io = createIo();
      const registry = createWorkspaceRegistry();
      const sender = createSocket(userId, "sender");
      attach(io, sender, calls, registry);
      await joinAs(io, sender, calls, registry, projectId, "editor");

      await sender.handler("canvas:preview")({
        projectId,
        nodes: [{ id: "n1", position: { x: NaN, y: 10 } }],
      });

      await settle();

      assert.equal(io.emits.length, 0);
    });

    it("width without height does not emit", async () => {
      const userId = id();
      const projectId = id();
      const calls = stub({ canvasResult: { nodes: [node("n1")], edges: [], version: 1 } });
      const io = createIo();
      const registry = createWorkspaceRegistry();
      const sender = createSocket(userId, "sender");
      attach(io, sender, calls, registry);
      await joinAs(io, sender, calls, registry, projectId, "editor");

      await sender.handler("canvas:preview")({
        projectId,
        nodes: [{ id: "n1", position: { x: 10, y: 10 }, width: 100 }],
      });

      await settle();

      assert.equal(io.emits.length, 0);
    });

    it("leave and delayed rejoin invalidate authority before queued detach", async () => {
      const userId = id();
      const projectId = id();
      const otherProject = id();
      const gates = [];
      let deferLookups = true;
      const calls = stub({
        canvasResult: { _id: id(), project: projectId, nodes: [], edges: [], version: 0 },
        findImpl: () => {
          if (!deferLookups) return Promise.resolve(projectDoc(projectId, userId, "owner"));
          const gate = defer();
          gates.push(gate);
          return gate.promise;
        },
      });
      const io = createIo();
      const socket = createSocket(userId);
      const registry = createWorkspaceRegistry();
      attach(io, socket, calls, registry);

      const joinAck = (body) => { joinAck.calls.push(body); };
      joinAck.calls = [];
      await socket.handler("workspace:join")({ projectId, tabId: TAB }, joinAck);
      await settle();
      gates[0].resolve(projectDoc(projectId, userId, "owner"));
      await settle();
      assert.equal(joinAck.calls[0].ok, true);

      deferLookups = false;
      await socket.handler("workspace:leave")({ projectId: otherProject });
      const stillAck = (body) => { stillAck.calls.push(body); };
      stillAck.calls = [];
      await socket.handler("canvas:preview")({ projectId, nodes: [{ id: "n1", position: { x: 1, y: 1 } }] }, stillAck);
      assert.equal(io.emits.length, 0);

      deferLookups = true;
      const rejoinAck = (body) => { rejoinAck.calls.push(body); };
      rejoinAck.calls = [];
      await socket.handler("workspace:join")({ projectId, tabId: TAB_B }, rejoinAck);
      await settle();
      assert.equal(rejoinAck.calls.length, 0);

      const duringPreview = (body) => { duringPreview.calls.push(body); };
      duringPreview.calls = [];
      await socket.handler("canvas:preview")({ projectId, nodes: [{ id: "n1", position: { x: 1, y: 1 } }] }, duringPreview);
      assert.deepEqual(duringPreview.calls, []);
      assert.equal(io.emits.length, 0);

      gates[1].resolve(projectDoc(projectId, userId, "owner"));
      await settle();
      await settle();
      assert.deepEqual(rejoinAck.calls, [{ ok: false, message: "Workspace request superseded" }]);
      assert.equal(registry.getRoom(projectId), null);
    });

    it("Canvas.updateOne and commit broadcast path are not used", async () => {
      const userId = id();
      const projectId = id();
      let updateOneCalls = 0;
      const calls = stub({
        canvasResult: { nodes: [node("n1")], edges: [], version: 1 },
        findImpl: (requested, requester) => Promise.resolve(projectDoc(requested, requester, "owner")),
      });
      const io = createIo();
      const registry = createWorkspaceRegistry();
      const sender = createSocket(userId, "sender");
      const receiver = createSocket(id(), "receiver");
      mock.method(Canvas, "updateOne", () => { updateOneCalls += 1; return Promise.resolve({ acknowledged: true, matchedCount: 1 }); });
      restores.push(() => Canvas.updateOne.mock.restore());
      attach(io, sender, calls, registry);
      attach(io, receiver, calls, registry);
      await joinAs(io, sender, calls, registry, projectId, "editor");
      await joinAs(io, receiver, calls, registry, projectId, "editor");

      await sender.handler("canvas:preview")({
        projectId,
        nodes: [{ id: "n1", position: { x: 50, y: 60 } }],
      });

      await settle();

      assert.equal(updateOneCalls, 0);
      assert.equal(io.emits.filter((e) => e.event === "canvas:ops").length, 0);
      assert.equal(io.emits.filter((e) => e.event === "canvas:preview").length, 1);
      assert.equal(io.emits[0].volatile, true);
    });
  });
});
