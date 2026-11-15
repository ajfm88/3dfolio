// Per-socket token bucket. The caller passes the clock, so a test can freeze
// time and this module never reads Date.now, starts a timer, or touches I/O.
// A call that is refused returns a new bucket and leaves the one it was given
// unchanged. An unknown rate fails closed and returns that same bucket.

export const RATE_LIMITS = Object.freeze({
  join: 3,
  commit: 20,
  sync: 5,
  preview: 30,
  cursor: 30,
  typing: 5,
  turn: 5,
});

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function createBucket(rate, now) {
  return { tokens: rate, updatedAt: now };
}

export function takeToken(bucket, rate, now) {
  if (!finiteNumber(rate) || rate <= 0) {
    return { allowed: false, bucket };
  }

  // A missing or malformed bucket is a full one at this instant. Arrays and
  // boxed values are not records, so they cannot smuggle a huge token count.
  let current = bucket;
  if (!isPlainObject(bucket) || !finiteNumber(bucket.tokens) || !finiteNumber(bucket.updatedAt)) {
    current = createBucket(rate, now);
  }

  // A clock that is missing, NaN, or infinite does not mint tokens. Time stays
  // on the bucket, including when that clock moved backwards.
  const time = finiteNumber(now) ? now : current.updatedAt;
  const elapsed = Math.max(0, time - current.updatedAt);
  const tokens = Math.min(rate, current.tokens + (elapsed * rate) / 1000);
  const allowed = tokens >= 1;

  return {
    allowed,
    bucket: {
      tokens: allowed ? tokens - 1 : tokens,
      updatedAt: Math.max(current.updatedAt, time),
    },
  };
}
