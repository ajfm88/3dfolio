import { MarkerType, applyEdgeChanges, applyNodeChanges } from "@xyflow/react";
import { toast } from "react-toastify";
import { create } from "zustand";

import { applyOps, NODE_COLORS, createEdgeId, normalizeCanvas } from "@shared/canvasOps.js";
import { getTabId } from "../lib/tabId";
import { createSyncController, createSyncState, invalidateSession } from "../lib/workspaceSync.js";
import { throttle } from "../lib/throttle.js";
import { createPreviewOverlayController } from "../lib/canvasPreview.js";
import { normalizeParticipants } from "../lib/participants.js";
import {
  canonicalUserId,
  createCursorExpiryController,
  validateCursorMove,
  validateInboundCursorLeave,
  validateInboundCursorMove,
} from "../lib/cursorPresence.js";
import { normalizeTurn, sameTurnTab } from "../lib/turnState.js";
import { playTurnSound } from "../lib/turnSound.js";
import { useSessionStore } from "./useSessionStore.js";

// The route effect owns one binding at a time. A late ack is ignored unless it
// still matches this object, the socket id captured at emit, and its attempt.
let activeBinding = null;

// Socket.IO authenticates at handshake. A workspace retry or route rebind on
// the same connection id does not make that transport belong to someone else.
const connectionAccounts = new WeakMap();

function connectionAccount(socket) {
  if (!socket) return "";
  const known = connectionAccounts.get(socket);
  if (!known || known.id !== socket.id) return "";
  return known.accountId;
}

function rememberConnectionAccount(socket) {
  const connectionId = socket?.id ?? "";
  if (!socket || !connectionId) return "";
  const known = connectionAccounts.get(socket);
  if (known && known.id === connectionId) return known.accountId;
  const accountId = selfUserId();
  if (!accountId) return "";
  connectionAccounts.set(socket, { id: connectionId, accountId });
  return accountId;
}

const syncDeps = {
  get: () => emptyWorkspace("idle"),
  set: () => {},
  toast,
  toDisplayNodes: (nodes, previous) => {
    // workspaceSync computes the display before it installs the canvas, so get()
    // still returns the previous canonical graph here. recovering is true for the
    // whole of a recovery, including its snapshot publish, so a replaced graph
    // can never inherit a preview from the one before it.
    const binding = activeBinding;
    if (binding?.sync?.recovering) clearPreviews(binding);
    return displayNodes(binding, nodes, syncDeps.get().canvas.nodes, previous);
  },
  toDisplayEdges,
  emptyWorkspace,
  isActive: (binding) => activeBinding === binding && !binding.disposed,
  rejoin: (binding) => startJoin(syncDeps.set, binding, true),
};
const sync = createSyncController(syncDeps);

function emptyWorkspace(status) {
  return {
    status,
    project: null,
    role: null,
    syncStatus: "idle",
    canvas: { nodes: [], edges: [], version: 0 },
    rfNodes: [],
    rfEdges: [],
    participants: [],
    cursors: {},
    turn: null,
    turnReceivedAt: null,
  };
}

// Who this binding is. The component reads it while rendering the queue, and
// a fresh object here would retrigger the subscription on every pass.
export const selectBindingTabId = () => (
  activeBinding && !activeBinding.disposed ? activeBinding.tabId : null
);

// Ownership, not permission to dispatch. Canvas recovery stays ready, so the
// holder is still identifiable while edits and previews are refused.
export const selectIsHolder = (state) => {
  if (state.status !== "ready") return false;
  if (state.role !== "owner" && state.role !== "editor") return false;
  const binding = activeBinding;
  if (!binding || binding.disposed) return false;
  const socket = binding.socket;
  if (!socket?.connected) return false;
  if (!binding.sync?.joinedConnectionId || socket.id !== binding.sync.joinedConnectionId) return false;
  if (state.project?._id !== binding.projectId) return false;
  if (!state.turn?.holder || !binding.tabId) return false;
  return sameTurnTab(state.turn.holder, { userId: selfUserId(), tabId: binding.tabId });
};

// Recovery and a disconnected binding refuse even when this tab holds the
// turn. The socket is read at call time so sign-out can remove listeners,
// and therefore skip the disconnect handler, without leaving a dispatch path open.
export const selectCanEdit = (state) => {
  if (state.status !== "ready" || state.syncStatus === "syncing") return false;
  if (state.role !== "owner" && state.role !== "editor") return false;
  const binding = activeBinding;
  if (!binding || binding.disposed || binding.sync?.recovering) return false;
  const socket = binding.socket;
  if (!socket?.connected) return false;
  if (!binding.sync?.joinedConnectionId || socket.id !== binding.sync.joinedConnectionId) return false;
  return selectIsHolder(state);
};

// Chat stays available to every project role without a turn, including while
// the canvas is syncing or recovering. The account id is the one that
// authenticated this connection. A later account cannot claim it by retrying
// the join, and a missing or replaced session socket does not inherit it.
export const selectCanChat = (state) => {
  if (state.status !== "ready") return false;
  if (!JOIN_ROLES.has(state.role)) return false;
  const binding = activeBinding;
  if (!binding || binding.disposed) return false;
  const socket = binding.socket;
  if (!socket?.connected) return false;
  if (!binding.sync?.joinedConnectionId || socket.id !== binding.sync.joinedConnectionId) return false;
  if (state.project?._id !== binding.projectId) return false;
  const session = useSessionStore.getState();
  if (!session.socket || session.socket !== socket) return false;
  const accountId = selfUserId();
  const owner = connectionAccount(socket);
  if (!accountId || accountId !== owner || accountId !== binding.joinedAccountId) return false;
  return true;
};

// A session account change, or a session socket that is missing or replaced,
// drops chat authority until a join whose connection id belongs to that
// account. Canvas and turn checks do not read this field.
export function revokeJoinedAccount(socket) {
  const binding = activeBinding;
  if (!binding || binding.disposed || binding.socket !== socket) return;
  binding.joinedAccountId = "";
}

syncDeps.canEdit = () => selectCanEdit(syncDeps.get());

// React Flow owns selected and measured. A rebuild that dropped them would
// deselect nodes and force a re-measure on every edit. The canonical object
// stays out of the display array because React Flow writes onto display nodes.
// measured wins over width and height when React Flow draws the node, so a
// measurement is kept only while it still describes the canonical size. A
// rejected resize leaves the attempted size in measured; copying that would
// paint the size the validator just refused. dragging and resizing are left
// off so a finished gesture cannot stay in progress.
function toDisplayNodes(nodes, previous) {
  const priorById = new Map(previous.map((node) => [node.id, node]));
  return nodes.map((node) => {
    const prior = priorById.get(node.id);
    const display = {
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      width: node.width,
      height: node.height,
      data: { ...node.data },
      selected: prior?.selected ?? false,
    };
    const measured = prior?.measured;
    if (measured && measured.width === node.width && measured.height === node.height) {
      display.measured = measured;
    } else if (measured) {
      display.measured = { width: node.width, height: node.height };
    }
    return display;
  });
}

function toDisplayEdges(edges, previous) {
  const priorById = new Map(previous.map((edge) => [edge.id, edge]));
  return edges.map((edge) => {
    const prior = priorById.get(edge.id);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: edge.type,
      data: { ...edge.data },
      selected: prior?.selected ?? false,
      // The arrow is chrome. React Flow resolves it while drawing and the
      // canonical edge never receives it, so a saved op cannot grow a marker.
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--collab-edge)" },
    };
  });
}

// Every display rebuild goes through here. Overlays are reconciled against the
// canonical change first, so a committed move cannot be painted over and a
// label edit cannot wipe another node's in-progress preview.
function displayNodes(binding, nextNodes, previousCanonical, priorDisplay) {
  const controller = binding?.previewController;
  if (!controller) return toDisplayNodes(nextNodes, priorDisplay);
  controller.onCanonicalNodesChange(previousCanonical, nextNodes);
  return controller.applyOverlays(toDisplayNodes(nextNodes, priorDisplay));
}

function clearPreviews(binding) {
  binding.previewThrottle?.cancel();
  binding.previewController?.clearAllOverlays();
}

const DISPLAY_NODE_CHANGES = new Set(["select", "position", "dimensions"]);

function isRecord(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

const JOIN_ROLES = new Set(["owner", "editor", "viewer"]);

function canonicalProjectId(projectId) {
  return typeof projectId === "string" ? projectId.toLowerCase() : "";
}

function classifyJoin(ack, projectId) {
  if (!isRecord(ack) || ack.ok !== true) {
    const message = isRecord(ack) && typeof ack.message === "string" ? ack.message : "";
    return { ok: false, notFound: message === "Project not found", message };
  }

  const receivedId = isRecord(ack.project) ? String(ack.project._id).toLowerCase() : "";
  const version = isRecord(ack.canvas) ? ack.canvas.version : undefined;
  const participants = normalizeParticipants(ack.participants);
  const valid = receivedId === projectId
    && JOIN_ROLES.has(ack.role)
    && isRecord(ack.canvas)
    && Array.isArray(ack.canvas.nodes)
    && Array.isArray(ack.canvas.edges)
    && Number.isSafeInteger(version)
    && version >= 0
    && participants !== null
    && Number.isFinite(ack.serverNow);
  if (!valid) return { ok: false, notFound: false, message: "" };

  // null is the pre-S20 ack: the turn is unknown, which is read-only. A
  // present snapshot has to parse. Its own serverNow is not the join clock.
  let turn = null;
  if (ack.turn !== null) {
    turn = normalizeTurn(ack.turn);
    if (!turn) return { ok: false, notFound: false, message: "" };
  }

  // Display builders only see a normalized snapshot. The join is not an edit.
  const normalized = normalizeCanvas(ack.canvas);
  return {
    ok: true,
    project: {
      _id: receivedId,
      name: ack.project.name,
      description: ack.project.description,
    },
    role: ack.role,
    canvas: { nodes: normalized.nodes, edges: normalized.edges, version },
    participants,
    turn,
  };
}

// A join or a rejoin already describes the turn. Chiming there would sound on
// every reconnect. Only a later event that newly assigns this exact tab is a grant.
function publishTurn(set, binding, turn, live, receivedAt) {
  const self = { userId: selfUserId(), tabId: binding.tabId };
  const previous = syncDeps.get().turn;
  const wasHolding = Boolean(previous?.holder) && sameTurnTab(previous.holder, self);
  const nowHolding = sameTurnTab(turn?.holder, self);
  // The receipt is the one sampled for this packet. The countdown pairs it
  // with the snapshot, and a null turn clears both.
  set({ turn, turnReceivedAt: turn ? receivedAt : null });
  // A sample queued while this tab held the turn must not leave after a
  // later grant. The throttle would otherwise see the new permission and send it.
  if (wasHolding && !nowHolding) binding.previewThrottle?.cancel();
  // The turn is already published, so a recovery snapshot cannot be edited
  // under the holder that just lost it.
  if (live && wasHolding && !nowHolding) {
    const session = binding.sync;
    if (session && session.pending.length > 0) {
      toast.error("Your turn ended before some edits could be sent");
      sync.beginRecovery(binding);
    }
  }
  if (!live || wasHolding || !nowHolding) return;
  toast.success("It's your turn");
  playTurnSound();
}

// A turn packet during join is deferred so packet order, not timestamp order,
// decides what survives. The ack continuation is already registered: an earlier
// packet's microtask runs before it and finds the workspace not ready, so the
// ack wins. A later packet's microtask runs after the snapshot is installed.
// Packets stay deferred while the attempt is in flight, including after ready,
// so a newer packet cannot publish ahead of one still waiting.
function deferTurn(set, binding, turn, attempt, connectionId, receivedAt) {
  queueMicrotask(() => {
    if (activeBinding !== binding || binding.disposed || binding.attempt !== attempt) return;
    const socket = binding.socket;
    if (!socket?.connected || socket.id !== connectionId) return;
    if (binding.sync?.joinedConnectionId !== connectionId) return;
    const state = syncDeps.get();
    if (state.status !== "ready" || state.project?._id !== binding.projectId) return;
    publishTurn(set, binding, turn, true, receivedAt);
  });
}

// Request, release, cancel, and reclaim share one authority check. Recovery
// stays ready, so it does not block them. Unknown turn state does: null is
// not an empty queue. The server still decides whether the emit sticks.
function emitTurn(get, event, allowed) {
  const binding = activeBinding;
  if (!binding || binding.disposed || !binding.tabId) return;
  const socket = binding.socket;
  if (!socket?.connected) return;
  if (!binding.sync?.joinedConnectionId || socket.id !== binding.sync.joinedConnectionId) return;
  const state = get();
  if (state.status !== "ready" || state.project?._id !== binding.projectId) return;
  if (!state.turn) return;
  const self = { userId: selfUserId(), tabId: binding.tabId };
  if (!self.userId) return;
  if (!allowed(state, self)) return;
  socket.emit(event, { projectId: binding.projectId });
}

function stillCurrent(binding, attempt, socket, connectionId) {
  return activeBinding === binding
    && !binding.disposed
    && binding.attempt === attempt
    && socket.connected
    && socket.id === connectionId;
}

function leaveIfCurrent(binding, attempt, socket, connectionId, projectId) {
  if (!stillCurrent(binding, attempt, socket, connectionId) || !projectId) return;
  socket.emit("workspace:leave", { projectId });
}

const WAKING_NOTICE_MS = 3000;
const WAKING_NOTICE = "Waking the server…";
const RECONNECTING_NOTICE = "Reconnecting…";

function clearNoticeTimer(binding) {
  if (binding.noticeTimer != null) {
    clearTimeout(binding.noticeTimer);
    binding.noticeTimer = null;
  }
}

// emptyWorkspace deliberately leaves connectionNotice alone. A rejoin replaces
// the canvas while "Reconnecting…" must stay up until this attempt goes ready
// or the slow-join timer replaces it.
function clearConnectionNotice(set, binding) {
  clearNoticeTimer(binding);
  binding.noticeDueAt = null;
  if (syncDeps.get().connectionNotice) set({ connectionNotice: null });
}

function armWaking(set, binding, attempt, delay = WAKING_NOTICE_MS) {
  clearNoticeTimer(binding);
  const wait = Math.max(0, delay);
  binding.noticeDueAt = Date.now() + wait;
  binding.noticeTimer = setTimeout(() => {
    binding.noticeTimer = null;
    if (activeBinding !== binding || binding.disposed || binding.attempt !== attempt) return;
    if (syncDeps.get().status !== "loading") return;
    set({ connectionNotice: WAKING_NOTICE });
  }, wait);
}

function failConnection(set, binding) {
  if (activeBinding !== binding || binding.disposed) return;
  clearConnectionNotice(set, binding);
  binding.noticeMode = null;
  binding.wasReady = false;
  binding.attempt += 1;
  binding.inFlight = null;
  binding.presenceBuffer = null;
  if (binding.sync) invalidateSession(binding.sync);
  binding.joinedAccountId = "";
  binding.previewController?.clearAllOverlays();
  binding.previewThrottle?.cancel();
  clearBindingCursors(binding);
  set(emptyWorkspace("error"));
}

// Page exit is best effort. A volatile emit can still land in sendBuffer when
// the heartbeat has expired but the transport looks writable, and that packet
// would flush on a later connection. Drop only the object this call passed.
function releaseOnPageHide(binding) {
  if (activeBinding !== binding || binding.disposed) return;
  if (!selectIsHolder(syncDeps.get())) return;
  const socket = binding.socket;
  const channel = socket?.volatile;
  if (!channel || typeof channel.emit !== "function") return;
  const payload = { projectId: binding.projectId };
  channel.emit("turn:release", payload);
  const buffer = socket.sendBuffer;
  if (!Array.isArray(buffer)) return;
  for (let index = buffer.length - 1; index >= 0; index -= 1) {
    const data = buffer[index]?.data;
    if (Array.isArray(data) && data[0] === "turn:release" && data[1] === payload) {
      buffer.splice(index, 1);
    }
  }
}

function startJoin(set, binding, force) {
  const socket = binding.socket;
  if (!socket?.connected || activeBinding !== binding || binding.disposed) return;
  const connectionId = socket.id;
  if (!force && binding.inFlight?.connectionId === connectionId) return;

  const keepDenial = Boolean(binding.sync?.denialRejoin);
  invalidateSession(binding.sync, { keepDenial });
  binding.sync.joinedConnectionId = connectionId;
  binding.joinedAccountId = rememberConnectionAccount(socket);

  const attempt = ++binding.attempt;
  const projectId = binding.projectId;
  binding.inFlight = { attempt, connectionId };
  // A new attempt must not keep a roster or a snapshot from the previous one,
  // including a presence event that arrived before that attempt's ack.
  binding.presenceBuffer = null;
  binding.cursorController.clearAll();
  binding.cursorThrottle.cancel();
  const continuingInitial = binding.noticeMode === "initial" && binding.noticeDueAt != null;
  const dueAt = binding.noticeDueAt;
  set(emptyWorkspace("loading"));
  // The first connection and its join share one three-second clock. A rejoin
  // after a drop keeps "Reconnecting…" and starts that clock only once the
  // socket is connected again.
  if (binding.noticeMode === "reconnect") {
    armWaking(set, binding, attempt);
  } else if (continuingInitial) {
    armWaking(set, binding, attempt, Math.max(0, dueAt - Date.now()));
  } else {
    binding.noticeMode = "initial";
    armWaking(set, binding, attempt);
  }

  const finish = () => {
    if (binding.inFlight?.attempt === attempt) binding.inFlight = null;
  };

  socket.timeout(10000).emitWithAck("workspace:join", {
    projectId,
    tabId: binding.tabId,
  }).then((ack) => {
    if (!stillCurrent(binding, attempt, socket, connectionId)) return;
    const result = classifyJoin(ack, projectId);
    if (!stillCurrent(binding, attempt, socket, connectionId)) return;
    if (result.ok) {
      // Presence may already be buffered. The turn may not: the server samples
      // it immediately before this ack, so anything queued earlier is older.
      // Installing the ack before ready lets a later packet, deferred behind
      // this continuation, apply without flashing the stale holder.
      clearConnectionNotice(set, binding);
      binding.noticeMode = null;
      binding.wasReady = true;
      const bufferedParticipants = binding.presenceBuffer?.attempt === attempt
        ? binding.presenceBuffer.participants
        : null;
      binding.presenceBuffer = null;
      publishTurn(set, binding, result.turn, false, performance.now());
      sync.onJoined(binding, {
        project: result.project,
        role: result.role,
        canvas: result.canvas,
      });
      if (!stillCurrent(binding, attempt, socket, connectionId)) return;
      const roster = bufferedParticipants ?? result.participants;
      set((state) => ({ participants: roster, cursors: pruneCursors(binding, state.cursors, roster) }));
      return;
    }
    clearConnectionNotice(set, binding);
    binding.noticeMode = null;
    binding.wasReady = false;
    binding.presenceBuffer = null;
    binding.sync.denialRejoin = false;
    binding.sync.toastRecovery = false;
    if (result.message) toast.error(result.message);
    leaveIfCurrent(binding, attempt, socket, connectionId, projectId);
    if (!stillCurrent(binding, attempt, socket, connectionId)) return;
    set(emptyWorkspace(result.notFound ? "notFound" : "error"));
  }).catch(() => {
    if (!stillCurrent(binding, attempt, socket, connectionId)) return;
    clearConnectionNotice(set, binding);
    binding.noticeMode = null;
    binding.wasReady = false;
    binding.presenceBuffer = null;
    binding.sync.denialRejoin = false;
    binding.sync.toastRecovery = false;
    leaveIfCurrent(binding, attempt, socket, connectionId, projectId);
    if (!stillCurrent(binding, attempt, socket, connectionId)) return;
    set(emptyWorkspace("error"));
  }).finally(finish);
}

// The Mongo id of the signed-in account. Workspace state has no authUser.
function selfUserId() {
  return canonicalUserId(useSessionStore.getState().authUser?._id);
}

// Every role may send and receive cursors while the workspace is ready on a
// live joined connection. Canvas-only recovery stays ready, so it is allowed.
function cursorLive(binding, state) {
  if (activeBinding !== binding || binding.disposed) return false;
  const socket = binding.socket;
  if (!socket?.connected) return false;
  const joined = binding.sync?.joinedConnectionId;
  if (!joined || socket.id !== joined) return false;
  if (state.status !== "ready" || !JOIN_ROLES.has(state.role)) return false;
  return state.project?._id === binding.projectId;
}

function clearBindingCursors(binding) {
  binding.cursorThrottle?.cancel();
  binding.cursorController?.clearAll();
  binding.cursorPublished = false;
}

// Drops cursors (and their timers) for users an accepted roster no longer has.
function pruneCursors(binding, cursors, participants) {
  const present = new Set(participants.map((person) => person.userId));
  let next = cursors;
  for (const userId of Object.keys(cursors)) {
    if (present.has(userId)) continue;
    if (next === cursors) next = { ...cursors };
    delete next[userId];
    binding.cursorController.cancelExpiry(userId);
  }
  return next;
}

function disposeBinding(set, binding) {
  if (!binding || binding.disposed) return;
  const owns = activeBinding === binding;
  // Decide before invalidation whether a final cursor:leave is still deliverable.
  const sendCursorLeave = owns && cursorLive(binding, syncDeps.get());
  binding.disposed = true;
  binding.attempt += 1;
  binding.inFlight = null;
  binding.presenceBuffer = null;
  if (binding.sync) invalidateSession(binding.sync);
  if (binding.previewThrottle) binding.previewThrottle.cancel();
  if (binding.previewController) binding.previewController.clearAllOverlays();
  if (binding.cursorThrottle) binding.cursorThrottle.cancel();
  if (binding.cursorController) binding.cursorController.dispose();
  binding.unsubscribe?.();
  binding.unsubscribe = null;
  binding.unlisten?.();
  binding.unlisten = null;
  binding.removePageHide?.();
  binding.removePageHide = null;
  // A disposer from an older route must not leave or clear the binding that replaced it.
  if (!owns) return;
  clearConnectionNotice(set, binding);
  binding.noticeMode = null;
  binding.wasReady = false;
  activeBinding = null;
  if (sendCursorLeave) {
    binding.socket.volatile?.emit("cursor:leave", { projectId: binding.projectId });
  }
  if (binding.socket?.connected && binding.projectId) {
    binding.socket.emit("workspace:leave", { projectId: binding.projectId });
  }
  set(emptyWorkspace("idle"));
}

function restoreDisplay(set, get) {
  const state = get();
  set({
    rfNodes: displayNodes(activeBinding, state.canvas.nodes, state.canvas.nodes, state.rfNodes),
    rfEdges: toDisplayEdges(state.canvas.edges, state.rfEdges),
  });
}

// NodeResizer calls onResizeEnd first, then emits one dimensions change with
// resizing: false and the size it tried to apply. applyNodeChanges writes that
// size onto measured, which React Flow draws ahead of width, so a rejected
// resize would reappear. The canonical size is already final, and this
// notification only settles to it. In-progress resizes and ordinary
// measurements stay display-only and never become another update.
function settleResizeEnd(change, nodes) {
  if (change.type !== "dimensions" || change.resizing !== false) return change;
  const canonical = nodes.find((node) => node.id === change.id);
  if (!canonical) return change;
  return {
    id: change.id,
    type: "dimensions",
    resizing: false,
    setAttributes: true,
    dimensions: { width: canonical.width, height: canonical.height },
  };
}

export const useWorkspaceStore = create((set, get) => {
  syncDeps.get = get;
  syncDeps.set = set;
  return {
  ...emptyWorkspace("idle"),
  connectionNotice: null,

  // Socket listeners live here so the page never emits. The disposer is the
  // effect cleanup: it drops only the listeners this binding registered.
  bindWorkspace: (socket, projectId) => {
    // Retire the previous binding while it still owns its socket. Doing this
    // after the swap makes its disposer skip the leave, so a connected socket
    // keeps the old project room.
    if (activeBinding && !activeBinding.disposed) disposeBinding(set, activeBinding);

    const previewController = createPreviewOverlayController({
      onExpire: () => {
        if (activeBinding !== binding || binding.disposed) return;
        set((state) => ({
          rfNodes: displayNodes(binding, state.canvas.nodes, state.canvas.nodes, state.rfNodes),
        }));
      },
    });
    const cursorController = createCursorExpiryController((userId) => {
      set((state) => {
        if (!state.cursors[userId]) return state;
        const next = { ...state.cursors };
        delete next[userId];
        return { cursors: next };
      });
    });

    const binding = {
      cursorPublished: false,
      unsubscribe: null,
      socket: socket ?? null,
      projectId: canonicalProjectId(projectId),
      attempt: 0,
      inFlight: null,
      disposed: false,
      unlisten: null,
      sync: createSyncState(),
      previewThrottle: throttle(({ projectId, nodes }) => {
        if (activeBinding !== binding || binding.disposed) return;
        if (projectId !== binding.projectId || !selectCanEdit(get())) return;
        binding.socket.volatile.emit("canvas:preview", { projectId, nodes });
      }, 50),
      previewController,
      joinedAccountId: "",
      tabId: getTabId(),
      // The callback revalidates its own binding, join attempt and connection
      // when it runs, so queued work never reaches a replacement binding.
      cursorThrottle: throttle(({ projectId, x, y, attempt, connectionId }) => {
        if (!cursorLive(binding, get())) return;
        if (binding.attempt !== attempt || binding.socket.id !== connectionId) return;
        if (projectId !== binding.projectId) return;
        binding.socket.volatile?.emit("cursor:move", { projectId, x, y });
      }, 50),
      cursorController,
      presenceBuffer: null,
      noticeTimer: null,
      noticeDueAt: null,
      noticeMode: null,
      wasReady: false,
      removePageHide: null,
    };
    activeBinding = binding;
    syncDeps.get = get;
    syncDeps.set = set;
    set(emptyWorkspace("loading"));
    // Failure transitions reached through the sync helper (error, notFound,
    // emptyWorkspace) bypass this file, so the binding watches status itself.
    binding.unsubscribe = useWorkspaceStore.subscribe((state) => {
      if (state.status !== "ready") {
        clearBindingCursors(binding);
        clearPreviews(binding);
      }
      if (activeBinding !== binding || binding.disposed) return;
      if (state.status === "ready" || state.status === "error" || state.status === "notFound" || state.status === "idle") {
        if (binding.noticeTimer != null || state.connectionNotice) clearConnectionNotice(set, binding);
      }
    });

    if (socket) {
      const onConnect = () => {
        if (activeBinding !== binding || binding.disposed) return;
        startJoin(set, binding, false);
      };
      const onDisconnect = () => {
        if (activeBinding !== binding || binding.disposed) return;
        // Drop role, queued edits, and the canvas together. A reconnect joins
        // again and installs whatever the server saved. Unsent work is not replayed.
        const session = binding.sync;
        if (session && (session.pending.length > 0 || session.commit)) {
          toast.error("Connection lost. Some edits may not have been saved");
        }
        if (binding.socket?.active === false) {
          failConnection(set, binding);
          return;
        }
        const reconnecting = binding.wasReady || binding.noticeMode === "reconnect";
        const initialDue = !reconnecting && binding.noticeMode === "initial" ? binding.noticeDueAt : null;
        binding.wasReady = false;
        clearConnectionNotice(set, binding);
        binding.attempt += 1;
        binding.inFlight = null;
        invalidateSession(binding.sync);
        binding.sync.joinedConnectionId = null;
        binding.joinedAccountId = "";
        binding.presenceBuffer = null;
        binding.previewController.clearAllOverlays();
        binding.previewThrottle.cancel();
        clearBindingCursors(binding);
        set(emptyWorkspace("loading"));
        if (reconnecting) {
          binding.noticeMode = "reconnect";
          set({ connectionNotice: RECONNECTING_NOTICE });
          return;
        }
        binding.noticeMode = "initial";
        const remaining = initialDue == null ? WAKING_NOTICE_MS : Math.max(0, initialDue - Date.now());
        armWaking(set, binding, binding.attempt, remaining);
      };
      const onConnectError = () => {
        if (activeBinding !== binding || binding.disposed) return;
        if (binding.socket?.active === false) failConnection(set, binding);
      };
      const onPageHide = () => releaseOnPageHide(binding);
      const onPresence = (payload) => {
        if (activeBinding !== binding || binding.disposed) return;
        const live = binding.socket;
        if (!live?.connected || live.id !== binding.sync?.joinedConnectionId) return;
        if (!isRecord(payload) || typeof payload.projectId !== "string") return;
        if (payload.projectId.toLowerCase() !== binding.projectId) return;
        const participants = normalizeParticipants(payload.participants);
        if (!participants) return;

        const state = get();
        // Recovery still has a joined connection. Canvas sync must not block
        // the roster, and a snapshot publish must not clear it.
        if (state.status === "ready") {
          set((current) => ({
            participants,
            cursors: pruneCursors(binding, current.cursors, participants),
          }));
          return;
        }
        if (binding.inFlight) {
          binding.presenceBuffer = { attempt: binding.inFlight.attempt, participants };
        }
      };
      const onTurn = (payload) => {
        if (activeBinding !== binding || binding.disposed) return;
        const live = binding.socket;
        if (!live?.connected || live.id !== binding.sync?.joinedConnectionId) return;
        if (!isRecord(payload) || typeof payload.projectId !== "string") return;
        if (payload.projectId.toLowerCase() !== binding.projectId) return;
        const receivedAt = performance.now();
        const turn = normalizeTurn(payload);
        if (!turn) return;
        // finally clears the attempt only after the ack continuation. Until
        // then every packet for this join stays in arrival order. The receipt
        // is taken now so a deferred packet does not look newer than it was.
        if (binding.inFlight) {
          deferTurn(set, binding, turn, binding.inFlight.attempt, binding.inFlight.connectionId, receivedAt);
          return;
        }
        const state = get();
        if (state.status === "ready" && state.project?._id === binding.projectId) {
          publishTurn(set, binding, turn, true, receivedAt);
        }
      };
      const onOps = (payload) => {
        if (activeBinding !== binding || binding.disposed) return;
        sync.onRemote(binding, payload);
      };
      const onPreview = (payload) => {
        if (activeBinding !== binding || binding.disposed) return;
        const live = binding.socket;
        if (!live?.connected || live.id !== binding.sync?.joinedConnectionId) return;
        const state = get();
        if (state.status !== "ready" || state.syncStatus === "syncing") return;
        if (!isRecord(payload) || typeof payload.projectId !== "string") return;
        const received = payload.projectId.toLowerCase();
        if (received !== binding.projectId) return;
        if (!Array.isArray(payload.nodes)) return;

        const result = binding.previewController.receivePreview(payload, () => state.canvas.nodes);
        if (!result.ok) return;

        set((current) => ({
          rfNodes: displayNodes(binding, current.canvas.nodes, current.canvas.nodes, current.rfNodes),
        }));
      };
      const onCursorMove = (payload) => {
        const state = get();
        if (!cursorLive(binding, state)) return;
        const move = validateInboundCursorMove(payload);
        if (!move || move.projectId !== binding.projectId) return;
        if (move.userId === selfUserId()) return;
        if (!state.participants.some((person) => person.userId === move.userId)) return;
        set((current) => ({
          cursors: {
            ...current.cursors,
            [move.userId]: { x: move.x, y: move.y, lastSeen: Date.now() },
          },
        }));
        binding.cursorController.scheduleExpiry(move.userId);
      };
      const onCursorLeave = (payload) => {
        const state = get();
        if (!cursorLive(binding, state)) return;
        const leave = validateInboundCursorLeave(payload);
        if (!leave || leave.projectId !== binding.projectId) return;
        if (leave.userId === selfUserId()) return;
        binding.cursorController.cancelExpiry(leave.userId);
        if (!state.cursors[leave.userId]) return;
        set((current) => {
          const next = { ...current.cursors };
          delete next[leave.userId];
          return { cursors: next };
        });
      };
      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      socket.on("connect_error", onConnectError);
      socket.on("canvas:ops", onOps);
      socket.on("canvas:preview", onPreview);
      socket.on("presence:update", onPresence);
      socket.on("turn:state", onTurn);
      socket.on("cursor:move", onCursorMove);
      socket.on("cursor:leave", onCursorLeave);
      if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("pagehide", onPageHide);
        binding.removePageHide = () => window.removeEventListener("pagehide", onPageHide);
      }
      binding.unlisten = () => {
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("connect_error", onConnectError);
        socket.off("canvas:ops", onOps);
        socket.off("canvas:preview", onPreview);
        socket.off("presence:update", onPresence);
        socket.off("turn:state", onTurn);
        socket.off("cursor:move", onCursorMove);
        socket.off("cursor:leave", onCursorLeave);
      };
      if (!socket.connected && socket.active === false) failConnection(set, binding);
      else if (socket.connected) startJoin(set, binding, false);
      else {
        binding.noticeMode = "initial";
        armWaking(set, binding, binding.attempt);
      }
    }

    return () => disposeBinding(set, binding);
  },

  retryWorkspace: () => {
    const binding = activeBinding;
    if (!binding || binding.disposed) return;
    const socket = binding.socket;
    clearConnectionNotice(set, binding);
    binding.wasReady = false;
    binding.noticeMode = null;
    if (!socket?.connected) {
      binding.attempt += 1;
      binding.inFlight = null;
      binding.presenceBuffer = null;
      invalidateSession(binding.sync);
      clearBindingCursors(binding);
      binding.previewThrottle?.cancel();
      binding.previewController?.clearAllOverlays();
      set(emptyWorkspace("loading"));
      binding.noticeMode = "initial";
      armWaking(set, binding, binding.attempt);
      if (socket && socket.active === false && typeof socket.connect === "function") socket.connect();
      return;
    }
    startJoin(set, binding, true);
  },

  resetWorkspace: () => {
    if (activeBinding) disposeBinding(set, activeBinding);
    else set({ ...emptyWorkspace("idle"), connectionNotice: null });
  },

  requestTurn: () => {
    emitTurn(get, "turn:request", (state, self) => {
      if (state.role !== "owner" && state.role !== "editor") return false;
      if (sameTurnTab(state.turn.holder, self)) return false;
      return !state.turn.queue.some((entry) => sameTurnTab(entry, self));
    });
  },

  releaseTurn: () => {
    emitTurn(get, "turn:release", (state, self) => {
      if (state.role !== "owner" && state.role !== "editor") return false;
      return sameTurnTab(state.turn.holder, self);
    });
  },

  cancelTurnRequest: () => {
    emitTurn(get, "turn:cancel", (state, self) => {
      if (state.role !== "owner" && state.role !== "editor") return false;
      return state.turn.queue.some((entry) => sameTurnTab(entry, self));
    });
  },

  reclaimTurn: () => {
    emitTurn(get, "turn:reclaim", (state, self) => {
      if (state.role !== "owner" || !state.turn.holder) return false;
      return !sameTurnTab(state.turn.holder, self);
    });
  },

  dispatch: (ops) => {
    const state = get();
    // The server is the real gate from S14. This keeps a viewer's UI from
    // showing edits that would be rejected. A refused call still snaps the
    // display back, because a drag can move rfNodes before the gate runs.
    if (!selectCanEdit(state)) {
      restoreDisplay(set, get);
      return false;
    }

    const result = applyOps(state.canvas, ops);
    if (!result.ok) {
      toast.error(result.error);
      restoreDisplay(set, get);
      return false;
    }

    // version stays at the last confirmed server version. The normalized ops
    // queue behind the single in-flight commit and are not applied twice.
    const canvas = {
      nodes: result.canvas.nodes,
      edges: result.canvas.edges,
      version: state.canvas.version,
    };
    set({
      canvas,
      rfNodes: displayNodes(activeBinding, canvas.nodes, state.canvas.nodes, state.rfNodes),
      rfEdges: toDisplayEdges(canvas.edges, state.rfEdges),
    });
    sync.enqueue(activeBinding, result.ops);
    return true;
  },

  // onNodeDragStop's third argument is every node that gesture moved.
  // Selection drags use the same callback, so there is no second commit.
  commitNodePositions: (nodes) => {
    get().cancelPreviewThrottle();
    if (!selectCanEdit(get())) {
      restoreDisplay(set, get);
      return false;
    }

    const canonicalById = new Map(get().canvas.nodes.map((node) => [node.id, node]));
    const seen = new Set();
    const ops = [];
    const moved = Array.isArray(nodes) ? nodes : [];

    for (const node of moved) {
      if (!isRecord(node) || typeof node.id !== "string" || seen.has(node.id)) continue;
      seen.add(node.id);
      const current = canonicalById.get(node.id);
      if (!current) continue;
      const position = isRecord(node.position) ? node.position : {};
      if (position.x === current.position.x && position.y === current.position.y) continue;
      ops.push({
        type: "node.update",
        id: node.id,
        patch: { position: { x: position.x, y: position.y } },
      });
    }

    if (ops.length === 0) return true;
    return get().dispatch(ops);
  },

  commitNodeResize: (id, params) => {
    get().cancelPreviewThrottle();
    if (!selectCanEdit(get())) {
      restoreDisplay(set, get);
      return false;
    }

    const current = get().canvas.nodes.find((node) => node.id === id);
    if (!current || !isRecord(params)) {
      restoreDisplay(set, get);
      return false;
    }

    if (
      params.x === current.position.x &&
      params.y === current.position.y &&
      params.width === current.width &&
      params.height === current.height
    ) {
      return true;
    }

    return get().dispatch([
      {
        type: "node.update",
        id,
        patch: {
          position: { x: params.x, y: params.y },
          width: params.width,
          height: params.height,
        },
      },
    ]);
  },

  // onDelete lists a removed node's edges too. node.remove already drops
  // those, and a following edge.remove fails with "Edge not found" and
  // rejects the whole batch. Only an edge whose canonical endpoints both
  // survive becomes its own op. Endpoint ids come from the stored edge.
  deleteElements: (payload) => {
    if (!selectCanEdit(get())) {
      restoreDisplay(set, get);
      return false;
    }

    const state = get();
    const canonicalNodeIds = new Set(state.canvas.nodes.map((node) => node.id));
    const canonicalEdgeById = new Map(state.canvas.edges.map((edge) => [edge.id, edge]));
    const requestedNodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
    const requestedEdges = Array.isArray(payload?.edges) ? payload.edges : [];
    const removedNodeIds = [];
    const seenNodes = new Set();

    for (const node of requestedNodes) {
      if (!isRecord(node) || typeof node.id !== "string" || seenNodes.has(node.id)) continue;
      if (!canonicalNodeIds.has(node.id)) continue;
      seenNodes.add(node.id);
      removedNodeIds.push(node.id);
    }

    const removed = new Set(removedNodeIds);
    const edgeOps = [];
    const seenEdges = new Set();

    for (const edge of requestedEdges) {
      if (!isRecord(edge) || typeof edge.id !== "string" || seenEdges.has(edge.id)) continue;
      const canonical = canonicalEdgeById.get(edge.id);
      if (!canonical || removed.has(canonical.source) || removed.has(canonical.target)) continue;
      seenEdges.add(edge.id);
      edgeOps.push({ type: "edge.remove", id: edge.id });
    }

    const ops = [
      ...removedNodeIds.map((id) => ({ type: "node.remove", id })),
      ...edgeOps,
    ];
    if (ops.length === 0) return true;
    return get().dispatch(ops);
  },

  // The draft lives in the editor. This compares the latest canonical label,
  // so a color change during typing cannot be what gets saved, and an unchanged
  // value never becomes an op. applyOps still rejects a non-string or a label
  // past the shared limit.
  setNodeLabel: (id, label) => {
    if (!selectCanEdit(get())) {
      restoreDisplay(set, get);
      return false;
    }

    const current = get().canvas.nodes.find((node) => node.id === id);
    if (!current) return false;
    if (label === current.data?.label) return true;

    return get().dispatch([{ type: "node.update", id, patch: { data: { label } } }]);
  },

  // A fresh id on every call keeps parallel edges apart. applyOps still rejects
  // a missing node or a handle it does not know, and a viewer never gets that far.
  connectNodes: (connection) => {
    if (!selectCanEdit(get())) {
      restoreDisplay(set, get);
      return false;
    }
    if (!isRecord(connection)) return false;

    return get().dispatch([{
      type: "edge.add",
      edge: {
        id: createEdgeId(),
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? null,
        targetHandle: connection.targetHandle ?? null,
        type: "link",
        data: { label: "" },
      },
    }]);
  },

  // The draft lives in the editor. An unchanged label is not an op, and a
  // missing edge is left missing. applyOps rejects a non-string or a label
  // past the shared limit without touching the accepted canvas.
  setEdgeLabel: (id, label) => {
    if (!selectCanEdit(get())) {
      restoreDisplay(set, get);
      return false;
    }

    const current = get().canvas.edges.find((edge) => edge.id === id);
    if (!current) return false;
    if (label === current.data?.label) return true;

    return get().dispatch([{ type: "edge.update", id, patch: { data: { label } } }]);
  },

  // The label sits in a portal outside the edge wrapper, so it cannot use the
  // wrapper's click. This mirrors that click: Ctrl/Cmd adds, and a plain click
  // selects this edge and clears the rest. Nothing here is an op.
  selectEdge: (id, additive) => {
    const state = get();
    const edge = state.rfEdges.find((item) => item.id === id);
    if (!edge) return false;

    if (additive) {
      get().onEdgesChange([{ type: "select", id, selected: !edge.selected }]);
      return true;
    }

    const nodeChanges = state.rfNodes
      .filter((node) => node.selected)
      .map((node) => ({ type: "select", id: node.id, selected: false }));
    if (nodeChanges.length > 0) get().onNodesChange(nodeChanges);

    const edgeChanges = [];
    for (const item of state.rfEdges) {
      const selected = item.id === id;
      if (Boolean(item.selected) !== selected) {
        edgeChanges.push({ type: "select", id: item.id, selected });
      }
    }
    if (edgeChanges.length > 0) get().onEdgesChange(edgeChanges);
    return true;
  },

  // Both fields are compared. A fixture can carry a matching fill with a
  // different text color, and choosing that palette name has to repair the pair.
  // The patch names only the colors, so a label edited in the same session stays.
  setNodeColor: (id, paletteName) => {
    if (!selectCanEdit(get())) {
      restoreDisplay(set, get);
      return false;
    }

    const current = get().canvas.nodes.find((node) => node.id === id);
    if (!current) return false;
    const pair = NODE_COLORS.find((item) => item.name === paletteName);
    if (!pair) return false;
    if (current.data?.color === pair.fill && current.data?.textColor === pair.text) return true;

    return get().dispatch([{
      type: "node.update",
      id,
      patch: { data: { color: pair.fill, textColor: pair.text } },
    }]);
  },

  onNodesChange: (changes) => {
    // remove is ignored here. onDelete dispatches the validated ops, and
    // applying the notification as well would delete before validation or twice.
    const kept = changes.filter((change) => DISPLAY_NODE_CHANGES.has(change.type));
    if (kept.length === 0) return;
    set((state) => ({
      rfNodes: applyNodeChanges(
        kept.map((change) => settleResizeEnd(change, state.canvas.nodes)),
        state.rfNodes,
      ),
    }));
  },

  onEdgesChange: (changes) => {
    const kept = changes.filter((change) => change.type === "select");
    if (kept.length === 0) return;
    set((state) => ({ rfEdges: applyEdgeChanges(kept, state.rfEdges) }));
  },

  onNodeDrag: (_event, _node, nodes) => {
    if (!Array.isArray(nodes)) return;
    const state = get();
    if (!selectCanEdit(state)) return;
    const binding = activeBinding;
    if (!binding || binding.disposed || !binding.socket?.connected) return;
    if (binding.socket.id !== binding.sync?.joinedConnectionId) return;

    const canonicalById = new Map(state.canvas.nodes.map((n) => [n.id, n]));
    const previewNodes = [];
    for (const node of nodes) {
      if (!node || typeof node.id !== "string") continue;
      const canonical = canonicalById.get(node.id);
      if (!canonical) continue;
      const position = node.position;
      if (!position || typeof position.x !== "number" || typeof position.y !== "number") continue;
      previewNodes.push({ id: node.id, position: { x: position.x, y: position.y } });
    }
    if (previewNodes.length === 0 || previewNodes.length > 50) return;

    binding.previewThrottle({ projectId: binding.projectId, nodes: previewNodes });
  },

  onNodeResize: (id, params) => {
    const state = get();
    if (!selectCanEdit(state)) return;
    const binding = activeBinding;
    if (!binding || binding.disposed || !binding.socket?.connected) return;
    if (binding.socket.id !== binding.sync?.joinedConnectionId) return;

    const canonical = state.canvas.nodes.find((n) => n.id === id);
    if (!canonical) return;
    if (!params || typeof params.x !== "number" || typeof params.y !== "number" ||
        typeof params.width !== "number" || typeof params.height !== "number") return;

    binding.previewThrottle({
      projectId: binding.projectId,
      nodes: [{ id, position: { x: params.x, y: params.y }, width: params.width, height: params.height }],
    });
  },

  cancelPreviewThrottle: () => {
    const binding = activeBinding;
    if (binding && binding.previewThrottle) {
      binding.previewThrottle.cancel();
    }
  },

  moveCursor: (point) => {
    const binding = activeBinding;
    if (!binding || binding.disposed) return;
    if (!cursorLive(binding, get())) return;
    if (!isRecord(point)) return;
    const valid = validateCursorMove({ projectId: binding.projectId, x: point.x, y: point.y });
    if (!valid) return;
    binding.cursorPublished = true;
    binding.cursorThrottle({
      projectId: valid.projectId,
      x: valid.x,
      y: valid.y,
      attempt: binding.attempt,
      connectionId: binding.socket.id,
    });
  },

  // A leave cancels pending movement first so a trailing point cannot recreate
  // the cursor, then emits only when a point was published on a live join.
  leaveCursor: () => {
    const binding = activeBinding;
    if (!binding || binding.disposed) return;
    binding.cursorThrottle.cancel();
    if (!binding.cursorPublished) return;
    binding.cursorPublished = false;
    if (!cursorLive(binding, get())) return;
    binding.socket.volatile?.emit("cursor:leave", { projectId: binding.projectId });
  },
};
});
