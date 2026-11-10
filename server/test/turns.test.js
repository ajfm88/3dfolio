import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GRACE_MS,
  IDLE_MS,
  createTurnState,
  requestTurn,
  releaseTurn,
  cancelRequest,
  reclaimTurn,
  tabLeft,
  tabRejoined,
  recordActivity,
  revokeEditRights,
  expire,
  toPublic,
} from "../src/lib/turns.js";

const A = { userId: "a", tabId: "a1" };
const A2 = { userId: "a", tabId: "a2" };
const B = { userId: "b", tabId: "b1" };
const C = { userId: "c", tabId: "c1" };

function freeze(state) {
  if (state.holder) Object.freeze(state.holder);
  for (const entry of state.queue) Object.freeze(entry);
  Object.freeze(state.queue);
  return Object.freeze(state);
}

function tab(entry) {
  return { userId: entry.userId, tabId: entry.tabId };
}

function assertNoHolder(state) {
  assert.equal(state.holder, null);
  assert.deepEqual(state.queue, []);
  assert.equal(state.holderSince, null);
  assert.equal(state.lastActivity, null);
  assert.equal(state.graceUntil, null);
}

describe("constants and empty state", () => {
  it("publishes the empty turn", () => {
    assert.equal(GRACE_MS, 20000);
    assert.equal(IDLE_MS, 120000);
    assert.deepEqual(toPublic(createTurnState(), 5), {
      holder: null,
      holderSince: null,
      queue: [],
      idleDeadline: null,
      graceUntil: null,
      serverNow: 5,
    });
  });
});

describe("request", () => {
  it("grants a free turn and queues later tabs in order", () => {
    const empty = freeze(createTurnState());
    const granted = requestTurn(empty, A, true, 0);
    assert.deepEqual(granted.holder, tab(A));
    assert.equal(granted.holderSince, 0);
    assert.equal(granted.lastActivity, 0);
    assert.equal(granted.graceUntil, null);
    assert.deepEqual(granted.queue, []);

    const withB = requestTurn(freeze(granted), B, true, 10);
    const withC = requestTurn(freeze(withB), C, true, 20);
    const withA2 = requestTurn(freeze(withC), A2, true, 30);
    assert.deepEqual(withA2.holder, tab(A));
    assert.deepEqual(withA2.queue.map(tab), [tab(B), tab(C), tab(A2)]);
    assert.deepEqual(withA2.queue.map((entry) => entry.queuedAt), [10, 20, 30]);
  });

  it("does nothing when the tab already holds or is queued", () => {
    const held = freeze(requestTurn(createTurnState(), A, true, 0));
    assert.equal(requestTurn(held, A, true, 5), held);

    const queued = freeze(requestTurn(held, B, true, 10));
    assert.equal(requestTurn(queued, B, true, 15), queued);

    const grace = freeze(tabLeft(queued, A, 40));
    assert.equal(requestTurn(grace, A, true, 41), grace);
  });

  it("refuses a viewer when the turn is free and when it is held", () => {
    const empty = freeze(createTurnState());
    assert.equal(requestTurn(empty, A, false, 0), empty);
    const held = freeze(requestTurn(createTurnState(), A, true, 0));
    assert.equal(requestTurn(held, B, false, 5), held);
  });

  it("ignores a malformed tab", () => {
    const empty = freeze(createTurnState());
    for (const bad of [null, "a", 1, { userId: "a" }, { userId: "", tabId: "a1" }, { userId: "a", tabId: "" }]) {
      assert.equal(requestTurn(empty, bad, true, 0), empty);
    }
  });
});

describe("release", () => {
  it("hands off in queue order and ends empty", () => {
    let state = requestTurn(createTurnState(), A, true, 0);
    state = requestTurn(freeze(state), B, true, 10);
    state = requestTurn(freeze(state), C, true, 20);
    const frozen = freeze(state);
    assert.equal(releaseTurn(frozen, B, 30), frozen);

    const next = releaseTurn(frozen, A, 40);
    assert.deepEqual(next.holder, tab(B));
    assert.equal(next.holderSince, 40);
    assert.equal(next.lastActivity, 40);
    assert.equal(next.graceUntil, null);
    assert.deepEqual(next.queue.map(tab), [tab(C)]);

    const done = releaseTurn(freeze(releaseTurn(freeze(next), B, 50)), C, 60);
    assertNoHolder(done);
  });
});

describe("cancel", () => {
  it("removes a queued tab and ignores the holder and strangers", () => {
    let state = requestTurn(createTurnState(), A, true, 0);
    state = requestTurn(freeze(state), B, true, 10);
    state = requestTurn(freeze(state), C, true, 20);
    const frozen = freeze(state);
    assert.equal(cancelRequest(frozen, A), frozen);
    assert.equal(cancelRequest(frozen, A2), frozen);
    const next = cancelRequest(frozen, B);
    assert.deepEqual(next.holder, tab(A));
    assert.deepEqual(next.queue.map(tab), [tab(C)]);
  });
});

describe("disconnected queue entries", () => {
  it("skips a tab that left before the release", () => {
    let state = requestTurn(createTurnState(), A, true, 0);
    state = requestTurn(freeze(state), B, true, 10);
    state = requestTurn(freeze(state), C, true, 20);
    state = tabLeft(freeze(state), B, 30);
    const next = releaseTurn(freeze(state), A, 40);
    assert.deepEqual(next.holder, tab(C));
    assert.deepEqual(next.queue, []);
  });
});

describe("reclaim", () => {
  it("refuses a caller without permission and the current holder", () => {
    let state = requestTurn(createTurnState(), A, true, 0);
    state = requestTurn(freeze(state), B, true, 1);
    const frozen = freeze(state);
    assert.equal(reclaimTurn(frozen, C, false, 100), frozen);
    assert.equal(reclaimTurn(frozen, A, true, 100), frozen);
  });

  it("puts the connected holder at the front and grants the reclaimer", () => {
    let state = requestTurn(createTurnState(), A, true, 0);
    state = requestTurn(freeze(state), B, true, 1);
    state = requestTurn(freeze(state), C, true, 2);
    const next = reclaimTurn(freeze(state), C, true, 100);
    assert.deepEqual(next.holder, tab(C));
    assert.equal(next.holderSince, 100);
    assert.equal(next.lastActivity, 100);
    assert.equal(next.graceUntil, null);
    assert.deepEqual(next.queue, [
      { userId: "a", tabId: "a1", queuedAt: 100 },
      { userId: "b", tabId: "b1", queuedAt: 1 },
    ]);
    assert.equal(toPublic(next, 100).idleDeadline, 120100);
  });

  it("grants a free turn", () => {
    const next = reclaimTurn(freeze(createTurnState()), A, true, 40);
    assert.deepEqual(next.holder, tab(A));
    assert.equal(next.holderSince, 40);
    assert.equal(next.lastActivity, 40);
    assert.deepEqual(next.queue, []);
    assert.equal(next.graceUntil, null);
  });

  it("drops a holder who is in grace", () => {
    let state = requestTurn(createTurnState(), A, true, 0);
    state = requestTurn(freeze(state), B, true, 10);
    state = tabLeft(freeze(state), A, 20);
    const next = reclaimTurn(freeze(state), C, true, 30);
    assert.deepEqual(next.holder, tab(C));
    assert.deepEqual(next.queue, [{ userId: "b", tabId: "b1", queuedAt: 10 }]);
    assert.equal(next.graceUntil, null);
    assert.equal(toPublic(next, 30).graceUntil, null);
  });
});

describe("grace", () => {
  it("starts once, expires on the boundary, and clears an empty queue", () => {
    let state = requestTurn(createTurnState(), A, true, 0);
    state = requestTurn(freeze(state), B, true, 10);
    const left = tabLeft(freeze(state), A, 1000);
    assert.equal(left.graceUntil, 21000);
    assert.equal(toPublic(left, 1000).idleDeadline, null);
    assert.equal(tabLeft(freeze(left), A, 1500), left);
    assert.equal(expire(freeze(left), 20999), left);

    const passed = expire(freeze(left), 21000);
    assert.deepEqual(passed.holder, tab(B));
    assert.equal(passed.holderSince, 21000);
    assert.deepEqual(passed.queue, []);

    const solo = tabLeft(freeze(requestTurn(createTurnState(), A, true, 0)), A, 1000);
    assertNoHolder(expire(freeze(solo), 21000));
  });
});

describe("rejoin", () => {
  it("keeps the turn, clears grace, and counts as activity", () => {
    let state = requestTurn(createTurnState(), A, true, 0);
    state = requestTurn(freeze(state), B, true, 100);
    state = tabLeft(freeze(state), A, 1000);
    const back = tabRejoined(freeze(state), A, 5000);
    assert.deepEqual(back.holder, tab(A));
    assert.equal(back.holderSince, 0);
    assert.equal(back.lastActivity, 5000);
    assert.equal(back.graceUntil, null);
    assert.equal(toPublic(back, 5000).idleDeadline, 125000);
  });

  it("does nothing when the holder is connected, for another tab, or after the hand-off", () => {
    const held = freeze(requestTurn(createTurnState(), A, true, 0));
    assert.equal(tabRejoined(held, A, 5000), held);

    let state = requestTurn(createTurnState(), A, true, 0);
    state = requestTurn(freeze(state), B, true, 10);
    const grace = freeze(tabLeft(freeze(state), A, 1000));
    assert.equal(tabRejoined(grace, A2, 5000), grace);

    const passed = freeze(expire(grace, 21000));
    assert.equal(tabRejoined(passed, A, 22000), passed);
  });
});

describe("idle", () => {
  it("starts when the first tab queues and does not re-queue the idle holder", () => {
    const held = freeze(requestTurn(createTurnState(), A, true, 0));
    assert.equal(expire(held, 10 * IDLE_MS), held);

    const waiting = requestTurn(held, B, true, 500000);
    assert.equal(toPublic(waiting, 500000).idleDeadline, 620000);
    const frozen = freeze(waiting);
    assert.equal(expire(frozen, 619999), frozen);
    const passed = expire(frozen, 620000);
    assert.deepEqual(passed.holder, tab(B));
    assert.equal(passed.holderSince, 620000);
    assert.deepEqual(passed.queue, []);
  });

  it("moves with activity and ignores a non-holder, a stale time, and grace", () => {
    const waiting = freeze(requestTurn(
      freeze(requestTurn(createTurnState(), A, true, 0)),
      B,
      true,
      500000,
    ));
    const moved = recordActivity(waiting, A, 600000);
    assert.equal(moved.lastActivity, 600000);
    assert.equal(toPublic(moved, 600000).idleDeadline, 720000);
    const frozen = freeze(moved);
    assert.equal(recordActivity(frozen, B, 600001), frozen);
    assert.equal(recordActivity(frozen, A, 600000), frozen);
    assert.equal(recordActivity(frozen, A, 599999), frozen);

    const grace = freeze(tabLeft(frozen, A, 600100));
    assert.equal(recordActivity(grace, A, 600200), grace);
  });

  it("lets grace beat an idle deadline that falls during the disconnect", () => {
    let state = requestTurn(createTurnState(), A, true, 0);
    state = requestTurn(freeze(state), B, true, 0);
    state = tabLeft(freeze(state), A, 119990);
    const frozen = freeze(state);
    assert.equal(frozen.graceUntil, 139990);
    assert.equal(expire(frozen, 120000), frozen);
    const passed = expire(frozen, 139990);
    assert.deepEqual(passed.holder, tab(B));
    assert.equal(passed.holderSince, 139990);
    assert.deepEqual(passed.queue, []);
  });

  it("follows the queue head", () => {
    let state = requestTurn(createTurnState(), A, true, 0);
    state = requestTurn(freeze(state), B, true, 100);
    state = requestTurn(freeze(state), C, true, 200);
    assert.equal(toPublic(state, 200).idleDeadline, 120100);
    state = cancelRequest(freeze(state), B);
    assert.equal(toPublic(state, 200).idleDeadline, 120200);
    state = cancelRequest(freeze(state), C);
    assert.equal(toPublic(state, 200).idleDeadline, null);
  });
});

describe("revoke", () => {
  it("removes every tab of that user and passes the turn on", () => {
    let state = requestTurn(createTurnState(), A, true, 0);
    state = requestTurn(freeze(state), A2, true, 1);
    state = requestTurn(freeze(state), B, true, 2);
    state = requestTurn(freeze(state), C, true, 3);
    const frozen = freeze(state);

    const withoutA = revokeEditRights(frozen, "a", 50);
    assert.deepEqual(withoutA.holder, tab(B));
    assert.equal(withoutA.holderSince, 50);
    assert.deepEqual(withoutA.queue.map(tab), [tab(C)]);

    const withoutB = revokeEditRights(frozen, "b", 50);
    assert.deepEqual(withoutB.holder, tab(A));
    assert.equal(withoutB.holderSince, 0);
    assert.deepEqual(withoutB.queue.map(tab), [tab(A2), tab(C)]);

    assert.equal(revokeEditRights(frozen, "z", 50), frozen);
    assert.equal(revokeEditRights(frozen, "", 50), frozen);
    assert.equal(revokeEditRights(frozen, null, 50), frozen);

    assertNoHolder(revokeEditRights(freeze(requestTurn(createTurnState(), A, true, 0)), "a", 80));
  });
});

describe("public shape", () => {
  it("copies the public fields and ignores extra tab fields", () => {
    const fancy = { userId: "a", tabId: "a1", role: "owner" };
    const held = requestTurn(freeze(createTurnState()), fancy, true, 3);
    assert.deepEqual(held.holder, tab(A));
    assert.deepEqual(Object.keys(held.holder), ["userId", "tabId"]);
    const queued = requestTurn(freeze(held), { ...B, img: "x" }, true, 4);
    assert.deepEqual(Object.keys(queued.queue[0]), ["userId", "tabId", "queuedAt"]);

    const state = freeze(queued);
    const pub = toPublic(state, 9);
    assert.deepEqual(Object.keys(pub), ["holder", "holderSince", "queue", "idleDeadline", "graceUntil", "serverNow"]);
    assert.deepEqual(Object.keys(pub.holder), ["userId", "tabId"]);
    assert.deepEqual(Object.keys(pub.queue[0]), ["userId", "tabId"]);
    pub.holder.userId = "changed";
    pub.queue[0].tabId = "changed";
    pub.queue.push({ userId: "z", tabId: "z1" });
    pub.idleDeadline = 1;
    assert.deepEqual(toPublic(state, 9), {
      holder: tab(A),
      holderSince: 3,
      queue: [tab(B)],
      idleDeadline: 120004,
      graceUntil: null,
      serverNow: 9,
    });
    assert.equal(state.holder.userId, "a");
  });
});

describe("invariant", () => {
  it("keeps an empty queue and null timestamps whenever nobody holds", () => {
    const seen = [];
    const keep = (state) => {
      seen.push(state);
      if (state.holder === null) assertNoHolder(state);
      return state;
    };

    let state = keep(createTurnState());
    state = keep(requestTurn(freeze(state), A, false, 0));
    state = keep(requestTurn(freeze(state), A, true, 0));
    state = keep(requestTurn(freeze(state), B, true, 10));
    state = keep(requestTurn(freeze(state), A2, true, 20));
    state = keep(recordActivity(freeze(state), A, 30));
    state = keep(cancelRequest(freeze(state), A2));
    state = keep(tabLeft(freeze(state), A, 40));
    state = keep(tabRejoined(freeze(state), A, 50));
    state = keep(reclaimTurn(freeze(state), C, true, 60));
    state = keep(releaseTurn(freeze(state), C, 70));
    state = keep(expire(freeze(state), 70));
    state = keep(revokeEditRights(freeze(state), "a", 80));
    state = keep(releaseTurn(freeze(state), B, 90));
    toPublic(state, 90);
    assert.equal(seen.length > 0, true);
    assertNoHolder(state);
  });
});
