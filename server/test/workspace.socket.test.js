import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import Canvas from "../src/models/canvas.model.js";
import User from "../src/models/user.model.js";
import * as projectAccess from "../src/lib/projectAccess.js";
import { createWorkspaceRegistry } from "../src/lib/workspaceRooms.js";
import { registerWorkspaceHandlers } from "../src/sockets/workspace.socket.js";

const TAB = "123e4567-e89b-41d3-a456-426614174000";

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

function savedNode() {
  return {
    id: "n1",
    type: "shape",
    position: { x: 10, y: 40 },
    width: 160,
    height: 80,
    data: { shape: "rectangle", label: "Saved", color: "#112233", textColor: "#ABCDEF" },
  };
}

function savedEdge() {
  return {
    id: "e1",
    source: "n1",
    target: "n1",
    sourceHandle: "right",
    targetHandle: "left",
    type: "link",
    data: { label: "goes" },
  };
}

function projectDoc(projectId, userId, role) {
  if (role === "owner") {
    return { _id: projectId, name: "Design", description: "Notes", owner: userId, members: [], email: "hidden@example.com" };
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

function canvasDoc(version = 4) {
  return {
    _id: id(),
    project: id(),
    nodes: [savedNode(), { id: "", type: "shape" }, { id: "n-bad", position: { x: 0, y: 0 }, width: 10, height: 10, data: {} }],
    edges: [savedEdge(), { id: "e-missing", source: "gone", target: "n1", type: "link" }],
    version,
    updatedBy: id(),
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
    joins: [],
    leaves: [],
    joinGate: null,
    joinError: null,
    on(event, handler) { handlers.set(event, handler); },
    async join(room) {
      socket.joins.push(room);
      if (socket.joinGate) await socket.joinGate.promise;
      if (socket.joinError && String(room).startsWith("project:")) {
        socket.rooms.add(room);
        socket.joinedBeforeError = true;
        throw socket.joinError;
      }
      socket.rooms.add(room);
    },
    async leave(room) {
      socket.leaves.push(room);
      socket.rooms.delete(room);
    },
    emit() {},
  };
  socket.handler = (event) => handlers.get(event);
  return socket;
}

function createIo() {
  const emits = [];
  return {
    emits,
    to(room) {
      return {
        emit(event, payload) {
          emits.push({ room, event, payload, volatile: false, global: false });
        },
      };
    },
    emit(event, payload) {
      emits.push({ room: null, event, payload, volatile: false, global: true });
    },
  };
}

function ackCapture() {
  const calls = [];
  const ack = (body) => { calls.push(body); };
  ack.calls = calls;
  return ack;
}

describe("workspace socket", { concurrency: false }, () => {
  const restores = [];

  afterEach(() => {
    while (restores.length > 0) restores.pop()();
  });

  function stub({ project, profile, canvasResult, findImpl, updateImpl, userImpl }) {
    const calls = { find: [], update: [], read: 0, user: 0 };
    const findProjectForMember = (...args) => {
      calls.find.push(args);
      if (findImpl) return findImpl(...args);
      return Promise.resolve(project);
    };

    mock.method(User, "findById", (...args) => {
      calls.user += 1;
      if (userImpl) return userImpl(...args);
      return query(profile);
    });
    restores.push(() => User.findById.mock.restore());

    mock.method(Canvas, "findOneAndUpdate", (...args) => {
      calls.update.push(args);
      if (updateImpl) return updateImpl(...args);
      return query(canvasResult);
    });
    restores.push(() => Canvas.findOneAndUpdate.mock.restore());

    mock.method(Canvas, "findOne", () => {
      calls.read += 1;
      return query(canvasResult);
    });
    restores.push(() => Canvas.findOne.mock.restore());

    calls.findProjectForMember = findProjectForMember;
    return calls;
  }

  function attach(socket, calls, registry) {
    const rooms = registry ?? createWorkspaceRegistry();
    if (!calls.io) calls.io = createIo();
    registerWorkspaceHandlers(calls.io, socket, rooms, {
      findProjectForMember: calls.findProjectForMember,
      roleOf: projectAccess.roleOf,
    });
    return rooms;
  }

  async function settle() {
    await new Promise((resolve) => setImmediate(resolve));
  }

  it("rejects malformed input before any lookup and prefers a bad project id", async () => {
    const userId = id();
    const calls = stub({ project: null, profile: null, canvasResult: null });
    const socket = createSocket(userId);
    attach(socket, calls);
    const join = socket.handler("workspace:join");

    await join({ projectId: id(), tabId: TAB });
    await join(null, ackCapture());
    await join([], ackCapture());
    const badProject = ackCapture();
    await join({ projectId: "not-an-id", tabId: "also-bad" }, badProject);
    const badTab = ackCapture();
    await join({ projectId: id(), tabId: "not-a-uuid" }, badTab);
    const noUser = createSocket("not-a-user");
    attach(noUser, calls);
    const missingIdentity = ackCapture();
    await noUser.handler("workspace:join")({ projectId: id(), tabId: TAB }, missingIdentity);

    assert.equal(calls.find.length, 0);
    assert.equal(calls.update.length, 0);
    assert.equal(calls.user, 0);
    assert.deepEqual(badProject.calls, [{ ok: false, message: "Project not found" }]);
    assert.deepEqual(badTab.calls, [{ ok: false, message: "Invalid workspace request" }]);
    assert.deepEqual(missingIdentity.calls, [{ ok: false, message: "Project not found" }]);
  });

  it("hides missing projects, outsiders, and unreadable roles without creating a canvas", async () => {
    const userId = id();
    const projectId = id();
    const cases = [
      null,
      projectDoc(projectId, id(), "owner"),
      projectDoc(projectId, userId, "admin"),
    ];
    let cursor = 0;
    const calls = stub({
      project: null,
      profile: { fullName: "Ada", img: "https://cdn.example/a.png", email: "hidden@example.com" },
      canvasResult: canvasDoc(),
      findImpl: () => Promise.resolve(cases[cursor++]),
    });
    const socket = createSocket(userId);
    attach(socket, calls);

    for (let index = 0; index < cases.length; index += 1) {
      const ack = ackCapture();
      await socket.handler("workspace:join")({ projectId, tabId: TAB, userId: id(), role: "owner" }, ack);
      assert.deepEqual(Object.keys(ack.calls[0]).sort(), ["message", "ok"]);
      assert.deepEqual(ack.calls[0], { ok: false, message: "Project not found" });
    }
    assert.equal(calls.update.length, 0);
    assert.equal(calls.user, 0);
    assert.equal(calls.find.length, cases.length);
  });

  it("returns the normalized snapshot once and canonicalizes ids", async () => {
    const userId = id();
    const projectId = id();
    const calls = stub({
      project: projectDoc(projectId, userId, "owner"),
      profile: { fullName: "Ada", img: "https://cdn.example/a.png", email: "hidden@example.com", clerkId: "clerk" },
      canvasResult: canvasDoc(7),
    });
    const socket = createSocket(userId);
    const registry = attach(socket, calls);
    const ack = ackCapture();
    const projectKey = projectId.toUpperCase();
    const tabKey = TAB.toUpperCase();

    await socket.handler("workspace:join")({
      projectId: projectKey,
      tabId: tabKey,
      userId: id(),
      role: "viewer",
      fullName: "Imposter",
    }, ack);

    assert.equal(ack.calls.length, 1);
    const body = ack.calls[0];
    assert.equal(body.ok, true);
    assert.deepEqual(Object.keys(body).sort(), ["canvas", "ok", "participants", "project", "role", "serverNow", "turn"]);
    assert.deepEqual(Object.keys(body.project).sort(), ["_id", "description", "name"]);
    assert.equal(body.project._id, projectId);
    assert.equal(body.role, "owner");
    assert.deepEqual(body.participants, [{
      userId,
      fullName: "Ada",
      img: "https://cdn.example/a.png",
      role: "owner",
    }]);
    assert.equal(JSON.stringify(body.participants).includes("hidden@"), false);
    assert.equal(JSON.stringify(body.participants).includes("clerk"), false);
    assert.equal(body.turn, null);
    assert.equal(Number.isFinite(body.serverNow), true);
    assert.equal(body.canvas.version, 7);
    assert.equal(body.canvas.nodes.length, 1);
    assert.equal(body.canvas.nodes[0].id, "n1");
    assert.equal(body.canvas.edges.length, 1);
    assert.equal(body.canvas.edges[0].data.label, "goes");
    assert.equal(Object.hasOwn(body.canvas, "_id"), false);
    assert.equal(socket.rooms.has(`project:${projectId}`), true);
    assert.equal(socket.rooms.has(userId), true);

    const room = registry.getRoom(projectId);
    assert.equal(room.connections.get(socket.id).tabId, TAB);
    assert.equal(room.members.get(userId).fullName, "Ada");
    assert.equal(room.members.get(userId).img, "https://cdn.example/a.png");
    assert.equal(Object.hasOwn(room.members.get(userId), "email"), false);

    const [filter, update, options] = calls.update[0];
    assert.equal(filter.project, projectId);
    assert.deepEqual(update, { $setOnInsert: { project: projectId, nodes: [], edges: [], version: 0 } });
    assert.equal(options.upsert, true);
    assert.equal(options.returnDocument, "after");
    assert.equal(options.runValidators, true);
    assert.equal(Object.hasOwn(update, "$set"), false);

    const again = ackCapture();
    await socket.handler("workspace:join")({ projectId, tabId: TAB }, again);
    assert.equal(again.calls[0].ok, true);
    assert.equal(calls.find.length, 2);
    assert.equal(calls.update.length, 1);
    assert.equal(room.connections.size, 1);
  });

  it("reads an existing canvas after duplicate key 11000 and does not swallow other write errors", async () => {
    const userId = id();
    const projectId = id();
    let updateCount = 0;
    const calls = stub({
      project: projectDoc(projectId, userId, "editor"),
      profile: { fullName: "Ada", img: "" },
      canvasResult: canvasDoc(5),
      updateImpl: () => ({
        lean: () => {
          updateCount += 1;
          if (updateCount === 1) {
            const error = new Error("E11000 duplicate key");
            error.code = 11000;
            return Promise.reject(error);
          }
          const error = new Error("not primary");
          error.code = 10107;
          return Promise.reject(error);
        },
      }),
    });
    const socket = createSocket(userId);
    attach(socket, calls);
    const logs = [];
    const original = console.error;
    console.error = (...args) => logs.push(args.join(" "));

    try {
      const first = ackCapture();
      await socket.handler("workspace:join")({ projectId, tabId: TAB }, first);
      assert.equal(first.calls[0].ok, true);
      assert.equal(first.calls[0].canvas.version, 5);
      assert.equal(calls.read, 1);
      await socket.handler("workspace:leave")({ projectId });

      const second = ackCapture();
      await socket.handler("workspace:join")({ projectId, tabId: TAB }, second);
      assert.deepEqual(second.calls, [{ ok: false, message: "Unable to open workspace" }]);
      assert.equal(calls.read, 1);
      assert.equal(logs.some((line) => line.includes("not primary")), true);
      assert.equal(socket.rooms.has(`project:${projectId}`), false);
    } finally {
      console.error = original;
    }
  });

  it("defaults a missing version and fails a malformed one", async () => {
    const userId = id();
    const projectId = id();
    const docs = [{ ...canvasDoc(0), version: undefined }, { ...canvasDoc(0), version: 1.5 }, canvasDoc(2)];
    let cursor = 0;
    const calls = stub({
      project: projectDoc(projectId, userId, "viewer"),
      profile: { fullName: "Ada", img: "" },
      canvasResult: null,
      updateImpl: () => query(docs[cursor++]),
    });
    const socket = createSocket(userId);
    attach(socket, calls);
    const original = console.error;
    console.error = () => {};
    try {
      const missing = ackCapture();
      await socket.handler("workspace:join")({ projectId, tabId: TAB }, missing);
      assert.equal(missing.calls[0].canvas.version, 0);
      await socket.handler("workspace:leave")({ projectId });

      const malformed = ackCapture();
      await socket.handler("workspace:join")({ projectId, tabId: TAB }, malformed);
      assert.deepEqual(malformed.calls, [{ ok: false, message: "Unable to open workspace" }]);

      const retry = ackCapture();
      await socket.handler("workspace:join")({ projectId, tabId: TAB }, retry);
      assert.equal(retry.calls[0].ok, true);
      assert.equal(retry.calls[0].canvas.version, 2);
      assert.equal(retry.calls[0].role, "viewer");
    } finally {
      console.error = original;
    }
  });

  it("cancels join A when leave A arrives before lookup resolves", async () => {
    const userId = id();
    const projectId = id();
    const gate = defer();
    const calls = stub({
      project: projectDoc(projectId, userId, "owner"),
      profile: { fullName: "Ada", img: "" },
      canvasResult: canvasDoc(),
      findImpl: () => gate.promise,
    });
    const socket = createSocket(userId);
    const registry = attach(socket, calls);
    const ack = ackCapture();
    const pending = socket.handler("workspace:join")({ projectId, tabId: TAB }, ack);
    await settle();
    const leaving = socket.handler("workspace:leave")({ projectId });
    gate.resolve(projectDoc(projectId, userId, "owner"));
    await pending;
    await leaving;

    assert.deepEqual(ack.calls, [{ ok: false, message: "Workspace request superseded" }]);
    assert.equal(calls.update.length, 0);
    assert.equal(registry.getRoom(projectId), null);
    assert.equal(socket.rooms.has(userId), true);
  });

  it("lets a delayed join A lose to join B and ignores a later leave A", async () => {
    const userId = id();
    const projectA = id();
    const projectB = id();
    const gates = new Map();
    const calls = stub({
      project: null,
      profile: { fullName: "Ada", img: "" },
      canvasResult: canvasDoc(3),
      findImpl: (projectId) => {
        const gate = defer();
        gates.set(projectId, gate);
        return gate.promise;
      },
    });
    const socket = createSocket(userId);
    const registry = attach(socket, calls);
    const ackA = ackCapture();
    const ackB = ackCapture();
    const first = socket.handler("workspace:join")({ projectId: projectA, tabId: TAB }, ackA);
    await settle();
    const second = socket.handler("workspace:join")({ projectId: projectB, tabId: TAB }, ackB);
    gates.get(projectA).resolve(projectDoc(projectA, userId, "owner"));
    await settle();
    gates.get(projectB).resolve(projectDoc(projectB, userId, "editor"));
    await first;
    await second;
    await socket.handler("workspace:leave")({ projectId: projectA });

    assert.deepEqual(ackA.calls, [{ ok: false, message: "Workspace request superseded" }]);
    assert.equal(ackB.calls[0].ok, true);
    assert.equal(ackB.calls[0].project._id, projectB);
    assert.equal(ackB.calls[0].role, "editor");
    assert.equal(socket.rooms.has(`project:${projectA}`), false);
    assert.equal(socket.rooms.has(`project:${projectB}`), true);
    assert.equal(socket.rooms.has(userId), true);
    assert.equal(registry.getRoom(projectB).connections.has(socket.id), true);
    assert.equal(registry.getRoom(projectA), null);
  });

  it("keeps one connection across a strict-mode join, leave, and join", async () => {
    const userId = id();
    const projectId = id();
    const gates = [];
    const calls = stub({
      project: projectDoc(projectId, userId, "owner"),
      profile: { fullName: "Ada", img: "" },
      canvasResult: canvasDoc(1),
      findImpl: () => {
        const gate = defer();
        gates.push(gate);
        return gate.promise;
      },
    });
    const socket = createSocket(userId);
    const registry = attach(socket, calls);
    const firstAck = ackCapture();
    const secondAck = ackCapture();
    const first = socket.handler("workspace:join")({ projectId, tabId: TAB }, firstAck);
    await settle();
    const leaving = socket.handler("workspace:leave")({ projectId });
    const second = socket.handler("workspace:join")({ projectId, tabId: TAB }, secondAck);
    gates[0].resolve(projectDoc(projectId, userId, "owner"));
    await settle();
    gates[1].resolve(projectDoc(projectId, userId, "owner"));
    await first;
    await leaving;
    await second;

    assert.deepEqual(firstAck.calls, [{ ok: false, message: "Workspace request superseded" }]);
    assert.equal(secondAck.calls[0].ok, true);
    assert.equal(secondAck.calls.length, 1);
    const room = registry.getRoom(projectId);
    assert.equal(room.connections.size, 1);
    assert.equal(room.members.size, 1);
    assert.equal(socket.rooms.has(`project:${projectId}`), true);
  });

  it("releases a room when the socket disconnects during canvas initialization", async () => {
    const userId = id();
    const projectId = id();
    const gate = defer();
    const calls = stub({
      project: projectDoc(projectId, userId, "owner"),
      profile: { fullName: "Ada", img: "" },
      canvasResult: canvasDoc(),
      updateImpl: () => ({ lean: () => gate.promise }),
    });
    const socket = createSocket(userId);
    const registry = attach(socket, calls);
    const ack = ackCapture();
    const pending = socket.handler("workspace:join")({ projectId, tabId: TAB }, ack);
    await settle();
    socket.connected = false;
    await socket.handler("disconnecting")("transport close");
    gate.resolve(canvasDoc());
    await pending;

    assert.equal(ack.calls.length, 0);
    assert.equal(registry.getRoom(projectId), null);
    assert.equal(socket.leaves.includes(userId), false);
    assert.equal(socket.rooms.has(userId), true);
  });

  it("does not evict a room while another join still holds its lease", async () => {
    const userA = id();
    const userB = id();
    const projectId = id();
    const calls = stub({
      project: null,
      profile: { fullName: "Ada", img: "" },
      canvasResult: canvasDoc(8),
      findImpl: (requested, requester) => Promise.resolve(
        projectDoc(requested, requester, requester === userA ? "owner" : "editor"),
      ),
    });
    const registry = createWorkspaceRegistry();
    const socketA = createSocket(userA, "socket-a");
    const socketB = createSocket(userB, "socket-b");
    socketB.joinGate = defer();
    attach(socketA, calls, registry);
    attach(socketB, calls, registry);

    const ackA = ackCapture();
    await socketA.handler("workspace:join")({ projectId, tabId: TAB }, ackA);
    assert.equal(ackA.calls[0].ok, true);

    const ackB = ackCapture();
    const pendingB = socketB.handler("workspace:join")({ projectId, tabId: TAB }, ackB);
    await settle();
    await socketA.handler("workspace:leave")({ projectId });
    assert.equal(registry.getRoom(projectId)?.canvas.version, 8);

    socketB.joinGate.resolve();
    await pendingB;
    assert.equal(ackB.calls[0].ok, true);
    assert.equal(ackB.calls[0].role, "editor");
    const room = registry.getRoom(projectId);
    assert.equal(room.connections.has("socket-a"), false);
    assert.equal(room.connections.has("socket-b"), true);
    assert.equal(room.members.has(userB), true);
    assert.equal(socketA.rooms.has(userA), true);
    assert.equal(socketB.rooms.has(userB), true);
  });

  it("rolls back an adapter join that throws and still accepts the next join", async () => {
    const userId = id();
    const projectId = id();
    const calls = stub({
      project: projectDoc(projectId, userId, "owner"),
      profile: { fullName: "Ada", img: "" },
      canvasResult: canvasDoc(1),
    });
    const socket = createSocket(userId);
    const registry = attach(socket, calls);
    socket.joinError = new Error("adapter down");
    const original = console.error;
    console.error = () => {};
    try {
      const failed = ackCapture();
      await socket.handler("workspace:join")({ projectId, tabId: TAB }, failed);
      assert.deepEqual(failed.calls, [{ ok: false, message: "Unable to open workspace" }]);
      assert.equal(socket.joinedBeforeError, true);
      assert.equal(registry.getRoom(projectId), null);
      assert.equal(socket.rooms.has(`project:${projectId}`), false);
      assert.equal(socket.leaves.includes(`project:${projectId}`), true);
      assert.equal(socket.rooms.has(userId), true);

      socket.joinError = null;
      const next = ackCapture();
      await socket.handler("workspace:join")({ projectId, tabId: TAB }, next);
      assert.equal(next.calls[0].ok, true);
      assert.equal(registry.getRoom(projectId).connections.size, 1);
      assert.equal(socket.rooms.has(`project:${projectId}`), true);
      assert.equal(socket.rooms.has(userId), true);
    } finally {
      console.error = original;
    }
  });

  it("clears the previous room when the replacement join is denied", async () => {
    const userId = id();
    const projectA = id();
    const projectB = id();
    const calls = stub({
      project: null,
      profile: { fullName: "Ada", img: "" },
      canvasResult: canvasDoc(),
      findImpl: (requested) => Promise.resolve(requested === projectA ? projectDoc(projectA, userId, "owner") : null),
    });
    const socket = createSocket(userId);
    const registry = attach(socket, calls);
    const first = ackCapture();
    await socket.handler("workspace:join")({ projectId: projectA, tabId: TAB }, first);
    const second = ackCapture();
    await socket.handler("workspace:join")({ projectId: projectB, tabId: TAB }, second);

    assert.equal(first.calls[0].ok, true);
    assert.deepEqual(second.calls, [{ ok: false, message: "Project not found" }]);
    assert.equal(socket.rooms.has(`project:${projectA}`), false);
    assert.equal(socket.rooms.has(`project:${projectB}`), false);
    assert.equal(socket.rooms.has(userId), true);
    assert.equal(registry.getRoom(projectA), null);
    assert.equal(registry.getRoom(projectB), null);
  });

  it("tracks two users independently and removes only the one who leaves", async () => {
    const userA = id();
    const userB = id();
    const projectId = id();
    const calls = stub({
      project: null,
      profile: { fullName: "Ada", img: "" },
      canvasResult: canvasDoc(6),
      findImpl: (requested, requester) => Promise.resolve(projectDoc(requested, requester, "owner")),
    });
    const registry = createWorkspaceRegistry();
    const socketA = createSocket(userA, "socket-a");
    const socketB = createSocket(userB, "socket-b");
    attach(socketA, calls, registry);
    attach(socketB, calls, registry);

    await socketA.handler("workspace:join")({ projectId, tabId: TAB }, ackCapture());
    await socketB.handler("workspace:join")({ projectId, tabId: "123e4567-e89b-41d3-a456-426614174001" }, ackCapture());
    const room = registry.getRoom(projectId);
    assert.equal(room.connections.size, 2);
    assert.equal(room.members.size, 2);

    await socketA.handler("workspace:leave")({ projectId: "nope" });
    await socketA.handler("workspace:leave")({ projectId });
    await socketA.handler("workspace:leave")({ projectId });
    assert.equal(registry.getRoom(projectId).connections.has("socket-b"), true);
    assert.equal(registry.getRoom(projectId).members.has(userA), false);
    assert.equal(socketA.rooms.has(`project:${projectId}`), false);
    assert.equal(socketA.rooms.has(userA), true);
    assert.equal(socketB.rooms.has(`project:${projectId}`), true);

    socketB.connected = false;
    await socketB.handler("disconnecting")();
    assert.equal(registry.getRoom(projectId), null);
    assert.equal(socketB.leaves.includes(userB), false);
    assert.equal(socketB.rooms.has(userB), true);
  });

  function presenceEmits(calls) {
    return calls.io.emits.filter((entry) => entry.event === "presence:update");
  }

  it("acks the joiner in a non-volatile project roster and does not query again to publish it", async () => {
    const userId = id();
    const projectId = id();
    const calls = stub({
      project: projectDoc(projectId, userId, "viewer"),
      profile: { fullName: "Ada", img: "", email: "hidden@example.com", clerkId: "clerk" },
      canvasResult: canvasDoc(2),
    });
    const socket = createSocket(userId);
    attach(socket, calls);
    const ack = ackCapture();
    const beforeUser = calls.user;
    const beforeUpdate = calls.update.length;

    await socket.handler("workspace:join")({ projectId, tabId: TAB }, ack);

    assert.equal(ack.calls[0].role, "viewer");
    assert.deepEqual(ack.calls[0].participants, [{
      userId,
      fullName: "Ada",
      img: "",
      role: "viewer",
    }]);
    assert.equal(calls.user, beforeUser + 1);
    assert.equal(calls.update.length, beforeUpdate + 1);
    const presence = presenceEmits(calls);
    assert.equal(presence.length, 1);
    assert.equal(presence[0].room, `project:${projectId}`);
    assert.equal(presence[0].volatile, false);
    assert.equal(presence[0].global, false);
    assert.deepEqual(Object.keys(presence[0].payload).sort(), ["participants", "projectId"]);
    assert.deepEqual(presence[0].payload.participants, ack.calls[0].participants);
    assert.equal(JSON.stringify(presence[0].payload).includes("hidden@"), false);
    assert.equal(JSON.stringify(presence[0].payload).includes("clerk"), false);
    assert.equal(calls.io.emits.some((entry) => entry.global), false);
  });

  it("keeps one user across tabs and publishes departure only for the last tab", async () => {
    const userId = id();
    const projectId = id();
    const calls = stub({
      project: projectDoc(projectId, userId, "editor"),
      profile: { fullName: "Ada", img: "https://cdn.example/a.png" },
      canvasResult: canvasDoc(1),
    });
    const registry = createWorkspaceRegistry();
    const first = createSocket(userId, "tab-1");
    const second = createSocket(userId, "tab-2");
    attach(first, calls, registry);
    attach(second, calls, registry);
    const secondTab = "123e4567-e89b-41d3-a456-426614174001";

    await first.handler("workspace:join")({ projectId, tabId: TAB }, ackCapture());
    assert.equal(calls.update.length, 1);
    await second.handler("workspace:join")({ projectId, tabId: secondTab }, ackCapture());
    assert.equal(calls.update.length, 1);
    assert.equal(calls.user, 2);
    let presence = presenceEmits(calls);
    assert.equal(presence.length, 2);
    assert.deepEqual(presence[1].payload.participants.map((person) => person.userId), [userId]);

    const order = [];
    const originalLeave = first.leave.bind(first);
    first.leave = async (room) => {
      order.push(`leave:${room}`);
      return originalLeave(room);
    };
    const realTo = calls.io.to.bind(calls.io);
    calls.io.to = (room) => {
      const operator = realTo(room);
      const emit = operator.emit.bind(operator);
      operator.emit = (event, payload) => {
        if (event === "presence:update") order.push(`presence:${payload.participants.length}`);
        return emit(event, payload);
      };
      return operator;
    };

    const beforeLeave = presenceEmits(calls).length;
    await first.handler("workspace:leave")({ projectId: id() });
    assert.equal(presenceEmits(calls).length, beforeLeave);
    await first.handler("workspace:leave")({ projectId });
    presence = presenceEmits(calls);
    assert.equal(presence.at(-1).payload.participants.length, 1);
    assert.deepEqual(order, [`presence:1`, `leave:project:${projectId}`]);
    assert.equal(registry.getParticipants(projectId).length, 1);

    second.connected = false;
    await second.handler("disconnecting")();
    presence = presenceEmits(calls);
    assert.deepEqual(presence.at(-1).payload, { projectId, participants: [] });
    assert.equal(registry.getRoom(projectId), null);
    assert.equal(calls.user, 2);
    assert.equal(calls.update.length, 1);
  });

  it("refreshes a same-project rejoin and notifies both rooms when the project changes", async () => {
    const userId = id();
    const projectA = id();
    const projectB = id();
    const profile = { fullName: "Ada", img: "" };
    const calls = stub({
      project: null,
      profile,
      canvasResult: canvasDoc(1),
      findImpl: (requested) => Promise.resolve(projectDoc(requested, userId, requested === projectA ? "owner" : "editor")),
    });
    const socket = createSocket(userId);
    const registry = attach(socket, calls);

    await socket.handler("workspace:join")({ projectId: projectA, tabId: TAB }, ackCapture());
    profile.fullName = "Ada Lovelace";
    const rejoined = ackCapture();
    await socket.handler("workspace:join")({ projectId: projectA, tabId: TAB }, rejoined);
    assert.equal(rejoined.calls[0].participants[0].fullName, "Ada Lovelace");
    assert.equal(rejoined.calls[0].participants[0].role, "owner");
    assert.equal(registry.getRoom(projectA).members.get(userId).fullName, "Ada Lovelace");

    const switched = ackCapture();
    await socket.handler("workspace:join")({ projectId: projectB, tabId: TAB }, switched);
    assert.equal(switched.calls[0].ok, true);
    assert.deepEqual(switched.calls[0].participants, [{
      userId,
      fullName: "Ada Lovelace",
      img: "",
      role: "editor",
    }]);
    const presence = presenceEmits(calls);
    const rooms = presence.map((entry) => entry.room);
    assert.equal(rooms.filter((room) => room === `project:${projectA}`).length >= 1, true);
    assert.equal(presence.some((entry) => entry.room === `project:${projectA}` && entry.payload.participants.length === 0), true);
    assert.equal(presence.some((entry) => entry.room === `project:${projectB}` && entry.payload.participants.length === 1), true);
    assert.equal(registry.getRoom(projectA), null);
    assert.equal(registry.getParticipants(projectB)[0].role, "editor");
  });

  it("does not announce a join that never attaches", async () => {
    const userId = id();
    const insider = id();
    const projectId = id();
    const calls = stub({
      project: null,
      profile: { fullName: "Ada", img: "" },
      canvasResult: canvasDoc(1),
      findImpl: (requested, requester) => Promise.resolve(
        requester === insider ? projectDoc(requested, insider, "owner") : null,
      ),
    });
    const registry = createWorkspaceRegistry();
    const member = createSocket(insider, "member");
    const outsider = createSocket(userId, "outsider");
    attach(member, calls, registry);
    attach(outsider, calls, registry);
    await member.handler("workspace:join")({ projectId, tabId: TAB }, ackCapture());
    const before = presenceEmits(calls).length;

    const denied = ackCapture();
    await outsider.handler("workspace:join")({ projectId, tabId: TAB }, denied);
    assert.deepEqual(denied.calls, [{ ok: false, message: "Project not found" }]);
    assert.equal(presenceEmits(calls).length, before);
    assert.deepEqual(registry.getParticipants(projectId).map((person) => person.userId), [insider]);

    const gate = defer();
    calls.findProjectForMember = () => gate.promise;
    const pendingSocket = createSocket(insider, "pending");
    attach(pendingSocket, calls, registry);
    const pendingAck = ackCapture();
    const pending = pendingSocket.handler("workspace:join")({ projectId, tabId: "123e4567-e89b-41d3-a456-426614174002" }, pendingAck);
    await settle();
    const leaving = pendingSocket.handler("workspace:leave")({ projectId });
    gate.resolve(projectDoc(projectId, insider, "editor"));
    await pending;
    await leaving;
    assert.deepEqual(pendingAck.calls, [{ ok: false, message: "Workspace request superseded" }]);
    assert.equal(presenceEmits(calls).length, before);
    assert.deepEqual(registry.getParticipants(projectId).map((person) => person.userId), [insider]);

    pendingSocket.joinError = new Error("adapter down");
    const original = console.error;
    console.error = () => {};
    try {
      const failed = ackCapture();
      calls.findProjectForMember = (requested, requester) => Promise.resolve(
        projectDoc(requested, requester, "editor"),
      );
      await pendingSocket.handler("workspace:join")({ projectId, tabId: TAB }, failed);
      assert.deepEqual(failed.calls, [{ ok: false, message: "Unable to open workspace" }]);
      assert.equal(presenceEmits(calls).length, before);
      assert.equal(registry.getParticipants(projectId).some((person) => person.userId === insider), true);
      assert.equal(registry.getRoom(projectId).connections.has(pendingSocket.id), false);
    } finally {
      console.error = original;
    }
  });
});
