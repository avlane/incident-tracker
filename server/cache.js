// A one-value-per-key cache with a time limit. The public status page is the
// one URL strangers can hit as often as they like, and computing it reads
// every incident, so it is worth keeping for a few seconds.
export function createTtlCache({ ttlMs, now = Date.now }) {
  const entries = new Map();

  return {
    // Returns the cached value, or computes, stores and returns a fresh one.
    getOrCompute(key, compute) {
      const hit = entries.get(key);
      const t = now();
      if (hit && hit.expiresAt > t) return hit.value;
      const value = compute();
      entries.set(key, { value, expiresAt: t + ttlMs });
      return value;
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}
