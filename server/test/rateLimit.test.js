import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RATE_LIMITS, createBucket, takeToken } from "../src/lib/rateLimit.js";

const LIMITS = {
  join: 3,
  commit: 20,
  sync: 5,
  preview: 30,
  cursor: 30,
  typing: 5,
  turn: 5,
};

function drain(rate, now) {
  let bucket = createBucket(rate, now);
  for (let i = 0; i < rate; i += 1) {
    const result = takeToken(bucket, rate, now);
    assert.equal(result.allowed, true);
    bucket = result.bucket;
  }
  return bucket;
}

describe("rateLimit", () => {
  it("freezes the seven production limits", () => {
    assert.deepEqual({ ...RATE_LIMITS }, LIMITS);
    assert.equal(Object.keys(RATE_LIMITS).length, 7);
    assert.equal(Object.isFrozen(RATE_LIMITS), true);
    assert.throws(() => {
      RATE_LIMITS.join = 9;
    }, TypeError);
    assert.equal(RATE_LIMITS.join, 3);
  });

  it("allows exactly rate calls at one instant and refuses the next", () => {
    const rate = 4;
    const now = 50;
    let bucket = createBucket(rate, now);
    for (let i = 0; i < rate; i += 1) {
      const result = takeToken(bucket, rate, now);
      assert.equal(result.allowed, true);
      bucket = result.bucket;
    }
    const refused = takeToken(bucket, rate, now);
    assert.equal(refused.allowed, false);
    assert.ok(refused.bucket.tokens >= 0);
    assert.ok(refused.bucket.tokens < 1);
  });

  it("refills in proportion to the elapsed time", () => {
    const drained = drain(5, 0);
    const early = takeToken(drained, 5, 199);
    assert.equal(early.allowed, false);
    assert.ok(early.bucket.tokens < 1);

    const onTime = takeToken(drained, 5, 200);
    assert.equal(onTime.allowed, true);
    assert.equal(takeToken(onTime.bucket, 5, 200).allowed, false);
  });

  it("never refills past capacity after a long idle", () => {
    const drained = drain(3, 0);
    const hour = 60 * 60 * 1000;
    let bucket = drained;
    for (let i = 0; i < 3; i += 1) {
      const result = takeToken(bucket, 3, hour);
      assert.equal(result.allowed, true);
      bucket = result.bucket;
    }
    assert.equal(takeToken(bucket, 3, hour).allowed, false);
  });

  it("does not let a refusal push the bucket below zero or delay recovery", () => {
    let bucket = drain(5, 0);
    for (let i = 0; i < 10; i += 1) {
      const result = takeToken(bucket, 5, 0);
      assert.equal(result.allowed, false);
      assert.ok(result.bucket.tokens >= 0);
      bucket = result.bucket;
    }
    const recovered = takeToken(bucket, 5, 1000);
    assert.equal(recovered.allowed, true);
  });

  it("refills nothing when the clock goes backwards or is not finite", () => {
    const drained = Object.freeze({ tokens: 0, updatedAt: 5000 });
    for (const now of [4999, 0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = takeToken(drained, 5, now);
      assert.equal(result.allowed, false);
      assert.equal(result.bucket.tokens, 0);
      assert.equal(result.bucket.updatedAt, 5000);
      assert.notEqual(result.bucket, drained);
    }
    assert.deepEqual(drained, { tokens: 0, updatedAt: 5000 });
  });

  it("refuses an invalid rate and returns the bucket it was given", () => {
    const bucket = Object.freeze({ tokens: 3, updatedAt: 10 });
    for (const rate of [0, -1, Number.NaN, undefined, "5"]) {
      const result = takeToken(bucket, rate, 100);
      assert.equal(result.allowed, false);
      assert.equal(result.bucket, bucket);
    }
    assert.deepEqual(bucket, { tokens: 3, updatedAt: 10 });
  });

  it("treats a malformed bucket as a new one", () => {
    const bad = [
      null,
      [],
      { tokens: 1 },
      { updatedAt: 1 },
      { tokens: Number.NaN, updatedAt: 1 },
      { tokens: 1, updatedAt: Number.POSITIVE_INFINITY },
    ];
    for (const bucket of bad) {
      const result = takeToken(bucket, 5, 1000);
      assert.equal(result.allowed, true);
      assert.deepEqual(result.bucket, { tokens: 4, updatedAt: 1000 });
    }
  });

  it("does not mutate the bucket it was given", () => {
    const full = Object.freeze({ tokens: 2, updatedAt: 0 });
    const allowed = takeToken(full, 5, 0);
    assert.equal(allowed.allowed, true);
    assert.deepEqual(full, { tokens: 2, updatedAt: 0 });
    assert.notEqual(allowed.bucket, full);

    const empty = Object.freeze({ tokens: 0, updatedAt: 0 });
    const refused = takeToken(empty, 5, 0);
    assert.equal(refused.allowed, false);
    assert.deepEqual(empty, { tokens: 0, updatedAt: 0 });
    assert.notEqual(refused.bucket, empty);
  });
});
