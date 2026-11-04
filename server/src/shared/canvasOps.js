// This file is the only definition of what a valid canvas is and how an op
// changes it. It lives in shared/ because the client bundles this same file
// (the Vite alias arrives in S07) and the server never bundles the client. A
// second copy would let the two sides drift, which is the failure this module
// exists to prevent.
//
// Nothing is loaded from another module. A browser has to run this file, so
// Mongoose, Node built-ins, the clock, and the network are all unavailable.
// Ids come from globalThis.crypto.randomUUID(), which browsers and Node 19+
// already share.

// Limits are the Limits table in context/2-architecture.md. Default sizes are
// fixed here: no earlier document chose them, and S08 uses them when a shape
// is dropped on the canvas.

export const NODE_SHAPES = freezeDeep([
  "rectangle",
  "diamond",
  "circle",
  "pill",
  "cylinder",
  "hexagon",
]);

export const HANDLE_IDS = freezeDeep(["top", "right", "bottom", "left"]);

export const NODE_COLORS = freezeDeep([
  { name: "Neutral", fill: "#1F1F1F", text: "#EDEDED" },
  { name: "Blue", fill: "#10233D", text: "#52A8FF" },
  { name: "Purple", fill: "#2E1938", text: "#BF7AF0" },
  { name: "Orange", fill: "#331B00", text: "#FF990A" },
  { name: "Red", fill: "#3C1618", text: "#FF6166" },
  { name: "Pink", fill: "#3A1726", text: "#F75F8F" },
  { name: "Green", fill: "#0F2E18", text: "#62C073" },
  { name: "Teal", fill: "#062822", text: "#0AC7B4" },
]);

export const DEFAULT_NODE_COLOR = NODE_COLORS[0];

export const DEFAULT_NODE_SIZE = freezeDeep({
  rectangle: { width: 160, height: 80 },
  pill: { width: 160, height: 64 },
  circle: { width: 96, height: 96 },
  diamond: { width: 144, height: 96 },
  hexagon: { width: 144, height: 96 },
  cylinder: { width: 112, height: 112 },
});

export const ID_PATTERN = freezeDeep(/^[A-Za-z0-9_-]{1,64}$/);
export const MAX_NODES = 300;
export const MAX_EDGES = 600;
export const MAX_OPS_PER_COMMIT = 50;
export const NODE_LABEL_MAX = 200;
export const EDGE_LABEL_MAX = 100;
export const NODE_SIZE_MIN = 40;
export const NODE_SIZE_MAX = 2000;
export const POSITION_MAX = 100000;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const SHAPE_SET = new Set(NODE_SHAPES);
const HANDLE_SET = new Set(HANDLE_IDS);

// Arrays, null, and boxed primitives must not count as records. toString is
// used so a lean Mongoose subdocument still passes, which instanceof would not.
function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function freezeDeep(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return value;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isCoordinate(value) {
  return isFiniteNumber(value) && Math.abs(value) <= POSITION_MAX;
}

function isNodeSize(value) {
  return isFiniteNumber(value) && value >= NODE_SIZE_MIN && value <= NODE_SIZE_MAX;
}

function isId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function normalizeHex(value) {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) return null;
  return value.toUpperCase();
}

function readLabel(value, max, truncate, noun) {
  if (value === undefined) return { ok: true, label: "" };
  if (typeof value !== "string") return { ok: false, error: `${noun} must be text` };
  if (value.length > max) {
    if (!truncate) return { ok: false, error: `${noun} must be ${max} characters or fewer` };
    return { ok: true, label: value.slice(0, max) };
  }
  return { ok: true, label: value };
}

function readColor(value, fallback, noun) {
  if (value === undefined) return { ok: true, color: fallback };
  const color = normalizeHex(value);
  if (color === null) return { ok: false, error: `${noun} must be a #RRGGBB value` };
  return { ok: true, color };
}

function cloneNode(node) {
  return {
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
  };
}

function cloneEdge(edge) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: edge.type,
    data: { label: edge.data.label },
  };
}

export function createNodeId() {
  return `n_${globalThis.crypto.randomUUID()}`;
}

export function createEdgeId() {
  return `e_${globalThis.crypto.randomUUID()}`;
}

export function sanitizeNode(raw, options) {
  const truncate = Boolean(options && options.truncate === true);
  if (!isPlainObject(raw)) return { ok: false, error: "Node must be an object" };
  if (!isId(raw.id)) {
    return { ok: false, error: "Node id must be 1 to 64 letters, numbers, underscores, or hyphens" };
  }
  if (!isPlainObject(raw.position) || !isCoordinate(raw.position.x)) {
    return { ok: false, error: `Node position x must be a finite number between -${POSITION_MAX} and ${POSITION_MAX}` };
  }
  if (!isCoordinate(raw.position.y)) {
    return { ok: false, error: `Node position y must be a finite number between -${POSITION_MAX} and ${POSITION_MAX}` };
  }
  if (!isNodeSize(raw.width)) {
    return { ok: false, error: `Node width must be between ${NODE_SIZE_MIN} and ${NODE_SIZE_MAX}` };
  }
  if (!isNodeSize(raw.height)) {
    return { ok: false, error: `Node height must be between ${NODE_SIZE_MIN} and ${NODE_SIZE_MAX}` };
  }
  if (!isPlainObject(raw.data)) return { ok: false, error: "Node data must be an object" };
  if (!SHAPE_SET.has(raw.data.shape)) {
    return { ok: false, error: "Node shape must be rectangle, diamond, circle, pill, cylinder, or hexagon" };
  }

  const label = readLabel(raw.data.label, NODE_LABEL_MAX, truncate, "Node label");
  if (!label.ok) return label;
  const color = readColor(raw.data.color, DEFAULT_NODE_COLOR.fill, "Node color");
  if (!color.ok) return color;
  const textColor = readColor(raw.data.textColor, DEFAULT_NODE_COLOR.text, "Node text color");
  if (!textColor.ok) return textColor;

  return {
    ok: true,
    node: {
      id: raw.id,
      type: "shape",
      position: { x: raw.position.x, y: raw.position.y },
      width: raw.width,
      height: raw.height,
      data: {
        label: label.label,
        shape: raw.data.shape,
        color: color.color,
        textColor: textColor.color,
      },
    },
  };
}

export function sanitizeEdge(raw, options) {
  const truncate = Boolean(options && options.truncate === true);
  if (!isPlainObject(raw)) return { ok: false, error: "Edge must be an object" };
  if (!isId(raw.id)) {
    return { ok: false, error: "Edge id must be 1 to 64 letters, numbers, underscores, or hyphens" };
  }
  if (!isId(raw.source)) {
    return { ok: false, error: "Edge source must be 1 to 64 letters, numbers, underscores, or hyphens" };
  }
  if (!isId(raw.target)) {
    return { ok: false, error: "Edge target must be 1 to 64 letters, numbers, underscores, or hyphens" };
  }

  const sourceHandle = readHandle(raw.sourceHandle, "Edge source handle");
  if (!sourceHandle.ok) return sourceHandle;
  const targetHandle = readHandle(raw.targetHandle, "Edge target handle");
  if (!targetHandle.ok) return targetHandle;

  // A missing data object means an unlabeled edge. Null and arrays are not
  // missing: they would throw if label were read off them.
  if (raw.data !== undefined && !isPlainObject(raw.data)) {
    return { ok: false, error: "Edge data must be an object" };
  }
  const label = readLabel(
    raw.data === undefined ? undefined : raw.data.label,
    EDGE_LABEL_MAX,
    truncate,
    "Edge label",
  );
  if (!label.ok) return label;

  // source === target is a self-loop. The architecture does not forbid it,
  // and more than one edge between the same pair is allowed too. S12 decides
  // how LinkEdge draws a self-loop.
  return {
    ok: true,
    edge: {
      id: raw.id,
      source: raw.source,
      target: raw.target,
      sourceHandle: sourceHandle.handle,
      targetHandle: targetHandle.handle,
      type: "link",
      data: { label: label.label },
    },
  };
}

function readHandle(value, noun) {
  if (value === undefined || value === null) return { ok: true, handle: null };
  if (typeof value === "string" && HANDLE_SET.has(value)) return { ok: true, handle: value };
  return { ok: false, error: `${noun} must be top, right, bottom, left, or null` };
}

function readNodePatch(patch) {
  if (!isPlainObject(patch)) return { ok: false, error: "Node patch must be an object" };
  const next = {};

  if (Object.hasOwn(patch, "position")) {
    const position = patch.position;
    if (!isPlainObject(position) || !Object.hasOwn(position, "x") || !Object.hasOwn(position, "y")) {
      return { ok: false, error: "Node position must include both x and y" };
    }
    if (!isCoordinate(position.x)) {
      return { ok: false, error: `Node position x must be a finite number between -${POSITION_MAX} and ${POSITION_MAX}` };
    }
    if (!isCoordinate(position.y)) {
      return { ok: false, error: `Node position y must be a finite number between -${POSITION_MAX} and ${POSITION_MAX}` };
    }
    next.position = { x: position.x, y: position.y };
  }

  if (Object.hasOwn(patch, "width")) {
    if (!isNodeSize(patch.width)) {
      return { ok: false, error: `Node width must be between ${NODE_SIZE_MIN} and ${NODE_SIZE_MAX}` };
    }
    next.width = patch.width;
  }

  if (Object.hasOwn(patch, "height")) {
    if (!isNodeSize(patch.height)) {
      return { ok: false, error: `Node height must be between ${NODE_SIZE_MIN} and ${NODE_SIZE_MAX}` };
    }
    next.height = patch.height;
  }

  if (Object.hasOwn(patch, "data")) {
    if (!isPlainObject(patch.data)) return { ok: false, error: "Node data must be an object" };
    const data = {};
    if (Object.hasOwn(patch.data, "label")) {
      // A key that is present but undefined is not "absent". Absent is how a
      // full node defaults its label; a patch has to name a real string.
      if (typeof patch.data.label !== "string") return { ok: false, error: "Node label must be text" };
      if (patch.data.label.length > NODE_LABEL_MAX) {
        return { ok: false, error: `Node label must be ${NODE_LABEL_MAX} characters or fewer` };
      }
      data.label = patch.data.label;
    }
    if (Object.hasOwn(patch.data, "shape")) {
      if (!SHAPE_SET.has(patch.data.shape)) {
        return { ok: false, error: "Node shape must be rectangle, diamond, circle, pill, cylinder, or hexagon" };
      }
      data.shape = patch.data.shape;
    }
    if (Object.hasOwn(patch.data, "color")) {
      const color = readColor(patch.data.color, null, "Node color");
      if (patch.data.color === undefined || !color.ok) {
        return { ok: false, error: "Node color must be a #RRGGBB value" };
      }
      data.color = color.color;
    }
    if (Object.hasOwn(patch.data, "textColor")) {
      const textColor = readColor(patch.data.textColor, null, "Node text color");
      if (patch.data.textColor === undefined || !textColor.ok) {
        return { ok: false, error: "Node text color must be a #RRGGBB value" };
      }
      data.textColor = textColor.color;
    }
    if (Object.keys(data).length > 0) next.data = data;
  }

  if (Object.keys(next).length === 0) return { ok: false, error: "Nothing to change" };
  return { ok: true, patch: next };
}

function readEdgePatch(patch) {
  if (!isPlainObject(patch)) return { ok: false, error: "Edge patch must be an object" };
  if (!isPlainObject(patch.data) || !Object.hasOwn(patch.data, "label")) {
    return { ok: false, error: "Nothing to change" };
  }
  const label = readLabel(patch.data.label, EDGE_LABEL_MAX, false, "Edge label");
  if (!label.ok) return label;
  if (patch.data.label === undefined) return { ok: false, error: "Edge label must be text" };
  return { ok: true, patch: { data: { label: label.label } } };
}

// Caller-chosen ids match ID_PATTERN, including __proto__ and constructor.
// A plain object used as a map would read Object.prototype instead of the
// canvas, so membership lives in Map and Set.
function workingCanvas(canvas) {
  const source = isPlainObject(canvas) ? canvas : {};
  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  const rawEdges = Array.isArray(source.edges) ? source.edges : [];
  const nodes = [];
  const nodeById = new Map();

  for (const raw of rawNodes) {
    if (!isPlainObject(raw) || !isPlainObject(raw.position) || !isPlainObject(raw.data)) continue;
    const node = cloneNode(raw);
    nodes.push(node);
    nodeById.set(node.id, node);
  }

  const edges = [];
  const edgeById = new Map();
  for (const raw of rawEdges) {
    if (!isPlainObject(raw)) continue;
    const data = isPlainObject(raw.data) ? raw.data : {};
    const edge = {
      id: raw.id,
      source: raw.source,
      target: raw.target,
      sourceHandle: raw.sourceHandle === undefined ? null : raw.sourceHandle,
      targetHandle: raw.targetHandle === undefined ? null : raw.targetHandle,
      type: raw.type === undefined ? "link" : raw.type,
      data: { label: data.label === undefined ? "" : data.label },
    };
    edges.push(edge);
    edgeById.set(edge.id, edge);
  }

  return { nodes, nodeById, edges, edgeById };
}

function applyOp(state, op) {
  if (!isPlainObject(op) || typeof op.type !== "string") {
    return { ok: false, error: isPlainObject(op) ? "Unknown change type" : "Change must be an object" };
  }

  switch (op.type) {
    case "node.add":
      return addNode(state, op.node);
    case "node.update":
      return updateNode(state, op.id, op.patch);
    case "node.remove":
      return removeNode(state, op.id);
    case "edge.add":
      return addEdge(state, op.edge);
    case "edge.update":
      return updateEdge(state, op.id, op.patch);
    case "edge.remove":
      return removeEdge(state, op.id);
    default:
      return { ok: false, error: "Unknown change type" };
  }
}

function addNode(state, raw) {
  const sanitized = sanitizeNode(raw);
  if (!sanitized.ok) return sanitized;
  if (state.nodeById.has(sanitized.node.id)) return { ok: false, error: "Node id is already used" };
  if (state.nodes.length + 1 > MAX_NODES) {
    return { ok: false, error: `A canvas can have at most ${MAX_NODES} nodes` };
  }

  const stored = cloneNode(sanitized.node);
  state.nodes.push(stored);
  state.nodeById.set(stored.id, stored);
  return { ok: true, op: { type: "node.add", node: sanitized.node } };
}

function updateNode(state, id, patch) {
  if (!isId(id)) {
    return { ok: false, error: "Node id must be 1 to 64 letters, numbers, underscores, or hyphens" };
  }
  const current = state.nodeById.get(id);
  if (!current) return { ok: false, error: "Node not found" };

  const read = readNodePatch(patch);
  if (!read.ok) return read;

  const merged = sanitizeNode({
    id: current.id,
    position: read.patch.position ?? current.position,
    width: Object.hasOwn(read.patch, "width") ? read.patch.width : current.width,
    height: Object.hasOwn(read.patch, "height") ? read.patch.height : current.height,
    data: { ...current.data, ...read.patch.data },
  });
  if (!merged.ok) return merged;

  const index = state.nodes.indexOf(current);
  const stored = cloneNode(merged.node);
  state.nodes[index] = stored;
  state.nodeById.set(id, stored);
  return { ok: true, op: { type: "node.update", id, patch: read.patch } };
}

function removeNode(state, id) {
  if (!state.nodeById.has(id)) return { ok: false, error: "Node not found" };
  state.nodeById.delete(id);
  state.nodes = state.nodes.filter((node) => node.id !== id);
  // Receivers cascade for themselves. The broadcast op is only the node id,
  // so this function is what actually drops the edges on every side.
  state.edges = state.edges.filter((edge) => {
    if (edge.source === id || edge.target === id) {
      state.edgeById.delete(edge.id);
      return false;
    }
    return true;
  });
  return { ok: true, op: { type: "node.remove", id } };
}

function addEdge(state, raw) {
  const sanitized = sanitizeEdge(raw);
  if (!sanitized.ok) return sanitized;
  if (state.edgeById.has(sanitized.edge.id)) return { ok: false, error: "Edge id is already used" };
  if (!state.nodeById.has(sanitized.edge.source)) return { ok: false, error: "Edge source does not exist" };
  if (!state.nodeById.has(sanitized.edge.target)) return { ok: false, error: "Edge target does not exist" };
  if (state.edges.length + 1 > MAX_EDGES) {
    return { ok: false, error: `A canvas can have at most ${MAX_EDGES} edges` };
  }

  const stored = cloneEdge(sanitized.edge);
  state.edges.push(stored);
  state.edgeById.set(stored.id, stored);
  return { ok: true, op: { type: "edge.add", edge: sanitized.edge } };
}

function updateEdge(state, id, patch) {
  if (!isId(id)) {
    return { ok: false, error: "Edge id must be 1 to 64 letters, numbers, underscores, or hyphens" };
  }
  const current = state.edgeById.get(id);
  if (!current) return { ok: false, error: "Edge not found" };

  const read = readEdgePatch(patch);
  if (!read.ok) return read;

  const stored = cloneEdge({ ...current, data: { label: read.patch.data.label } });
  const index = state.edges.indexOf(current);
  state.edges[index] = stored;
  state.edgeById.set(id, stored);
  return { ok: true, op: { type: "edge.update", id, patch: read.patch } };
}

function removeEdge(state, id) {
  if (!state.edgeById.has(id)) return { ok: false, error: "Edge not found" };
  state.edgeById.delete(id);
  state.edges = state.edges.filter((edge) => edge.id !== id);
  return { ok: true, op: { type: "edge.remove", id } };
}

export function applyOps(canvas, ops) {
  // Checked before any op runs, so an oversized batch never depends on the
  // ops inside it being valid.
  if (!Array.isArray(ops)) return { ok: false, error: "Ops must be a list", index: -1 };
  if (ops.length === 0) return { ok: false, error: "Nothing to apply", index: -1 };
  if (ops.length > MAX_OPS_PER_COMMIT) {
    return { ok: false, error: "Too many changes at once", index: -1 };
  }

  // Writes go to objects allocated here. A failed op discards this copy, so
  // the caller never observes a half-applied batch and the inputs stay intact.
  const state = workingCanvas(canvas);
  const normalized = [];

  for (let index = 0; index < ops.length; index += 1) {
    const applied = applyOp(state, ops[index]);
    if (!applied.ok) return { ok: false, error: applied.error, index };
    normalized.push(applied.op);
  }

  return { ok: true, canvas: { nodes: state.nodes, edges: state.edges }, ops: normalized };
}

export function normalizeCanvas(raw) {
  if (!isPlainObject(raw)) return { nodes: [], edges: [] };

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  const nodes = [];
  const nodeIds = new Set();

  for (const rawNode of rawNodes) {
    if (nodes.length >= MAX_NODES) break;
    const sanitized = sanitizeNode(rawNode, { truncate: true });
    if (!sanitized.ok || nodeIds.has(sanitized.node.id)) continue;
    nodeIds.add(sanitized.node.id);
    nodes.push(sanitized.node);
  }

  const edges = [];
  const edgeIds = new Set();
  for (const rawEdge of rawEdges) {
    if (edges.length >= MAX_EDGES) break;
    const sanitized = sanitizeEdge(rawEdge, { truncate: true });
    if (!sanitized.ok || edgeIds.has(sanitized.edge.id)) continue;
    if (!nodeIds.has(sanitized.edge.source) || !nodeIds.has(sanitized.edge.target)) continue;
    edgeIds.add(sanitized.edge.id);
    edges.push(sanitized.edge);
  }

  return { nodes, edges };
}
