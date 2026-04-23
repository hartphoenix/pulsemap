import { join } from "node:path";
import { Midi } from "@tonejs/midi";
import type { BeatEvent } from "../../../schema/map";

export interface BeatAlignResult {
	alignedPath: string;
	sha256: string;
	durationMs: number;
	label: string;
}

async function computeSha256(filePath: string): Promise<string> {
	const data = await Bun.file(filePath).arrayBuffer();
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(new Uint8Array(data));
	return hasher.digest("hex");
}

function getBpm(beats: BeatEvent[]): number {
	for (const beat of beats) {
		if (beat.bpm) return beat.bpm;
	}
	return 120;
}

export async function beatAlignMidi(
	midiPath: string,
	beats: BeatEvent[],
	workDir: string,
	label: string,
): Promise<BeatAlignResult> {
	const midiData = await Bun.file(midiPath).arrayBuffer();
	const midi = new Midi(midiData);

	const bpm = getBpm(beats);

	// Set the correct tempo track so the MIDI file's beat grid
	// matches the map's detected BPM. Note positions stay exactly
	// where they were detected — the tempo track provides context,
	// not correction.
	midi.header.tempos = [{ ticks: 0, bpm }];
	midi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4] }];

	let maxEndTime = 0;
	for (const track of midi.tracks) {
		for (const note of track.notes) {
			const endTime = note.time + note.duration;
			if (endTime > maxEndTime) maxEndTime = endTime;
		}
	}

	const alignedPath = join(workDir, "midi", `${label}-aligned.mid`);
	const output = new Uint8Array(midi.toArray());
	await Bun.write(alignedPath, output);

	const sha256 = await computeSha256(alignedPath);
	const durationMs = Math.round(maxEndTime * 1000);

	return { alignedPath, sha256, durationMs, label };
}
