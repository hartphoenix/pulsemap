import { describe, expect, it } from "bun:test";
import { parseLrc } from "../../src/bootstrap/stages/lyrics";

describe("parseLrc", () => {
	it("parses standard LRC format", () => {
		const lrc = `[00:12.34]First line
[00:15.67]Second line
[00:20.00]Third line`;

		const result = parseLrc(lrc);
		expect(result).toHaveLength(3);
		expect(result?.[0]).toEqual({ t: 12340, text: "First line", end: 15670 });
		expect(result?.[1]).toEqual({
			t: 15670,
			text: "Second line",
			end: 20000,
		});
		expect(result?.[2]).toEqual({ t: 20000, text: "Third line" });
	});

	it("handles 3-digit milliseconds", () => {
		const lrc = "[01:30.500]Line with ms";
		const result = parseLrc(lrc);
		expect(result).toHaveLength(1);
		expect(result?.[0].t).toBe(90500);
	});

	it("handles 2-digit centiseconds", () => {
		const lrc = "[00:05.50]Half second line";
		const result = parseLrc(lrc);
		expect(result?.[0].t).toBe(5500);
	});

	it("skips metadata tags", () => {
		const lrc = `[ti:Song Title]
[ar:Artist Name]
[00:05.00]Actual lyric`;

		const result = parseLrc(lrc);
		expect(result).toHaveLength(1);
		expect(result?.[0].text).toBe("Actual lyric");
	});

	it("skips empty lyric lines", () => {
		const lrc = `[00:05.00]Real line
[00:10.00]
[00:15.00]Another line`;

		const result = parseLrc(lrc);
		expect(result).toHaveLength(2);
		expect(result?.[0].text).toBe("Real line");
		expect(result?.[1].text).toBe("Another line");
	});

	it("returns undefined for empty input", () => {
		expect(parseLrc("")).toBeUndefined();
	});

	it("returns undefined for metadata-only LRC", () => {
		const lrc = `[ti:Title]
[ar:Artist]
[al:Album]`;
		expect(parseLrc(lrc)).toBeUndefined();
	});

	it("sets end times from next line start", () => {
		const lrc = `[00:00.00]Line one
[00:03.00]Line two
[00:06.00]Line three`;

		const result = parseLrc(lrc) ?? [];
		expect(result[0].end).toBe(3000);
		expect(result[1].end).toBe(6000);
		expect(result[2].end).toBeUndefined();
	});
});
