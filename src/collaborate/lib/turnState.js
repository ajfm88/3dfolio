// Public turn snapshots cross the socket boundary. Rebuild only the fields the
// bar and the edit gate are allowed to trust, and drop anything else. This
// module stays free of the clock: equal serverNow values are normal when two
// changes land in the same millisecond, and arrival order is the order.

const USER_ID = /^[0-9a-f]{24}$/;
const TAB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isRecord(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function canonicalTab(value) {
  if (!isRecord(value)) return null;
  if (typeof value.userId !== "string" || typeof value.tabId !== "string") return null;
  const userId = value.userId.toLowerCase();
  const tabId = value.tabId.toLowerCase();
  if (!USER_ID.test(userId) || !TAB_ID.test(tabId)) return null;
  return { userId, tabId };
}

function finiteTime(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function optionalTime(value) {
  return value === null || finiteTime(value);
}

// A missing or invalid tab is never "the same" as another missing tab.
// Otherwise a half-parsed holder would look like this browser.
export function sameTurnTab(left, right) {
  const a = canonicalTab(left);
  const b = canonicalTab(right);
  if (!a || !b) return false;
  return a.userId === b.userId && a.tabId === b.tabId;
}

export function normalizeTurn(value) {
  if (!isRecord(value)) return null;
  if (!Object.hasOwn(value, "holder")
    || !Object.hasOwn(value, "holderSince")
    || !Object.hasOwn(value, "queue")
    || !Object.hasOwn(value, "idleDeadline")
    || !Object.hasOwn(value, "graceUntil")
    || !Object.hasOwn(value, "serverNow")) {
    return null;
  }
  if (!finiteTime(value.serverNow)) return null;
  if (!optionalTime(value.holderSince) || !optionalTime(value.idleDeadline) || !optionalTime(value.graceUntil)) {
    return null;
  }
  if (!Array.isArray(value.queue)) return null;

  const holder = value.holder === null ? null : canonicalTab(value.holder);
  if (value.holder !== null && !holder) return null;

  const queue = [];
  const seen = new Set();
  for (const entry of value.queue) {
    const tab = canonicalTab(entry);
    if (!tab) return null;
    const key = `${tab.userId}:${tab.tabId}`;
    if (seen.has(key)) return null;
    seen.add(key);
    if (holder && tab.userId === holder.userId && tab.tabId === holder.tabId) return null;
    queue.push(tab);
  }

  if (holder === null) {
    if (queue.length !== 0 || value.holderSince !== null || value.idleDeadline !== null || value.graceUntil !== null) {
      return null;
    }
  } else if (value.holderSince === null) {
    return null;
  }

  if (value.graceUntil !== null && value.idleDeadline !== null) return null;
  if (queue.length === 0 && value.idleDeadline !== null) return null;
  if (holder && queue.length > 0 && value.graceUntil === null && value.idleDeadline === null) return null;

  return {
    holder,
    holderSince: value.holderSince,
    queue,
    idleDeadline: value.idleDeadline,
    graceUntil: value.graceUntil,
    serverNow: value.serverNow,
  };
}

// Seconds left in the holder's idle window. localNow and receivedAt are one
// monotonic clock; serverNow and idleDeadline stay on the server's clock.
// Equal serverNow values are different packets, so the caller passes the
// receipt sampled for this packet. The client displays the result and does
// not release or pass the turn when it reaches zero.
export function idleSecondsRemaining(turn, receivedAt, localNow) {
  if (!turn || turn.idleDeadline == null || turn.graceUntil != null) return null;
  if (typeof receivedAt !== "number" || typeof localNow !== "number") return null;
  if (!Number.isFinite(receivedAt) || !Number.isFinite(localNow)) return null;
  const elapsed = Math.max(0, localNow - receivedAt);
  const remainingMs = turn.idleDeadline - turn.serverNow - elapsed;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function formatIdleCountdown(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}
