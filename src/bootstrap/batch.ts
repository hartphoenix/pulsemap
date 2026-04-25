import { mkdir } from "node:fs/promises";
import { bootstrap } from "./index";
import type { WordAlignMethod } from "./stages/word-align";

interface SongEntry {
	title: string;
	artist: string;
	url: string;
	year?: number;
}

interface BatchResult {
	title: string;
	artist: string;
	url: string;
	status: "success" | "error";
	duration_s: number;
	map_id?: string;
	fields?: string[];
	error?: string;
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes("--help")) {
		console.log(`Usage: bun run src/bootstrap/batch.ts <songs.json> [options]

Runs the bootstrap pipeline on a batch of songs from a JSON file.
The JSON file should be an array of objects with: title, artist, url

Options:
  --output-dir <dir>     Output directory for maps (default: maps/)
  --log <path>           Path for batch results log (default: batch-results.json)
  --concurrency <n>      Max parallel pipelines (default: 1)
  --method <a|b|c>       Word alignment method (default: a)
  --skip-existing        Skip songs that already have maps
  --start <n>            Start from song N (0-indexed, for resuming)
  --limit <n>            Process at most N songs
  --help                 Show this help message`);
		process.exit(args.includes("--help") ? 0 : 1);
	}

	const songsFile = args[0];
	const opts: Record<string, string> = {};
	const flags = new Set<string>();

	for (let i = 1; i < args.length; i++) {
		if (args[i] === "--skip-existing") {
			flags.add("skip-existing");
		} else if (args[i].startsWith("--") && args[i + 1]) {
			opts[args[i].slice(2)] = args[i + 1];
			i++;
		}
	}

	const outputDir = opts["output-dir"] || "maps";
	const logPath = opts.log || "batch-results.json";
	const concurrency = Number.parseInt(opts.concurrency || "1", 10);
	const wordAlignMethod = (opts.method || "a") as WordAlignMethod;
	const startIdx = Number.parseInt(opts.start || "0", 10);
	const limit = opts.limit ? Number.parseInt(opts.limit, 10) : undefined;

	let songs: SongEntry[];
	try {
		const raw = await Bun.file(songsFile).text();
		songs = JSON.parse(raw) as SongEntry[];
	} catch (err) {
		console.error(`Failed to read songs file: ${err}`);
		process.exit(1);
	}

	const total = songs.length;
	const slice = songs.slice(startIdx, limit ? startIdx + limit : undefined);

	console.log(
		`\nBatch pipeline: ${slice.length} songs (of ${total} total, starting at ${startIdx})`,
	);
	console.log(
		`Output: ${outputDir}  Log: ${logPath}  Concurrency: ${concurrency}  Method: ${wordAlignMethod}\n`,
	);

	await mkdir(outputDir, { recursive: true });

	const results: BatchResult[] = [];

	// Load existing results if resuming
	try {
		const existing = await Bun.file(logPath).text();
		const parsed = JSON.parse(existing) as BatchResult[];
		results.push(...parsed);
		console.log(`Loaded ${results.length} existing results from ${logPath}\n`);
	} catch {
		// No existing log, starting fresh
	}

	const existingUrls = new Set(results.filter((r) => r.status === "success").map((r) => r.url));

	let completed = 0;
	let succeeded = 0;
	let failed = 0;
	const startTime = performance.now();

	async function processSong(song: SongEntry, idx: number): Promise<void> {
		const songNum = startIdx + idx + 1;
		const label = `[${songNum}/${total}]`;

		if (flags.has("skip-existing") && existingUrls.has(song.url)) {
			console.log(`${label} SKIP ${song.title} by ${song.artist} (already mapped)`);
			completed++;
			return;
		}

		const songStart = performance.now();
		console.log(`${label} START ${song.title} by ${song.artist}`);

		try {
			const map = await bootstrap(song.url, {
				wordAlignMethod,
				outputDir,
			});

			const duration_s = Math.round((performance.now() - songStart) / 1000);
			const fields: string[] = [];
			if (map.lyrics?.length) fields.push(`lyrics(${map.lyrics.length})`);
			if (map.words?.length) fields.push(`words(${map.words.length})`);
			if (map.chords?.length) fields.push(`chords(${map.chords.length})`);
			if (map.beats?.length) fields.push(`beats(${map.beats.length})`);
			if (map.midi?.length) fields.push(`midi(${map.midi.length})`);

			const result: BatchResult = {
				title: song.title,
				artist: song.artist,
				url: song.url,
				status: "success",
				duration_s,
				map_id: map.id,
				fields,
			};

			results.push(result);
			succeeded++;
			console.log(`${label} OK    ${song.title} (${duration_s}s) ${fields.join(" ")}`);
		} catch (err) {
			const duration_s = Math.round((performance.now() - songStart) / 1000);
			const errorMsg = err instanceof Error ? err.message : String(err);

			const result: BatchResult = {
				title: song.title,
				artist: song.artist,
				url: song.url,
				status: "error",
				duration_s,
				error: errorMsg.slice(0, 500),
			};

			results.push(result);
			failed++;
			console.error(`${label} FAIL  ${song.title} (${duration_s}s): ${errorMsg.slice(0, 200)}`);
		}

		completed++;

		// Write results after each song for crash recovery
		await Bun.write(logPath, JSON.stringify(results, null, 2));
	}

	if (concurrency <= 1) {
		for (let i = 0; i < slice.length; i++) {
			await processSong(slice[i], i);
		}
	} else {
		const queue = slice.map((song, i) => ({ song, i }));
		const workers = Array.from({ length: concurrency }, async () => {
			while (queue.length > 0) {
				const item = queue.shift();
				if (item) await processSong(item.song, item.i);
			}
		});
		await Promise.all(workers);
	}

	const totalTime = Math.round((performance.now() - startTime) / 1000);
	const avgTime = completed > 0 ? Math.round(totalTime / completed) : 0;

	console.log(`\n${"=".repeat(60)}`);
	console.log(`Batch complete: ${succeeded} succeeded, ${failed} failed, ${completed} total`);
	console.log(`Total time: ${totalTime}s  Average: ${avgTime}s/song`);
	console.log(`Results written to ${logPath}`);

	// Summary stats
	const successResults = results.filter((r) => r.status === "success");
	const errorResults = results.filter((r) => r.status === "error");

	if (errorResults.length > 0) {
		console.log(`\nErrors (${errorResults.length}):`);
		for (const r of errorResults) {
			console.log(`  ${r.title} by ${r.artist}: ${r.error?.slice(0, 100)}`);
		}
	}

	if (successResults.length > 0) {
		const avgDuration = Math.round(
			successResults.reduce((sum, r) => sum + r.duration_s, 0) / successResults.length,
		);
		const withWords = successResults.filter((r) => r.fields?.some((f) => f.startsWith("words")));
		const withMidi = successResults.filter((r) => r.fields?.some((f) => f.startsWith("midi")));
		console.log("\nQuality:");
		console.log(`  Avg pipeline time: ${avgDuration}s`);
		console.log(`  With word alignment: ${withWords.length}/${successResults.length}`);
		console.log(`  With MIDI: ${withMidi.length}/${successResults.length}`);
	}
}

main();
