import { describe, expect, it } from "bun:test";
import {
	parseSoundCloudTrackUrl,
	SoundCloudWidgetAdapter,
	type SoundCloudWidgetLike,
	soundCloudWidgetMatcher,
} from "../../sdk/adapters/soundcloud-widget";

describe("soundCloudWidgetMatcher", () => {
	const cases: Array<{ url: string; expected: string | null }> = [
		// Match — track permalinks, normalized
		{
			url: "https://soundcloud.com/artist/some-track",
			expected: "https://soundcloud.com/artist/some-track",
		},
		{
			url: "https://www.soundcloud.com/artist/some-track",
			expected: "https://soundcloud.com/artist/some-track",
		},
		{
			url: "https://m.soundcloud.com/artist/some-track",
			expected: "https://soundcloud.com/artist/some-track",
		},
		{
			url: "http://soundcloud.com/artist/some-track?in=someone/sets/mix",
			expected: "https://soundcloud.com/artist/some-track",
		},
		// Match — short links
		{
			url: "https://on.soundcloud.com/AbCdEf123",
			expected: "https://on.soundcloud.com/AbCdEf123",
		},
		// Match — API track URLs
		{
			url: "https://api.soundcloud.com/tracks/123456789",
			expected: "https://api.soundcloud.com/tracks/123456789",
		},
		// Match — widget URLs unwrap to the inner track URL
		{
			url: "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Fsome-track&auto_play=false",
			expected: "https://soundcloud.com/artist/some-track",
		},
		// No match — profiles, playlists, site pages, other platforms
		{ url: "https://soundcloud.com/artist", expected: null },
		{ url: "https://soundcloud.com/artist/sets/my-playlist", expected: null },
		{ url: "https://soundcloud.com/artist/sets", expected: null },
		{ url: "https://soundcloud.com/discover/some-page", expected: null },
		{ url: "https://soundcloud.com/search/results", expected: null },
		{ url: "https://soundcloud.com/pages/contact", expected: null },
		{ url: "https://soundcloud.com/stations/track/xyz", expected: null },
		{ url: "https://api.soundcloud.com/playlists/123", expected: null },
		{ url: "https://api.soundcloud.com/tracks/not-a-number", expected: null },
		{ url: "https://w.soundcloud.com/player/?visual=true", expected: null },
		{ url: "https://www.youtube.com/watch?v=abc123", expected: null },
		{ url: "https://example.com/artist/track", expected: null },
		{ url: "ftp://soundcloud.com/artist/track", expected: null },
		{ url: "not a url", expected: null },
		{ url: "", expected: null },
	];

	for (const { url, expected } of cases) {
		it(`${expected ? "matches" : "rejects"}: ${url || "(empty)"}`, () => {
			expect(parseSoundCloudTrackUrl(url)).toBe(expected);
		});
	}

	it("declares its platform as 'soundcloud'", () => {
		expect(soundCloudWidgetMatcher.platform).toBe("soundcloud");
	});
});

/**
 * Fake widget implementing SoundCloudWidgetLike. The adapter accepts an
 * injected widget specifically so tests can run without DOM, network,
 * or the api.js global. The fake records calls and exposes dispatch()
 * to simulate widget events.
 */
function createFakeWidget(opts: { duration?: number; volume?: number } = {}) {
	const listeners = new Map<string, (data?: unknown) => void>();
	const calls: Array<[string, ...unknown[]]> = [];
	const fake = {
		duration: opts.duration ?? 200_000,
		volume: opts.volume ?? 100,
		bind(event: string, fn: (data?: unknown) => void) {
			listeners.set(event, fn);
		},
		unbind(event: string) {
			listeners.delete(event);
		},
		play() {
			calls.push(["play"]);
		},
		pause() {
			calls.push(["pause"]);
		},
		seekTo(ms: number) {
			calls.push(["seekTo", ms]);
		},
		setVolume(volume: number) {
			calls.push(["setVolume", volume]);
			fake.volume = volume;
		},
		getVolume(cb: (volume: number) => void) {
			cb(fake.volume);
		},
		getDuration(cb: (ms: number) => void) {
			cb(fake.duration);
		},
		getPosition(cb: (ms: number) => void) {
			cb(0);
		},
		dispatch(event: string, data?: unknown) {
			listeners.get(event)?.(data);
		},
		calls,
		listeners,
	};
	return fake;
}

function makeAdapter(opts: { duration?: number; volume?: number } = {}) {
	const fake = createFakeWidget(opts);
	let clock = 0;
	const adapter = new SoundCloudWidgetAdapter({
		widget: fake as unknown as SoundCloudWidgetLike,
		now: () => clock,
	});
	fake.dispatch("ready");
	return {
		adapter,
		fake,
		tick(ms: number) {
			clock += ms;
		},
	};
}

describe("SoundCloudWidgetAdapter", () => {
	it("declares soundcloud platform and the expected capabilities (no rate)", () => {
		const { adapter } = makeAdapter();
		expect(adapter.platform).toBe("soundcloud");
		expect(adapter.capabilities).toMatchObject({
			play: true,
			pause: true,
			seek: true,
			setPosition: true,
			getPosition: true,
			volume: true,
			mute: true,
		});
		expect(adapter.capabilities.rate).toBeUndefined();
	});

	it("resolves waitForReady on the READY event and caches duration", async () => {
		const { adapter } = makeAdapter({ duration: 123_456 });
		await adapter.waitForReady();
		expect(adapter.getDuration()).toBe(123_456);
	});

	it("passes play/pause/seek through to the widget (seek already in ms)", () => {
		const { adapter, fake } = makeAdapter();
		adapter.play();
		adapter.pause();
		adapter.seek(45_000);
		expect(fake.calls).toEqual([["play"], ["pause"], ["seekTo", 45_000]]);
	});

	it("caches position from PLAY_PROGRESS and returns it while paused", () => {
		const { adapter, fake, tick } = makeAdapter();
		fake.dispatch("playProgress", { currentPosition: 10_000 });
		tick(500);
		expect(adapter.getPosition()).toBe(10_000);
	});

	it("interpolates position against the clock while playing", () => {
		const { adapter, fake, tick } = makeAdapter();
		fake.dispatch("play", { currentPosition: 10_000 });
		tick(300);
		expect(adapter.getPosition()).toBe(10_300);
		fake.dispatch("playProgress", { currentPosition: 10_250 });
		tick(100);
		expect(adapter.getPosition()).toBe(10_350);
	});

	it("freezes position on pause and clamps interpolation to duration", () => {
		const { adapter, fake, tick } = makeAdapter({ duration: 20_000 });
		fake.dispatch("play", { currentPosition: 19_900 });
		tick(5_000);
		expect(adapter.getPosition()).toBe(20_000);
		fake.dispatch("pause", { currentPosition: 19_950 });
		tick(5_000);
		expect(adapter.getPosition()).toBe(19_950);
	});

	it("reports the seek target optimistically before the SEEK event arrives", () => {
		const { adapter, fake } = makeAdapter();
		fake.dispatch("playProgress", { currentPosition: 10_000 });
		adapter.seek(90_000);
		expect(adapter.getPosition()).toBe(90_000);
		fake.dispatch("seek", { currentPosition: 90_012 });
		expect(adapter.getPosition()).toBe(90_012);
	});

	it("normalizes volume 0–1 (adapter) to 0–100 (widget) and clamps", () => {
		const { adapter, fake } = makeAdapter();
		adapter.setVolume(0.5);
		expect(fake.volume).toBe(50);
		expect(adapter.getVolume()).toBe(0.5);
		adapter.setVolume(2);
		expect(fake.volume).toBe(100);
		adapter.setVolume(-1);
		expect(fake.volume).toBe(0);
	});

	it("reads the widget's initial volume on ready", () => {
		const { adapter } = makeAdapter({ volume: 30 });
		expect(adapter.getVolume()).toBe(0.3);
	});

	it("emulates mute via setVolume(0) and restores the previous volume", () => {
		const { adapter, fake } = makeAdapter();
		adapter.setVolume(0.7);
		adapter.setMuted(true);
		expect(adapter.isMuted()).toBe(true);
		expect(fake.volume).toBe(0);
		expect(adapter.getVolume()).toBe(0.7); // logical volume survives mute
		adapter.setMuted(false);
		expect(adapter.isMuted()).toBe(false);
		expect(fake.volume).toBe(70);
	});

	it("applies volume set while muted only after unmute", () => {
		const { adapter, fake } = makeAdapter();
		adapter.setMuted(true);
		adapter.setVolume(0.4);
		expect(fake.volume).toBe(0); // still muted
		adapter.setMuted(false);
		expect(fake.volume).toBe(40);
		expect(adapter.getVolume()).toBe(0.4);
	});

	it("emits playing → paused → ended transitions and dedupes repeats", () => {
		const { adapter, fake } = makeAdapter();
		const states: string[] = [];
		adapter.onStateChange((s) => states.push(s));
		fake.dispatch("play", { currentPosition: 0 });
		fake.dispatch("play", { currentPosition: 10 });
		fake.dispatch("pause", { currentPosition: 500 });
		fake.dispatch("finish", { currentPosition: 1_000 });
		expect(states).toEqual(["playing", "paused", "ended"]);
	});

	it("isPlaying and getState reflect the event-driven state", () => {
		const { adapter, fake } = makeAdapter();
		expect(adapter.getState()).toBe("unstarted");
		expect(adapter.isPlaying()).toBe(false);
		fake.dispatch("play", { currentPosition: 0 });
		expect(adapter.getState()).toBe("playing");
		expect(adapter.isPlaying()).toBe(true);
	});

	it("no-ops playback rate per the adapter contract", () => {
		const { adapter } = makeAdapter();
		adapter.setPlaybackRate(2);
		expect(adapter.getPlaybackRate()).toBe(1);
	});

	it("unsubscribes state listeners cleanly", () => {
		const { adapter, fake } = makeAdapter();
		const states: string[] = [];
		const off = adapter.onStateChange((s) => states.push(s));
		off();
		fake.dispatch("play", { currentPosition: 0 });
		expect(states).toEqual([]);
	});

	it("ignores commands before READY", () => {
		const fake = createFakeWidget();
		const adapter = new SoundCloudWidgetAdapter({
			widget: fake as unknown as SoundCloudWidgetLike,
		});
		adapter.play();
		adapter.seek(1_000);
		adapter.setMuted(true);
		expect(fake.calls).toEqual([]);
		expect(adapter.isMuted()).toBe(false);
	});

	it("getWidget returns the underlying widget for extra event bindings", () => {
		const { adapter, fake } = makeAdapter();
		expect(adapter.getWidget()).toBe(fake as unknown as SoundCloudWidgetLike);
	});

	it("destroy unbinds all widget events and clears listeners", () => {
		const { adapter, fake } = makeAdapter();
		const states: string[] = [];
		adapter.onStateChange((s) => states.push(s));
		adapter.destroy();
		expect(fake.listeners.size).toBe(0);
		fake.dispatch("play", { currentPosition: 0 });
		expect(states).toEqual([]);
	});
});
