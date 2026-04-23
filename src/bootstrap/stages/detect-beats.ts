import type { BeatEvent } from "../../../schema/map";
import { runPythonScript } from "../python";

export interface BeatDetectionResult {
	beats: BeatEvent[];
	tempo: number;
	beatCount: number;
	downbeatCount: number;
}

export async function detectBeats(audioPath: string): Promise<BeatDetectionResult | undefined> {
	const { stdout, stderr, exitCode } = await runPythonScript("detect_beats.py", [audioPath]);

	if (exitCode !== 0) {
		console.warn(`Beat detection failed (exit ${exitCode}): ${stderr}`);
		return undefined;
	}

	if (stderr) {
		console.error(`Beat detection info: ${stderr}`);
	}

	try {
		const result = JSON.parse(stdout) as {
			beats: BeatEvent[];
			tempo: number;
			beat_count: number;
			downbeat_count: number;
		};
		return {
			beats: result.beats,
			tempo: result.tempo,
			beatCount: result.beat_count,
			downbeatCount: result.downbeat_count,
		};
	} catch {
		console.warn(`Failed to parse beat detection output: ${stdout.slice(0, 200)}`);
		return undefined;
	}
}
