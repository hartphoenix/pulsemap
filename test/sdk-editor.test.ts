import { describe, expect, it } from "bun:test";
import { editorUrl } from "../sdk/editor";

describe("editorUrl", () => {
	it("constructs correct URL with all params", () => {
		const url = editorUrl({
			mapId: "abc123",
			t: 5000,
			lane: "chords",
			index: 2,
			source: "lrclib",
		});
		expect(url).toBe(
			"https://hartphoenix.github.io/pulsemap/editor/abc123?t=5000&lane=chords&index=2&source=lrclib",
		);
	});

	it("omits undefined optional params", () => {
		const url = editorUrl({
			mapId: "abc123",
			lane: "words",
		});
		expect(url).toBe("https://hartphoenix.github.io/pulsemap/editor/abc123?lane=words");
		expect(url).not.toContain("t=");
		expect(url).not.toContain("index=");
		expect(url).not.toContain("source=");
	});

	it("works with only mapId (no optional params)", () => {
		const url = editorUrl({ mapId: "12345678-1234-1234-1234-123456789012" });
		expect(url).toBe(
			"https://hartphoenix.github.io/pulsemap/editor/12345678-1234-1234-1234-123456789012",
		);
	});
});
