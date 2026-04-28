import type { LyricLine } from "../../../schema/map";

const DECORATIVE_PATTERN =
	/^[\s♪♫♬★☆♡♥✦✧✨🎵🎶🎤🎼🎹♪-♯\u{1F3B5}-\u{1F3BC}\-–—]+|[\s♪♫♬★☆♡♥✦✧✨🎵🎶🎤🎼🎹♪-♯\u{1F3B5}-\u{1F3BC}\-–—]+$/gu;

const BRACKET_WRAPPER_PATTERN =
	/^[♪♫🎵🎶\s]*[[(]?\s*[♪♫🎵🎶]\s*[\])]?\s*|\s*[[(]?\s*[♪♫🎵🎶]\s*[\])]?\s*[♪♫🎵🎶\s]*$/gu;

export function cleanLyricText(text: string): string {
	let cleaned = text;
	cleaned = cleaned.replace(BRACKET_WRAPPER_PATTERN, "");
	cleaned = cleaned.replace(DECORATIVE_PATTERN, "");
	cleaned = cleaned.replace(/\s+/g, " ").trim();
	return cleaned;
}

export function cleanLyrics(lyrics: LyricLine[]): LyricLine[] {
	const result: LyricLine[] = [];
	for (const line of lyrics) {
		const cleaned = cleanLyricText(line.text);
		if (cleaned.length > 0) {
			result.push({ ...line, text: cleaned });
		}
	}
	return result;
}
