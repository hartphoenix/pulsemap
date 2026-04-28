import type { LyricLine, WordEvent } from "../../../schema/map";

export interface ReconcileResult {
	words: WordEvent[];
	correctionCount: number;
}

const SYSTEM_PROMPT = `You reconcile word-level audio transcription with canonical lyrics for a song. You receive two representations:

1. LRCLIB lines: canonical text with line-start timestamps
2. WhisperX words: transcribed text with per-word timestamps

Return JSON only: {"corrections": [{"i": <index>, "text": "<corrected>"}]}

Rules:
- Only include words that need text correction
- Never add or remove words — only correct existing slots
- Preserve original word boundaries (don't merge or split)
- If a WhisperX word is an ad-lib or vocal flourish absent from LRCLIB, leave it unchanged
- Prefer LRCLIB spelling/punctuation when the word clearly matches
- If uncertain, leave unchanged`;

function formatLrclibLines(lyrics: LyricLine[]): string {
	return lyrics
		.map((line) => {
			const totalMs = line.t;
			const minutes = Math.floor(totalMs / 60000);
			const seconds = Math.floor((totalMs % 60000) / 1000);
			const centiseconds = Math.floor((totalMs % 1000) / 10);
			return `[${minutes}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}] ${line.text}`;
		})
		.join("\n");
}

function formatWhisperXWords(words: WordEvent[]): string {
	return words.map((w, i) => `${i}: "${w.text}" (${w.t}ms)`).join("\n");
}

interface Correction {
	i: number;
	text: string;
}

function parseCorrections(raw: string): Correction[] | undefined {
	// Try to extract JSON from the response (may be wrapped in markdown fences)
	let jsonStr = raw.trim();
	const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fenceMatch) {
		jsonStr = fenceMatch[1].trim();
	}

	try {
		const parsed = JSON.parse(jsonStr) as { corrections?: Correction[] };
		if (!Array.isArray(parsed.corrections)) return undefined;
		return parsed.corrections;
	} catch {
		return undefined;
	}
}

export async function reconcileWords(
	words: WordEvent[],
	lyrics: LyricLine[],
	metadata: { title?: string; artist?: string },
): Promise<ReconcileResult> {
	// Fallback: empty lyrics means nothing to reconcile against
	if (lyrics.length === 0) {
		return { words, correctionCount: 0 };
	}

	// Check if claude CLI is available
	if (!Bun.which("claude")) {
		return { words, correctionCount: 0 };
	}

	const userPrompt = `Song: ${metadata.title || "Unknown"} by ${metadata.artist || "Unknown"}

LRCLIB lines:
${formatLrclibLines(lyrics)}

WhisperX words (${words.length} total):
${formatWhisperXWords(words)}`;

	let stdout: string;
	try {
		const proc = Bun.spawn(
			["claude", "--bare", "-p", userPrompt, "--model", "haiku", "--system-prompt", SYSTEM_PROMPT],
			{
				stdout: "pipe",
				stderr: "pipe",
			},
		);

		const exitCode = await proc.exited;
		if (exitCode !== 0) {
			return { words, correctionCount: 0 };
		}

		stdout = await new Response(proc.stdout).text();
	} catch {
		return { words, correctionCount: 0 };
	}

	const corrections = parseCorrections(stdout);
	if (!corrections) {
		return { words, correctionCount: 0 };
	}

	// Apply valid corrections
	const correctedWords = [...words];
	let correctionCount = 0;

	for (const c of corrections) {
		// Discard out-of-bounds
		if (c.i < 0 || c.i >= correctedWords.length) continue;
		// Discard empty text
		if (!c.text || c.text.trim().length === 0) continue;
		// Discard no-ops
		if (c.text === correctedWords[c.i].text) continue;

		correctedWords[c.i] = { ...correctedWords[c.i], text: c.text };
		correctionCount++;
	}

	return { words: correctedWords, correctionCount };
}
