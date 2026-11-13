import { applyOps, MAX_OPS_PER_COMMIT, normalizeCanvas } from "@shared/canvasOps.js";

export const COMMIT_TIMEOUT_MS = 8000;
export const RECOVERY_TOAST = "Canvas re-synced";

// The Engine.IO heartbeat can expire while socket.connected stays true.
// Socket.IO then keeps canvas:commit in sendBuffer and flushes that queue
// on the next connection, ahead of workspace:join. This emit owns one
// payload object, and that object is the only canvas:commit removed here.
// A packet the transport already wrote stays in place until the server
// acknowledgement or a snapshot settles it.
function dropBufferedCommit(socket, payload) {
  const buffer = socket?.sendBuffer;
  if (!Array.isArray(buffer)) return;
  for (let index = buffer.length - 1; index >= 0; index -= 1) {
    const data = buffer[index]?.data;
    if (Array.isArray(data) && data[0] === "canvas:commit" && data[1] === payload) {
      buffer.splice(index, 1);
    }
  }
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

function isRecord(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function isSafeVersion(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function cloneGraph(canvas) {
  return {
    nodes: canvas.nodes.map((node) => ({
      ...node,
      position: { x: node.position.x, y: node.position.y },
      data: { ...node.data },
    })),
    edges: canvas.edges.map((edge) => ({
      ...edge,
      data: edge.data ? { ...edge.data } : {},
    })),
    version: canvas.version,
  };
}

function messageOf(body) {
  return isRecord(body) && typeof body.message === "string" ? body.message : "";
}

export function createSyncState() {
  return {
    epoch: 0,
    joinedConnectionId: null,
    confirmed: null,
    pending: [],
    commit: null,
    commitSeq: 0,
    syncSeq: 0,
    syncOutstanding: false,
    syncDirty: false,
    syncFollowed: false,
    recovering: false,
    toastRecovery: false,
    toasted: false,
    errorShown: null,
    remoteHigh: null,
    remoteMalformed: false,
    denialRejoin: false,
    // Optional history notifications, installed by the store. The controller
    // calls them blind so helpers built without them keep working.
    hooks: null,
  };
}

// Drop queued work and invalidate commit/sync callbacks. A denial rejoin keeps
// its toast flag so the following join can announce recovery once.
export function invalidateSession(session, { keepDenial = false } = {}) {
  const denial = keepDenial && session.denialRejoin;
  const toastRecovery = keepDenial && session.toastRecovery;
  session.epoch += 1;
  session.pending = [];
  session.commit = null;
  session.syncSeq += 1;
  session.syncOutstanding = false;
  session.syncDirty = false;
  session.syncFollowed = false;
  session.recovering = false;
  session.remoteHigh = null;
  session.remoteMalformed = false;
  session.toasted = false;
  session.errorShown = null;
  session.confirmed = null;
  session.joinedConnectionId = null;
  session.denialRejoin = denial;
  session.toastRecovery = toastRecovery;
  if (!keepDenial) {
    session.denialRejoin = false;
    session.toastRecovery = false;
  }
  session.hooks?.invalidate?.("session");
}

function requiredVersion(session) {
  const confirmed = session.confirmed?.version ?? 0;
  const remote = session.remoteHigh ?? confirmed;
  return Math.max(confirmed, remote);
}

function readSnapshot(body) {
  if (!isRecord(body) || !isRecord(body.canvas)) return null;
  const canvas = body.canvas;
  if (!Array.isArray(canvas.nodes) || !Array.isArray(canvas.edges)) return null;
  if (!isSafeVersion(canvas.version)) return null;
  const normalized = normalizeCanvas(canvas);
  return { nodes: normalized.nodes, edges: normalized.edges, version: canvas.version };
}

function validRemote(payload, projectId) {
  if (!isRecord(payload)) return false;
  const received = typeof payload.projectId === "string" ? payload.projectId.toLowerCase() : "";
  if (received !== projectId) return false;
  if (!isSafeVersion(payload.version)) return false;
  if (!Array.isArray(payload.ops) || payload.ops.length < 1 || payload.ops.length > MAX_OPS_PER_COMMIT) {
    return false;
  }
  return typeof payload.by === "string" && OBJECT_ID.test(payload.by);
}

function relevantProject(payload, projectId) {
  if (!isRecord(payload)) return false;
  const received = typeof payload.projectId === "string" ? payload.projectId.toLowerCase() : "";
  return received === projectId;
}

export function createSyncController(deps) {
  function active(binding) {
    return Boolean(binding) && deps.isActive(binding) && binding.sync;
  }

  function sameSocket(binding, captured) {
    const socket = binding.socket;
    return socket === captured.socket
      && socket?.connected
      && socket.id === captured.connectionId
      && binding.projectId === captured.projectId
      && binding.attempt === captured.attempt
      && binding.sync.epoch === captured.epoch;
  }

  function commitCurrent(binding, captured) {
    return active(binding)
      && !binding.sync.recovering
      && binding.sync.commit?.token === captured.token
      && sameSocket(binding, captured)
      && deps.get().status === "ready";
  }

  function syncCurrent(binding, captured) {
    return active(binding)
      && binding.sync.recovering
      && binding.sync.syncSeq === captured.syncSeq
      && sameSocket(binding, captured);
  }

  function publish(canvas, { status, syncStatus, project, role, freshSelection }) {
    const previous = deps.get();
    const priorNodes = freshSelection ? [] : previous.rfNodes;
    const priorEdges = freshSelection ? [] : previous.rfEdges;
    deps.set({
      status: status ?? previous.status,
      syncStatus,
      project: project === undefined ? previous.project : project,
      role: role === undefined ? previous.role : role,
      canvas,
      rfNodes: deps.toDisplayNodes(canvas.nodes, priorNodes),
      rfEdges: deps.toDisplayEdges(canvas.edges, priorEdges),
    });
  }

  function showError(session, message) {
    if (!message || session.errorShown === message) return;
    session.errorShown = message;
    deps.toast.error(message);
  }

  function finishRecovery(binding, canvas) {
    const session = binding.sync;
    if (session.confirmed && canvas.version < session.confirmed.version) return false;
    if (session.remoteHigh != null && canvas.version < session.remoteHigh) return false;
    if (session.remoteMalformed && session.remoteHigh == null) return false;
    session.confirmed = cloneGraph(canvas);
    session.pending = [];
    session.commit = null;
    session.remoteHigh = null;
    session.remoteMalformed = false;
    session.syncDirty = false;
    session.syncOutstanding = false;
    // recovering stays true through this publish so a blur caused by the
    // rebuild cannot enqueue another edit against the graph being replaced.
    publish(cloneGraph(canvas), { status: "ready", syncStatus: "idle" });
    if (session.toastRecovery && !session.toasted) {
      session.toasted = true;
      deps.toast.success(RECOVERY_TOAST);
    }
    session.recovering = false;
    session.toastRecovery = false;
    session.denialRejoin = false;
    // The queue is empty and recovery is over, so busy state has to follow.
    session.hooks?.queue?.();
    return true;
  }

  function failRecovery(binding) {
    if (!active(binding)) return;
    const session = binding.sync;
    invalidateSession(session);
    if (binding.socket?.connected && binding.projectId) {
      binding.socket.emit("workspace:leave", { projectId: binding.projectId });
    }
    deps.set({ ...deps.emptyWorkspace("error"), syncStatus: "idle" });
  }

  function denyAccess(binding, message) {
    if (!active(binding)) return;
    invalidateSession(binding.sync);
    showError(binding.sync, message);
    if (binding.socket?.connected && binding.projectId) {
      binding.socket.emit("workspace:leave", { projectId: binding.projectId });
    }
    deps.set({ ...deps.emptyWorkspace("notFound"), syncStatus: "idle" });
  }

  function denyEdit(binding, message) {
    if (!active(binding)) return;
    const session = binding.sync;
    invalidateSession(session);
    session.denialRejoin = true;
    session.toastRecovery = true;
    showError(session, message);
    deps.rejoin(binding);
  }

  function ensureSync(binding) {
    const session = binding.sync;
    if (!active(binding) || !session.recovering) return;
    const socket = binding.socket;
    if (!socket?.connected || socket.id !== binding.sync.joinedConnectionId) {
      failRecovery(binding);
      return;
    }
    if (session.syncOutstanding) {
      session.syncDirty = true;
      return;
    }
    session.syncOutstanding = true;
    const captured = {
      epoch: session.epoch,
      attempt: binding.attempt,
      socket,
      connectionId: socket.id,
      projectId: binding.projectId,
      syncSeq: session.syncSeq,
      // Events observed after this request begins can overtake a valid reply
      // without making the reply stale relative to what this request knew.
      requiredVersion: requiredVersion(session),
    };
    let pending;
    try {
      pending = socket.timeout(COMMIT_TIMEOUT_MS).emitWithAck("canvas:sync", { projectId: binding.projectId });
    } catch {
      session.syncOutstanding = false;
      failRecovery(binding);
      return;
    }
    pending.then((body) => {
      onSyncAck(binding, captured, body);
    }).catch(() => {
      if (!syncCurrent(binding, captured)) return;
      failRecovery(binding);
    }).finally(() => {
      if (!active(binding) || binding.sync.syncSeq !== captured.syncSeq) return;
      binding.sync.syncOutstanding = false;
      if (binding.sync.recovering && binding.sync.syncDirty) {
        binding.sync.syncDirty = false;
        ensureSync(binding);
      }
    });
  }

  function beginRecovery(binding, { message = "", snapshot = null } = {}) {
    if (!active(binding)) return;
    const session = binding.sync;
    if (message === "Project not found") {
      denyAccess(binding, message);
      return;
    }
    if (message === "You cannot edit this canvas") {
      denyEdit(binding, message);
      return;
    }

    const already = session.recovering;
    if (!already) {
      session.toastRecovery = true;
      session.toasted = false;
      session.errorShown = null;
      session.syncFollowed = false;
      // Epoch retires the commit that triggered this. Sync uses syncSeq so a
      // later event can mark the in-flight read dirty without dropping it.
      session.epoch += 1;
      session.syncSeq += 1;
    }
    session.pending = [];
    session.commit = null;
    session.recovering = true;
    // Every recovery drops local undo history, including a rejection whose
    // attached snapshot is installed immediately below. Which provisional
    // frames reached the server is unknowable from the optimistic graph.
    session.hooks?.invalidate?.("recovery");
    showError(session, message);

    const usable = snapshot && snapshot.version >= requiredVersion(session) && !session.remoteMalformed
      ? snapshot
      : null;
    if (usable && (session.remoteHigh == null || usable.version >= session.remoteHigh)) {
      session.syncSeq += 1;
      session.syncOutstanding = false;
      session.syncDirty = false;
      finishRecovery(binding, usable);
      return;
    }

    if (already && session.syncOutstanding) {
      session.syncDirty = true;
      return;
    }

    const confirmed = session.confirmed
      ? cloneGraph(session.confirmed)
      : { nodes: [], edges: [], version: 0 };
    if (!session.confirmed) session.confirmed = cloneGraph(confirmed);
    publish(confirmed, { status: "ready", syncStatus: "syncing" });
    ensureSync(binding);
  }

  function onSyncAck(binding, captured, body) {
    if (!syncCurrent(binding, captured)) return;
    const message = messageOf(body);
    if (message === "Project not found") {
      denyAccess(binding, message);
      return;
    }
    if (message === "You cannot edit this canvas") {
      denyEdit(binding, message);
      return;
    }
    const session = binding.sync;
    const snapshot = isRecord(body) && body.ok === true ? readSnapshot(body) : null;
    if (!snapshot) {
      failRecovery(binding);
      return;
    }
    // A malformed event has no trustworthy version. The read already in
    // flight may have happened before it, so one later snapshot has to agree.
    // A second malformed event fails closed.
    if (session.remoteMalformed && !session.syncFollowed) {
      session.syncFollowed = true;
      session.remoteMalformed = false;
      session.syncDirty = true;
      return;
    }
    if (session.remoteMalformed) {
      failRecovery(binding);
      return;
    }
    const confirmedVersion = session.confirmed?.version ?? 0;
    const meetsRequestFloor = snapshot.version >= captured.requiredVersion
      && snapshot.version >= confirmedVersion;
    const overtaken = meetsRequestFloor
      && session.remoteHigh != null
      && snapshot.version < session.remoteHigh;
    // A valid reply can lose to a commit that happened after this request
    // started. That is ordinary before turn enforcement. Keep one read in
    // flight and fetch the next snapshot. Do not spend the one-miss budget.
    if (overtaken) {
      session.syncDirty = true;
      return;
    }
    // Below the version this request already required, or otherwise not
    // installable. One later read may catch up. A second such miss fails closed.
    if (!finishRecovery(binding, snapshot)) {
      if (session.syncFollowed) {
        failRecovery(binding);
        return;
      }
      session.syncFollowed = true;
      session.syncDirty = true;
    }
  }

  function noteRemote(session, version) {
    if (session.remoteHigh == null || version > session.remoteHigh) session.remoteHigh = version;
  }

  function applyRemote(binding, payload) {
    const session = binding.sync;
    const applied = applyOps(session.confirmed, payload.ops);
    if (!applied.ok) {
      noteRemote(session, payload.version);
      beginRecovery(binding);
      return;
    }
    const next = {
      nodes: applied.canvas.nodes,
      edges: applied.canvas.edges,
      version: payload.version,
    };
    session.confirmed = cloneGraph(next);
    publish(cloneGraph(next), { status: "ready", syncStatus: "idle" });
  }

  function onRemote(binding, payload) {
    if (!active(binding)) return;
    const socket = binding.socket;
    if (!socket?.connected || socket.id !== binding.sync.joinedConnectionId) return;
    if (!relevantProject(payload, binding.projectId)) return;

    const session = binding.sync;
    const state = deps.get();
    if (state.status !== "ready" && state.status !== "loading") return;
    if (!validRemote(payload, binding.projectId)) {
      if (state.status === "loading" || session.recovering) {
        session.remoteMalformed = true;
        if (session.recovering) session.syncDirty = true;
        return;
      }
      beginRecovery(binding);
      return;
    }

    const version = payload.version;
    const confirmedVersion = session.confirmed?.version;
    if (state.status === "loading" || session.recovering || confirmedVersion == null) {
      noteRemote(session, version);
      if (session.recovering) session.syncDirty = true;
      return;
    }
    if (version <= confirmedVersion) return;

    // A real remote change makes every retained inverse stale. Duplicates and
    // foreign traffic returned above and leave history alone.
    session.hooks?.invalidate?.("remote");
    noteRemote(session, version);
    if (session.pending.length > 0 || session.commit) {
      beginRecovery(binding);
      return;
    }
    if (version !== confirmedVersion + 1) {
      beginRecovery(binding);
      return;
    }
    applyRemote(binding, payload);
  }

  function acceptCommit(binding, captured) {
    if (!commitCurrent(binding, captured)) return;
    const session = binding.sync;
    const applied = applyOps(session.confirmed, captured.ops);
    if (!applied.ok) {
      beginRecovery(binding);
      return;
    }
    const version = captured.baseVersion + 1;
    session.confirmed = {
      nodes: applied.canvas.nodes,
      edges: applied.canvas.edges,
      version,
    };
    session.commit = null;
    const current = deps.get();
    deps.set({
      canvas: {
        nodes: current.canvas.nodes,
        edges: current.canvas.edges,
        version,
      },
    });
    pump(binding);
    session.hooks?.queue?.();
  }

  function onCommitAck(binding, captured, body) {
    if (!commitCurrent(binding, captured)) return;
    const message = messageOf(body);
    if (message === "Project not found" || message === "You cannot edit this canvas") {
      if (message === "Project not found") denyAccess(binding, message);
      else denyEdit(binding, message);
      return;
    }
    const accepted = isRecord(body)
      && body.ok === true
      && isSafeVersion(body.version)
      && body.version === captured.baseVersion + 1;
    if (accepted) {
      acceptCommit(binding, captured);
      return;
    }
    const snapshot = isRecord(body) && body.ok === false ? readSnapshot(body) : null;
    beginRecovery(binding, { message, snapshot });
  }

  function pump(binding) {
    if (!active(binding)) return;
    const session = binding.sync;
    if (session.commit || session.recovering || session.pending.length === 0) return;
    const state = deps.get();
    const socket = binding.socket;
    if (state.status !== "ready" || state.syncStatus === "syncing") return;
    if (!socket?.connected || socket.id !== binding.sync.joinedConnectionId) return;
    if (!session.confirmed) return;
    // Turn loss drops the queue itself. A closed gate must not take batches
    // or emit, including when an ack pumps the next commit.
    if (!deps.canEdit()) return;
    // A queued write belongs to the account that authenticated this
    // connection. It is not sent if the session has moved to someone else.
    if (deps.ownsConnection && !deps.ownsConnection(binding)) return;

    const ops = [];
    const batches = [];
    for (const batch of session.pending) {
      if (batch.length < 1 || batch.length > MAX_OPS_PER_COMMIT) {
        beginRecovery(binding);
        return;
      }
      if (ops.length + batch.length > MAX_OPS_PER_COMMIT) break;
      batches.push(batch);
      ops.push(...batch);
    }
    if (batches.length === 0) return;
    const check = applyOps(session.confirmed, ops);
    if (!check.ok) {
      beginRecovery(binding);
      return;
    }
    session.pending.splice(0, batches.length);
    const token = ++session.commitSeq;
    const captured = {
      token,
      epoch: session.epoch,
      attempt: binding.attempt,
      socket,
      connectionId: socket.id,
      projectId: binding.projectId,
      baseVersion: session.confirmed.version,
      ops,
    };
    session.commit = captured;
    const payload = {
      projectId: binding.projectId,
      baseVersion: captured.baseVersion,
      ops,
    };
    let pending;
    try {
      pending = socket.timeout(COMMIT_TIMEOUT_MS).emitWithAck("canvas:commit", payload);
    } catch {
      dropBufferedCommit(socket, payload);
      if (session.commit?.token === token) beginRecovery(binding);
      return;
    }
    dropBufferedCommit(socket, payload);
    pending.then((body) => {
      onCommitAck(binding, captured, body);
    }).catch(() => {
      if (!commitCurrent(binding, captured)) return;
      beginRecovery(binding);
    });
  }

  function enqueue(binding, ops) {
    if (!active(binding)) return;
    binding.sync.pending.push(ops.map((op) => structuredClone(op)));
    pump(binding);
    binding.sync.hooks?.queue?.();
  }

  // Every batch is queued before the first emit, so a synchronous failure while
  // pumping clears them all together and cannot leave later ones orphaned.
  function enqueueMany(binding, batches) {
    if (!active(binding)) return;
    for (const ops of batches) binding.sync.pending.push(ops.map((op) => structuredClone(op)));
    pump(binding);
    binding.sync.hooks?.queue?.();
  }

  function onJoined(binding, { project, role, canvas }) {
    const session = binding.sync;
    session.confirmed = cloneGraph(canvas);
    session.pending = [];
    session.commit = null;
    session.recovering = false;
    const behind = (session.remoteHigh != null && session.remoteHigh > canvas.version) || session.remoteMalformed;
    const identity = { project, role, freshSelection: true };
    if (behind) {
      session.recovering = true;
      session.toastRecovery = session.denialRejoin;
      publish(cloneGraph(canvas), { status: "ready", syncStatus: "syncing", ...identity });
      ensureSync(binding);
      return;
    }
    session.remoteHigh = null;
    session.remoteMalformed = false;
    publish(cloneGraph(canvas), { status: "ready", syncStatus: "idle", ...identity });
    if (session.denialRejoin && session.toastRecovery && !session.toasted) {
      session.toasted = true;
      deps.toast.success(RECOVERY_TOAST);
    }
    session.denialRejoin = false;
    session.toastRecovery = false;
  }

  return { enqueue, enqueueMany, pump, onRemote, onJoined, beginRecovery, invalidateSession };
}
