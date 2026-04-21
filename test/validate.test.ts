import { describe, expect, it } from "bun:test";
import type { PulseMap } from "../schema/map";
import { assertValid, validate } from "../src/validate";

const MINIMAL_MAP: PulseMap = {
	version: "0.1.0",
	id: "12345678-1234-1234-1234-123456789012",
	duration_ms: 240000,
};

describe("validate", () => {
	it("accepts a minimal valid map", () => {
		const result = validate(MINIMAL_MAP);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("rejects missing required fields", () => {
		const result = validate({ version: "0.1.0" });
		expect(result.valid).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it("rejects wrong types", () => {
		const result = validate({
			...MINIMAL_MAP,
			duration_ms: "not a number",
		});
		expect(result.valid).toBe(false);
	});

	it("accepts a full map with all optional fields", () => {
		const full: PulseMap = {
			...MINIMAL_MAP,
			fingerprint: {
				chromaprint: "AQADtNI...",
				algorithm: 2,
				duration: 240000,
			},
			metadata: {
				title: "Test Song",
				artist: "Test Artist",
				album: "Test Album",
				key: "C major",
				tempo: 120,
				time_signature: "4/4",
				extra: { genre: "Rock", year: 2024 },
			},
			playback: [
				{
					platform: "youtube",
					uri: "https://youtube.com/watch?v=test",
					id: "test",
					capabilities: { play: true, pause: true, seek: true },
					added: "2024-01-01",
				},
			],
			lyrics: [
				{ t: 0, text: "Hello world", end: 1000 },
				{ t: 1000, text: "Second line" },
			],
			chords: [
				{ t: 0, chord: "C", end: 2000 },
				{ t: 2000, chord: "Am" },
			],
			beats: [
				{ t: 0, downbeat: true, bpm: 120, time_sig: "4/4" },
				{ t: 500, downbeat: false },
				{ t: 1000, downbeat: false },
				{ t: 1500, downbeat: false },
			],
			sections: [
				{ t: 0, type: "intro", end: 10000 },
				{ t: 10000, type: "verse", label: "Verse 1", end: 30000 },
			],
			midi: [
				{
					sha256: "abc123def456",
					duration_ms: 240000,
					tracks: [
						{ index: 0, label: "melody" },
						{ index: 1, label: "bass" },
					],
				},
			],
			analysis: {
				fingerprint: { tool: "fpcalc", version: "1.6.0", date: "2024-01-01" },
				lyrics: { tool: "lrclib", date: "2024-01-01" },
			},
		};

		const result = validate(full);
		expect(result.valid).toBe(true);
	});

	it("accepts playback rate as continuous", () => {
		const map = {
			...MINIMAL_MAP,
			playback: [
				{
					platform: "custom",
					capabilities: { rate: "continuous" },
				},
			],
		};
		expect(validate(map).valid).toBe(true);
	});

	it("accepts playback rate as number array", () => {
		const map = {
			...MINIMAL_MAP,
			playback: [
				{
					platform: "youtube",
					capabilities: { rate: [0.5, 1, 1.5, 2] },
				},
			],
		};
		expect(validate(map).valid).toBe(true);
	});

	it("rejects empty object", () => {
		expect(validate({}).valid).toBe(false);
	});

	it("rejects null", () => {
		expect(validate(null).valid).toBe(false);
	});
});

describe("assertValid", () => {
	it("does not throw for valid maps", () => {
		expect(() => assertValid(MINIMAL_MAP)).not.toThrow();
	});

	it("throws with details for invalid maps", () => {
		expect(() => assertValid({})).toThrow("Invalid PulseMap");
	});
});
