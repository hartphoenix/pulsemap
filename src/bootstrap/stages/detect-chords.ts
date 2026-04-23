import type { ChordEvent } from "../../../schema/map";
import { runPythonScript } from "../python";

export async function detectChords(audioPath: string): Promise<ChordEvent[] | undefined> {
	const { stdout, stderr, exitCode } = await runPythonScript("detect_chords.py", [audioPath]);

	if (exitCode !== 0) {
		console.warn(`Chord detection failed (exit ${exitCode}): ${stderr}`);
		return undefined;
	}

	if (stderr) {
		console.error(`Chord detection info: ${stderr}`);
	}

	try {
		const chords = JSON.parse(stdout) as ChordEvent[];
		return chords.length > 0 ? chords : undefined;
	} catch {
		console.warn(`Failed to parse chord detection output: ${stdout.slice(0, 200)}`);
		return undefined;
	}
}
