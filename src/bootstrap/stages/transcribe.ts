import { join } from "node:path";
import type { MidiReference } from "../../../schema/map";
import { runPythonScript } from "../python";

export interface TranscriptionResult {
	reference: MidiReference;
	filePath: string;
	label: string;
	noteCount: number;
}

async function computeSha256(filePath: string): Promise<string> {
	const data = await Bun.file(filePath).arrayBuffer();
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(new Uint8Array(data));
	return hasher.digest("hex");
}

export async function transcribeStem(
	stemPath: string,
	stemLabel: string,
	workDir: string,
	audioDurationMs: number,
): Promise<TranscriptionResult | undefined> {
	const midiPath = join(workDir, "midi", `${stemLabel}.mid`);
	await Bun.spawn(["mkdir", "-p", join(workDir, "midi")], {
		stdout: "ignore",
		stderr: "ignore",
	}).exited;

	let scriptName: string;
	let args: string[];

	if (stemLabel === "vocals") {
		scriptName = "transcribe_vocals.py";
		args = [stemPath, midiPath];
	} else if (stemLabel === "drums") {
		scriptName = "transcribe_drums.py";
		args = [stemPath, midiPath];
	} else {
		scriptName = "transcribe_pitched.py";
		args = [stemPath, midiPath, stemLabel];
	}

	const { stdout, stderr, exitCode } = await runPythonScript(scriptName, args);

	if (exitCode !== 0) {
		console.warn(`Transcription failed for ${stemLabel} (exit ${exitCode}): ${stderr}`);
		return undefined;
	}

	if (stderr) {
		console.error(`Transcription warnings (${stemLabel}): ${stderr}`);
	}

	try {
		const result = JSON.parse(stdout) as {
			midi_path: string;
			label: string;
			note_count: number;
			duration_ms: number;
		};

		if (result.note_count === 0) {
			console.warn(`No notes detected for ${stemLabel}`);
			return undefined;
		}

		const sha256 = await computeSha256(result.midi_path);

		return {
			reference: {
				sha256,
				duration_ms: result.duration_ms || audioDurationMs,
				tracks: [{ index: 0, label: stemLabel }],
			},
			filePath: result.midi_path,
			label: stemLabel,
			noteCount: result.note_count,
		};
	} catch {
		console.warn(`Failed to parse transcription output for ${stemLabel}: ${stdout.slice(0, 200)}`);
		return undefined;
	}
}
