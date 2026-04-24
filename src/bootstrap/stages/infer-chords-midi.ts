import { join } from "node:path";
import type { BeatEvent, ChordEvent } from "../../../schema/map";
import { runPythonScript } from "../python";

export interface MidiChordValidation {
	midiChords: ChordEvent[];
	concordance: number;
	conflicts: Array<{
		t: number;
		midiChord: string;
		audioChord: string;
	}>;
}

export async function inferChordsMidi(
	bassMidiPath: string,
	otherMidiPath: string,
	beats: BeatEvent[],
	workDir: string,
): Promise<ChordEvent[] | undefined> {
	const beatsPath = join(workDir, "beats-for-chords.json");
	await Bun.write(beatsPath, JSON.stringify(beats));

	const { stdout, stderr, exitCode } = await runPythonScript("infer_chords_midi.py", [
		bassMidiPath,
		otherMidiPath,
		beatsPath,
	]);

	if (exitCode !== 0) {
		console.warn(`MIDI chord inference failed (exit ${exitCode}): ${stderr}`);
		return undefined;
	}

	if (stderr) {
		console.error(`MIDI chord inference warnings: ${stderr}`);
	}

	try {
		const chords = JSON.parse(stdout) as ChordEvent[];
		return chords.length > 0 ? chords : undefined;
	} catch {
		console.warn(`Failed to parse MIDI chord output: ${stdout.slice(0, 200)}`);
		return undefined;
	}
}

export function crossValidateMidiChords(
	midiChords: ChordEvent[],
	audioChords: ChordEvent[],
): MidiChordValidation {
	let matches = 0;
	let total = 0;
	const conflicts: MidiChordValidation["conflicts"] = [];

	for (const mc of midiChords) {
		const mcEnd = mc.end ?? mc.t + 500;
		const overlapping = audioChords.find((ac) => ac.t < mcEnd && (ac.end ?? ac.t + 500) > mc.t);

		if (!overlapping) continue;

		total++;
		if (normalizeChordRoot(mc.chord) === normalizeChordRoot(overlapping.chord)) {
			matches++;
		} else {
			conflicts.push({
				t: mc.t,
				midiChord: mc.chord,
				audioChord: overlapping.chord,
			});
		}
	}

	return {
		midiChords,
		concordance: total > 0 ? matches / total : 0,
		conflicts,
	};
}

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

function normalizeChordRoot(chord: string): string {
	const m = chord.match(/^([A-G][#b]?)/);
	if (!m) return chord;
	const root = m[1];
	return ENHARMONIC[root] ?? root;
}
