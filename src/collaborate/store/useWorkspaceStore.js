import { MarkerType, applyEdgeChanges, applyNodeChanges } from "@xyflow/react";
import { toast } from "react-toastify";
import { create } from "zustand";

import { applyOps, NODE_COLORS, createEdgeId, normalizeCanvas } from "@shared/canvasOps.js";
import { getTabId } from "../lib/tabId";

// The route effect owns one binding at a time. A late ack is ignored unless it
// still matches this object, the socket id captured at emit, and its attempt.
let activeBinding = null;

function emptyWorkspace(status) {
  return {
    status,
    project: null,
    role: null,
    canvas: { nodes: [], edges: [], version: 0 },
    rfNodes: [],
    rfEdges: [],
  };
}

// From S20 this also means holding the turn. One helper keeps that change in one place.
export const selectCanEdit = (s) => s.role === "owner" || s.role === "editor";

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
  const valid = receivedId === projectId
    && JOIN_ROLES.has(ack.role)
    && isRecord(ack.canvas)
    && Array.isArray(ack.canvas.nodes)
    && Array.isArray(ack.canvas.edges)
    && Number.isInteger(version)
    && version >= 0
    && Array.isArray(ack.participants)
    && ack.participants.length === 0
    && ack.turn === null
    && Number.isFinite(ack.serverNow);
  if (!valid) return { ok: false, notFound: false, message: "" };

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
  };
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

function installSnapshot(set, project, role, canvas) {
  // Empty previous selection: a loaded snapshot starts unselected, and it
  // replaces whatever this client had changed locally.
  set({
    status: "ready",
    project,
    role,
    canvas,
    rfNodes: toDisplayNodes(canvas.nodes, []),
    rfEdges: toDisplayEdges(canvas.edges, []),
  });
}

function startJoin(set, binding, force) {
  const socket = binding.socket;
  if (!socket?.connected || activeBinding !== binding || binding.disposed) return;
  const connectionId = socket.id;
  if (!force && binding.inFlight?.connectionId === connectionId) return;

  const attempt = ++binding.attempt;
  const projectId = binding.projectId;
  binding.inFlight = { attempt, connectionId };
  set(emptyWorkspace("loading"));

  const finish = () => {
    if (binding.inFlight?.attempt === attempt) binding.inFlight = null;
  };

  socket.timeout(10000).emitWithAck("workspace:join", {
    projectId,
    tabId: getTabId(),
  }).then((ack) => {
    if (!stillCurrent(binding, attempt, socket, connectionId)) return;
    const result = classifyJoin(ack, projectId);
    if (!stillCurrent(binding, attempt, socket, connectionId)) return;
    if (result.ok) {
      installSnapshot(set, result.project, result.role, result.canvas);
      return;
    }
    if (result.message) toast.error(result.message);
    leaveIfCurrent(binding, attempt, socket, connectionId, projectId);
    if (!stillCurrent(binding, attempt, socket, connectionId)) return;
    set(emptyWorkspace(result.notFound ? "notFound" : "error"));
  }).catch(() => {
    if (!stillCurrent(binding, attempt, socket, connectionId)) return;
    leaveIfCurrent(binding, attempt, socket, connectionId, projectId);
    if (!stillCurrent(binding, attempt, socket, connectionId)) return;
    set(emptyWorkspace("error"));
  }).finally(finish);
}

function disposeBinding(set, binding) {
  if (!binding || binding.disposed) return;
  const owns = activeBinding === binding;
  binding.disposed = true;
  binding.attempt += 1;
  binding.inFlight = null;
  binding.unlisten?.();
  binding.unlisten = null;
  // A disposer from an older route must not leave or clear the binding that replaced it.
  if (!owns) return;
  activeBinding = null;
  if (binding.socket?.connected && binding.projectId) {
    binding.socket.emit("workspace:leave", { projectId: binding.projectId });
  }
  set(emptyWorkspace("idle"));
}

function restoreDisplay(set, get) {
  const state = get();
  set({
    rfNodes: toDisplayNodes(state.canvas.nodes, state.rfNodes),
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

export const useWorkspaceStore = create((set, get) => ({
  ...emptyWorkspace("idle"),

  // Socket listeners live here so the page never emits. The disposer is the
  // effect cleanup: it drops only the listeners this binding registered.
  bindWorkspace: (socket, projectId) => {
    // Retire the previous binding while it still owns its socket. Doing this
    // after the swap makes its disposer skip the leave, so a connected socket
    // keeps the old project room.
    if (activeBinding && !activeBinding.disposed) disposeBinding(set, activeBinding);

    const binding = {
      socket: socket ?? null,
      projectId: canonicalProjectId(projectId),
      attempt: 0,
      inFlight: null,
      disposed: false,
      unlisten: null,
    };
    activeBinding = binding;
    set(emptyWorkspace("loading"));

    if (socket) {
      const onConnect = () => {
        if (activeBinding !== binding || binding.disposed) return;
        startJoin(set, binding, false);
      };
      const onDisconnect = () => {
        if (activeBinding !== binding || binding.disposed) return;
        // Drop role and the canvas together so a disconnected client cannot edit stale content.
        binding.attempt += 1;
        binding.inFlight = null;
        set(emptyWorkspace("loading"));
      };
      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      binding.unlisten = () => {
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
      };
      if (socket.connected) startJoin(set, binding, false);
    }

    return () => disposeBinding(set, binding);
  },

  retryWorkspace: () => {
    const binding = activeBinding;
    if (!binding || binding.disposed) return;
    if (!binding.socket?.connected) {
      binding.attempt += 1;
      binding.inFlight = null;
      set(emptyWorkspace("loading"));
      return;
    }
    startJoin(set, binding, true);
  },

  resetWorkspace: () => {
    if (activeBinding) disposeBinding(set, activeBinding);
    else set(emptyWorkspace("idle"));
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

    // version stays as it is. S15 sets it from commit acks.
    const canvas = {
      nodes: result.canvas.nodes,
      edges: result.canvas.edges,
      version: state.canvas.version,
    };
    set({
      canvas,
      rfNodes: toDisplayNodes(canvas.nodes, state.rfNodes),
      rfEdges: toDisplayEdges(canvas.edges, state.rfEdges),
    });
    return true;
  },

  // onNodeDragStop's third argument is every node that gesture moved.
  // Selection drags use the same callback, so there is no second commit.
  commitNodePositions: (nodes) => {
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
}));
