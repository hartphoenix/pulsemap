/**
 * Round all millisecond timestamp fields in a map (and in diff entries)
 * to integers before submission.
 *
 * Beat snapping and drag math produce float timestamps internally
 * (e.g. 14806.437581380209). Schema-wise these are valid — `Type.Number()`
 * doesn't require integers — but committing them produces noisy diffs,
 * inflated JSON size, and floating-point churn on every re-save. The map
 * format is millisecond-resolution by convention; sub-millisecond
 * precision isn't carrying signal.
 *
 * This helper rounds at the submission boundary only. In-memory editor
 * state is left untouched.
 */

import type { PulseMap } from "pulsemap/schema";
import type { DiffEntry } from "./diff";

const TIMESTAMP_KEYS = new Set(["t", "end", "t_start", "t_end", "duration_ms"]);

function roundEvent<T extends Record<string, unknown>>(event: T): T {
	const out: Record<string, unknown> = { ...event };
	for (const key of Object.keys(out)) {
		if (TIMESTAMP_KEYS.has(key) && typeof out[key] === "number") {
			out[key] = Math.round(out[key] as number);
		}
	}
	return out as T;
}

export function roundMapTimestamps(map: PulseMap): PulseMap {
	const rounded: PulseMap = { ...map };
	rounded.duration_ms = Math.round(map.duration_ms);
	if (map.lyrics) rounded.lyrics = map.lyrics.map(roundEvent);
	if (map.words) rounded.words = map.words.map(roundEvent);
	if (map.chords) rounded.chords = map.chords.map(roundEvent);
	if (map.beats) rounded.beats = map.beats.map(roundEvent);
	if (map.sections) rounded.sections = map.sections.map(roundEvent);
	return rounded;
}

export function roundEntryTimestamps(entry: DiffEntry): DiffEntry {
	if (entry.kind === "field") {
		const isTimestamp = TIMESTAMP_KEYS.has(entry.field);
		if (isTimestamp && typeof entry.before === "number" && typeof entry.after === "number") {
			return {
				...entry,
				before: Math.round(entry.before),
				after: Math.round(entry.after),
			};
		}
		return entry;
	}
	if (entry.value && typeof entry.value === "object") {
		return { ...entry, value: roundEvent(entry.value as Record<string, unknown>) };
	}
	return entry;
}
