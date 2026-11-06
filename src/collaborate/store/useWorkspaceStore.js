import { applyEdgeChanges, applyNodeChanges } from "@xyflow/react";
import { toast } from "react-toastify";
import { create } from "zustand";

import { applyOps, NODE_COLORS } from "@shared/canvasOps.js";
import { axiosInstance } from "../lib/axios";

// StrictMode and fast project switches can overlap. Only the latest load may
// write state, and reset bumps the counter so an in-flight response cannot land.
let loadRequest = 0;

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
    };
  });
}

const DISPLAY_NODE_CHANGES = new Set(["select", "position", "dimensions"]);

function isRecord(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
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

  loadWorkspace: async (projectId) => {
    const request = ++loadRequest;
    // The store outlives the route, so the previous project's canvas is cleared
    // before this request can resolve.
    set(emptyWorkspace("loading"));
    try {
      const res = await axiosInstance.get(`/projects/${projectId}`);
      if (request !== loadRequest) return;
      // The stored canvas arrives with workspace:join in S13. Until then every
      // open starts empty, and nothing here is saved or sent.
      set({
        ...emptyWorkspace("ready"),
        project: res.data.project,
        role: res.data.role,
      });
    } catch (error) {
      if (request !== loadRequest) return;
      set(emptyWorkspace(error.response?.status === 404 ? "notFound" : "error"));
    }
  },

  resetWorkspace: () => {
    loadRequest += 1;
    set(emptyWorkspace("idle"));
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
