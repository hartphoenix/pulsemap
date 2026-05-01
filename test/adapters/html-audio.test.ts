import { describe, expect, it } from "bun:test";
import {
	HtmlAudioAdapter,
	type HtmlAudioOptions,
	htmlAudioMatcher,
} from "../../sdk/adapters/html-audio";

describe("htmlAudioMatcher", () => {
	const cases = [
		// Match
		{ url: "blob:https://example.com/abc-def", match: true },
		{ url: "file:///Users/x/song.mp3", match: true },
		{ url: "data:audio/mpeg;base64,SUQzBAAAAAAA", match: true },
		{ url: "https://cdn.example.com/song.mp3", match: true },
		{ url: "https://cdn.example.com/song.MP3", match: true },
		{ url: "https://cdn.example.com/track.wav", match: true },
		{ url: "https://cdn.example.com/track.ogg", match: true },
		{ url: "https://cdn.example.com/track.flac", match: true },
		{ url: "https://cdn.example.com/track.m4a", match: true },
		{ url: "https://cdn.example.com/track.aac", match: true },
		{ url: "https://cdn.example.com/track.opus", match: true },
		{ url: "http://example.com/song.mp3?token=abc", match: true },
		// No match
		{ url: "https://www.youtube.com/watch?v=abc123", match: false },
		{ url: "https://youtu.be/abc123", match: false },
		{ url: "https://open.spotify.com/track/xyz", match: false },
		{ url: "https://example.com/song", match: false },
		{ url: "https://example.com/song.mp4", match: false },
		{ url: "https://example.com/page.html", match: false },
		{ url: "data:image/png;base64,iVBORw0KGgo=", match: false },
		{ url: "", match: false },
	];

	for (const { url, match } of cases) {
		it(`${match ? "matches" : "rejects"}: ${url || "(empty)"}`, () => {
			const result = htmlAudioMatcher.match(url);
			if (match) {
				expect(result).toBe(url);
			} else {
				expect(result).toBeNull();
			}
		});
	}

	it("declares its platform as 'html-audio'", () => {
		expect(htmlAudioMatcher.platform).toBe("html-audio");
	});
});

/**
 * Minimal HTMLAudioElement stub. We don't need a real DOM — `HtmlAudioAdapter`
 * accepts an injected `element` option specifically so tests can pass a fake.
 * The fake records every property write and exposes the registered listeners
 * so tests can simulate media events.
 */
function createFakeAudio() {
	const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
	const fake = {
		src: "",
		preload: "" as "" | "none" | "metadata" | "auto",
		crossOrigin: null as string | null,
		currentTime: 0,
		volume: 1,
		muted: false,
		paused: true,
		ended: false,
		playbackRate: 1,
		parentNode: null,
		addEventListener(type: string, fn: (...args: unknown[]) => void) {
			let set = listeners.get(type);
			if (!set) {
				set = new Set();
				listeners.set(type, set);
			}
			set.add(fn);
		},
		removeEventListener(type: string, fn: (...args: unknown[]) => void) {
			listeners.get(type)?.delete(fn);
		},
		removeAttribute(_name: string) {
			fake.src = "";
		},
		load() {},
		play() {
			fake.paused = false;
			fake.dispatch("play");
			return Promise.resolve();
		},
		pause() {
			fake.paused = true;
			fake.dispatch("pause");
		},
		dispatch(type: string) {
			const set = listeners.get(type);
			if (!set) return;
			for (const fn of set) fn();
		},
	};
	return fake;
}

function makeAdapter(extras: Partial<HtmlAudioOptions> = {}) {
	const fake = createFakeAudio();
	const adapter = new HtmlAudioAdapter({
		source: "https://example.com/song.mp3",
		element: fake as unknown as HTMLAudioElement,
		...extras,
	});
	return { adapter, fake };
}

describe("HtmlAudioAdapter", () => {
	it("declares html-audio platform and the expected capabilities", () => {
		const { adapter } = makeAdapter();
		expect(adapter.platform).toBe("html-audio");
		expect(adapter.capabilities).toMatchObject({
			play: true,
			pause: true,
			seek: true,
			rate: "continuous",
			volume: true,
			mute: true,
		});
	});

	it("sets the element src directly when source is a URL string", () => {
		const { fake } = makeAdapter({ source: "https://cdn.example.com/x.mp3" });
		expect(fake.src).toBe("https://cdn.example.com/x.mp3");
	});

	it("converts position between ms (adapter) and seconds (element)", () => {
		const { adapter, fake } = makeAdapter();
		fake.currentTime = 12.5;
		expect(adapter.getPosition()).toBe(12500);
		adapter.seek(3000);
		expect(fake.currentTime).toBe(3);
	});

	it("normalizes volume 0–1 round-trip and clamps out-of-range input", () => {
		const { adapter, fake } = makeAdapter();
		adapter.setVolume(0.5);
		expect(fake.volume).toBe(0.5);
		expect(adapter.getVolume()).toBe(0.5);

		adapter.setVolume(2);
		expect(fake.volume).toBe(1);

		adapter.setVolume(-1);
		expect(fake.volume).toBe(0);
	});

	it("clamps playback rate into [0.25, 4]", () => {
		const { adapter, fake } = makeAdapter();
		adapter.setPlaybackRate(0.5);
		expect(fake.playbackRate).toBe(0.5);

		adapter.setPlaybackRate(10);
		expect(fake.playbackRate).toBe(4);

		adapter.setPlaybackRate(0);
		expect(fake.playbackRate).toBe(0.25);
	});

	it("emits playing → paused → ended state transitions", () => {
		const { adapter, fake } = makeAdapter();
		const states: string[] = [];
		adapter.onStateChange((s) => states.push(s));

		fake.dispatch("play");
		expect(states).toEqual(["playing"]);

		fake.paused = true;
		fake.ended = false;
		fake.dispatch("pause");
		expect(states).toEqual(["playing", "paused"]);

		fake.ended = true;
		fake.dispatch("ended");
		expect(states).toEqual(["playing", "paused", "ended"]);
	});

	it("dedupes consecutive identical states", () => {
		const { adapter, fake } = makeAdapter();
		const states: string[] = [];
		adapter.onStateChange((s) => states.push(s));
		fake.dispatch("play");
		fake.dispatch("playing"); // alias — should NOT re-emit
		fake.dispatch("play");
		expect(states).toEqual(["playing"]);
	});

	it("unsubscribes cleanly when the returned function is called", () => {
		const { adapter, fake } = makeAdapter();
		const states: string[] = [];
		const off = adapter.onStateChange((s) => states.push(s));
		off();
		fake.dispatch("play");
		expect(states).toEqual([]);
	});

	it("isPlaying reflects element paused/ended state", () => {
		const { adapter, fake } = makeAdapter();
		expect(adapter.isPlaying()).toBe(false);
		fake.paused = false;
		fake.ended = false;
		expect(adapter.isPlaying()).toBe(true);
		fake.ended = true;
		expect(adapter.isPlaying()).toBe(false);
	});

	it("getElement returns the underlying <audio> for Web Audio wiring", () => {
		const { adapter, fake } = makeAdapter();
		expect(adapter.getElement()).toBe(fake);
	});

	it("destroy releases the source and clears listeners", () => {
		const { adapter, fake } = makeAdapter();
		const states: string[] = [];
		adapter.onStateChange((s) => states.push(s));
		adapter.destroy();
		expect(fake.src).toBe("");
		fake.dispatch("play");
		expect(states).toEqual([]);
	});

	it("waitForReady resolves on the element's loadedmetadata event", async () => {
		const { adapter, fake } = makeAdapter();
		const ready = adapter.waitForReady();
		fake.dispatch("loadedmetadata");
		await ready; // resolves cleanly
	});
});
