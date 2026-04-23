import { bootstrap } from "./index";

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes("--help")) {
		console.log(`Usage: bun run bootstrap <source> [options]

Source can be a URL (YouTube, etc.) or a local audio file path.

Options:
  --id <mbid>            MusicBrainz recording ID (skips AcoustID lookup)
  --output <path>        Output file path (default: maps/<id>.json)
  --acoustid-key <key>   AcoustID API key (or set ACOUSTID_API_KEY env var)
  --skip-separation      Skip Demucs source separation
  --help                 Show this help message`);
		process.exit(args.includes("--help") ? 0 : 1);
	}

	const source = args[0];
	const opts: Record<string, string> = {};

	const flags = new Set<string>();
	for (let i = 1; i < args.length; i++) {
		if (args[i] === "--skip-separation") {
			flags.add("skip-separation");
		} else if (args[i].startsWith("--") && args[i + 1]) {
			opts[args[i].slice(2)] = args[i + 1];
			i++;
		}
	}

	try {
		await bootstrap(source, {
			id: opts.id,
			output: opts.output,
			acoustIdKey: opts["acoustid-key"],
			skipSeparation: flags.has("skip-separation"),
		});
	} catch (err) {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	}
}

main();
