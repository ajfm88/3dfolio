import Canvas from "../models/canvas.model.js";
import User from "../models/user.model.js";
import * as projectAccess from "../lib/projectAccess.js";
import { safeHandler } from "../lib/safeHandler.js";
import { normalizeCanvas } from "../shared/canvasOps.js";
import { createSerialQueue, workspaceRegistry } from "../lib/workspaceRooms.js";

// REST uses the same sentence for a bad id, a missing project, and a non-member.
const PROJECT_NOT_FOUND = { ok: false, message: "Project not found" };
const INVALID_REQUEST = { ok: false, message: "Invalid workspace request" };
const SUPERSEDED = { ok: false, message: "Workspace request superseded" };
const UNAVAILABLE = { ok: false, message: "Unable to open workspace" };

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

async function detach(registry, socket, state, projectId, socketId) {
  registry.removeConnection(projectId, socketId);
  if (state.activeProjectId === projectId) state.activeProjectId = null;
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

async function runJoin(socket, registry, deps, state, generation, projectId, tabId, userId, reply) {
  const socketId = socket.id;
  let handle = null;
  let adapterJoined = false;
  let attached = false;

  const stale = () => !isCurrent(state, generation) || !socket.connected || socket.id !== socketId;

  const rollback = async () => {
    registry.removeConnection(projectId, socketId);
    if (state.activeProjectId === projectId) state.activeProjectId = null;
    attached = false;
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
      await detach(registry, socket, state, state.activeProjectId, socket.id);
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
        await detach(registry, socket, state, state.activeProjectId, socket.id);
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
        await detach(registry, socket, state, state.activeProjectId, socket.id);
      }
      reply(PROJECT_NOT_FOUND);
      return;
    }

    handle = await registry.acquire(projectId, loadWorkspaceCanvas);
    if (stale()) {
      reply(SUPERSEDED);
      return;
    }

    // The adapter can add the project room and then reject. Count the attempt
    // before the await so that failure still leaves this room. The per-user
    // chat room is never named here.
    adapterJoined = true;
    await socket.join(roomName(projectId));
    if (stale()) {
      reply(SUPERSEDED);
      return;
    }

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

    if (stale()) {
      reply(SUPERSEDED);
      return;
    }

    const canvas = handle.room.canvas;
    reply({
      ok: true,
      project: projectSummary(project),
      role,
      canvas: {
        nodes: canvas.nodes,
        edges: canvas.edges,
        version: canvas.version,
      },
      participants: [],
      turn: null,
      serverNow: Date.now(),
    });
    attached = false;
    adapterJoined = false;
  } catch (error) {
    console.error("Error in socket handler (workspace:join):", error.message);
    if (isCurrent(state, generation) && socket.connected && socket.id === socketId) {
      if (state.activeProjectId) {
        try {
          await detach(registry, socket, state, state.activeProjectId, socket.id);
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

function onJoin(socket, registry, deps, payload, ack) {
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

  return state.queue(() => (
    runJoin(socket, registry, deps, state, generation, projectId, tabId, userId, reply)
  ));
}

function onLeave(socket, registry, payload) {
  if (!isRecord(payload)) return undefined;
  if (typeof payload.projectId !== "string" || !OBJECT_ID.test(payload.projectId)) return undefined;

  const projectId = payload.projectId.toLowerCase();
  const state = getLifecycle(socket);
  // Cancel only a join for this project. A leave for A must not drop an in-flight join to B.
  if (state.intent?.kind === "join" && state.intent.projectId === projectId) {
    state.generation += 1;
    state.intent = null;
  }

  return state.queue(async () => {
    if (state.activeProjectId !== projectId) return;
    await detach(registry, socket, state, projectId, socket.id);
  });
}

function onDisconnecting(socket, registry) {
  const state = getLifecycle(socket);
  state.generation += 1;
  state.intent = null;
  const projectId = state.activeProjectId;
  const socketId = socket.id;
  state.activeProjectId = null;
  if (projectId) registry.removeConnection(projectId, socketId);
}

export function registerWorkspaceHandlers(io, socket, roomRegistry = workspaceRegistry, deps = defaultDeps) {
  // Later slices broadcast on io. Join and leave only touch this socket's rooms.
  void io;

  // Touch the lifecycle so the queue exists before the first event.
  getLifecycle(socket);

  socket.on("workspace:join", safeHandler("workspace:join", (payload, ack) => (
    onJoin(socket, roomRegistry, deps, payload, ack)
  )));

  socket.on("workspace:leave", safeHandler("workspace:leave", (payload) => (
    onLeave(socket, roomRegistry, payload)
  )));

  // disconnecting drops the registry entry. Socket.io removes adapter rooms itself,
  // including this socket's project room, and the per-user chat room stays.
  socket.on("disconnecting", safeHandler("disconnecting", () => {
    onDisconnecting(socket, roomRegistry);
  }));
}
