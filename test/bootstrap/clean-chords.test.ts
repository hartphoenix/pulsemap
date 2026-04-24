import { describe, expect, it } from "bun:test";
import type { BeatEvent, ChordEvent } from "../../schema/map";
import { cleanChords } from "../../src/bootstrap/stages/clean-chords";

const BEATS_120BPM: BeatEvent[] = [
	{ t: 0, downbeat: true, bpm: 120, time_sig: "4/4" },
	{ t: 500, downbeat: false },
	{ t: 1000, downbeat: false },
	{ t: 1500, downbeat: false },
	{ t: 2000, downbeat: true },
];

// At 120 BPM: 8th note = 250ms, floor = 300ms → threshold is 300ms

describe("cleanChords", () => {
	it("filters chords shorter than the threshold (300ms floor at 120 BPM)", () => {
		const chords: ChordEvent[] = [
			{ t: 0, chord: "C", end: 1000 },
			{ t: 1000, chord: "Cm", end: 1200 }, // 200ms — below 300ms floor
			{ t: 1200, chord: "C", end: 2000 },
		];
		const result = cleanChords(chords, { beats: BEATS_120BPM });
		expect(result).toHaveLength(1);
		expect(result[0].chord).toBe("C");
		expect(result[0].t).toBe(0);
		expect(result[0].end).toBe(2000);
	});

	it("keeps chords above the threshold", () => {
		const chords: ChordEvent[] = [
			{ t: 0, chord: "C", end: 1000 },
			{ t: 1000, chord: "Am", end: 1400 }, // 400ms — above 300ms floor
			{ t: 1400, chord: "G", end: 2000 },
		];
		const result = cleanChords(chords, { beats: BEATS_120BPM });
		expect(result).toHaveLength(3);
	});

	it("extends previous chord end when filtering", () => {
		const chords: ChordEvent[] = [
			{ t: 0, chord: "Am", end: 500 },
			{ t: 500, chord: "A", end: 600 }, // 100ms artifact
			{ t: 600, chord: "G", end: 2000 },
		];
		const result = cleanChords(chords, { beats: BEATS_120BPM });
		expect(result).toHaveLength(2);
		expect(result[0].chord).toBe("Am");
		expect(result[0].end).toBe(600);
		expect(result[1].chord).toBe("G");
	});

	it("merges consecutive duplicate chords", () => {
		const chords: ChordEvent[] = [
			{ t: 0, chord: "C", end: 1000 },
			{ t: 1000, chord: "C", end: 2000 },
		];
		const result = cleanChords(chords, { beats: BEATS_120BPM });
		expect(result).toHaveLength(1);
		expect(result[0].t).toBe(0);
		expect(result[0].end).toBe(2000);
	});

	it("returns empty array for empty input", () => {
		expect(cleanChords([], { beats: BEATS_120BPM })).toEqual([]);
	});

	it("returns original chords when no BPM available", () => {
		const beats: BeatEvent[] = [{ t: 0, downbeat: true }];
		const chords: ChordEvent[] = [
			{ t: 0, chord: "C", end: 50 },
			{ t: 50, chord: "Am", end: 2000 },
		];
		const result = cleanChords(chords, { beats });
		expect(result).toHaveLength(2);
	});

	it("uses half-beat threshold at slow tempos where it exceeds 300ms", () => {
		// At 80 BPM: 8th note = 375ms > 300ms floor, so threshold is 375ms
		const slowBeats: BeatEvent[] = [
			{ t: 0, downbeat: true, bpm: 80, time_sig: "4/4" },
			{ t: 750, downbeat: false },
		];
		const chords: ChordEvent[] = [
			{ t: 0, chord: "C", end: 1000 },
			{ t: 1000, chord: "Dm", end: 1350 }, // 350ms — above 300ms but below 375ms
			{ t: 1350, chord: "G", end: 2000 },
		];
		const result = cleanChords(chords, { beats: slowBeats });
		expect(result).toHaveLength(2);
		expect(result[0].chord).toBe("C");
		expect(result[1].chord).toBe("G");
	});

	it("handles The Keys style rapid chord flicker at 95 BPM", () => {
		// At 95 BPM: 8th note = 316ms, floor = 316ms (exceeds 300ms)
		const beats95: BeatEvent[] = [{ t: 35000, downbeat: true, bpm: 95, time_sig: "4/4" }];
		const chords: ChordEvent[] = [
			{ t: 35201, chord: "C", end: 35387 }, // 186ms — filtered
			{ t: 35387, chord: "Cm", end: 35666 }, // 279ms — filtered
			{ t: 35666, chord: "C", end: 37988 }, // 2322ms — kept
			{ t: 37988, chord: "Cm", end: 38824 }, // 836ms — kept
			{ t: 38824, chord: "Bm", end: 39102 }, // 278ms — filtered
			{ t: 39102, chord: "Cm", end: 39660 }, // 558ms — kept
		];
		const result = cleanChords(chords, { beats: beats95, key: "C major" });
		expect(result.length).toBeLessThan(chords.length);
		// The short chords should be absorbed, leaving fewer distinct chords
		expect(result.every((c) => (c.end ?? 0) - c.t >= 300)).toBe(true);
	});
});
