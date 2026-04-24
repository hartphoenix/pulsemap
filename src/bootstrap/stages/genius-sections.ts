import type { BeatEvent, LyricLine, PlaybackTarget, Section, WordEvent } from "../../../schema/map";
import { runPythonScript } from "../python";
import { normalizeForMatch } from "./normalize";

export interface GeniusSection {
	header: string;
	lines: string[];
}

export interface GeniusMedia {
	provider: string;
	url: string;
	native_uri?: string;
}

export interface GeniusResult {
	sections: GeniusSection[];
	media: GeniusMedia[];
}

const SECTION_TYPE_MAP: Record<string, string> = {
	intro: "intro",
	verse: "verse",
	"pre-chorus": "pre-chorus",
	prechorus: "pre-chorus",
	chorus: "chorus",
	hook: "chorus",
	refrain: "chorus",
	bridge: "bridge",
	solo: "solo",
	interlude: "interlude",
	outro: "outro",
	coda: "coda",
};

const INSTRUMENTAL_TYPES = new Set(["solo", "interlude", "instrumental break", "guitar solo"]);

function parseSectionType(header: string): string {
	const lower = header
		.toLowerCase()
		.replace(/\s*\d+\s*$/, "")
		.trim();
	return SECTION_TYPE_MAP[lower] ?? "section";
}

function isInstrumental(header: string): boolean {
	const lower = header.toLowerCase().trim();
	return INSTRUMENTAL_TYPES.has(lower) || lower.includes("solo") || lower.includes("instrumental");
}

export async function fetchGeniusData(
	artist: string,
	title: string,
): Promise<GeniusResult | undefined> {
	if (!process.env.GENIUS_API_TOKEN) return undefined;

	const { stdout, stderr, exitCode } = await runPythonScript("fetch_genius_sections.py", [
		artist,
		title,
	]);

	if (exitCode !== 0) {
		console.warn(`Genius fetch failed (exit ${exitCode}): ${stderr}`);
		return undefined;
	}

	try {
		const result = JSON.parse(stdout) as GeniusResult;
		return result.sections.length > 0 || result.media.length > 0 ? result : undefined;
	} catch {
		console.warn(`Failed to parse Genius output: ${stdout.slice(0, 200)}`);
		return undefined;
	}
}

function textMatchScore(geniusLine: string, lrclibLine: string): number {
	const gn = normalizeForMatch(geniusLine);
	const ln = normalizeForMatch(lrclibLine);

	if (!gn || !ln) return 0;
	if (gn === ln) return 1;

	// Substring: one contains the other
	if (ln.includes(gn)) return 0.9;
	if (gn.includes(ln)) return 0.85;

	// Word overlap ratio
	const gWords = new Set(gn.split(" "));
	const lWords = new Set(ln.split(" "));
	const intersection = [...gWords].filter((w) => lWords.has(w)).length;
	const union = new Set([...gWords, ...lWords]).size;
	const jaccard = union > 0 ? intersection / union : 0;

	return jaccard >= 0.5 ? jaccard * 0.8 : 0;
}

function findBestMatch(
	geniusLines: string[],
	lyrics: LyricLine[],
	searchFrom: number,
): { index: number; score: number } | undefined {
	if (geniusLines.length === 0) return undefined;

	const firstLine = geniusLines[0];
	let bestIndex = -1;
	let bestScore = 0;

	for (let i = searchFrom; i < lyrics.length; i++) {
		const score = textMatchScore(firstLine, lyrics[i].text);
		if (score > bestScore) {
			bestScore = score;
			bestIndex = i;
		}
		if (score === 1) break;
	}

	// If first line didn't match well, try concatenating first two Genius lines
	// (handles case where LRCLIB joined them)
	if (bestScore < 0.7 && geniusLines.length >= 2) {
		const combined = `${geniusLines[0]} ${geniusLines[1]}`;
		for (let i = searchFrom; i < lyrics.length; i++) {
			const score = textMatchScore(combined, lyrics[i].text);
			if (score > bestScore) {
				bestScore = score;
				bestIndex = i;
			}
		}
	}

	const MATCH_THRESHOLD = 0.5;
	return bestScore >= MATCH_THRESHOLD ? { index: bestIndex, score: bestScore } : undefined;
}

function findWordGap(
	words: WordEvent[],
	afterMs: number,
	beforeMs: number,
): { start: number; end: number } | undefined {
	const sorted = words.filter((w) => w.t >= afterMs && w.t <= beforeMs).sort((a, b) => a.t - b.t);

	let longestGap: { start: number; end: number } | undefined;
	let maxLen = 0;

	for (let i = 0; i < sorted.length - 1; i++) {
		const gapStart = sorted[i].end ?? sorted[i].t;
		const gapEnd = sorted[i + 1].t;
		const len = gapEnd - gapStart;
		if (len > maxLen && len > 2000) {
			maxLen = len;
			longestGap = { start: gapStart, end: gapEnd };
		}
	}

	return longestGap;
}

export function alignGeniusSections(
	geniusSections: GeniusSection[],
	lyrics: LyricLine[],
	words: WordEvent[] | undefined,
	beats: BeatEvent[] | undefined,
	durationMs: number,
): Section[] {
	let searchFrom = 0;
	let pendingInstrumentals = 0;

	interface PendingSection {
		header: string;
		startMs: number | undefined;
		matchedLyricIndex: number | undefined;
		instrumental: boolean;
	}
	const pending: PendingSection[] = [];

	for (const gs of geniusSections) {
		if (isInstrumental(gs.header) || gs.lines.length === 0) {
			pending.push({
				header: gs.header,
				startMs: undefined,
				matchedLyricIndex: undefined,
				instrumental: true,
			});
			pendingInstrumentals++;
			continue;
		}

		let effectiveSearchFrom = searchFrom;

		// If instrumental sections precede this lyric section, find the word
		// gap and start searching from the LRCLIB line after it. This prevents
		// matching the next identical line (e.g. "Let it be, let it be") when
		// there's a long instrumental break between them.
		if (pendingInstrumentals > 0 && words?.length) {
			const prevMs = searchFrom > 0 ? lyrics[searchFrom - 1].t : 0;
			const gap = findWordGap(words, prevMs, durationMs);
			if (gap) {
				for (let j = searchFrom; j < lyrics.length; j++) {
					if (lyrics[j].t >= gap.end) {
						effectiveSearchFrom = j;
						break;
					}
				}
			}
		}

		const match = findBestMatch(gs.lines, lyrics, effectiveSearchFrom);
		if (match) {
			pending.push({
				header: gs.header,
				startMs: lyrics[match.index].t,
				matchedLyricIndex: match.index,
				instrumental: false,
			});
			searchFrom = match.index + 1;
		} else {
			pending.push({
				header: gs.header,
				startMs: undefined,
				matchedLyricIndex: undefined,
				instrumental: false,
			});
		}
		pendingInstrumentals = 0;
	}

	// Resolve instrumental sections using word gaps
	for (let i = 0; i < pending.length; i++) {
		const p = pending[i];
		if (!p.instrumental || p.startMs !== undefined) continue;

		if (words?.length) {
			const prevEnd = findPrevTimestamp(pending, i) ?? 0;
			const nextStart = findNextTimestamp(pending, i) ?? durationMs;
			const gap = findWordGap(words, prevEnd, nextStart);
			if (gap) {
				p.startMs = gap.start;
			}
		}
	}

	// Handle Intro: if first section is unmatched intro, start at 0
	if (pending.length > 0 && pending[0].startMs === undefined) {
		const type = parseSectionType(pending[0].header);
		if (type === "intro") {
			pending[0].startMs = 0;
		}
	}

	// Handle Outro: if last section is unmatched outro, start after last matched section
	if (pending.length > 0) {
		const last = pending[pending.length - 1];
		if (last.startMs === undefined) {
			const type = parseSectionType(last.header);
			if (type === "outro") {
				const prevTs = findPrevTimestamp(pending, pending.length - 1);
				if (prevTs !== undefined) {
					last.startMs = prevTs;
				}
			}
		}
	}

	// Build sections from resolved pending entries
	const raw: Section[] = [];
	for (let i = 0; i < pending.length; i++) {
		const p = pending[i];
		if (p.startMs === undefined) continue;

		const nextResolved = pending.slice(i + 1).find((n) => n.startMs !== undefined);
		const endMs = nextResolved?.startMs ?? durationMs;

		raw.push({
			t: snapToDownbeat(p.startMs, beats),
			type: parseSectionType(p.header),
			label: p.header,
			end: snapToDownbeat(endMs, beats),
		});
	}

	// Fold sections shorter than 2 bars into the following section
	const minDurationMs = minTwoBars(beats);
	const sections: Section[] = [];
	for (let i = 0; i < raw.length; i++) {
		const s = raw[i];
		const duration = s.end - s.t;
		if (duration < minDurationMs && i + 1 < raw.length) {
			raw[i + 1].t = s.t;
			continue;
		}
		sections.push(s);
	}

	return sections;
}

function findPrevTimestamp(
	pending: Array<{ startMs: number | undefined }>,
	index: number,
): number | undefined {
	for (let i = index - 1; i >= 0; i--) {
		if (pending[i].startMs !== undefined) return pending[i].startMs;
	}
	return undefined;
}

function findNextTimestamp(
	pending: Array<{ startMs: number | undefined }>,
	index: number,
): number | undefined {
	for (let i = index + 1; i < pending.length; i++) {
		if (pending[i].startMs !== undefined) return pending[i].startMs;
	}
	return undefined;
}

function minTwoBars(beats: BeatEvent[] | undefined): number {
	if (!beats?.length) return 4000;

	const beatsPerBar = beats[0].time_sig ? Number.parseInt(beats[0].time_sig.split("/")[0]) || 4 : 4;
	const bpm = beats[0].bpm ?? 120;
	const beatMs = 60000 / bpm;
	return beatMs * beatsPerBar * 2;
}

function snapToDownbeat(timeMs: number, beats: BeatEvent[] | undefined): number {
	if (!beats?.length) return timeMs;

	let closest = beats[0].t;
	let minDist = Math.abs(timeMs - closest);

	for (const b of beats) {
		if (!b.downbeat) continue;
		const dist = Math.abs(timeMs - b.t);
		if (dist < minDist) {
			minDist = dist;
			closest = b.t;
		}
		if (b.t > timeMs + minDist) break;
	}

	return closest;
}

export function geniusMediaToPlayback(media: GeniusMedia[]): PlaybackTarget[] {
	const targets: PlaybackTarget[] = [];

	for (const m of media) {
		if (m.provider === "youtube" && m.url) {
			const videoId = extractYouTubeId(m.url);
			targets.push({
				platform: "youtube",
				uri: m.url,
				id: videoId ?? undefined,
				capabilities: {
					play: true,
					pause: true,
					seek: true,
					setPosition: true,
					getPosition: true,
					rate: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
					volume: true,
					mute: true,
				},
			});
		} else if (m.provider === "spotify" && m.url) {
			const trackId = m.url.match(/track\/(\w+)/)?.[1];
			targets.push({
				platform: "spotify",
				uri: m.url,
				id: trackId ?? undefined,
				capabilities: {
					play: true,
					pause: true,
					seek: true,
					setPosition: true,
					getPosition: true,
					volume: true,
				},
			});
		}
	}

	return targets;
}

function extractYouTubeId(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1);
		return parsed.searchParams.get("v");
	} catch {
		return null;
	}
}
