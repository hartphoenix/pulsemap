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

describe("cleanChords", () => {
	it("filters chords shorter than a 16th note", () => {
		// At 120 BPM, 16th note = 60000/120/4 = 125ms
		const chords: ChordEvent[] = [
			{ t: 0, chord: "C", end: 1000 },
			{ t: 1000, chord: "Cm", end: 1080 }, // 80ms — artifact
			{ t: 1080, chord: "C", end: 2000 },
		];
		const result = cleanChords(chords, { beats: BEATS_120BPM });
		expect(result).toHaveLength(1);
		expect(result[0].chord).toBe("C");
		expect(result[0].t).toBe(0);
		expect(result[0].end).toBe(2000);
	});

	it("extends previous chord end when filtering", () => {
		const chords: ChordEvent[] = [
			{ t: 0, chord: "Am", end: 500 },
			{ t: 500, chord: "A", end: 560 }, // 60ms artifact
			{ t: 560, chord: "G", end: 2000 },
		];
		const result = cleanChords(chords, { beats: BEATS_120BPM });
		expect(result).toHaveLength(2);
		expect(result[0].chord).toBe("Am");
		expect(result[0].end).toBe(560);
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

	it("keeps legitimate short chords that are diatonic", () => {
		// At 120 BPM, 16th = 125ms. A 130ms chord is just above threshold.
		const chords: ChordEvent[] = [
			{ t: 0, chord: "C", end: 1000 },
			{ t: 1000, chord: "G", end: 1130 }, // 130ms, diatonic — kept
			{ t: 1130, chord: "Am", end: 2000 },
		];
		const result = cleanChords(chords, { beats: BEATS_120BPM, key: "C major" });
		expect(result).toHaveLength(3);
	});

	it("filters very short non-diatonic chords more aggressively", () => {
		// Cm is non-diatonic in C major, and only 100ms
		const chords: ChordEvent[] = [
			{ t: 0, chord: "C", end: 1000 },
			{ t: 1000, chord: "Cm", end: 1100 }, // 100ms, non-diatonic
			{ t: 1100, chord: "F", end: 2000 },
		];
		const result = cleanChords(chords, { beats: BEATS_120BPM, key: "C major" });
		expect(result).toHaveLength(2);
		expect(result[0].chord).toBe("C");
		expect(result[1].chord).toBe("F");
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

	it("handles The Keys style rapid chord flicker", () => {
		// Real data: C→Cm→C→Cm→Bm→C all within ~4 seconds at 95 BPM
		// 16th at 95 BPM = 60000/95/4 ≈ 158ms
		const beats95: BeatEvent[] = [{ t: 35000, downbeat: true, bpm: 95, time_sig: "4/4" }];
		const chords: ChordEvent[] = [
			{ t: 35201, chord: "C", end: 35387 }, // 186ms
			{ t: 35387, chord: "Cm", end: 35666 }, // 279ms
			{ t: 35666, chord: "C", end: 37988 }, // 2322ms
			{ t: 37988, chord: "Cm", end: 38824 }, // 836ms
			{ t: 38824, chord: "Bm", end: 39102 }, // 278ms
			{ t: 39102, chord: "Cm", end: 39660 }, // 558ms
		];
		const result = cleanChords(chords, { beats: beats95, key: "C major" });
		// Short non-diatonic chords should be filtered, duplicates merged
		expect(result.length).toBeLessThan(chords.length);
	});
});
