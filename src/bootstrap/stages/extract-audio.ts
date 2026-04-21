import { join } from "node:path";

export interface ExtractedAudio {
	path: string;
	title?: string;
	artist?: string;
	duration?: number;
	sourceUrl?: string;
}

export async function extractAudio(source: string, workDir: string): Promise<ExtractedAudio> {
	if (await Bun.file(source).exists()) {
		return { path: source };
	}

	const metaProc = Bun.spawn(["yt-dlp", "--dump-json", "--no-download", source], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const metaOutput = await new Response(metaProc.stdout).text();
	await metaProc.exited;

	let title: string | undefined;
	let artist: string | undefined;
	let duration: number | undefined;

	if (metaProc.exitCode === 0) {
		try {
			const meta = JSON.parse(metaOutput);
			title = meta.track || meta.title;
			artist = meta.artist || meta.creator || meta.uploader;
			duration = meta.duration ? Math.round(meta.duration * 1000) : undefined;
		} catch {
			// metadata extraction is best-effort
		}
	}

	const outputTemplate = join(workDir, "source.%(ext)s");
	const proc = Bun.spawn(["yt-dlp", "-x", "--audio-format", "wav", "-o", outputTemplate, source], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const stderr = await new Response(proc.stderr).text();
	await proc.exited;

	if (proc.exitCode !== 0) {
		throw new Error(`yt-dlp failed (exit ${proc.exitCode}): ${stderr}`);
	}

	const audioPath = join(workDir, "source.wav");
	if (!(await Bun.file(audioPath).exists())) {
		throw new Error(`Expected audio at ${audioPath} but file not found. yt-dlp stderr: ${stderr}`);
	}

	return { path: audioPath, title, artist, duration, sourceUrl: source };
}
