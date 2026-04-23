import { Midi } from "@tonejs/midi";
import type { ChordEvent } from "../../../schema/map";

export interface ConflictEvent {
	t: number;
	bassPitch: string;
	chordRoot: string;
	chord: string;
}

export interface CrossValidationResult {
	concordance: number;
	conflicts: ConflictEvent[];
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

function midiToPitchClass(midiNote: number): string {
	return NOTE_NAMES[midiNote % 12];
}

function normalizeNote(note: string): string {
	return ENHARMONIC[note] ?? note;
}

function parseChordRoot(chord: string): string | undefined {
	const m = chord.match(/^([A-G][#b]?)/);
	return m?.[1];
}

function parseSlashBass(chord: string): string | undefined {
	const m = chord.match(/\/([A-G][#b]?)$/);
	return m?.[1];
}

function pitchClassesMatch(a: string, b: string): boolean {
	return normalizeNote(a) === normalizeNote(b);
}

export async function crossValidateBassChords(
	bassMidiPath: string,
	chords: ChordEvent[],
): Promise<CrossValidationResult> {
	const midiData = await Bun.file(bassMidiPath).arrayBuffer();
	const midi = new Midi(midiData);

	const bassNotes = midi.tracks.flatMap((track) =>
		track.notes.map((n) => ({
			time: n.time * 1000,
			duration: n.duration * 1000,
			pitch: n.midi,
			pitchClass: midiToPitchClass(n.midi),
		})),
	);

	if (bassNotes.length === 0 || chords.length === 0) {
		return { concordance: 1, conflicts: [] };
	}

	let matches = 0;
	let total = 0;
	const conflicts: ConflictEvent[] = [];

	for (const chord of chords) {
		const chordEnd = chord.end ?? chord.t + 1000;
		const overlapping = bassNotes.filter((n) => n.time < chordEnd && n.time + n.duration > chord.t);

		if (overlapping.length === 0) continue;

		const dominantBass = overlapping.reduce((a, b) => (a.duration > b.duration ? a : b));
		const root = parseChordRoot(chord.chord);
		const slashBass = parseSlashBass(chord.chord);

		if (!root) continue;

		total++;

		const bassMatches =
			pitchClassesMatch(dominantBass.pitchClass, root) ||
			(slashBass != null && pitchClassesMatch(dominantBass.pitchClass, slashBass));

		if (bassMatches) {
			matches++;
		} else {
			conflicts.push({
				t: chord.t,
				bassPitch: dominantBass.pitchClass,
				chordRoot: root,
				chord: chord.chord,
			});
		}
	}

	const concordance = total > 0 ? matches / total : 1;
	return { concordance, conflicts };
}
