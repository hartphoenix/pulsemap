/**
 * Test vocal onset detection offset correction on existing maps.
 *
 * Usage: PULSEMAP_PYTHON=.venv/bin/python bun run src/bootstrap/test-vocal-offset.ts <map.json>
 *
 * Extracts audio, runs Demucs, detects first vocal onset via RMS,
 * compares to LRCLIB first lyric timestamp, and reports the offset.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { PulseMap } from "../../schema/map";
import { extractAudio } from "./stages/extract-audio";
import { separateAudio } from "./stages/separate";
import { resolvePython } from "./python";

async function main() {
	const mapPath = process.argv[2];
	if (!mapPath) {
		console.error("Usage: bun run src/bootstrap/test-vocal-offset.ts <map.json>");
		process.exit(1);
	}

	const map: PulseMap = await Bun.file(mapPath).json();
	const title = map.metadata?.title ?? "Unknown";
	const artist = map.metadata?.artist ?? "Unknown";
	const lyrics = map.lyrics ?? [];
	const words = map.words ?? [];

	if (!lyrics.length) {
		console.error(`No lyrics in ${mapPath}`);
		process.exit(1);
	}

	const playback = map.playback?.[0];
	if (!playback?.uri) {
		console.error(`No playback URI in ${mapPath}`);
		process.exit(1);
	}

	console.log(`\n=== ${title} — ${artist} ===`);
	console.log(`Source: ${playback.uri}`);
	console.log(`LRCLIB first line: ${lyrics[0].t}ms "${lyrics[0].text.slice(0, 60)}"`);
	if (words.length) {
		console.log(`WhisperX first word: ${words[0].t}ms "${words[0].text}"`);
	}

	const workDir = join(process.env.TMPDIR || "/tmp", `vocal-onset-${Date.now()}`);
	await mkdir(workDir, { recursive: true });

	try {
		console.log("\nExtracting audio...");
		const audio = await extractAudio(playback.uri, workDir);
		console.log(`  → ${audio.path}`);

		console.log("Running Demucs separation...");
		const stems = await separateAudio(audio.path, workDir);
		if (!stems?.vocals) {
			console.error("No vocal stem produced");
			process.exit(1);
		}
		console.log(`  → vocal stem: ${stems.vocals}`);

		console.log("Detecting vocal onset...");
		const python = await resolvePython();
		const scriptPath = join(import.meta.dir, "scripts", "detect_vocal_onset.py");
		const proc = Bun.spawn([python, scriptPath, stems.vocals], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();
		await proc.exited;

		if (proc.exitCode !== 0) {
			console.error(`Onset detection failed: ${stderr}`);
			process.exit(1);
		}

		const result = JSON.parse(stdout.trim());
		const onsetMs: number = result.onset_ms;
		console.log(`  → first vocal onset: ${onsetMs}ms (${(onsetMs / 1000).toFixed(1)}s), RMS: ${result.rms_db}dB`);

		const firstLyricT = lyrics[0].t;
		const offset = onsetMs - firstLyricT;

		console.log(`\n--- Results ---`);
		console.log(`LRCLIB first lyric:  ${firstLyricT}ms (${(firstLyricT / 1000).toFixed(1)}s)`);
		console.log(`Vocal onset:         ${onsetMs}ms (${(onsetMs / 1000).toFixed(1)}s)`);
		console.log(`Offset:              ${offset}ms (${(offset / 1000).toFixed(1)}s)`);

		if (Math.abs(offset) > 2000) {
			console.log(`\nOffset > 2s — correction recommended.`);
			console.log(`Corrected first 5 lyrics:`);
			for (const line of lyrics.slice(0, 5)) {
				const corrected = Math.max(0, line.t + offset);
				console.log(`  ${line.t}ms → ${corrected}ms  "${line.text.slice(0, 50)}"`);
			}
		} else {
			console.log(`\nOffset ≤ 2s — no correction needed.`);
		}

		if (words.length) {
			const wordDelta = words[0].t - onsetMs;
			console.log(`\nWhisperX first word vs onset: ${wordDelta}ms (${(wordDelta / 1000).toFixed(1)}s)`);
		}
	} finally {
		const proc = Bun.spawn(["rm", "-rf", workDir], { stdout: "ignore", stderr: "ignore" });
		await proc.exited;
	}
}

main();
