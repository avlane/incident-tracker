// A fixed-window rate limiter. Each key gets `limit` hits per `windowMs`; the
// window starts at the key's first hit. Fixed windows allow a burst of up to
// twice the limit across a window boundary, which is fine for protecting a
// small internal service and keeps the bookkeeping to one counter per key.

export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const buckets = new Map();

  function check(key) {
    const t = now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      bucket = { count: 0, resetAt: t + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    const allowed = bucket.count <= limit;
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt,
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - t) / 1000)),
    };
  }

  // Forget a key, for example after a successful login.
  function reset(key) {
    buckets.delete(key);
  }

  // Drops buckets whose window has passed so the map can't grow forever.
  function sweep() {
    const t = now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= t) buckets.delete(key);
  }

  return { check, reset, sweep, get size() { return buckets.size; } };
}
