import { POSITION_MAX } from "@shared/canvasOps.js";

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const CURSOR_EXPIRY_MS = 10000;

function isRecord(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function canonicalId(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

export function validateCursorMove(payload) {
  if (!isRecord(payload)) return null;
  const projectId = canonicalId(payload.projectId);
  if (!OBJECT_ID.test(projectId)) return null;
  const x = payload.x;
  const y = payload.y;
  if (typeof x !== "number" || !Number.isFinite(x) || Math.abs(x) > POSITION_MAX) return null;
  if (typeof y !== "number" || !Number.isFinite(y) || Math.abs(y) > POSITION_MAX) return null;
  return { projectId, x, y };
}

export function validateCursorLeave(payload) {
  if (!isRecord(payload)) return null;
  const projectId = canonicalId(payload.projectId);
  if (!OBJECT_ID.test(projectId)) return null;
  return { projectId };
}

// Valid Mongo ids only, lowercased. Anything else is not a user.
export function canonicalUserId(value) {
  const id = canonicalId(value);
  return OBJECT_ID.test(id) ? id : "";
}

// Validates a relayed cursor:move record, including the sender's user id.
export function validateInboundCursorMove(payload) {
  if (!isRecord(payload)) return null;
  const userId = canonicalUserId(payload.userId);
  if (!userId) return null;
  const move = validateCursorMove(payload);
  return move ? { ...move, userId } : null;
}

export function validateInboundCursorLeave(payload) {
  if (!isRecord(payload)) return null;
  const userId = canonicalUserId(payload.userId);
  if (!userId) return null;
  const leave = validateCursorLeave(payload);
  return leave ? { ...leave, userId } : null;
}

// React Flow's flowToScreenPosition returns client coordinates (it adds the
// flow container's DOM rect). The overlay is absolutely positioned, so its
// local point is that client point minus the overlay's own rect, exactly once.
export function clientToOverlayPosition(clientPoint, containerRect) {
  if (!clientPoint || !Number.isFinite(clientPoint.x) || !Number.isFinite(clientPoint.y)) return null;
  if (!containerRect || !Number.isFinite(containerRect.left) || !Number.isFinite(containerRect.top)) return null;
  return { x: clientPoint.x - containerRect.left, y: clientPoint.y - containerRect.top };
}

export function createCursorExpiryController(onChange, clock = defaultClock) {
  // Each entry owns a token. A callback that no longer owns its entry is a
  // superseded timer and must not touch a newer point.
  const entries = new Map();
  let disposed = false;

  function cancelExpiry(userId) {
    const entry = entries.get(userId);
    if (!entry) return;
    entries.delete(userId);
    clock.clearTimeout(entry.handle);
  }

  function scheduleExpiry(userId) {
    if (disposed) return;
    cancelExpiry(userId);
    const entry = { handle: null };
    entries.set(userId, entry);
    entry.handle = clock.setTimeout(() => {
      if (disposed || entries.get(userId) !== entry) return;
      entries.delete(userId);
      onChange(userId);
    }, CURSOR_EXPIRY_MS);
  }

  function clearAll() {
    const all = [...entries.values()];
    entries.clear();
    for (const entry of all) clock.clearTimeout(entry.handle);
  }

  function dispose() {
    disposed = true;
    clearAll();
  }

  return {
    scheduleExpiry,
    cancelExpiry,
    clearAll,
    dispose,
    // Test and cleanup visibility; not part of serialized state.
    pendingCount: () => entries.size,
    has: (userId) => entries.has(userId),
  };
}

const defaultClock = {
  now: () => Date.now(),
  setTimeout: (fn, delay) => setTimeout(fn, delay),
  clearTimeout: (id) => clearTimeout(id),
};
const BLOCKED_SELECTOR = [
  "input", "textarea", "select", "button", "a[href]", "[role='button']",
  "[contenteditable='']", "[contenteditable='true']",
  "[data-collab-chrome]", "[role='toolbar']",
  // The node color toolbar's padding and gaps are not buttons.
  ".collab-color-toolbar", ".react-flow__node-toolbar",
].join(",");

// True when a pointer target is an editable control or floating chrome, or sits
// inside one (an icon within a button, the empty area of a panel). Diagram
// nodes and edge labels that are not being edited are not blocked.
export function isCursorBlockedTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (typeof target.closest !== "function") return false;
  return target.closest(BLOCKED_SELECTOR) !== null;
}

// Pointer callbacks for the canvas wrapper, kept free of React so tests can
// drive them with fake events. Touch input never publishes a cursor.
export function createCursorPointerHandlers({ screenToFlowPosition, moveCursor, leaveCursor, getWrapper }) {
  return {
    onPointerMove(event) {
      if (event.pointerType === "touch") return;
      const wrapper = getWrapper();
      if (isCursorBlockedTarget(event.target) || !wrapper || !wrapper.contains(event.target)) {
        leaveCursor();
        return;
      }
      moveCursor(screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: false }));
    },
    onPointerLeave(event) {
      if (event.pointerType === "touch") return;
      const wrapper = getWrapper();
      if (!wrapper) return;
      const related = event.relatedTarget;
      if (related && wrapper.contains(related)) return;
      leaveCursor();
    },
    onPointerCancel(event) {
      if (event.pointerType === "touch") return;
      leaveCursor();
    },
  };
}
