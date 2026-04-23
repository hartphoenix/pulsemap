import { join } from "node:path";
import type { LyricLine, WordEvent } from "../../../schema/map";
import { runPythonScript } from "../python";

export async function alignWords(
	vocalStemPath: string,
	lyrics: LyricLine[],
	workDir: string,
): Promise<WordEvent[] | undefined> {
	const lyricsPath = join(workDir, "lyrics-for-align.json");
	await Bun.write(lyricsPath, JSON.stringify(lyrics));

	const { stdout, stderr, exitCode } = await runPythonScript("word_align.py", [
		vocalStemPath,
		lyricsPath,
	]);

	if (exitCode !== 0) {
		console.warn(`Word alignment failed (exit ${exitCode}): ${stderr}`);
		return undefined;
	}

	if (stderr) {
		console.error(`Alignment warnings: ${stderr}`);
	}

	try {
		const words = JSON.parse(stdout) as WordEvent[];
		return words.length > 0 ? words : undefined;
	} catch {
		console.warn(`Failed to parse alignment output: ${stdout.slice(0, 200)}`);
		return undefined;
	}
}
