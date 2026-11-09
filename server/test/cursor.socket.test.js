import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import mongoose from "mongoose";

import Canvas from "../src/models/canvas.model.js";
import User from "../src/models/user.model.js";
import * as projectAccess from "../src/lib/projectAccess.js";
import { createWorkspaceRegistry } from "../src/lib/workspaceRooms.js";
import { registerWorkspaceHandlers } from "../src/sockets/workspace.socket.js";
import { POSITION_MAX } from "../src/shared/canvasOps.js";

const TAB = "123e4567-e89b-41d3-a456-426614174000";
const TAB_B = "123e4567-e89b-41d3-a456-426614174001";
const CURSOR_EVENTS = new Set(["cursor:move", "cursor:leave"]);

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

// One fake network. socket.to(room).volatile.emit delivers to every other
// socket whose adapter rooms include the room, never to the sender.
function createNetwork() {
  const sockets = [];
  const ioEmits = [];
  const io = {
    ioEmits,
    to(room) {
      const operator = {
        except() { return operator; },
        emit(event, payload) { ioEmits.push({ room, event, payload }); },
        get volatile() { return operator; },
      };
      return operator;
    },
    emit(event, payload) { ioEmits.push({ room: null, event, payload }); },
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
          emit() { throw new Error("cursor relays must be volatile"); },
        };
      },
    };
    socket.handler = (event) => handlers.get(event);
    sockets.push(socket);
    return socket;
  }

  return { io, createSocket };
}

describe("cursor socket handlers", { concurrency: false }, () => {
  const restores = [];

  afterEach(() => {
    while (restores.length > 0) restores.pop()();
  });

  function world(rolesByUser) {
    const calls = { find: 0, user: 0, canvasRead: 0, canvasWrite: 0 };
    mock.method(User, "findById", () => {
      calls.user += 1;
      return query({ fullName: "Ada", img: "" });
    });
    restores.push(() => User.findById.mock.restore());
    mock.method(Canvas, "findOneAndUpdate", () => {
      calls.canvasRead += 1;
      return query({ nodes: [], edges: [], version: 3 });
    });
    restores.push(() => Canvas.findOneAndUpdate.mock.restore());
    mock.method(Canvas, "findOne", () => {
      calls.canvasRead += 1;
      return query({ nodes: [], edges: [], version: 3 });
    });
    restores.push(() => Canvas.findOne.mock.restore());
    mock.method(Canvas, "updateOne", () => {
      calls.canvasWrite += 1;
      return Promise.resolve({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    });
    restores.push(() => Canvas.updateOne.mock.restore());

    const registry = createWorkspaceRegistry();
    const network = createNetwork();
    const deps = {
      findProjectForMember: (projectId, userId) => {
        calls.find += 1;
        const role = rolesByUser.get(userId);
        return Promise.resolve(role ? projectDoc(projectId, userId, role) : null);
      },
      roleOf: projectAccess.roleOf,
    };

    function connect(userId, socketId) {
      const socket = network.createSocket(userId, socketId);
      registerWorkspaceHandlers(network.io, socket, registry, deps);
      return socket;
    }

    async function join(socket, projectId, tabId = TAB) {
      const acks = [];
      await socket.handler("workspace:join")({ projectId, tabId }, (body) => acks.push(body));
      return acks[0];
    }

    return { calls, registry, network, connect, join };
  }

  function cursorEvents(socket) {
    return socket.received.filter((entry) => CURSOR_EVENTS.has(entry.event));
  }

  it("relays movement from owner, editor and viewer to others but not the sender", async () => {
    const ownerId = id();
    const editorId = id();
    const viewerId = id();
    const projectId = id();
    const otherProject = id();
    const roles = new Map([[ownerId, "owner"], [editorId, "editor"], [viewerId, "viewer"]]);
    const w = world(roles);
    const owner = w.connect(ownerId, "s-owner");
    const editor = w.connect(editorId, "s-editor");
    const viewer = w.connect(viewerId, "s-viewer");
    const ownerTab2 = w.connect(ownerId, "s-owner-2");
    const elsewhere = w.connect(ownerId, "s-elsewhere");
    for (const [socket, tab] of [[owner, TAB], [editor, TAB], [viewer, TAB], [ownerTab2, TAB_B]]) {
      const ack = await w.join(socket, projectId, tab);
      assert.equal(ack.ok, true, ack?.message);
      assert.ok(socket.rooms.has(`project:${projectId}`));
    }
    assert.equal((await w.join(elsewhere, otherProject)).ok, true);

    for (const sender of [owner, editor, viewer]) {
      for (const socket of [owner, editor, viewer, ownerTab2, elsewhere]) socket.received.length = 0;
      const userId = sender.data.userId;
      await sender.handler("cursor:move")({ projectId: projectId.toUpperCase(), x: 12.5, y: -40, extra: "drop", userId: "forged" });

      assert.equal(cursorEvents(sender).length, 0, "sender must not receive its own cursor");
      assert.equal(cursorEvents(elsewhere).length, 0, "another project must not receive it");
      const recipients = [owner, editor, viewer, ownerTab2].filter((socket) => socket !== sender);
      for (const socket of recipients) {
        const events = cursorEvents(socket);
        assert.equal(events.length, 1);
        assert.equal(events[0].volatile, true);
        assert.deepEqual(events[0], {
          event: "cursor:move",
          volatile: true,
          payload: { projectId, userId, x: 12.5, y: -40 },
        });
      }
    }
  });

  it("relays leave from every role to others but not the sender", async () => {
    const ownerId = id();
    const viewerId = id();
    const projectId = id();
    const w = world(new Map([[ownerId, "owner"], [viewerId, "viewer"]]));
    const owner = w.connect(ownerId, "s-owner");
    const viewer = w.connect(viewerId, "s-viewer");
    assert.equal((await w.join(owner, projectId)).ok, true);
    assert.equal((await w.join(viewer, projectId)).ok, true);

    await viewer.handler("cursor:leave")({ projectId, userId: "forged", x: 1 });
    assert.deepEqual(cursorEvents(owner), [{
      event: "cursor:leave",
      volatile: true,
      payload: { projectId, userId: viewerId },
    }]);
    assert.equal(cursorEvents(viewer).length, 0);

    await owner.handler("cursor:leave")({ projectId });
    assert.equal(cursorEvents(viewer).length, 1);
    assert.equal(cursorEvents(owner).length, 1);
  });

  it("relays nothing and calls no callback for invalid payloads", async () => {
    const ownerId = id();
    const viewerId = id();
    const projectId = id();
    const w = world(new Map([[ownerId, "owner"], [viewerId, "viewer"]]));
    const owner = w.connect(ownerId, "s-owner");
    const viewer = w.connect(viewerId, "s-viewer");
    await w.join(owner, projectId);
    await w.join(viewer, projectId);

    let callbackCalls = 0;
    const callback = () => { callbackCalls += 1; };
    const move = owner.handler("cursor:move");
    const leave = owner.handler("cursor:leave");
    const bad = [
      undefined, null, [], "x", 5,
      { projectId: "not-an-id", x: 1, y: 1 },
      { projectId: 5, x: 1, y: 1 },
      { projectId, x: "1", y: 1 },
      { projectId, x: 1, y: "1" },
      { projectId, x: null, y: 1 },
      { projectId, x: NaN, y: 1 },
      { projectId, x: 1, y: Infinity },
      { projectId, x: -Infinity, y: 1 },
      { projectId, x: POSITION_MAX + 1, y: 1 },
      { projectId, x: 1, y: -POSITION_MAX - 1 },
      { projectId },
    ];
    for (const payload of bad) await move(payload, callback);
    for (const payload of [undefined, null, [], "x", { projectId: "bad" }, { projectId: 7 }]) {
      await leave(payload, callback);
    }
    assert.equal(cursorEvents(viewer).length, 0);
    assert.equal(callbackCalls, 0);

    // Boundary values are valid.
    await move({ projectId, x: POSITION_MAX, y: -POSITION_MAX }, callback);
    assert.equal(cursorEvents(viewer).length, 1);
    assert.equal(callbackCalls, 0);
  });

  it("relays nothing for an outsider, an unjoined socket, or another project", async () => {
    const ownerId = id();
    const outsiderId = id();
    const projectId = id();
    const otherProject = id();
    const w = world(new Map([[ownerId, "owner"]]));
    const owner = w.connect(ownerId, "s-owner");
    const outsider = w.connect(outsiderId, "s-outsider");
    const unjoined = w.connect(ownerId, "s-unjoined");
    const listener = w.connect(ownerId, "s-listener");
    assert.equal((await w.join(owner, projectId)).ok, true);
    assert.equal((await w.join(listener, projectId, TAB_B)).ok, true);
    const denied = await w.join(outsider, projectId);
    assert.equal(denied.ok, false);

    await outsider.handler("cursor:move")({ projectId, x: 1, y: 2 });
    await outsider.handler("cursor:leave")({ projectId });
    await unjoined.handler("cursor:move")({ projectId, x: 1, y: 2 });
    await owner.handler("cursor:move")({ projectId: otherProject, x: 1, y: 2 });
    await owner.handler("cursor:leave")({ projectId: otherProject });

    assert.equal(cursorEvents(listener).length, 0);
  });

  it("relays nothing after leave, disconnect, queued detach, or while rejoin is pending", async () => {
    const ownerId = id();
    const projectId = id();
    const w = world(new Map([[ownerId, "owner"]]));
    const sender = w.connect(ownerId, "s-sender");
    const listener = w.connect(ownerId, "s-listener");
    assert.equal((await w.join(sender, projectId)).ok, true);
    assert.equal((await w.join(listener, projectId, TAB_B)).ok, true);

    // Same-project leave: authority is gone synchronously, before detach runs.
    const leaving = sender.handler("workspace:leave")({ projectId });
    await sender.handler("cursor:move")({ projectId, x: 1, y: 1 });
    await leaving;
    await sender.handler("cursor:move")({ projectId, x: 2, y: 2 });
    assert.equal(cursorEvents(listener).length, 0);

    // A delayed rejoin does not restore authority until it completes.
    const gate = defer();
    sender.joinGate = gate;
    const acks = [];
    const rejoin = sender.handler("workspace:join")({ projectId, tabId: TAB }, (body) => acks.push(body));
    await settle();
    await sender.handler("cursor:move")({ projectId, x: 3, y: 3 });
    assert.equal(cursorEvents(listener).length, 0);
    gate.resolve();
    await rejoin;
    assert.equal(acks[0]?.ok, true);
    sender.joinGate = null;
    await sender.handler("cursor:move")({ projectId, x: 4, y: 4 });
    assert.deepEqual(cursorEvents(listener).map((entry) => entry.payload.x), [4]);

    // A disconnected socket is not an authority.
    listener.received.length = 0;
    sender.connected = false;
    await sender.handler("cursor:move")({ projectId, x: 5, y: 5 });
    await sender.handler("cursor:leave")({ projectId });
    assert.equal(cursorEvents(listener).length, 0);
  });

  it("keeps authority when a leave names a different project", async () => {
    const ownerId = id();
    const projectId = id();
    const otherProject = id();
    const w = world(new Map([[ownerId, "owner"]]));
    const sender = w.connect(ownerId, "s-sender");
    const listener = w.connect(ownerId, "s-listener");
    await w.join(sender, projectId);
    await w.join(listener, projectId, TAB_B);

    await sender.handler("workspace:leave")({ projectId: otherProject });
    await sender.handler("cursor:move")({ projectId, x: 7, y: 8 });
    assert.deepEqual(cursorEvents(listener).map((entry) => entry.payload.x), [7]);
  });

  it("does not touch models, rooms, the write queue, or canvas state", async () => {
    const ownerId = id();
    const viewerId = id();
    const projectId = id();
    const w = world(new Map([[ownerId, "owner"], [viewerId, "viewer"]]));
    const owner = w.connect(ownerId, "s-owner");
    const viewer = w.connect(viewerId, "s-viewer");
    await w.join(owner, projectId);
    await w.join(viewer, projectId);

    const room = w.registry.getRoom(projectId);
    const connections = room.connections.size;
    const version = room.canvas.version;
    const canvasRef = room.canvas;
    let queued = 0;
    const originalEnqueue = room.writeQueue;
    room.writeQueue = (...args) => { queued += 1; return originalEnqueue(...args); };
    for (const key of Object.keys(w.calls)) w.calls[key] = 0;
    const emitsBefore = w.network.io.ioEmits.length;
    const ownerEmitsBefore = owner.emits.length;

    await owner.handler("cursor:move")({ projectId, x: 1, y: 2 });
    await viewer.handler("cursor:move")({ projectId, x: 3, y: 4 });
    await owner.handler("cursor:leave")({ projectId });
    await settle();

    assert.deepEqual(w.calls, { find: 0, user: 0, canvasRead: 0, canvasWrite: 0 });
    assert.equal(queued, 0);
    assert.equal(w.registry.getRoom(projectId), room);
    assert.equal(room.connections.size, connections);
    assert.equal(room.canvas, canvasRef);
    assert.equal(room.canvas.version, version);
    assert.equal(w.network.io.ioEmits.length, emitsBefore, "no io-level canvas or presence emit");
    assert.equal(owner.emits.length, ownerEmitsBefore);
    assert.equal(cursorEvents(viewer).length, 2);
  });
});
