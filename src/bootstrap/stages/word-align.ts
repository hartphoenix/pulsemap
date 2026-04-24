import { join } from "node:path";
import type { LyricLine, WordEvent } from "../../../schema/map";
import { runPythonScript } from "../python";

export interface WordAlignResult {
	words: WordEvent[];
	lrclibValidated: boolean;
	lrclibOffsetMs: number | null;
	source: "forced_alignment" | "free_transcription";
}

interface RawOutput {
	words: WordEvent[];
	lrclib_validated: boolean;
	lrclib_offset_ms: number | null;
	source: "forced_alignment" | "free_transcription";
}

export async function alignWords(
	vocalStemPath: string,
	lyrics: LyricLine[] | undefined,
	workDir: string,
): Promise<WordAlignResult | undefined> {
	const args = [vocalStemPath];

	if (lyrics?.length) {
		const lyricsPath = join(workDir, "lyrics-for-align.json");
		await Bun.write(lyricsPath, JSON.stringify(lyrics));
		args.push(lyricsPath);
	}

	const { stdout, stderr, exitCode } = await runPythonScript("word_align.py", args);

	if (exitCode !== 0) {
		console.warn(`Word alignment failed (exit ${exitCode}): ${stderr}`);
		return undefined;
	}

	if (stderr) {
		console.error(`Alignment warnings: ${stderr}`);
	}

	try {
		const raw = JSON.parse(stdout) as RawOutput;
		const words = raw.words
			.filter((w) => w.text.trim().length > 0)
			.map((w) => ({
				...w,
				end: w.end != null && w.end > w.t ? w.end : w.t + 50,
			}));

		if (words.length === 0) return undefined;

		return {
			words,
			lrclibValidated: raw.lrclib_validated,
			lrclibOffsetMs: raw.lrclib_offset_ms,
			source: raw.source,
		};
	} catch {
		console.warn(`Failed to parse alignment output: ${stdout.slice(0, 200)}`);
		return undefined;
	}
}
