// Outgoing true is rate-limited to once per 2s so a long burst refreshes the
// receiver's 5s expiry. Idle, blur, send, and close send false. Disposal sends
// false only while this binding can still emit.

export const TYPING_TRUE_INTERVAL_MS = 2000;
export const TYPING_IDLE_MS = 2000;
export const TYPING_EXPIRY_MS = 5000;

export function createOutgoingTyping({ emit, canEmit, now, schedule, cancel }) {
  const clock = now ?? (() => Date.now());
  let lastTrueAt = Number.NEGATIVE_INFINITY;
  let burst = false;
  let idle = null;

  function clearIdle() {
    if (idle == null) return;
    cancel(idle);
    idle = null;
  }

  function emitFalse() {
    burst = false;
    lastTrueAt = Number.NEGATIVE_INFINITY;
    if (canEmit()) emit(false);
  }

  return {
    note(text) {
      const blank = typeof text !== "string" || text.trim().length === 0;
      if (blank) {
        clearIdle();
        if (burst) emitFalse();
        return;
      }
      if (!canEmit()) {
        clearIdle();
        burst = false;
        return;
      }
      const time = clock();
      if (!burst || time - lastTrueAt >= TYPING_TRUE_INTERVAL_MS) {
        if (!canEmit()) return;
        emit(true);
        lastTrueAt = time;
        burst = true;
      }
      clearIdle();
      idle = schedule(() => {
        idle = null;
        if (!burst) return;
        emitFalse();
      }, TYPING_IDLE_MS);
    },
    stop() {
      clearIdle();
      if (!burst) return;
      emitFalse();
    },
    dispose() {
      clearIdle();
      if (!burst) return;
      emitFalse();
    },
    hasTimer() {
      return idle != null;
    },
    isBurst() {
      return burst;
    },
  };
}

// Each true replaces that user's expiry. A callback from the previous timer
// sees a mismatched generation and cannot clear the newer flag.
export function createIncomingTyping({ schedule, cancel, onChange, expiryMs = TYPING_EXPIRY_MS }) {
  const timers = new Map();

  function publish() {
    onChange([...timers.keys()]);
  }

  return {
    setTyping(userId, isTyping) {
      const current = timers.get(userId);
      if (!isTyping) {
        if (!current) return;
        cancel(current.id);
        timers.delete(userId);
        publish();
        return;
      }
      const generation = (current?.generation ?? 0) + 1;
      if (current) cancel(current.id);
      const id = schedule(() => {
        const latest = timers.get(userId);
        if (!latest || latest.generation !== generation || latest.id !== id) return;
        timers.delete(userId);
        publish();
      }, expiryMs);
      timers.set(userId, { id, generation });
      if (!current) publish();
    },
    clearUser(userId) {
      this.setTyping(userId, false);
    },
    clearAll() {
      if (timers.size === 0) return;
      for (const timer of timers.values()) cancel(timer.id);
      timers.clear();
      publish();
    },
    dispose() {
      for (const timer of timers.values()) cancel(timer.id);
      timers.clear();
    },
    size() {
      return timers.size;
    },
  };
}
