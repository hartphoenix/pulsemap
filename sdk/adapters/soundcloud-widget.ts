import type { PlaybackCapabilities } from "../../schema/map";
import type { AdapterMatcher, PlaybackAdapter, PlaybackState } from "./types";

/**
 * The subset of the SoundCloud Widget API this adapter uses.
 * See https://developers.soundcloud.com/docs/api/html5-widget
 *
 * All getters are callback-async; audio events (PLAY, PAUSE, FINISH,
 * SEEK, PLAY_PROGRESS) receive `{ currentPosition }` in milliseconds.
 * The adapter caches position from events and interpolates between
 * them, so consumers get a synchronous `getPosition()`.
 */
export interface SoundCloudWidgetLike {
	bind(eventName: string, listener: (data?: WidgetAudioEvent) => void): void;
	unbind(eventName: string): void;
	play(): void;
	pause(): void;
	seekTo(ms: number): void;
	/** Volume in the widget's native 0–100 range. */
	setVolume(volume: number): void;
	getVolume(callback: (volume: number) => void): void;
	getDuration(callback: (ms: number) => void): void;
	getPosition(callback: (ms: number) => void): void;
}

interface WidgetAudioEvent {
	relativePosition?: number;
	loadedProgress?: number;
	currentPosition?: number;
}

/** String values of SC.Widget.Events — inlined so the adapter works with an injected widget without the api.js global. */
const EVENTS = {
	READY: "ready",
	PLAY: "play",
	PAUSE: "pause",
	FINISH: "finish",
	SEEK: "seek",
	PLAY_PROGRESS: "playProgress",
	ERROR: "error",
} as const;

interface SCGlobal {
	Widget: (iframe: HTMLIFrameElement | string) => SoundCloudWidgetLike;
}

interface SCWindow {
	SC?: SCGlobal;
}

let apiLoadPromise: Promise<SCGlobal> | null = null;

function ensureApi(): Promise<SCGlobal> {
	const existing = (window as SCWindow).SC;
	if (existing) return Promise.resolve(existing);
	if (apiLoadPromise) return apiLoadPromise;
	apiLoadPromise = new Promise<SCGlobal>((resolve, reject) => {
		const tag = document.createElement("script");
		tag.src = "https://w.soundcloud.com/player/api.js";
		tag.onload = () => {
			const sc = (window as SCWindow).SC;
			if (sc) resolve(sc);
			else reject(new Error("SoundCloud widget API loaded but window.SC is missing"));
		};
		tag.onerror = () => reject(new Error("Failed to load SoundCloud widget API"));
		document.head.appendChild(tag);
	});
	return apiLoadPromise;
}

const RESERVED_FIRST_SEGMENTS = new Set([
	"charts",
	"discover",
	"feed",
	"jobs",
	"messages",
	"mobile",
	"notifications",
	"pages",
	"people",
	"popular",
	"search",
	"settings",
	"stations",
	"stream",
	"tags",
	"terms-of-use",
	"upload",
	"you",
]);

/**
 * Extract a canonical SoundCloud track URL from a URL. Returns null
 * if the URL is not a recognized SoundCloud track format.
 *
 * Accepts:
 * - Track permalinks: soundcloud.com/<user>/<track>
 * - Short links: on.soundcloud.com/<token> (resolved by the widget)
 * - API track URLs: api.soundcloud.com/tracks/<id>
 * - Widget URLs: w.soundcloud.com/player/?url=<encoded track URL>
 *
 * Rejects profiles, playlists (/sets/), and site pages. Playlists are
 * out of scope: PulseMap maps describe a single recording.
 */
export function parseSoundCloudTrackUrl(url: string): string | null {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return null;
	}
	if (u.protocol !== "https:" && u.protocol !== "http:") return null;
	const host = u.hostname.replace(/^www\./, "");
	const segments = u.pathname.split("/").filter(Boolean);

	if (host === "on.soundcloud.com") {
		return segments.length === 1 ? `https://on.soundcloud.com/${segments[0]}` : null;
	}
	if (host === "api.soundcloud.com") {
		if (segments.length === 2 && segments[0] === "tracks" && /^\d+$/.test(segments[1])) {
			return `https://api.soundcloud.com/tracks/${segments[1]}`;
		}
		return null;
	}
	if (host === "w.soundcloud.com") {
		const inner = u.searchParams.get("url");
		return inner ? parseSoundCloudTrackUrl(inner) : null;
	}
	if (host === "soundcloud.com" || host === "m.soundcloud.com") {
		if (segments.length !== 2) return null;
		if (RESERVED_FIRST_SEGMENTS.has(segments[0])) return null;
		if (segments[1] === "sets") return null;
		return `https://soundcloud.com/${segments[0]}/${segments[1]}`;
	}
	return null;
}

export const soundCloudWidgetMatcher: AdapterMatcher = {
	platform: "soundcloud",
	match: parseSoundCloudTrackUrl,
};

export interface SoundCloudWidgetOptions {
	/** SoundCloud track URL (permalink, short link, or api.soundcloud.com/tracks/<id>). */
	url?: string;
	/** DOM id of the container the widget iframe is appended to. */
	elementId?: string;
	/** Iframe height in px. Defaults to 166 (the compact player). */
	height?: number;
	/** Extra query params for the widget URL (e.g. { visual: "true" }). */
	iframeParams?: Record<string, string>;
	/**
	 * Existing widget instance. Skips iframe and script setup. For
	 * tests (inject a fake) or apps that manage their own embed.
	 */
	widget?: SoundCloudWidgetLike;
	/** Clock used for position interpolation. Tests inject a fake. Defaults to performance.now. */
	now?: () => number;
}

const SOUNDCLOUD_CAPABILITIES: PlaybackCapabilities = {
	play: true,
	pause: true,
	seek: true,
	setPosition: true,
	getPosition: true,
	volume: true,
	mute: true,
	// no rate: the widget has no playback-rate control
};

/**
 * PlaybackAdapter backed by the SoundCloud HTML5 Widget.
 *
 * No API key or app registration required — the widget is the same
 * iframe + postMessage surface as every SoundCloud embed on the web.
 *
 * Platform notes:
 * - Go+ (premium-catalog) tracks play as 30-second previews in
 *   embeds, with no way to authenticate inside the iframe. Duration
 *   reported by the widget will reflect the preview.
 * - The widget has no mute or playback-rate controls; mute is
 *   emulated via setVolume(0) with the previous volume stashed.
 * - Position getters are callback-async in the widget, so this
 *   adapter caches `currentPosition` from audio events and
 *   interpolates against the clock while playing.
 */
export class SoundCloudWidgetAdapter implements PlaybackAdapter {
	readonly platform = "soundcloud";
	readonly capabilities: PlaybackCapabilities = SOUNDCLOUD_CAPABILITIES;

	private widget: SoundCloudWidgetLike | null = null;
	private iframe: HTMLIFrameElement | null = null;
	private ready = false;
	private readyPromise: Promise<void>;
	private resolveReady!: () => void;
	private stateListeners = new Set<(state: PlaybackState) => void>();
	private currentState: PlaybackState = "unstarted";
	private now: () => number;

	private positionMs = 0;
	private positionAt = 0;
	private durationMs = 0;
	private volumeCache = 1;
	private volumeBeforeMute: number | null = null;

	constructor(options: SoundCloudWidgetOptions) {
		this.now = options.now ?? (() => performance.now());
		this.readyPromise = new Promise<void>((resolve) => {
			this.resolveReady = resolve;
		});
		if (options.widget) {
			this.widget = options.widget;
			this.bindWidget(options.widget);
		} else {
			if (!options.url || !options.elementId) {
				throw new Error("SoundCloudWidgetAdapter requires either a widget or url + elementId");
			}
			void this.init(options);
		}
	}

	private async init(options: SoundCloudWidgetOptions) {
		const container = document.getElementById(options.elementId as string);
		if (!container) {
			throw new Error(`SoundCloudWidgetAdapter: no element with id "${options.elementId}"`);
		}
		const params = new URLSearchParams({
			url: options.url as string,
			auto_play: "false",
			...options.iframeParams,
		});
		const iframe = document.createElement("iframe");
		iframe.src = `https://w.soundcloud.com/player/?${params.toString()}`;
		iframe.width = "100%";
		iframe.height = String(options.height ?? 166);
		iframe.allow = "autoplay";
		iframe.style.border = "none";
		container.appendChild(iframe);
		this.iframe = iframe;

		const sc = await ensureApi();
		const widget = sc.Widget(iframe);
		this.widget = widget;
		this.bindWidget(widget);
	}

	private bindWidget(widget: SoundCloudWidgetLike) {
		widget.bind(EVENTS.READY, () => {
			this.ready = true;
			widget.getDuration((ms) => {
				this.durationMs = ms;
			});
			widget.getVolume((volume) => {
				this.volumeCache = volume / 100;
			});
			this.resolveReady();
		});
		widget.bind(EVENTS.PLAY, (data) => {
			this.updatePosition(data);
			this.emit("playing");
		});
		widget.bind(EVENTS.PAUSE, (data) => {
			this.updatePosition(data);
			// The widget fires PAUSE right before FINISH at the end of a
			// track; FINISH follows immediately and overwrites the state.
			this.emit("paused");
		});
		widget.bind(EVENTS.FINISH, (data) => {
			this.updatePosition(data);
			this.emit("ended");
		});
		widget.bind(EVENTS.SEEK, (data) => {
			this.updatePosition(data);
		});
		widget.bind(EVENTS.PLAY_PROGRESS, (data) => {
			this.updatePosition(data);
		});
	}

	private updatePosition(data?: WidgetAudioEvent) {
		if (data?.currentPosition === undefined) return;
		this.positionMs = data.currentPosition;
		this.positionAt = this.now();
	}

	private emit(state: PlaybackState) {
		if (state === this.currentState) return;
		this.currentState = state;
		for (const listener of this.stateListeners) listener(state);
	}

	waitForReady(): Promise<void> {
		return this.readyPromise;
	}

	getPosition(): number {
		if (this.currentState !== "playing") return this.positionMs;
		const interpolated = this.positionMs + (this.now() - this.positionAt);
		return this.durationMs > 0 ? Math.min(interpolated, this.durationMs) : interpolated;
	}

	seek(ms: number): void {
		if (!this.ready || !this.widget) return;
		this.widget.seekTo(ms);
		// Optimistic: the SEEK event will confirm, but consumers polling
		// getPosition() before it arrives should see the new position.
		this.positionMs = ms;
		this.positionAt = this.now();
	}

	play(): void {
		if (!this.ready || !this.widget) return;
		this.widget.play();
	}

	pause(): void {
		if (!this.ready || !this.widget) return;
		this.widget.pause();
	}

	isPlaying(): boolean {
		return this.currentState === "playing";
	}

	getState(): PlaybackState {
		return this.currentState;
	}

	getPlaybackRate(): number {
		return 1;
	}

	setPlaybackRate(_rate: number): void {
		// Not supported by the widget; no-op per PlaybackAdapter contract.
	}

	getVolume(): number {
		return this.volumeCache;
	}

	setVolume(level: number): void {
		if (!this.ready || !this.widget) return;
		const clamped = Math.max(0, Math.min(1, level));
		this.volumeCache = clamped;
		if (this.volumeBeforeMute !== null) {
			// Adjusting volume while muted updates the restore value only.
			this.volumeBeforeMute = clamped;
			return;
		}
		this.widget.setVolume(Math.round(clamped * 100));
	}

	isMuted(): boolean {
		return this.volumeBeforeMute !== null;
	}

	setMuted(muted: boolean): void {
		if (!this.ready || !this.widget) return;
		if (muted) {
			if (this.volumeBeforeMute !== null) return;
			this.volumeBeforeMute = this.volumeCache;
			this.widget.setVolume(0);
		} else {
			if (this.volumeBeforeMute === null) return;
			const restore = this.volumeBeforeMute;
			this.volumeBeforeMute = null;
			this.volumeCache = restore;
			this.widget.setVolume(Math.round(restore * 100));
		}
	}

	onStateChange(callback: (state: PlaybackState) => void): () => void {
		this.stateListeners.add(callback);
		return () => this.stateListeners.delete(callback);
	}

	/** Track duration in ms as reported by the widget. For Go+ preview tracks this is the preview length, not the full recording — compare against the map's duration_ms to detect preview-only playback. */
	getDuration(): number {
		return this.durationMs;
	}

	destroy(): void {
		if (this.widget) {
			for (const event of Object.values(EVENTS)) {
				this.widget.unbind(event);
			}
		}
		this.widget = null;
		if (this.iframe?.parentNode) {
			this.iframe.parentNode.removeChild(this.iframe);
		}
		this.iframe = null;
		this.ready = false;
		this.stateListeners.clear();
	}
}
