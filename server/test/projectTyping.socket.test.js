import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import mongoose from "mongoose";

import Canvas from "../src/models/canvas.model.js";
import User from "../src/models/user.model.js";
import * as projectAccess from "../src/lib/projectAccess.js";
import { createWorkspaceRegistry } from "../src/lib/workspaceRooms.js";
import { registerWorkspaceHandlers } from "../src/sockets/workspace.socket.js";

const TAB = "123e4567-e89b-41d3-a456-426614174000";
const TAB_B = "123e4567-e89b-41d3-a456-426614174001";

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
          emit() { throw new Error("typing relays must be volatile"); },
        };
      },
    };
    socket.handler = (event) => handlers.get(event);
    sockets.push(socket);
    return socket;
  }

  return { io, createSocket };
}

describe("project typing relay", { concurrency: false }, () => {
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

  function typingEvents(socket) {
    return socket.received.filter((entry) => entry.event === "project:typing");
  }

  it("relays true and false for every role, strips a forged user, and stays inside the project", async () => {
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
      assert.equal((await w.join(socket, projectId, tab)).ok, true);
    }
    assert.equal((await w.join(elsewhere, otherProject)).ok, true);

    for (const sender of [owner, editor, viewer]) {
      for (const flag of [true, false]) {
        for (const socket of [owner, editor, viewer, ownerTab2, elsewhere]) socket.received.length = 0;
        let acked = false;
        await sender.handler("project:typing")(
          { projectId: projectId.toUpperCase(), isTyping: flag, userId: "forged", extra: "drop" },
          () => { acked = true; },
        );
        assert.equal(acked, false);
        assert.equal(typingEvents(sender).length, 0);
        assert.equal(typingEvents(elsewhere).length, 0);
        for (const socket of [owner, editor, viewer, ownerTab2].filter((item) => item !== sender)) {
          const events = typingEvents(socket);
          assert.equal(events.length, 1);
          assert.equal(events[0].volatile, true);
          assert.deepEqual(events[0].payload, {
            projectId,
            userId: sender.data.userId,
            isTyping: flag,
          });
        }
      }
    }
  });

  it("drops malformed payloads, outsiders, and sockets that are not in a finished join", async () => {
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
    assert.equal((await w.join(outsider, projectId)).ok, false);

    const dropped = [
      null,
      [],
      "yes",
      {},
      { projectId, isTyping: "true" },
      { projectId, isTyping: 1 },
      { projectId, isTyping: null },
      { projectId: "nope", isTyping: true },
      { isTyping: true },
    ];
    for (const payload of dropped) {
      await owner.handler("project:typing")(payload);
    }
    await outsider.handler("project:typing")({ projectId, isTyping: true });
    await unjoined.handler("project:typing")({ projectId, isTyping: true });
    await owner.handler("project:typing")({ projectId: otherProject, isTyping: true });
    assert.equal(typingEvents(listener).length, 0);
  });

  it("drops typing after leave, disconnect, and while a rejoin or replacement is pending", async () => {
    const ownerId = id();
    const projectId = id();
    const otherProject = id();
    const w = world(new Map([[ownerId, "owner"]]));
    const sender = w.connect(ownerId, "s-sender");
    const listener = w.connect(ownerId, "s-listener");
    assert.equal((await w.join(sender, projectId)).ok, true);
    assert.equal((await w.join(listener, projectId, TAB_B)).ok, true);

    const leaving = sender.handler("workspace:leave")({ projectId });
    await sender.handler("project:typing")({ projectId, isTyping: true });
    await leaving;
    await sender.handler("project:typing")({ projectId, isTyping: false });
    assert.equal(typingEvents(listener).length, 0);

    const gate = defer();
    sender.joinGate = gate;
    const acks = [];
    const rejoin = sender.handler("workspace:join")({ projectId, tabId: TAB }, (body) => acks.push(body));
    await settle();
    await sender.handler("project:typing")({ projectId, isTyping: true });
    assert.equal(typingEvents(listener).length, 0);
    gate.resolve();
    await rejoin;
    assert.equal(acks[0]?.ok, true);
    sender.joinGate = null;

    listener.received.length = 0;
    const replacementGate = defer();
    sender.joinGate = replacementGate;
    const replacement = sender.handler("workspace:join")({ projectId: otherProject, tabId: TAB }, () => {});
    await settle();
    await sender.handler("project:typing")({ projectId, isTyping: true });
    assert.equal(typingEvents(listener).length, 0);
    replacementGate.resolve();
    await replacement;
    sender.joinGate = null;

    sender.connected = false;
    await sender.handler("disconnecting")();
    await sender.handler("project:typing")({ projectId, isTyping: true });
    assert.equal(typingEvents(listener).length, 0);
  });

  it("keeps authority when a leave names another project", async () => {
    const ownerId = id();
    const projectId = id();
    const otherProject = id();
    const w = world(new Map([[ownerId, "owner"]]));
    const sender = w.connect(ownerId, "s-sender");
    const listener = w.connect(ownerId, "s-listener");
    await w.join(sender, projectId);
    await w.join(listener, projectId, TAB_B);

    await sender.handler("workspace:leave")({ projectId: otherProject });
    await sender.handler("project:typing")({ projectId, isTyping: true });
    assert.deepEqual(typingEvents(listener).map((entry) => entry.payload.isTyping), [true]);
  });

  it("does not read models, enqueue canvas work, or change the turn", async () => {
    const ownerId = id();
    const viewerId = id();
    const projectId = id();
    const w = world(new Map([[ownerId, "owner"], [viewerId, "viewer"]]));
    const owner = w.connect(ownerId, "s-owner");
    const viewer = w.connect(viewerId, "s-viewer");
    await w.join(owner, projectId);
    await w.join(viewer, projectId);

    const room = w.registry.getRoom(projectId);
    const turn = room.turn;
    const canvas = room.canvas;
    const version = canvas.version;
    let queued = 0;
    const original = room.writeQueue;
    room.writeQueue = (...args) => {
      queued += 1;
      return original(...args);
    };
    for (const key of Object.keys(w.calls)) w.calls[key] = 0;
    const broadcasts = w.network.io.ioEmits.length;
    room.members.get(viewerId).role = "guest";
    await viewer.handler("project:typing")({ projectId, isTyping: true });
    assert.equal(typingEvents(owner).length, 0);
    room.members.get(viewerId).role = "viewer";

    await viewer.handler("project:typing")({ projectId, isTyping: false });
    assert.equal(queued, 0);
    assert.equal(room.turn, turn);
    assert.equal(room.canvas, canvas);
    assert.equal(room.canvas.version, version);
    assert.equal(w.network.io.ioEmits.length, broadcasts);
    assert.deepEqual(w.calls, { find: 0, user: 0, canvasRead: 0, canvasWrite: 0 });
    assert.deepEqual(typingEvents(owner).map((entry) => entry.payload), [{
      projectId,
      userId: viewerId,
      isTyping: false,
    }]);
  });
});
