import type { LyricLine, WordEvent } from "../../../schema/map";

interface TextCluster {
	t: number;
	text: string;
}

export interface LyricOffsetResult {
	lyrics: LyricLine[];
	offsetMs: number;
	accepted: boolean;
	avgSimilarity: number;
	zeroSimilarity: number;
}

const SIMILARITY_THRESHOLD = 0.25;
const IMPROVEMENT_THRESHOLD = 0.15;
const MIN_OFFSET_MS = 500;

function clusterWords(words: WordEvent[], gapMs: number = 1000): TextCluster[] {
	if (!words.length) return [];
	const sorted = [...words].sort((a, b) => a.t - b.t);
	const clusters: TextCluster[] = [];
	let current = { t: sorted[0].t, texts: [sorted[0].text] };

	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].t - sorted[i - 1].t > gapMs) {
			clusters.push({ t: current.t, text: current.texts.join(" ") });
			current = { t: sorted[i].t, texts: [sorted[i].text] };
		} else {
			current.texts.push(sorted[i].text);
		}
	}
	clusters.push({ t: current.t, text: current.texts.join(" ") });
	return clusters;
}

function normalize(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, "")
			.split(/\s+/)
			.filter((w) => w.length > 0),
	);
}

function jaccard(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 && b.size === 0) return 0;
	let intersection = 0;
	for (const w of a) {
		if (b.has(w)) intersection++;
	}
	const union = a.size + b.size - intersection;
	return union > 0 ? intersection / union : 0;
}

function scoreAtOffset(
	lines: { t: number; words: Set<string> }[],
	clusters: { t: number; words: Set<string> }[],
	delta: number,
	toleranceMs: number,
): number {
	let total = 0;
	for (const line of lines) {
		const shifted = line.t + delta;
		let bestSim = 0;
		for (const cl of clusters) {
			if (Math.abs(shifted - cl.t) <= toleranceMs) {
				const sim = jaccard(line.words, cl.words);
				if (sim > bestSim) bestSim = sim;
			}
		}
		total += bestSim;
	}
	return total;
}

export function detectLyricOffset(
	lyrics: LyricLine[],
	words: WordEvent[],
): LyricOffsetResult {
	const clusters = clusterWords(words);
	const linesNormed = lyrics.map((l) => ({ t: l.t, words: normalize(l.text) }));
	const clustersNormed = clusters.map((c) => ({ t: c.t, words: normalize(c.text) }));

	const rangeMs = 120_000;
	const stepMs = 500;
	const toleranceMs = 3000;

	const zeroScore = scoreAtOffset(linesNormed, clustersNormed, 0, toleranceMs);
	let bestOffset = 0;
	let bestScore = zeroScore;

	for (let delta = -rangeMs; delta <= rangeMs; delta += stepMs) {
		const score = scoreAtOffset(linesNormed, clustersNormed, delta, toleranceMs);
		if (score > bestScore) {
			bestScore = score;
			bestOffset = delta;
		}
	}

	const avgSimilarity = lyrics.length > 0 ? bestScore / lyrics.length : 0;
	const zeroSimilarity = lyrics.length > 0 ? zeroScore / lyrics.length : 0;
	const improvement = avgSimilarity - zeroSimilarity;

	const accepted =
		Math.abs(bestOffset) > MIN_OFFSET_MS &&
		avgSimilarity >= SIMILARITY_THRESHOLD &&
		improvement >= IMPROVEMENT_THRESHOLD;

	if (!accepted) {
		return { lyrics, offsetMs: 0, accepted: false, avgSimilarity: zeroSimilarity, zeroSimilarity };
	}

	const corrected = lyrics.map((line) => ({
		...line,
		t: Math.max(0, line.t + bestOffset),
		...(line.end != null ? { end: Math.max(0, line.end + bestOffset) } : {}),
	}));

	return { lyrics: corrected, offsetMs: bestOffset, accepted: true, avgSimilarity, zeroSimilarity };
}
