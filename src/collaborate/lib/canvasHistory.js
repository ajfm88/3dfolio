import { applyOps, invertOps, MAX_OPS_PER_COMMIT } from "@shared/canvasOps.js";

// A client memory policy, not a server limit. Redo can never hold more than
// the undo frames that produced it.
export const MAX_UNDO_FRAMES = 100;

function nodeKey(node) {
  return JSON.stringify([
    node.id, node.type, node.position.x, node.position.y, node.width, node.height,
    node.data.label, node.data.shape, node.data.color, node.data.textColor,
  ]);
}

function edgeKey(edge) {
  return JSON.stringify([
    edge.id, edge.source, edge.target, edge.sourceHandle, edge.targetHandle,
    edge.type, edge.data?.label ?? "",
  ]);
}

// Equal by id and fields. Array order and the version are not part of the
// round-trip contract: an undo restores content, not z-order or version.
export function sameGraph(a, b) {
  if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) return false;
  const nodes = new Map(a.nodes.map((node) => [node.id, nodeKey(node)]));
  for (const node of b.nodes) {
    if (nodes.get(node.id) !== nodeKey(node)) return false;
  }
  const edges = new Map(a.edges.map((edge) => [edge.id, edgeKey(edge)]));
  for (const edge of b.edges) {
    if (edges.get(edge.id) !== edgeKey(edge)) return false;
  }
  return true;
}

// Contiguous slices, in order, none dropped or merged. An inverse can be
// longer than one commit may carry (a node with 600 edges), so the sequence is
// replayed as several commits and never as one enlarged envelope.
export function chunkOps(ops, size = MAX_OPS_PER_COMMIT) {
  const chunks = [];
  for (let at = 0; at < ops.length; at += size) chunks.push(ops.slice(at, at + size));
  return chunks;
}

// One public dispatch becomes one frame. `canvas` is the optimistic canonical
// graph the dispatch ran against and `normalized` and `after` are applyOps'
// own output for it. Returns null when nothing changed (nothing to undo, and
// redo must survive), or when the inverse cannot be built, which the caller
// treats as a reason to drop history rather than keep a hole in it.
export function prepareFrame(canvas, normalized, after) {
  if (sameGraph(canvas, after)) return { changed: false, frame: null };
  const inverse = invertOps(canvas, normalized);
  if (!inverse.ok) return { changed: true, frame: null };
  return {
    changed: true,
    frame: { forward: structuredClone(normalized), inverse: inverse.ops },
  };
}

// Dry-runs every chunk against a private copy before anything is published
// or sent, so a sequence that no longer applies fails whole.
export function prepareReplay(canvas, ops) {
  let current = canvas;
  const chunks = [];
  for (const chunk of chunkOps(ops)) {
    const applied = applyOps(current, chunk);
    if (!applied.ok) return { ok: false, error: applied.error };
    chunks.push(applied.ops);
    current = applied.canvas;
  }
  if (chunks.length === 0) return { ok: false, error: "Nothing to replay" };
  return { ok: true, chunks, canvas: { nodes: current.nodes, edges: current.edges } };
}

// Memory-only stacks for one binding. generation moves on every clear, so a
// late callback that captured an earlier value can tell its history is gone.
export function createCanvasHistory() {
  const history = {
    generation: 0,
    undo: [],
    redo: [],
    // A new edit is the only thing that clears redo.
    record(frame) {
      history.redo = [];
      history.undo.push(frame);
      while (history.undo.length > MAX_UNDO_FRAMES) history.undo.shift();
    },
    clear() {
      history.generation += 1;
      history.undo = [];
      history.redo = [];
    },
    // Moves the top frame across after a fully drained replay. The frame is
    // checked by identity so a stale completion cannot pop a newer one.
    transfer(kind, frame) {
      const from = kind === "undo" ? history.undo : history.redo;
      const to = kind === "undo" ? history.redo : history.undo;
      if (from[from.length - 1] !== frame) return false;
      from.pop();
      to.push(frame);
      while (history.undo.length > MAX_UNDO_FRAMES) history.undo.shift();
      return true;
    },
  };
  return history;
}
