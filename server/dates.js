const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Parses a range start. "2026-03-02" means the very start of that day (UTC).
export function parseRangeStart(raw) {
  return Date.parse(raw);
}

// Parses a range end. A bare date like "2026-03-02" means *through the end of
// that day*, so `to=2026-03-02` includes things that happened on the 2nd.
// Full timestamps are taken exactly as written.
export function parseRangeEnd(raw) {
  const ms = Date.parse(raw);
  return DATE_ONLY.test(raw) && !Number.isNaN(ms) ? ms + 86_400_000 - 1 : ms;
}
