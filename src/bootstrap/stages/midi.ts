import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { MidiReference } from "../../../schema/map";

export interface MidiResult {
	reference: MidiReference;
	filePath: string;
}

export async function extractMidi(
	audioPath: string,
	workDir: string,
	audioDurationMs: number,
): Promise<MidiResult | undefined> {
	const midiDir = join(workDir, "midi");
	await mkdir(midiDir, { recursive: true });

	const proc = Bun.spawn(["basic-pitch", midiDir, audioPath], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const stderr = await new Response(proc.stderr).text();
	await proc.exited;

	if (proc.exitCode !== 0) {
		console.warn(`basic-pitch failed (exit ${proc.exitCode}): ${stderr}`);
		return undefined;
	}

	const files = await readdir(midiDir);
	const midiFile = files.find((f) => f.endsWith(".mid") || f.endsWith(".midi"));

	if (!midiFile) {
		console.warn("basic-pitch produced no MIDI output");
		return undefined;
	}

	const midiPath = join(midiDir, midiFile);
	const midiBytes = await Bun.file(midiPath).arrayBuffer();

	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(new Uint8Array(midiBytes));
	const sha256 = hasher.digest("hex");

	return {
		reference: { sha256, duration_ms: audioDurationMs },
		filePath: midiPath,
	};
}
