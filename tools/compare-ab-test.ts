#!/usr/bin/env bun
/**
 * Compare word alignment quality across AB test methods.
 *
 * Usage: bun run tools/compare-ab-test.ts maps/ab-test/a maps/ab-test/b [maps/ab-test/c]
 *
 * Reads maps from each directory, computes per-song and aggregate metrics,
 * outputs a comparison table.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { PulseMap, WordEvent } from "../schema/map";

interface WordMetrics {
	totalWords: number;
	collapsedWords: number;
	durationAnomalies: number;
	medianDuration: number;
	medianGap: number;
	maxDuration: number;
	lrclibValidated: boolean;
	source: string;
}

interface SongComparison {
	id: string;
	title: string;
	artist: string;
	methods: Record<string, WordMetrics>;
}

function computeMetrics(map: PulseMap): WordMetrics {
	const words = (map.words || []).sort((a, b) => a.t - b.t);
	const provenance = map.analysis?.words;

	if (words.length === 0) {
		return {
			totalWords: 0,
			collapsedWords: 0,
			durationAnomalies: 0,
			medianDuration: 0,
			medianGap: 0,
			maxDuration: 0,
			lrclibValidated: false,
			source: provenance?.tool || "none",
		};
	}

	const durations = words.map((w) => (w.end ?? w.t) - w.t);
	const gaps: number[] = [];
	for (let i = 0; i < words.length - 1; i++) {
		const gap = words[i + 1].t - (words[i].end ?? words[i].t);
		gaps.push(gap);
	}

	const collapsed = durations.filter((d) => d < 75).length;
	const anomalies = durations.filter((d) => d > 2000).length;
	const sortedDurs = [...durations].sort((a, b) => a - b);
	const sortedGaps = [...gaps].sort((a, b) => a - b);

	return {
		totalWords: words.length,
		collapsedWords: collapsed,
		durationAnomalies: anomalies,
		medianDuration: sortedDurs[Math.floor(sortedDurs.length / 2)] || 0,
		medianGap: sortedGaps.length > 0 ? sortedGaps[Math.floor(sortedGaps.length / 2)] : 0,
		maxDuration: Math.max(...durations),
		lrclibValidated:
			provenance?.tool?.includes("+lrclib") || provenance?.tool?.includes("forced") || false,
		source: provenance?.tool || "unknown",
	};
}

async function loadMaps(dir: string): Promise<Map<string, PulseMap>> {
	const maps = new Map<string, PulseMap>();
	const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
	for (const file of files) {
		const raw = await Bun.file(join(dir, file)).text();
		const map = JSON.parse(raw) as PulseMap;
		maps.set(map.id, map);
	}
	return maps;
}

function pad(s: string, n: number): string {
	return s.padEnd(n);
}

function rpad(s: string, n: number): string {
	return s.padStart(n);
}

async function main() {
	const dirs = process.argv.slice(2);
	if (dirs.length < 2) {
		console.log("Usage: bun run tools/compare-ab-test.ts <dir-a> <dir-b> [dir-c]");
		process.exit(1);
	}

	const labels = dirs.map((d) => d.split("/").pop() || d);
	const allMaps: Map<string, PulseMap>[] = [];

	for (const dir of dirs) {
		allMaps.push(await loadMaps(dir));
	}

	// Find common song IDs
	const allIds = new Set<string>();
	for (const maps of allMaps) {
		for (const id of maps.keys()) allIds.add(id);
	}

	const comparisons: SongComparison[] = [];

	for (const id of allIds) {
		const firstMap = allMaps.find((m) => m.has(id))?.get(id);
		if (!firstMap) continue;

		const comp: SongComparison = {
			id,
			title: firstMap.metadata?.title || "?",
			artist: firstMap.metadata?.artist || "?",
			methods: {},
		};

		for (let i = 0; i < allMaps.length; i++) {
			const map = allMaps[i].get(id);
			if (map) {
				comp.methods[labels[i]] = computeMetrics(map);
			}
		}

		comparisons.push(comp);
	}

	// Print per-song comparison
	console.log("\n=== PER-SONG COMPARISON ===\n");

	for (const comp of comparisons) {
		console.log(`${comp.artist} - ${comp.title}`);
		console.log(
			`  ${pad("Method", 8)} ${rpad("Words", 6)} ${rpad("Collapsed", 10)} ${rpad("Anomalies", 10)} ${rpad("Med Dur", 8)} ${rpad("Med Gap", 8)} ${rpad("Max Dur", 8)} Source`,
		);
		for (const [label, m] of Object.entries(comp.methods)) {
			console.log(
				`  ${pad(label, 8)} ${rpad(String(m.totalWords), 6)} ${rpad(String(m.collapsedWords), 10)} ${rpad(String(m.durationAnomalies), 10)} ${rpad(`${m.medianDuration}ms`, 8)} ${rpad(`${m.medianGap}ms`, 8)} ${rpad(`${m.maxDuration}ms`, 8)} ${m.source}`,
			);
		}
		console.log();
	}

	// Aggregate
	console.log("=== AGGREGATE ===\n");
	console.log(
		`${pad("Method", 8)} ${rpad("Avg Words", 10)} ${rpad("Collapse%", 10)} ${rpad("Anomaly%", 9)} ${rpad("Med Dur", 8)} ${rpad("Max Dur", 8)} Songs`,
	);

	for (let i = 0; i < labels.length; i++) {
		const label = labels[i];
		const metrics = comparisons
			.map((c) => c.methods[label])
			.filter((m): m is WordMetrics => m != null);

		if (metrics.length === 0) continue;

		const avgWords = Math.round(metrics.reduce((s, m) => s + m.totalWords, 0) / metrics.length);
		const totalCollapsed = metrics.reduce((s, m) => s + m.collapsedWords, 0);
		const totalWords = metrics.reduce((s, m) => s + m.totalWords, 0);
		const collapseRate = totalWords > 0 ? ((totalCollapsed / totalWords) * 100).toFixed(1) : "0";
		const totalAnomalies = metrics.reduce((s, m) => s + m.durationAnomalies, 0);
		const anomalyRate = totalWords > 0 ? ((totalAnomalies / totalWords) * 100).toFixed(1) : "0";
		const avgMedDur = Math.round(
			metrics.reduce((s, m) => s + m.medianDuration, 0) / metrics.length,
		);
		const maxMaxDur = Math.max(...metrics.map((m) => m.maxDuration));

		console.log(
			`${pad(label, 8)} ${rpad(String(avgWords), 10)} ${rpad(`${collapseRate}%`, 10)} ${rpad(`${anomalyRate}%`, 9)} ${rpad(`${avgMedDur}ms`, 8)} ${rpad(`${maxMaxDur}ms`, 8)} ${metrics.length}`,
		);
	}

	console.log();
}

main();
