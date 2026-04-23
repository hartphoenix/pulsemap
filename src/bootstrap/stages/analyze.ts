import type { BeatEvent, ChordEvent, Section } from "../../../schema/map";
import { runPythonScript } from "../python";

export interface AnalysisResult {
	key?: string;
	scale?: string;
	tempo?: number;
	time_signature?: string;
	beats?: BeatEvent[];
	chords?: ChordEvent[];
	sections?: Section[];
}

export async function analyzeAudio(audioPath: string): Promise<AnalysisResult | undefined> {
	const { stdout, stderr, exitCode } = await runPythonScript("analyze.py", [audioPath]);

	if (exitCode !== 0) {
		console.warn(`Audio analysis failed (exit ${exitCode}): ${stderr}`);
		return undefined;
	}

	if (stderr) {
		console.warn(`Analysis warnings: ${stderr}`);
	}

	try {
		return JSON.parse(stdout) as AnalysisResult;
	} catch {
		console.warn(`Failed to parse analysis output: ${stdout.slice(0, 200)}`);
		return undefined;
	}
}
