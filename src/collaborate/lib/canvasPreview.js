import { ID_PATTERN, POSITION_MAX, NODE_SIZE_MIN, NODE_SIZE_MAX } from "@shared/canvasOps.js";

const PREVIEW_TTL_MS = 3000;
const defaultClock = {
  setTimeout: (fn, delay) => setTimeout(fn, delay),
  clearTimeout: (id) => clearTimeout(id),
};

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function sanitizePreviewNodes(rawNodes) {
  if (!Array.isArray(rawNodes)) return { ok: false, nodes: [] };
  if (rawNodes.length === 0) return { ok: true, nodes: [] };
  if (rawNodes.length > 50) return { ok: false, nodes: [] };

  const seen = new Set();
  const nodes = [];

  for (const raw of rawNodes) {
    if (!isPlainObject(raw)) return { ok: false, nodes: [] };
    const id = raw.id;
    if (typeof id !== "string" || !ID_PATTERN.test(id)) return { ok: false, nodes: [] };
    if (seen.has(id)) return { ok: false, nodes: [] };
    seen.add(id);

    const position = raw.position;
    if (!isPlainObject(position)) return { ok: false, nodes: [] };
    const x = position.x;
    const y = position.y;
    if (typeof x !== "number" || !Number.isFinite(x) || Math.abs(x) > POSITION_MAX) return { ok: false, nodes: [] };
    if (typeof y !== "number" || !Number.isFinite(y) || Math.abs(y) > POSITION_MAX) return { ok: false, nodes: [] };

    const hasWidth = Object.hasOwn(raw, "width");
    const hasHeight = Object.hasOwn(raw, "height");
    if (hasWidth !== hasHeight) return { ok: false, nodes: [] };

    let width, height;
    if (hasWidth) {
      width = raw.width;
      height = raw.height;
      if (typeof width !== "number" || !Number.isFinite(width) || width < NODE_SIZE_MIN || width > NODE_SIZE_MAX) return { ok: false, nodes: [] };
      if (typeof height !== "number" || !Number.isFinite(height) || height < NODE_SIZE_MIN || height > NODE_SIZE_MAX) return { ok: false, nodes: [] };
    }

    const node = { id, position: { x, y } };
    if (hasWidth) {
      node.width = width;
      node.height = height;
    }
    nodes.push(node);
  }

  return { ok: true, nodes };
}

export function createPreviewOverlayController({ onExpire = () => {}, clock = defaultClock } = {}) {
  const overlays = new Map();
  const timers = new Map();

  function clearOverlay(id) {
    overlays.delete(id);
    const timer = timers.get(id);
    if (timer !== undefined) {
      clock.clearTimeout(timer);
      timers.delete(id);
    }
  }

  function clearAllOverlays() {
    for (const timer of timers.values()) clock.clearTimeout(timer);
    overlays.clear();
    timers.clear();
  }

  function applyOverlays(rfNodes) {
    const result = [];
    for (const node of rfNodes) {
      const overlay = overlays.get(node.id);
      if (overlay) {
        const display = { ...node };
        display.position = { ...overlay.position };
        if (overlay.width !== undefined) {
          display.width = overlay.width;
          display.height = overlay.height;
          display.measured = { width: overlay.width, height: overlay.height };
        }
        result.push(display);
      } else {
        result.push(node);
      }
    }
    return result;
  }

  function upsertOverlay(id, position, width, height) {
    const now = Date.now();
    overlays.set(id, { id, position: { ...position }, width, height, lastSample: now });
    const existing = timers.get(id);
    if (existing !== undefined) clock.clearTimeout(existing);
    const timer = clock.setTimeout(() => {
      // A superseded timer must not expire the newer sample that replaced it.
      if (timers.get(id) !== timer) return;
      timers.delete(id);
      overlays.delete(id);
      onExpire(id);
    }, PREVIEW_TTL_MS);
    timers.set(id, timer);
  }

  function clearOnCanonicalUpdate(id, previousCanonical, currentCanonical) {
    const prev = previousCanonical.get(id);
    const curr = currentCanonical.get(id);
    if (!prev || !curr) return;
    if (prev.position.x !== curr.position.x || prev.position.y !== curr.position.y) {
      clearOverlay(id);
      return;
    }
    if (prev.width !== curr.width || prev.height !== curr.height) {
      clearOverlay(id);
    }
  }

  function receivePreview(payload, getCanonicalNodes) {
    const sanitized = sanitizePreviewNodes(payload.nodes);
    if (!sanitized.ok || sanitized.nodes.length === 0) return { ok: false, applied: [] };

    const canonicalById = new Map(getCanonicalNodes().map((n) => [n.id, n]));
    const applied = [];

    for (const node of sanitized.nodes) {
      if (!canonicalById.has(node.id)) continue;
      upsertOverlay(node.id, node.position, node.width, node.height);
      applied.push(node.id);
    }

    return { ok: true, applied };
  }

  function onCanonicalNodesChange(previousCanonicalNodes, currentCanonicalNodes) {
    const previousById = new Map(previousCanonicalNodes.map((n) => [n.id, n]));
    const currentById = new Map(currentCanonicalNodes.map((n) => [n.id, n]));
    for (const id of previousById.keys()) {
      if (!currentById.has(id)) {
        clearOverlay(id);
      }
    }
    for (const [id, curr] of currentById) {
      const prev = previousById.get(id);
      if (prev) clearOnCanonicalUpdate(id, previousById, currentById);
    }
  }

  return {
    clearOverlay,
    clearAllOverlays,
    applyOverlays,
    receivePreview,
    onCanonicalNodesChange,
    getOverlays: () => new Map(overlays),
  };
}