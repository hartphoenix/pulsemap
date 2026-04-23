import { describe, expect, it } from "bun:test";
import { cleanLyricText, cleanLyrics } from "../../src/bootstrap/stages/clean-lyrics";

describe("cleanLyricText", () => {
	it("strips musical note characters from start and end", () => {
		expect(cleanLyricText("♪ Hello world ♪")).toBe("Hello world");
	});

	it("strips emoji music notes", () => {
		expect(cleanLyricText("🎵 Sing along 🎶")).toBe("Sing along");
	});

	it("strips multiple decorative characters", () => {
		expect(cleanLyricText("♪♫ La la la ♫♪")).toBe("La la la");
	});

	it("strips star and heart decorations", () => {
		expect(cleanLyricText("★ Shining star ★")).toBe("Shining star");
	});

	it("preserves parenthesized backing vocals", () => {
		expect(cleanLyricText("(ooh) Baby")).toBe("(ooh) Baby");
	});

	it("preserves internal punctuation", () => {
		expect(cleanLyricText("Don't stop believin'")).toBe("Don't stop believin'");
	});

	it("normalizes whitespace", () => {
		expect(cleanLyricText("Hello    world")).toBe("Hello world");
	});

	it("leaves clean text unchanged", () => {
		expect(cleanLyricText("Just a normal line")).toBe("Just a normal line");
	});

	it("returns empty string for decoration-only lines", () => {
		expect(cleanLyricText("♪ ♫ ♪")).toBe("");
	});

	it("strips leading dashes and em dashes", () => {
		expect(cleanLyricText("— Hello")).toBe("Hello");
	});
});

describe("cleanLyrics", () => {
	it("removes lines that become empty", () => {
		const lyrics = [
			{ t: 0, text: "♪ ♫ ♪", end: 1000 },
			{ t: 1000, text: "Real lyrics here", end: 2000 },
		];
		const result = cleanLyrics(lyrics);
		expect(result).toHaveLength(1);
		expect(result[0].text).toBe("Real lyrics here");
	});

	it("preserves timing on cleaned lines", () => {
		const lyrics = [{ t: 5000, text: "♪ Hello ♪", end: 6000 }];
		const result = cleanLyrics(lyrics);
		expect(result[0].t).toBe(5000);
		expect(result[0].end).toBe(6000);
		expect(result[0].text).toBe("Hello");
	});

	it("handles empty input", () => {
		expect(cleanLyrics([])).toEqual([]);
	});
});
