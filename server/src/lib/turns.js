// Turn rules are pure so the socket layer and the sweeper share one result.
// S20 broadcasts only when the returned object is not the state it passed in,
// so a call that changes nothing hands that same object back.

export const GRACE_MS = 20000;
export const IDLE_MS = 120000;

function isRecord(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

// A tab the caller invented, or a user id that is not text, must not move
// the turn. Permission stays outside this module because the access table
// loads the database driver.
function isTab(tab) {
  return isRecord(tab)
    && typeof tab.userId === "string"
    && tab.userId !== ""
    && typeof tab.tabId === "string"
    && tab.tabId !== "";
}

function isUserId(userId) {
  return typeof userId === "string" && userId !== "";
}

function sameTab(left, right) {
  return left.userId === right.userId && left.tabId === right.tabId;
}

function storedTab(tab) {
  return { userId: tab.userId, tabId: tab.tabId };
}

export function createTurnState() {
  return {
    holder: null,
    holderSince: null,
    lastActivity: null,
    graceUntil: null,
    queue: [],
  };
}

function grant(queue, tab, now) {
  return {
    holder: storedTab(tab),
    holderSince: now,
    lastActivity: now,
    graceUntil: null,
    queue,
  };
}

// The previous holder is not put back on the queue. One call hands off once,
// and an empty queue is the empty state rather than a holder with no name.
function passOn(queue, now) {
  if (queue.length === 0) return createTurnState();
  const [next, ...rest] = queue;
  return grant(rest, next, now);
}

function withQueue(state, queue) {
  return {
    holder: state.holder,
    holderSince: state.holderSince,
    lastActivity: state.lastActivity,
    graceUntil: state.graceUntil,
    queue,
  };
}

// Idle starts when someone is actually waiting, from the later of the
// holder's last activity and the moment the current head of the queue joined.
// During grace there is no deadline, so a short disconnect cannot lose the
// turn to the idle rule.
function idleDeadline(state) {
  if (!state.holder || state.graceUntil !== null || state.queue.length === 0) return null;
  return Math.max(state.lastActivity, state.queue[0].queuedAt) + IDLE_MS;
}

export function requestTurn(state, tab, canEdit, now) {
  if (canEdit !== true || !isTab(tab)) return state;
  if (state.holder && sameTab(state.holder, tab)) return state;
  if (state.queue.some((entry) => sameTab(entry, tab))) return state;
  if (!state.holder) return grant(state.queue, tab, now);
  return withQueue(state, [
    ...state.queue,
    { userId: tab.userId, tabId: tab.tabId, queuedAt: now },
  ]);
}

export function releaseTurn(state, tab, now) {
  if (!isTab(tab) || !state.holder || !sameTab(state.holder, tab)) return state;
  return passOn(state.queue, now);
}

export function cancelRequest(state, tab) {
  if (!isTab(tab)) return state;
  const index = state.queue.findIndex((entry) => sameTab(entry, tab));
  if (index === -1) return state;
  return withQueue(state, state.queue.filter((entry) => !sameTab(entry, tab)));
}

export function reclaimTurn(state, tab, canReclaim, now) {
  if (canReclaim !== true || !isTab(tab)) return state;
  if (state.holder && sameTab(state.holder, tab)) return state;
  const queue = state.queue.filter((entry) => !sameTab(entry, tab));
  if (!state.holder) return grant(queue, tab, now);
  // A holder in grace is disconnected. The queue only holds connected tabs,
  // so that holder is dropped instead of being placed at the front.
  const nextQueue = state.graceUntil === null
    ? [{ userId: state.holder.userId, tabId: state.holder.tabId, queuedAt: now }, ...queue]
    : queue;
  return grant(nextQueue, tab, now);
}

export function tabLeft(state, tab, now) {
  if (!isTab(tab)) return state;
  if (state.holder && sameTab(state.holder, tab)) {
    if (state.graceUntil !== null) return state;
    return {
      holder: state.holder,
      holderSince: state.holderSince,
      lastActivity: state.lastActivity,
      graceUntil: now + GRACE_MS,
      queue: state.queue,
    };
  }
  const index = state.queue.findIndex((entry) => sameTab(entry, tab));
  if (index === -1) return state;
  return withQueue(state, state.queue.filter((entry) => !sameTab(entry, tab)));
}

export function tabRejoined(state, tab, now) {
  if (!isTab(tab) || !state.holder || !sameTab(state.holder, tab)) return state;
  if (state.graceUntil === null) return state;
  return {
    holder: state.holder,
    holderSince: state.holderSince,
    lastActivity: now,
    graceUntil: null,
    queue: state.queue,
  };
}

export function recordActivity(state, tab, now) {
  if (!isTab(tab) || !state.holder || !sameTab(state.holder, tab)) return state;
  if (state.graceUntil !== null || !(now > state.lastActivity)) return state;
  return {
    holder: state.holder,
    holderSince: state.holderSince,
    lastActivity: now,
    graceUntil: null,
    queue: state.queue,
  };
}

export function revokeEditRights(state, userId, now) {
  if (!isUserId(userId)) return state;
  const holds = state.holder !== null && state.holder.userId === userId;
  const queue = state.queue.filter((entry) => entry.userId !== userId);
  if (!holds && queue.length === state.queue.length) return state;
  if (holds) return passOn(queue, now);
  return withQueue(state, queue);
}

export function expire(state, now) {
  if (!state.holder) return state;
  if (state.graceUntil !== null) {
    if (now >= state.graceUntil) return passOn(state.queue, now);
    return state;
  }
  const deadline = idleDeadline(state);
  if (deadline !== null && now >= deadline) return passOn(state.queue, now);
  return state;
}

export function toPublic(state, now) {
  return {
    holder: state.holder ? storedTab(state.holder) : null,
    holderSince: state.holderSince,
    queue: state.queue.map((entry) => ({ userId: entry.userId, tabId: entry.tabId })),
    idleDeadline: idleDeadline(state),
    graceUntil: state.graceUntil,
    serverNow: now,
  };
}
