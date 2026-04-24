import { describe, expect, it } from "bun:test";
import { fuzzyMatch, normalizeForMatch } from "../../src/bootstrap/stages/normalize";

describe("normalizeForMatch", () => {
	it("lowercases and strips punctuation", () => {
		expect(normalizeForMatch("Fly.")).toBe("fly");
		expect(normalizeForMatch("Don't Stop")).toBe("dont stop");
	});

	it("collapses whitespace", () => {
		expect(normalizeForMatch("  hello   world  ")).toBe("hello world");
	});

	it("handles empty and whitespace-only input", () => {
		expect(normalizeForMatch("")).toBe("");
		expect(normalizeForMatch("   ")).toBe("");
	});

	it("preserves numbers", () => {
		expect(normalizeForMatch("Section 1")).toBe("section 1");
	});

	it("strips quotes and brackets", () => {
		expect(normalizeForMatch('[Verse 1] "Hello"')).toBe("verse 1 hello");
	});
});

describe("fuzzyMatch", () => {
	it("matches identical strings after normalization", () => {
		expect(fuzzyMatch("fly.", "fly")).toBe(true);
		expect(fuzzyMatch("The End", "the end")).toBe(true);
	});

	it("matches within Levenshtein distance 2", () => {
		expect(fuzzyMatch("gonna", "gona")).toBe(true);
		expect(fuzzyMatch("color", "colour")).toBe(true);
	});

	it("rejects strings beyond max distance", () => {
		expect(fuzzyMatch("hello", "world")).toBe(false);
	});

	it("respects custom max distance", () => {
		expect(fuzzyMatch("abc", "abcdef", 3)).toBe(true);
		expect(fuzzyMatch("abc", "abcdef", 2)).toBe(false);
	});
});
