import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { LyricLine } from "../../../schema/map";

export async function lookupLyrics(
	artist: string,
	title: string,
): Promise<LyricLine[] | undefined> {
	const url = new URL("https://lrclib.net/api/get");
	url.searchParams.set("artist_name", artist);
	url.searchParams.set("track_name", title);

	const res = await fetch(url);
	if (!res.ok) return undefined;

	const data = (await res.json()) as { syncedLyrics?: string };
	if (!data.syncedLyrics) return undefined;

	return parseLrc(data.syncedLyrics);
}

export async function searchLyrics(query: string): Promise<LyricLine[] | undefined> {
	const url = new URL("https://lrclib.net/api/search");
	url.searchParams.set("q", query);

	const res = await fetch(url);
	if (!res.ok) return undefined;

	const results = (await res.json()) as Array<{ syncedLyrics?: string }>;
	for (const result of results) {
		if (result.syncedLyrics) {
			return parseLrc(result.syncedLyrics);
		}
	}

	return undefined;
}

export async function extractYouTubeLyrics(
	sourceUrl: string,
	workDir: string,
): Promise<LyricLine[] | undefined> {
	const proc = Bun.spawn(
		[
			"yt-dlp",
			"--write-subs",
			"--write-auto-subs",
			"--sub-langs",
			"en,-live_chat",
			"--convert-subs",
			"vtt",
			"--skip-download",
			"-o",
			join(workDir, "lyrics"),
			sourceUrl,
		],
		{ stdout: "pipe", stderr: "pipe" },
	);

	await proc.exited;

	const files = await readdir(workDir);
	const subFile = files.find((f) => f.startsWith("lyrics") && f.endsWith(".vtt"));
	if (!subFile) return undefined;

	const vtt = await Bun.file(join(workDir, subFile)).text();
	return parseVtt(vtt);
}

export function parseVtt(vtt: string): LyricLine[] | undefined {
	const lines: LyricLine[] = [];
	const cueBlocks = vtt.split(/\n\n+/);

	for (const block of cueBlocks) {
		const blockLines = block.trim().split("\n");

		let timingLine: string | undefined;
		let textStartIndex = 0;

		for (let i = 0; i < blockLines.length; i++) {
			if (blockLines[i].includes("-->")) {
				timingLine = blockLines[i];
				textStartIndex = i + 1;
				break;
			}
		}

		if (!timingLine) continue;

		const m = timingLine.match(
			/(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/,
		);
		if (!m) continue;

		const startMs =
			Number.parseInt(m[1]) * 3_600_000 +
			Number.parseInt(m[2]) * 60_000 +
			Number.parseInt(m[3]) * 1000 +
			Number.parseInt(m[4]);
		const endMs =
			Number.parseInt(m[5]) * 3_600_000 +
			Number.parseInt(m[6]) * 60_000 +
			Number.parseInt(m[7]) * 1000 +
			Number.parseInt(m[8]);

		const textParts = blockLines.slice(textStartIndex);
		const text = textParts
			.join(" ")
			.replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "")
			.replace(/<\/?c>/g, "")
			.replace(/<[^>]+>/g, "")
			.replace(/\s+/g, " ")
			.trim();

		if (!text) continue;

		if (lines.length > 0 && lines[lines.length - 1].text === text) {
			lines[lines.length - 1].end = endMs;
			continue;
		}

		lines.push({ t: startMs, text, end: endMs });
	}

	return lines.length > 0 ? lines : undefined;
}

export function cleanYouTubeTitle(title: string, artist?: string): string {
	let cleaned = title;

	if (artist) {
		const escaped = artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const prefixRe = new RegExp(`^${escaped}\\s*[-–—:]\\s*`, "i");
		cleaned = cleaned.replace(prefixRe, "");
		cleaned = cleaned.replace(prefixRe, "");
	}

	cleaned = cleaned.replace(
		/\s*[\(\[](?:Official|Remaster|HD|4K|Lyric|Audio|Music|Video|Mono|Stereo|Live|feat\.|ft\.)[\w\s\/,.'()\-]*[\)\]]/gi,
		"",
	);
	cleaned = cleaned.replace(/\s+\d{4}\s*$/g, "");
	cleaned = cleaned.replace(/\s+(?:HD|HQ|4K)\s*$/i, "");
	cleaned = cleaned.replace(/^["'“”]|["'“”]$/g, "");
	cleaned = cleaned.replace(/[\s\-–—:]+$/g, "").trim();

	return cleaned || title;
}

export function parseLrc(lrc: string): LyricLine[] | undefined {
	const lines: LyricLine[] = [];
	const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/;

	for (const raw of lrc.split("\n")) {
		const match = raw.match(regex);
		if (!match) continue;

		const minutes = Number.parseInt(match[1], 10);
		const seconds = Number.parseInt(match[2], 10);
		const fractional =
			match[3].length === 2 ? Number.parseInt(match[3], 10) * 10 : Number.parseInt(match[3], 10);

		const t = minutes * 60_000 + seconds * 1000 + fractional;
		const text = match[4].trim();

		if (text) {
			lines.push({ t, text });
		}
	}

	for (let i = 0; i < lines.length - 1; i++) {
		lines[i].end = lines[i + 1].t;
	}

	return lines.length > 0 ? lines : undefined;
}
