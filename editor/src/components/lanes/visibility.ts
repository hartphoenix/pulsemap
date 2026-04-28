/**
 * Find the range of events visible in the current viewport.
 * Events must be sorted by `t` in ascending order.
 *
 * An event is visible if its time range overlaps the viewport:
 *   event starts before viewport ends AND event ends after viewport starts.
 *
 * Returns [startIdx, endIdx) — a half-open range suitable for Array.slice().
 */
export function findVisibleRange(
	events: ReadonlyArray<{ t: number; end?: number }>,
	viewportStartMs: number,
	viewportEndMs: number,
): [number, number] {
	if (events.length === 0) return [0, 0];

	let startIdx = -1;
	let endIdx = 0;

	for (let i = 0; i < events.length; i++) {
		if (events[i].t > viewportEndMs) break;

		const effectiveEnd = events[i].end ?? events[i + 1]?.t ?? events[i].t;
		if (effectiveEnd >= viewportStartMs) {
			if (startIdx === -1) startIdx = i;
			endIdx = i + 1;
		}
	}

	return startIdx === -1 ? [0, 0] : [startIdx, endIdx];
}
