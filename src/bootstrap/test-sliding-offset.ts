/**
 * Test sliding-window offset detection on existing maps.
 * Uses WhisperX word clusters + LRCLIB line timestamps already in the map.
 * No audio processing needed — runs instantly.
 *
 * Usage: bun run src/bootstrap/test-sliding-offset.ts <map.json> [map2.json ...]
 */

import type { PulseMap, WordEvent } from "../../schema/map";

interface TextCluster {
	t: number;
	text: string;
}

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

const SIMILARITY_THRESHOLD = 0.25;
const IMPROVEMENT_THRESHOLD = 0.15;

function findBestOffset(
	lrclibLines: { t: number; text: string }[],
	clusters: TextCluster[],
	rangeMs: number = 120_000,
	stepMs: number = 500,
	toleranceMs: number = 3000,
): { offsetMs: number; score: number; zeroScore: number; accepted: boolean } {
	const lrclibNormed = lrclibLines.map((l) => ({ t: l.t, words: normalize(l.text) }));
	const clusterNormed = clusters.map((c) => ({ t: c.t, words: normalize(c.text) }));

	function scoreAtOffset(delta: number): number {
		let total = 0;
		for (const line of lrclibNormed) {
			const shifted = line.t + delta;
			let bestSim = 0;
			for (const cl of clusterNormed) {
				if (Math.abs(shifted - cl.t) <= toleranceMs) {
					const sim = jaccard(line.words, cl.words);
					if (sim > bestSim) bestSim = sim;
				}
			}
			total += bestSim;
		}
		return total;
	}

	const zeroScore = scoreAtOffset(0);
	let bestOffset = 0;
	let bestScore = zeroScore;

	for (let delta = -rangeMs; delta <= rangeMs; delta += stepMs) {
		const score = scoreAtOffset(delta);
		if (score > bestScore) {
			bestScore = score;
			bestOffset = delta;
		}
	}

	const avgSim = lrclibLines.length > 0 ? bestScore / lrclibLines.length : 0;
	const improvement = lrclibLines.length > 0 ? (bestScore - zeroScore) / lrclibLines.length : 0;
	const accepted =
		Math.abs(bestOffset) > 2000 && avgSim >= SIMILARITY_THRESHOLD && improvement >= IMPROVEMENT_THRESHOLD;

	return { offsetMs: bestOffset, score: bestScore, zeroScore, accepted };
}

async function testMap(mapPath: string) {
	const map: PulseMap = await Bun.file(mapPath).json();
	const title = map.metadata?.title ?? "Unknown";
	const artist = map.metadata?.artist ?? "Unknown";
	const lyrics = map.lyrics ?? [];
	const words = map.words ?? [];

	console.log(`\n=== ${title} — ${artist} ===`);

	if (!lyrics.length || !words.length) {
		console.log("  Missing lyrics or words — skipping");
		return;
	}

	const clusters = clusterWords(words);

	console.log(`  LRCLIB lines: ${lyrics.length}, WhisperX clusters: ${clusters.length}`);

	const result = findBestOffset(lyrics, clusters);

	const avgSim = lyrics.length > 0 ? result.score / lyrics.length : 0;
	const zeroAvg = lyrics.length > 0 ? result.zeroScore / lyrics.length : 0;
	const improvement = avgSim - zeroAvg;

	console.log(`  Best offset: ${result.offsetMs}ms (${(result.offsetMs / 1000).toFixed(1)}s)`);
	console.log(`  Avg similarity at best offset: ${(avgSim * 100).toFixed(1)}%`);
	console.log(`  Avg similarity at offset=0:    ${(zeroAvg * 100).toFixed(1)}%`);
	console.log(`  Improvement: ${improvement >= 0 ? "+" : ""}${(improvement * 100).toFixed(1)}%`);
	console.log(`  Verdict: ${result.accepted ? "ACCEPTED" : "REJECTED"}`);

	if (result.accepted) {
		console.log(`\n  Corrected first 5 lyrics:`);
		for (const line of lyrics.slice(0, 5)) {
			const corrected = Math.max(0, line.t + result.offsetMs);
			console.log(`    ${line.t}ms → ${corrected}ms  "${line.text.slice(0, 50)}"`);
		}
	}
}

async function main() {
	const paths = process.argv.slice(2);
	if (!paths.length) {
		console.error("Usage: bun run src/bootstrap/test-sliding-offset.ts <map.json> [map2.json ...]");
		process.exit(1);
	}
	for (const p of paths) {
		await testMap(p);
	}
}

main();
