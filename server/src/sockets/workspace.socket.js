import Canvas from "../models/canvas.model.js";
import User from "../models/user.model.js";
import * as projectAccess from "../lib/projectAccess.js";
import { safeHandler } from "../lib/safeHandler.js";
import { applyOps, MAX_OPS_PER_COMMIT, normalizeCanvas, ID_PATTERN, POSITION_MAX, NODE_SIZE_MIN, NODE_SIZE_MAX } from "../shared/canvasOps.js";
import { can } from "../lib/projectAccess.js";
import { createSerialQueue, workspaceRegistry } from "../lib/workspaceRooms.js";

// REST uses the same sentence for a bad id, a missing project, and a non-member.
const PROJECT_NOT_FOUND = { ok: false, message: "Project not found" };
const INVALID_REQUEST = { ok: false, message: "Invalid workspace request" };
const INVALID_CANVAS = { ok: false, message: "Invalid canvas request" };
const CANNOT_EDIT = { ok: false, message: "You cannot edit this canvas" };
const VERSION_MISMATCH = "Canvas version mismatch";
const SUPERSEDED = { ok: false, message: "Workspace request superseded" };
const UNAVAILABLE = { ok: false, message: "Unable to open workspace" };
const UNABLE_SAVE = { ok: false, message: "Unable to save canvas" };
const UNABLE_SYNC = { ok: false, message: "Unable to sync canvas" };

// A failed compare-and-set reload, or a write whose acknowledgement never
// arrived, leaves the cache untrustworthy. The flag lives with the room
// object, which dies when the room is evicted, so a later first join loads
// from the database instead of inheriting it.
const refreshRequired = new WeakSet();

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const lifecycles = new WeakMap();

const defaultDeps = {
  findProjectForMember: (projectId, userId) => projectAccess.findProjectForMember(projectId, userId),
  roleOf: (project, userId) => projectAccess.roleOf(project, userId),
};

function isRecord(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function roomName(projectId) {
  return `project:${projectId}`;
}

function isDuplicateKey(error) {
  return error?.code === 11000 || error?.cause?.code === 11000 || error?.errorResponse?.code === 11000;
}

function readVersion(doc) {
  if (!Object.hasOwn(doc, "version") || doc.version === undefined || doc.version === null) return 0;
  if (typeof doc.version !== "number" || !Number.isInteger(doc.version) || doc.version < 0) {
    throw new Error("Malformed canvas version");
  }
  return doc.version;
}

function writableVersion(value) {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value < Number.MAX_SAFE_INTEGER;
}

function readUserId(socket) {
  return typeof socket.data?.userId === "string" && OBJECT_ID.test(socket.data.userId)
    ? socket.data.userId.toLowerCase()
    : null;
}

function logHandler(event, error) {
  console.error(`Error in socket handler (${event}):`, error.message);
}

// The ack is the caller's. A throw inside it, a dead socket, or a socket whose
// id was replaced must not roll back a write that already succeeded.
function replyTo(socket, ack, event) {
  const socketId = socket.id;
  let settled = false;
  return (body) => {
    if (settled) return;
    settled = true;
    if (!socket.connected || socket.id !== socketId) return;
    try {
      ack(body);
    } catch (error) {
      logHandler(event, error);
    }
  };
}

function canvasSnapshot(canvas) {
  return {
    nodes: canvas.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      width: node.width,
      height: node.height,
      data: {
        label: node.data.label,
        shape: node.data.shape,
        color: node.data.color,
        textColor: node.data.textColor,
      },
    })),
    edges: canvas.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: edge.type,
      data: { label: edge.data.label },
    })),
    version: canvas.version,
  };
}

function validCommitEnvelope(payload) {
  if (!Object.hasOwn(payload, "baseVersion") || !Object.hasOwn(payload, "ops")) return false;
  if (!writableVersion(payload.baseVersion)) return false;
  return Array.isArray(payload.ops)
    && payload.ops.length >= 1
    && payload.ops.length <= MAX_OPS_PER_COMMIT;
}

// Edit rights follow the connection object stored on the room, not a payload
// and not a lookalike with the same fields. Turn checks arrive in S20; until
// then an owner or editor connection may write.
export function canWrite(room, connection) {
  if (!room || !connection || typeof connection !== "object") return false;
  if (!room.connections || typeof room.connections.values !== "function") return false;
  let stored = false;
  for (const current of room.connections.values()) {
    if (current === connection) {
      stored = true;
      break;
    }
  }
  if (!stored) return false;
  const member = room.members?.get(connection.userId);
  return Boolean(member) && projectAccess.can(member.role, "edit") === true;
}

function sameAttempt(socket, state, room, captured) {
  return socket.connected
    && socket.id === captured.socketId
    && state.generation === captured.generation
    && state.activeProjectId === captured.projectId
    && socket.rooms.has(roomName(captured.projectId))
    && room.connections.get(captured.socketId) === captured.connection
    && captured.connection.userId === captured.userId;
}

async function reloadCanvas(room, projectId, event) {
  let doc;
  try {
    doc = await Canvas.findOne({ project: projectId }).lean();
  } catch (error) {
    logHandler(event, error);
    refreshRequired.add(room);
    return { ok: false, status: "operational" };
  }

  if (!doc || typeof doc !== "object") {
    refreshRequired.add(room);
    return { ok: false, status: "missing" };
  }

  try {
    const normalized = normalizeCanvas(doc);
    room.canvas = {
      nodes: normalized.nodes,
      edges: normalized.edges,
      version: readVersion(doc),
    };
    refreshRequired.delete(room);
    return { ok: true };
  } catch (error) {
    logHandler(event, error);
    refreshRequired.add(room);
    return { ok: false, status: "operational" };
  }
}

function reloadFailure(status, event) {
  if (status === "missing") return PROJECT_NOT_FOUND;
  return event === "canvas:sync" ? UNABLE_SYNC : UNABLE_SAVE;
}

async function ensureFreshCanvas(room, projectId, event) {
  if (!refreshRequired.has(room)) return { ok: true };
  const loaded = await reloadCanvas(room, projectId, event);
  if (!loaded.ok) return { ok: false, body: reloadFailure(loaded.status, event) };
  return { ok: true };
}

// Join creates a missing canvas and never rewrites one that already exists.
async function loadWorkspaceCanvas(projectId) {
  let doc;
  try {
    doc = await Canvas.findOneAndUpdate(
      { project: projectId },
      { $setOnInsert: { project: projectId, nodes: [], edges: [], version: 0 } },
      { upsert: true, returnDocument: "after", runValidators: true },
    ).lean();
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    doc = await Canvas.findOne({ project: projectId }).lean();
  }

  if (!doc || typeof doc !== "object") throw new Error("Canvas lookup failed");
  const normalized = normalizeCanvas(doc);
  return { nodes: normalized.nodes, edges: normalized.edges, version: readVersion(doc) };
}

function getLifecycle(socket) {
  let state = lifecycles.get(socket);
  if (!state) {
    state = {
      generation: 0,
      intent: null,
      activeProjectId: null,
      // Generation of the join that finished. Leave and rejoin clear it
      // immediately; registry removal can still be waiting on the socket queue.
      joinedGeneration: null,
      queue: createSerialQueue(),
    };
    lifecycles.set(socket, state);
  }
  return state;
}

function isCurrent(state, generation) {
  return state.generation === generation
    && state.intent?.kind === "join"
    && state.intent.generation === generation;
}

function replyOnce(socket, ack) {
  let settled = false;
  return (body) => {
    if (settled) return;
    settled = true;
    // A disconnected caller is waiting on its own timeout. Acking into a dead
    // socket, or letting the ack throw, must not change cleanup.
    if (!socket.connected) return;
    try {
      ack(body);
    } catch (error) {
      console.error("Error in socket handler (workspace:join):", error.message);
    }
  };
}

// The roster is taken after the registry change and sent before adapter leave.
// A disconnecting socket is already not connected, so this goes through io
// rather than the socket. A throw in a listener must not skip the leave or
// roll back a join that has already been acknowledged.
function publishPresence(io, registry, projectId) {
  const participants = registry.getParticipants(projectId).map((person) => ({
    userId: person.userId,
    fullName: person.fullName,
    img: person.img,
    role: person.role,
  }));
  try {
    io.to(roomName(projectId)).emit("presence:update", { projectId, participants });
  } catch (error) {
    logHandler("presence:update", error);
  }
}

async function detach(io, registry, socket, state, projectId, socketId) {
  const removed = registry.removeConnection(projectId, socketId);
  if (state.activeProjectId === projectId) state.activeProjectId = null;
  if (removed) publishPresence(io, registry, projectId);
  if (socket.connected) await socket.leave(roomName(projectId));
}

function projectSummary(project) {
  return {
    _id: String(project._id).toLowerCase(),
    name: typeof project.name === "string" ? project.name : "",
    description: typeof project.description === "string" ? project.description : "",
  };
}

function memberProfile(profile) {
  return {
    fullName: typeof profile.fullName === "string" ? profile.fullName : "",
    img: typeof profile.img === "string" ? profile.img : "",
  };
}

async function runJoin(io, socket, registry, deps, state, generation, projectId, tabId, userId, reply) {
  const socketId = socket.id;
  let handle = null;
  let adapterJoined = false;
  let attached = false;

  const stale = () => !isCurrent(state, generation) || !socket.connected || socket.id !== socketId;

  const rollback = async () => {
    const removed = registry.removeConnection(projectId, socketId);
    if (state.activeProjectId === projectId) state.activeProjectId = null;
    if (state.joinedGeneration === generation) state.joinedGeneration = null;
    attached = false;
    // Entering the adapter room is not a connection. Announce only the socket
    // that was actually stored, and never a different member of the room.
    if (removed) publishPresence(io, registry, projectId);
    if (adapterJoined && socket.connected) {
      adapterJoined = false;
      await socket.leave(roomName(projectId));
    }
  };

  try {
    if (stale()) {
      reply(SUPERSEDED);
      return;
    }

    // A failed replacement must not leave the previous project joined.
    if (state.activeProjectId && state.activeProjectId !== projectId) {
      await detach(io, registry, socket, state, state.activeProjectId, socket.id);
      if (stale()) {
        reply(SUPERSEDED);
        return;
      }
    }

    const project = await deps.findProjectForMember(projectId, userId);
    if (stale()) {
      reply(SUPERSEDED);
      return;
    }
    const role = deps.roleOf(project, userId);
    if (!project || !role) {
      if (isCurrent(state, generation) && state.activeProjectId) {
        await detach(io, registry, socket, state, state.activeProjectId, socket.id);
      }
      reply(PROJECT_NOT_FOUND);
      return;
    }

    const profile = await User.findById(userId).select("fullName img").lean();
    if (stale()) {
      reply(SUPERSEDED);
      return;
    }
    if (!profile) {
      if (isCurrent(state, generation) && state.activeProjectId) {
        await detach(io, registry, socket, state, state.activeProjectId, socket.id);
      }
      reply(PROJECT_NOT_FOUND);
      return;
    }

    handle = await registry.acquire(projectId, loadWorkspaceCanvas);
    if (stale()) {
      reply(SUPERSEDED);
      return;
    }

    // Subscribe and take the snapshot on the room write queue. A commit that
    // is already running finishes first, so it is inside the snapshot and its
    // broadcast happens before this socket joins. A commit queued behind this
    // job broadcasts only after the ack. Leave and disconnect do not enter
    // this queue: they bump the generation, and this job treats that as stale,
    // so the two queues cannot wait on each other.
    const published = await handle.room.writeQueue(async () => {
      if (stale()) return "superseded";
      if (refreshRequired.has(handle.room)) {
        const loaded = await reloadCanvas(handle.room, projectId, "workspace:join");
        if (stale()) return "superseded";
        if (!loaded.ok) throw new Error("Canvas reload failed");
      }

      const canvas = canvasSnapshot(handle.room.canvas);

      // The adapter can add the project room and then reject. Count the
      // attempt before the await so that failure still leaves this room. The
      // per-user chat room is never named here.
      adapterJoined = true;
      await socket.join(roomName(projectId));
      if (stale()) return "superseded";

      const profileFields = memberProfile(profile);
      const added = registry.addConnection(projectId, socketId, {
        userId,
        tabId,
        role,
        fullName: profileFields.fullName,
        img: profileFields.img,
      });
      if (!added) throw new Error("Workspace room missing");
      attached = true;
      state.activeProjectId = projectId;
      if (stale()) return "superseded";
      // Publish authority only for the join that is still current. A rejoin
      // can be inside this queue and already have cleared the previous one.
      state.joinedGeneration = generation;

      const participants = registry.getParticipants(projectId);
      reply({
        ok: true,
        project: projectSummary(project),
        role,
        canvas,
        participants,
        turn: null,
        serverNow: Date.now(),
      });
      publishPresence(io, registry, projectId);
      attached = false;
      adapterJoined = false;
      return "ok";
    });
    if (published === "superseded") reply(SUPERSEDED);
  } catch (error) {
    console.error("Error in socket handler (workspace:join):", error.message);
    if (isCurrent(state, generation) && socket.connected && socket.id === socketId) {
      if (state.activeProjectId) {
        try {
          await detach(io, registry, socket, state, state.activeProjectId, socket.id);
        } catch (detachError) {
          console.error("Error in socket handler (workspace:join):", detachError.message);
        }
      }
      reply(UNAVAILABLE);
    } else {
      reply(SUPERSEDED);
    }
  } finally {
    try {
      if (attached || adapterJoined) await rollback();
    } catch (error) {
      console.error("Error in socket handler (workspace:join):", error.message);
    }
    if (handle) handle.release();
  }
}

function onJoin(io, socket, registry, deps, payload, ack) {
  if (typeof ack !== "function") return undefined;

  const reply = replyOnce(socket, ack);
  if (!isRecord(payload)) {
    reply(INVALID_REQUEST);
    return undefined;
  }
  // A bad project id answers before the tab id is judged, matching REST.
  if (typeof payload.projectId !== "string" || !OBJECT_ID.test(payload.projectId)) {
    reply(PROJECT_NOT_FOUND);
    return undefined;
  }
  if (typeof payload.tabId !== "string" || !UUID_V4.test(payload.tabId)) {
    reply(INVALID_REQUEST);
    return undefined;
  }

  const projectId = payload.projectId.toLowerCase();
  const tabId = payload.tabId.toLowerCase();
  const userId = typeof socket.data?.userId === "string" && OBJECT_ID.test(socket.data.userId)
    ? socket.data.userId.toLowerCase()
    : null;
  if (!userId) {
    reply(PROJECT_NOT_FOUND);
    return undefined;
  }

  const state = getLifecycle(socket);
  state.generation += 1;
  const generation = state.generation;
  state.intent = { generation, projectId, kind: "join" };
  state.joinedGeneration = null;

  return state.queue(() => (
    runJoin(io, socket, registry, deps, state, generation, projectId, tabId, userId, reply)
  ));
}

function onLeave(io, socket, registry, payload) {
  if (!isRecord(payload)) return undefined;
  if (typeof payload.projectId !== "string" || !OBJECT_ID.test(payload.projectId)) return undefined;

  const projectId = payload.projectId.toLowerCase();
  const state = getLifecycle(socket);
  // Cancel only a join for this project. A leave for A must not drop an in-flight join to B.
  if (state.intent?.kind === "join" && state.intent.projectId === projectId) {
    state.generation += 1;
    state.intent = null;
    state.joinedGeneration = null;
  }

  return state.queue(async () => {
    if (state.activeProjectId !== projectId) return;
    await detach(io, registry, socket, state, projectId, socket.id);
  });
}

function joinedConnection(socket, registry, projectId, userId) {
  if (!socket.connected || !userId) return null;
  const state = getLifecycle(socket);
  // activeProjectId and the registry entry survive until queued detach runs.
  // Matching them alone lets a request after leave capture the new generation
  // and use the old connection. Authority is the completed join's generation.
  if (!isCurrent(state, state.joinedGeneration)) return null;
  if (state.activeProjectId !== projectId) return null;
  if (!socket.rooms.has(roomName(projectId))) return null;
  const room = registry.getRoom(projectId);
  const connection = room?.connections.get(socket.id);
  if (!room || !connection || connection.userId !== userId) return null;
  return { state, room, connection };
}

function acceptCanvasRequest(socket, registry, projectId, userId) {
  const joined = joinedConnection(socket, registry, projectId, userId);
  if (!joined) return null;
  const lease = registry.retain(projectId);
  if (!lease || lease.room !== joined.room) {
    if (lease) lease.release();
    return null;
  }
  return {
    ...joined,
    release: lease.release,
    captured: {
      socketId: socket.id,
      generation: joined.state.generation,
      connection: joined.connection,
      userId,
      projectId,
    },
  };
}

async function authorizeMember(socket, deps, state, room, captured, reply, event) {
  const failure = event === "canvas:sync" ? UNABLE_SYNC : UNABLE_SAVE;
  if (!sameAttempt(socket, state, room, captured)) {
    reply(SUPERSEDED);
    return null;
  }

  let project;
  try {
    project = await deps.findProjectForMember(captured.projectId, captured.userId);
  } catch (error) {
    logHandler(event, error);
    reply(sameAttempt(socket, state, room, captured) ? failure : SUPERSEDED);
    return null;
  }

  if (!sameAttempt(socket, state, room, captured)) {
    reply(SUPERSEDED);
    return null;
  }

  const role = deps.roleOf(project, captured.userId);
  const member = room.members.get(captured.userId);
  if (!project || !role || !member) {
    reply(PROJECT_NOT_FOUND);
    return null;
  }
  member.role = role;
  if (!sameAttempt(socket, state, room, captured)) {
    reply(SUPERSEDED);
    return null;
  }
  return role;
}

function finishUnknownWrite(room, socket, state, captured, reply, event) {
  refreshRequired.add(room);
  if (socket.connected && socket.id === captured.socketId) {
    reply(event === "canvas:sync" ? UNABLE_SYNC : UNABLE_SAVE);
  }
}

async function runCommit(io, socket, deps, state, room, release, captured, reply) {
  const event = "canvas:commit";
  try {
    const role = await authorizeMember(socket, deps, state, room, captured, reply, event);
    if (!role) return;
    if (!sameAttempt(socket, state, room, captured)) {
      reply(SUPERSEDED);
      return;
    }
    if (!canWrite(room, captured.connection)) {
      reply(CANNOT_EDIT);
      return;
    }

    const fresh = await ensureFreshCanvas(room, captured.projectId, event);
    if (!sameAttempt(socket, state, room, captured)) {
      reply(SUPERSEDED);
      return;
    }
    if (!fresh.ok) {
      reply(fresh.body);
      return;
    }
    if (!room.canvas || !writableVersion(room.canvas.version)) {
      reply(UNABLE_SAVE);
      return;
    }
    if (captured.baseVersion !== room.canvas.version) {
      reply({
        ok: false,
        message: VERSION_MISMATCH,
        canvas: canvasSnapshot(room.canvas),
      });
      return;
    }

    const applied = applyOps(room.canvas, captured.ops);
    if (!applied.ok) {
      if (!sameAttempt(socket, state, room, captured)) {
        reply(SUPERSEDED);
        return;
      }
      reply({
        ok: false,
        message: applied.error,
        canvas: canvasSnapshot(room.canvas),
      });
      return;
    }

    // Past this await the database round-trip has started. Leaving no longer
    // cancels it: a successful result is installed and broadcast, and only
    // the success ack is skipped when this socket is no longer the holder.
    if (!sameAttempt(socket, state, room, captured)) {
      reply(SUPERSEDED);
      return;
    }

    let result;
    try {
      result = await Canvas.updateOne(
        { project: captured.projectId, version: captured.baseVersion },
        {
          $set: {
            nodes: applied.canvas.nodes,
            edges: applied.canvas.edges,
            updatedBy: captured.userId,
          },
          $inc: { version: 1 },
        },
      );
    } catch (error) {
      logHandler(event, error);
      finishUnknownWrite(room, socket, state, captured, reply, event);
      return;
    }

    const acknowledged = Boolean(result) && result.acknowledged === true;
    if (!acknowledged || typeof result.matchedCount !== "number" || result.matchedCount > 1) {
      finishUnknownWrite(room, socket, state, captured, reply, event);
      return;
    }

    if (result.matchedCount === 0) {
      const loaded = await reloadCanvas(room, captured.projectId, event);
      if (!sameAttempt(socket, state, room, captured)) {
        reply(SUPERSEDED);
        return;
      }
      if (!loaded.ok) {
        reply(reloadFailure(loaded.status, event));
        return;
      }
      reply({
        ok: false,
        message: VERSION_MISMATCH,
        canvas: canvasSnapshot(room.canvas),
      });
      return;
    }

    const version = captured.baseVersion + 1;
    room.canvas = {
      nodes: applied.canvas.nodes,
      edges: applied.canvas.edges,
      version,
    };
    refreshRequired.delete(room);

    // Notification failures are not a failed save. The cache already matches
    // the write, and a second updateOne would apply the edit twice.
    if (sameAttempt(socket, state, room, captured)) reply({ ok: true, version });
    try {
      io.to(roomName(captured.projectId)).except(captured.socketId).emit("canvas:ops", {
        projectId: captured.projectId,
        version,
        ops: applied.ops,
        by: captured.userId,
      });
    } catch (error) {
      logHandler(event, error);
    }
  } catch (error) {
    logHandler(event, error);
    if (socket.connected && socket.id === captured.socketId) reply(UNABLE_SAVE);
  } finally {
    release();
  }
}

async function runSync(socket, deps, state, room, release, captured, reply) {
  const event = "canvas:sync";
  try {
    const role = await authorizeMember(socket, deps, state, room, captured, reply, event);
    if (!role) return;
    if (!sameAttempt(socket, state, room, captured)) {
      reply(SUPERSEDED);
      return;
    }
    if (projectAccess.can(role, "view") !== true) {
      reply(PROJECT_NOT_FOUND);
      return;
    }

    const fresh = await ensureFreshCanvas(room, captured.projectId, event);
    if (!sameAttempt(socket, state, room, captured)) {
      reply(SUPERSEDED);
      return;
    }
    if (!fresh.ok) {
      reply(fresh.body);
      return;
    }
    // Sync may return a stored version that is too large to increment.
    // A commit rejects that shape; a read must not pretend the cache is empty.
    if (!room.canvas || typeof room.canvas.version !== "number" || !Number.isInteger(room.canvas.version) || room.canvas.version < 0) {
      reply(UNABLE_SYNC);
      return;
    }
    reply({ ok: true, canvas: canvasSnapshot(room.canvas) });
  } catch (error) {
    logHandler(event, error);
    if (socket.connected && socket.id === captured.socketId) reply(UNABLE_SYNC);
  } finally {
    release();
  }
}

function onCommit(io, socket, registry, deps, payload, ack) {
  if (typeof ack !== "function") return undefined;
  const reply = replyTo(socket, ack, "canvas:commit");
  if (!isRecord(payload)) {
    reply(INVALID_CANVAS);
    return undefined;
  }
  if (typeof payload.projectId !== "string" || !OBJECT_ID.test(payload.projectId)) {
    reply(PROJECT_NOT_FOUND);
    return undefined;
  }
  if (!validCommitEnvelope(payload)) {
    reply(INVALID_CANVAS);
    return undefined;
  }

  const projectId = payload.projectId.toLowerCase();
  const userId = readUserId(socket);
  const accepted = userId && acceptCanvasRequest(socket, registry, projectId, userId);
  if (!accepted) {
    reply(PROJECT_NOT_FOUND);
    return undefined;
  }

  const captured = {
    ...accepted.captured,
    baseVersion: payload.baseVersion,
    ops: payload.ops.slice(),
  };
  return accepted.room.writeQueue(() => (
    runCommit(io, socket, deps, accepted.state, accepted.room, accepted.release, captured, reply)
  ));
}

function onSync(socket, registry, deps, payload, ack) {
  if (typeof ack !== "function") return undefined;
  const reply = replyTo(socket, ack, "canvas:sync");
  if (!isRecord(payload)) {
    reply(INVALID_CANVAS);
    return undefined;
  }
  if (typeof payload.projectId !== "string" || !OBJECT_ID.test(payload.projectId)) {
    reply(PROJECT_NOT_FOUND);
    return undefined;
  }

  const projectId = payload.projectId.toLowerCase();
  const userId = readUserId(socket);
  const accepted = userId && acceptCanvasRequest(socket, registry, projectId, userId);
  if (!accepted) {
    reply(PROJECT_NOT_FOUND);
    return undefined;
  }

  return accepted.room.writeQueue(() => (
    runSync(socket, deps, accepted.state, accepted.room, accepted.release, accepted.captured, reply)
  ));
}

function onDisconnecting(io, socket, registry) {
  const state = getLifecycle(socket);
  state.generation += 1;
  state.intent = null;
  state.joinedGeneration = null;
  const projectId = state.activeProjectId;
  const socketId = socket.id;
  state.activeProjectId = null;
  if (!projectId) return;
  const removed = registry.removeConnection(projectId, socketId);
  if (removed) publishPresence(io, registry, projectId);
}

// Validation constants for preview
const MAX_PREVIEW_NODES = 50;

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function validPreviewEnvelope(payload) {
  if (!isPlainObject(payload)) return false;
  if (typeof payload.projectId !== "string" || !OBJECT_ID.test(payload.projectId)) return false;
  if (!Array.isArray(payload.nodes) || payload.nodes.length < 1 || payload.nodes.length > MAX_PREVIEW_NODES) return false;

  const seen = new Set();
  for (const node of payload.nodes) {
    if (!isPlainObject(node)) return false;
    if (typeof node.id !== "string" || !ID_PATTERN.test(node.id)) return false;
    if (seen.has(node.id)) return false;
    seen.add(node.id);

    if (!isPlainObject(node.position)) return false;
    const x = node.position.x;
    const y = node.position.y;
    if (typeof x !== "number" || !Number.isFinite(x) || Math.abs(x) > POSITION_MAX) return false;
    if (typeof y !== "number" || !Number.isFinite(y) || Math.abs(y) > POSITION_MAX) return false;

    const hasWidth = Object.hasOwn(node, "width");
    const hasHeight = Object.hasOwn(node, "height");
    if (hasWidth !== hasHeight) return false;
    if (hasWidth) {
      const width = node.width;
      const height = node.height;
      if (typeof width !== "number" || !Number.isFinite(width) || width < NODE_SIZE_MIN || width > NODE_SIZE_MAX) return false;
      if (typeof height !== "number" || !Number.isFinite(height) || height < NODE_SIZE_MIN || height > NODE_SIZE_MAX) return false;
    }
  }
  return true;
}

function sanitizePreviewNode(node) {
  const sanitized = { id: node.id, position: { x: node.position.x, y: node.position.y } };
  if (Object.hasOwn(node, "width")) {
    sanitized.width = node.width;
    sanitized.height = node.height;
  }
  return sanitized;
}

async function onPreview(io, socket, registry, deps, payload, ack) {
  // No ack for volatile events
  if (!validPreviewEnvelope(payload)) return;

  const projectId = payload.projectId.toLowerCase();
  const userId = readUserId(socket);
  if (!userId) return;

  const joined = joinedConnection(socket, registry, projectId, userId);
  if (!joined) return;
  if (!canWrite(joined.room, joined.connection)) return;

  const nodes = payload.nodes.map(sanitizePreviewNode);
  if (nodes.length === 0) return;

  try {
    io.to(roomName(projectId)).except(socket.id).volatile.emit("canvas:preview", {
      projectId,
      by: userId,
      nodes,
    });
  } catch (error) {
    logHandler("canvas:preview", error);
  }
}

function validCursorMove(payload) {
  if (!isRecord(payload)) return null;
  const projectId = typeof payload.projectId === "string" ? payload.projectId.toLowerCase() : "";
  if (!OBJECT_ID.test(projectId)) return null;
  const x = payload.x;
  const y = payload.y;
  if (typeof x !== "number" || !Number.isFinite(x) || Math.abs(x) > POSITION_MAX) return null;
  if (typeof y !== "number" || !Number.isFinite(y) || Math.abs(y) > POSITION_MAX) return null;
  return { projectId, x, y };
}

function validCursorLeave(payload) {
  if (!isRecord(payload)) return null;
  const projectId = typeof payload.projectId === "string" ? payload.projectId.toLowerCase() : "";
  if (!OBJECT_ID.test(projectId)) return null;
  return { projectId };
}

function authorizeCursor(socket, registry, projectId, userId) {
  const joined = joinedConnection(socket, registry, projectId, userId);
  if (!joined) return null;
  const member = joined.room.members?.get(userId);
  if (!member) return null;
  if (can(member.role, "chat") !== true) return null;
  return { room: joined.room, connection: joined.connection, state: joined.state };
}

function onCursorMove(io, socket, registry, deps, payload) {
  const validated = validCursorMove(payload);
  if (!validated) return;

  const userId = readUserId(socket);
  if (!userId) return;

  const authorized = authorizeCursor(socket, registry, validated.projectId, userId);
  if (!authorized) return;

  try {
    socket.to(roomName(validated.projectId)).volatile.emit("cursor:move", {
      projectId: validated.projectId,
      userId,
      x: validated.x,
      y: validated.y,
    });
  } catch (error) {
    logHandler("cursor:move", error);
  }
}

function onCursorLeave(io, socket, registry, deps, payload) {
  const validated = validCursorLeave(payload);
  if (!validated) return;

  const userId = readUserId(socket);
  if (!userId) return;

  const authorized = authorizeCursor(socket, registry, validated.projectId, userId);
  if (!authorized) return;

  try {
    socket.to(roomName(validated.projectId)).volatile.emit("cursor:leave", {
      projectId: validated.projectId,
      userId,
    });
  } catch (error) {
    logHandler("cursor:leave", error);
  }
}

export function registerWorkspaceHandlers(io, socket, roomRegistry = workspaceRegistry, deps = defaultDeps) {
  // Touch the lifecycle so the queue exists before the first event.
  getLifecycle(socket);

  socket.on("workspace:join", safeHandler("workspace:join", (payload, ack) => (
    onJoin(io, socket, roomRegistry, deps, payload, ack)
  )));

  socket.on("workspace:leave", safeHandler("workspace:leave", (payload) => (
    onLeave(io, socket, roomRegistry, payload)
  )));

  socket.on("canvas:commit", safeHandler("canvas:commit", (payload, ack) => (
    onCommit(io, socket, roomRegistry, deps, payload, ack)
  )));

  socket.on("canvas:sync", safeHandler("canvas:sync", (payload, ack) => (
    onSync(socket, roomRegistry, deps, payload, ack)
  )));

  socket.on("canvas:preview", safeHandler("canvas:preview", (payload) => (
    onPreview(io, socket, roomRegistry, deps, payload)
  )));

  socket.on("cursor:move", safeHandler("cursor:move", (payload) => (
    onCursorMove(io, socket, roomRegistry, deps, payload)
  )));

  socket.on("cursor:leave", safeHandler("cursor:leave", (payload) => (
    onCursorLeave(io, socket, roomRegistry, deps, payload)
  )));

  // disconnecting drops the registry entry. Socket.io removes adapter rooms itself,
  // including this socket's project room, and the per-user chat room stays.
  socket.on("disconnecting", safeHandler("disconnecting", () => {
    onDisconnecting(io, socket, roomRegistry);
  }));
}
