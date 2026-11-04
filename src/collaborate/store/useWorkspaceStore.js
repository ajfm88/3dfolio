import { applyEdgeChanges, applyNodeChanges } from "@xyflow/react";
import { toast } from "react-toastify";
import { create } from "zustand";

import { applyOps } from "@shared/canvasOps.js";
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
    if (prior?.measured) display.measured = prior.measured;
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
    // showing edits that would be rejected.
    if (!selectCanEdit(state)) return false;

    const result = applyOps(state.canvas, ops);
    if (!result.ok) {
      toast.error(result.error);
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

  onNodesChange: (changes) => {
    // Deletes become ops through onDelete in S10. Applying remove here would
    // delete twice, and nothing outside dispatch may add content.
    const kept = changes.filter((change) => DISPLAY_NODE_CHANGES.has(change.type));
    if (kept.length === 0) return;
    set((state) => ({ rfNodes: applyNodeChanges(kept, state.rfNodes) }));
  },

  onEdgesChange: (changes) => {
    const kept = changes.filter((change) => change.type === "select");
    if (kept.length === 0) return;
    set((state) => ({ rfEdges: applyEdgeChanges(kept, state.rfEdges) }));
  },
}));
