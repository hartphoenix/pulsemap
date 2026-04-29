import type { LyricLine, WordEvent } from "../../../schema/map";

export interface ReconcileResult {
	words: WordEvent[];
	correctionCount: number;
}

const SYSTEM_PROMPT = `You reconcile word-level audio transcription with canonical lyrics for a song. You receive lines grouped by timestamp window. Each group shows:

- The canonical LRCLIB text for that line
- The WhisperX transcribed words (with indices) that fall in that time window

Return JSON only: {"corrections": [{"i": <index>, "text": "<corrected>"}]}

Rules:
- Only include words that need text correction
- Never add or remove words — only correct existing text at existing indices
- Preserve original word boundaries (don't merge or split)
- If a WhisperX word is an ad-lib or vocal flourish absent from LRCLIB, leave it unchanged
- Prefer LRCLIB spelling/punctuation when the word clearly matches
- If uncertain, leave unchanged`;

interface LineChunk {
	lineText: string;
	words: { index: number; text: string }[];
}

function buildChunks(lyrics: LyricLine[], words: WordEvent[]): LineChunk[] {
	const sorted = [...words].map((w, i) => ({ ...w, origIndex: i })).sort((a, b) => a.t - b.t);
	const chunks: LineChunk[] = [];

	// Use midpoints between consecutive line starts as boundaries
	const boundaries: number[] = [];
	for (let l = 0; l < lyrics.length; l++) {
		if (l === 0) {
			boundaries.push(-Infinity);
		} else {
			boundaries.push((lyrics[l - 1].t + lyrics[l].t) / 2);
		}
	}

	for (let l = 0; l < lyrics.length; l++) {
		const windowStart = boundaries[l];
		const windowEnd = l + 1 < boundaries.length ? boundaries[l + 1] : Number.POSITIVE_INFINITY;
		const nextLineStart = l + 1 < lyrics.length ? (lyrics[l].t + lyrics[l + 1].t) / 2 : Number.POSITIVE_INFINITY;

		const chunkWords: { index: number; text: string }[] = [];
		for (const w of sorted) {
			if (w.t >= windowStart && w.t < nextLineStart) {
				chunkWords.push({ index: w.origIndex, text: w.text });
			}
		}

		if (chunkWords.length > 0) {
			chunks.push({ lineText: lyrics[l].text, words: chunkWords });
		}
	}

	return chunks;
}

function formatChunkedPrompt(
	chunks: LineChunk[],
	metadata: { title?: string; artist?: string },
): string {
	const lines: string[] = [`Song: ${metadata.title || "Unknown"} by ${metadata.artist || "Unknown"}`, ""];

	for (let c = 0; c < chunks.length; c++) {
		const chunk = chunks[c];
		lines.push(`Line ${c + 1} canonical: "${chunk.lineText}"`);
		const wordList = chunk.words.map((w) => `${w.index}:"${w.text}"`).join(", ");
		lines.push(`Line ${c + 1} transcribed: [${wordList}]`);
		lines.push("");
	}

	return lines.join("\n");
}

interface Correction {
	i: number;
	text: string;
}

function parseCorrections(raw: string): Correction[] | undefined {
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
	if (lyrics.length === 0) {
		return { words, correctionCount: 0 };
	}

	if (!Bun.which("claude")) {
		return { words, correctionCount: 0 };
	}

	const chunks = buildChunks(lyrics, words);
	if (chunks.length === 0) {
		return { words, correctionCount: 0 };
	}

	const userPrompt = formatChunkedPrompt(chunks, metadata);

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
		console.error("[reconcile-words] claude CLI threw");
		return { words, correctionCount: 0 };
	}

	console.error(`[reconcile-words] raw response (${stdout.length} chars): ${stdout.slice(0, 500)}`);

	const corrections = parseCorrections(stdout);
	if (!corrections) {
		console.error("[reconcile-words] failed to parse corrections from response");
		return { words, correctionCount: 0 };
	}

	console.error(`[reconcile-words] parsed ${corrections.length} corrections`);

	const correctedWords = [...words];
	let correctionCount = 0;

	for (const c of corrections) {
		if (c.i < 0 || c.i >= correctedWords.length) continue;
		if (!c.text || c.text.trim().length === 0) continue;
		if (c.text === correctedWords[c.i].text) continue;

		correctedWords[c.i] = { ...correctedWords[c.i], text: c.text };
		correctionCount++;
	}

	return { words: correctedWords, correctionCount };
}
