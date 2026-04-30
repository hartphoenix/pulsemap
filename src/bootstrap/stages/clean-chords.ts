import type { BeatEvent, ChordEvent } from "../../../schema/map";

export interface ChordCleanupOptions {
	beats: BeatEvent[];
	/** Reserved for future diatonic-root filtering; currently unused. */
	key?: string;
}

function getBpm(beats: BeatEvent[]): number | undefined {
	for (const beat of beats) {
		if (beat.bpm) return beat.bpm;
	}
	return undefined;
}

export function cleanChords(chords: ChordEvent[], options: ChordCleanupOptions): ChordEvent[] {
	if (chords.length === 0) return [];

	const bpm = getBpm(options.beats);
	if (!bpm) return chords;

	const eighthMs = 60000 / bpm / 2;
	const minChordMs = Math.max(300, eighthMs);

	const filtered: ChordEvent[] = [];

	for (let i = 0; i < chords.length; i++) {
		const chord = chords[i];
		const duration = chord.end != null ? chord.end - chord.t : undefined;

		if (duration != null && duration < minChordMs) {
			if (filtered.length > 0) {
				filtered[filtered.length - 1].end = chord.end;
			}
			continue;
		}

		filtered.push({ ...chord });
	}

	const merged: ChordEvent[] = [];
	for (const chord of filtered) {
		const prev = merged[merged.length - 1];
		if (prev && prev.chord === chord.chord) {
			prev.end = chord.end ?? prev.end;
		} else {
			merged.push(chord);
		}
	}

	return merged;
}
