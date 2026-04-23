import type { BeatEvent, ChordEvent } from "../../../schema/map";

export interface ChordCleanupOptions {
	beats: BeatEvent[];
	key?: string;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ENHARMONIC: Record<string, string> = {
	Db: "C#",
	Eb: "D#",
	Fb: "E",
	Gb: "F#",
	Ab: "G#",
	Bb: "A#",
	Cb: "B",
	"E#": "F",
	"B#": "C",
};

const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE_STEPS = [0, 2, 3, 5, 7, 8, 10];

function normalizeNote(note: string): string {
	return ENHARMONIC[note] ?? note;
}

function noteIndex(note: string): number {
	return NOTE_NAMES.indexOf(normalizeNote(note));
}

function parseChordRoot(chord: string): string | undefined {
	const m = chord.match(/^([A-G][#b]?)/);
	return m?.[1];
}

function getDiatonicRoots(key: string): Set<string> {
	const parts = key.split(/\s+/);
	const root = parts[0];
	const mode = parts[1]?.toLowerCase();
	const rootIdx = noteIndex(root);
	if (rootIdx < 0) return new Set();

	const steps = mode === "minor" ? MINOR_SCALE_STEPS : MAJOR_SCALE_STEPS;
	return new Set(steps.map((s) => NOTE_NAMES[(rootIdx + s) % 12]));
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

	const sixteenthMs = 60000 / bpm / 4;
	const diatonicRoots = options.key ? getDiatonicRoots(options.key) : undefined;

	const filtered: ChordEvent[] = [];

	for (let i = 0; i < chords.length; i++) {
		const chord = chords[i];
		const duration = chord.end != null ? chord.end - chord.t : undefined;

		if (duration != null && duration < sixteenthMs) {
			if (filtered.length > 0) {
				filtered[filtered.length - 1].end = chord.end;
			}
			continue;
		}

		if (duration != null && duration < sixteenthMs * 2) {
			const root = parseChordRoot(chord.chord);
			const isDiatonic = root && diatonicRoots ? diatonicRoots.has(normalizeNote(root)) : true;
			if (!isDiatonic) {
				if (filtered.length > 0) {
					filtered[filtered.length - 1].end = chord.end;
				}
				continue;
			}
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
