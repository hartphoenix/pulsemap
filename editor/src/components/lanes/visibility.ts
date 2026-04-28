/**
 * Binary search to find the range of events visible in the current viewport.
 * Events must be sorted by `t` in ascending order.
 *
 * Returns [startIdx, endIdx) — a half-open range suitable for Array.slice().
 * Includes one event before the viewport (for blocks that start before but
 * extend into view) and one after (for safety margin).
 */
export function findVisibleRange(
  events: ReadonlyArray<{ t: number; end?: number }>,
  viewportStartMs: number,
  viewportEndMs: number,
): [number, number] {
  if (events.length === 0) return [0, 0];

  // Find first event that could be visible:
  // Binary search for the first event where t >= viewportStartMs
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].t < viewportStartMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  // Back up one to catch blocks that start before viewport but extend into it
  const startIdx = Math.max(0, lo - 1);

  // Find first event past the viewport end
  lo = startIdx;
  hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].t <= viewportEndMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  // Include one extra for safety
  const endIdx = Math.min(events.length, lo + 1);

  return [startIdx, endIdx];
}
