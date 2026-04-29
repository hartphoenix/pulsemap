/**
 * Structural diff between an original PulseMap and the editor's working map.
 *
 * Produces a flat list of DiffEntry rows: per-field changes on matched
 * events, plus inserts and deletes for events with no counterpart.
 *
 * Each entry is independently applicable to `original` to reconstruct
 * the working state — this is how selective submission works (apply
 * only the rows the user kept checked).
 */

import type { ChordEvent, LyricLine, PulseMap, Section, WordEvent } from "pulsemap/schema";
import type { EditableLane } from "../state/types";

export type DiffEntry =
	| {
			kind: "field";
			lane: EditableLane;
			/** Index in `original` (post-match). */
			index: number;
			field: string;
			before: unknown;
			after: unknown;
	  }
	| {
			kind: "insert";
			lane: EditableLane;
			/** Position in `working` where the new event sits. */
			index: number;
			value: unknown;
	  }
	| {
			kind: "delete";
			lane: EditableLane;
			/** Position in `original` of the removed event. */
			index: number;
			value: unknown;
	  };

const EDITABLE_LANES: readonly EditableLane[] = ["chords", "words", "lyrics", "sections"] as const;

type LaneEvent = ChordEvent | WordEvent | LyricLine | Section;

interface MatchResult {
	pairs: Array<{ originalIndex: number; workingIndex: number }>;
	originalUnmatched: number[];
	workingUnmatched: number[];
}

/**
 * Score how plausibly two events represent "the same item, edited."
 * Higher means more likely the same. A pair below MATCH_THRESHOLD is
 * treated as unrelated (insert+delete rather than edit).
 */
function similarity(a: LaneEvent, b: LaneEvent, lane: EditableLane): number {
	let score = 0;
	if (a.t === b.t) score += 100;
	else if (Math.abs(a.t - b.t) < 1000) score += 30;

	if (lane === "chords") {
		const ca = a as ChordEvent;
		const cb = b as ChordEvent;
		if (ca.chord === cb.chord) score += 80;
	} else if (lane === "words" || lane === "lyrics") {
		const ta = (a as WordEvent | LyricLine).text;
		const tb = (b as WordEvent | LyricLine).text;
		if (ta === tb) score += 80;
		else if (ta && tb && ta.toLowerCase() === tb.toLowerCase()) score += 40;
	} else if (lane === "sections") {
		const sa = a as Section;
		const sb = b as Section;
		if (sa.type === sb.type) score += 50;
		if (sa.label === sb.label) score += 30;
	}
	return score;
}

const MATCH_THRESHOLD = 50;

/** Greedy best-fit pairing between two arrays. */
function matchEvents(before: LaneEvent[], after: LaneEvent[], lane: EditableLane): MatchResult {
	const candidates: Array<{ i: number; j: number; score: number }> = [];
	for (let i = 0; i < before.length; i++) {
		for (let j = 0; j < after.length; j++) {
			const s = similarity(before[i], after[j], lane);
			if (s >= MATCH_THRESHOLD) candidates.push({ i, j, score: s });
		}
	}
	candidates.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j);

	const claimedI = new Set<number>();
	const claimedJ = new Set<number>();
	const pairs: MatchResult["pairs"] = [];

	for (const c of candidates) {
		if (claimedI.has(c.i) || claimedJ.has(c.j)) continue;
		pairs.push({ originalIndex: c.i, workingIndex: c.j });
		claimedI.add(c.i);
		claimedJ.add(c.j);
	}

	const originalUnmatched: number[] = [];
	for (let i = 0; i < before.length; i++) if (!claimedI.has(i)) originalUnmatched.push(i);
	const workingUnmatched: number[] = [];
	for (let j = 0; j < after.length; j++) if (!claimedJ.has(j)) workingUnmatched.push(j);

	return { pairs, originalUnmatched, workingUnmatched };
}

/** Field names to compare per lane. */
const FIELDS_BY_LANE: Record<EditableLane, readonly string[]> = {
	chords: ["t", "end", "chord"],
	words: ["t", "end", "text"],
	lyrics: ["t", "end", "text"],
	sections: ["t", "end", "type", "label"],
};

function fieldDiffs(
	lane: EditableLane,
	originalIndex: number,
	a: LaneEvent,
	b: LaneEvent,
): DiffEntry[] {
	const out: DiffEntry[] = [];
	for (const field of FIELDS_BY_LANE[lane]) {
		const av = (a as Record<string, unknown>)[field];
		const bv = (b as Record<string, unknown>)[field];
		if (av === bv) continue;
		out.push({
			kind: "field",
			lane,
			index: originalIndex,
			field,
			before: av,
			after: bv,
		});
	}
	return out;
}

function laneArray(map: PulseMap, lane: EditableLane): LaneEvent[] {
	switch (lane) {
		case "chords":
			return (map.chords ?? []) as LaneEvent[];
		case "words":
			return (map.words ?? []) as LaneEvent[];
		case "lyrics":
			return (map.lyrics ?? []) as LaneEvent[];
		case "sections":
			return (map.sections ?? []) as LaneEvent[];
	}
}

/** Compute the structural diff between original and working maps. */
export function diffMaps(original: PulseMap, working: PulseMap): DiffEntry[] {
	const entries: DiffEntry[] = [];
	for (const lane of EDITABLE_LANES) {
		const before = laneArray(original, lane);
		const after = laneArray(working, lane);
		const { pairs, originalUnmatched, workingUnmatched } = matchEvents(before, after, lane);

		for (const { originalIndex, workingIndex } of pairs) {
			entries.push(...fieldDiffs(lane, originalIndex, before[originalIndex], after[workingIndex]));
		}
		for (const i of originalUnmatched) {
			entries.push({ kind: "delete", lane, index: i, value: before[i] });
		}
		for (const j of workingUnmatched) {
			entries.push({ kind: "insert", lane, index: j, value: after[j] });
		}
	}
	return entries;
}

/**
 * Apply a subset of diff entries to `original` to produce a new PulseMap.
 * Entries reference indices in `original` (for field/delete) or in
 * `working` (for insert); we apply in an order that keeps both index
 * spaces stable: field updates first (in original-index order), then
 * deletes (descending), then inserts (ascending into the resulting
 * array). Each lane's array is re-sorted by `t` after edits.
 */
export function applyDiffEntries(original: PulseMap, entries: DiffEntry[]): PulseMap {
	const out = JSON.parse(JSON.stringify(original)) as PulseMap;

	for (const lane of EDITABLE_LANES) {
		const laneEntries = entries.filter((e) => e.lane === lane);
		if (laneEntries.length === 0) continue;

		const arr = laneArray(out, lane);

		for (const e of laneEntries) {
			if (e.kind === "field") {
				const target = arr[e.index] as Record<string, unknown>;
				if (target == null) continue;
				if (e.after === undefined) delete target[e.field];
				else target[e.field] = e.after;
			}
		}

		const deletes = laneEntries
			.filter((e): e is Extract<DiffEntry, { kind: "delete" }> => e.kind === "delete")
			.sort((a, b) => b.index - a.index);
		for (const e of deletes) arr.splice(e.index, 1);

		const inserts = laneEntries
			.filter((e): e is Extract<DiffEntry, { kind: "insert" }> => e.kind === "insert")
			.sort((a, b) => a.index - b.index);
		for (const e of inserts) arr.push(JSON.parse(JSON.stringify(e.value)));

		(arr as { t: number }[]).sort((a, b) => a.t - b.t);
		(out as Record<string, unknown>)[lane] = arr;
	}

	return out;
}

function formatValue(v: unknown): string {
	if (v === undefined || v === null) return "—";
	if (typeof v === "string") return `"${v}"`;
	if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
	return JSON.stringify(v);
}

function formatTimeMs(ms: unknown): string {
	if (typeof ms !== "number") return formatValue(ms);
	return `${(ms / 1000).toFixed(2)}s`;
}

export function describeEntry(entry: DiffEntry): string {
	switch (entry.kind) {
		case "field": {
			const { lane, index, field, before, after } = entry;
			const fmt = field === "t" || field === "end" ? formatTimeMs : formatValue;
			return `${lane}[${index}].${field}: ${fmt(before)} → ${fmt(after)}`;
		}
		case "insert": {
			const v = entry.value as Record<string, unknown>;
			const label =
				entry.lane === "chords" && typeof v.chord === "string"
					? `"${v.chord}"`
					: (entry.lane === "words" || entry.lane === "lyrics") && typeof v.text === "string"
						? `"${v.text}"`
						: entry.lane === "sections" && typeof v.label === "string"
							? `"${v.label}"`
							: "item";
			return `${entry.lane}: + ${label} at ${formatTimeMs(v.t)}`;
		}
		case "delete": {
			const v = entry.value as Record<string, unknown>;
			const label =
				entry.lane === "chords" && typeof v.chord === "string"
					? `"${v.chord}"`
					: (entry.lane === "words" || entry.lane === "lyrics") && typeof v.text === "string"
						? `"${v.text}"`
						: entry.lane === "sections" && typeof v.label === "string"
							? `"${v.label}"`
							: "item";
			return `${entry.lane}[${entry.index}]: − ${label} at ${formatTimeMs(v.t)}`;
		}
	}
}

export function fieldCountsByLane(entries: DiffEntry[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const e of entries) counts[e.lane] = (counts[e.lane] ?? 0) + 1;
	return counts;
}

export function laneSummary(entries: DiffEntry[]): string {
	const counts = fieldCountsByLane(entries);
	const parts = Object.entries(counts).map(([lane, n]) => `${n} ${lane}`);
	return parts.length > 0 ? parts.join(", ") : "no changes";
}
