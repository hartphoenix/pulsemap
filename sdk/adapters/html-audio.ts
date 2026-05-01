import type { PlaybackCapabilities } from "../../schema/map";
import type { AdapterMatcher, PlaybackAdapter, PlaybackState } from "./types";

export interface HtmlAudioOptions {
	/** Audio source: a URL string, a Blob, or a File. */
	source: string | Blob | File;
	/** Existing <audio> element. If omitted, a new one is created and managed by the adapter. */
	element?: HTMLAudioElement;
	/** Maps to <audio>'s `preload` attribute. Defaults to "metadata". */
	preload?: "none" | "metadata" | "auto";
	/** Maps to <audio>'s `crossOrigin` attribute. Required for cross-origin Web Audio analysis. */
	crossOrigin?: "anonymous" | "use-credentials" | null;
}

const HTML_AUDIO_CAPABILITIES: PlaybackCapabilities = {
	play: true,
	pause: true,
	seek: true,
	setPosition: true,
	getPosition: true,
	rate: "continuous",
	volume: true,
	mute: true,
};

const AUDIO_EXTENSION_RE = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|webm)(\?.*)?$/i;

/**
 * Match URLs that an <audio> element can plausibly play: blob:, file:,
 * data:audio/*, and direct http(s) URLs ending in a common audio extension.
 *
 * Does NOT match plain http(s) URLs without an audio extension — pages or
 * extension-less endpoints could be anything. Apps that know the URL is
 * audio (e.g. via Content-Type) can construct HtmlAudioAdapter directly.
 */
export const htmlAudioMatcher: AdapterMatcher = {
	platform: "html-audio",
	match(url: string): string | null {
		if (!url) return null;
		if (url.startsWith("blob:") || url.startsWith("file:") || url.startsWith("data:audio/")) {
			return url;
		}
		if (/^https?:\/\//.test(url) && AUDIO_EXTENSION_RE.test(url)) {
			return url;
		}
		return null;
	},
};

/** Clamp a number into [min, max] without throwing on NaN. */
function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.max(min, Math.min(max, value));
}

/**
 * PlaybackAdapter backed by an HTMLAudioElement. Universal entry point —
 * works with any URL, Blob, or File the browser can decode.
 *
 * To wire Web Audio (visualizers, FX), pass `crossOrigin: "anonymous"`,
 * grab the element via `getElement()`, and call
 * `audioContext.createMediaElementSource(adapter.getElement())`.
 */
export class HtmlAudioAdapter implements PlaybackAdapter {
	readonly platform = "html-audio";
	readonly capabilities: PlaybackCapabilities = HTML_AUDIO_CAPABILITIES;

	private element: HTMLAudioElement;
	private ownsElement: boolean;
	private blobUrl: string | null = null;
	private listeners = new Set<(state: PlaybackState) => void>();
	private currentState: PlaybackState = "unstarted";
	private readyPromise: Promise<void>;
	private resolveReady!: () => void;

	constructor(options: HtmlAudioOptions) {
		const element = options.element ?? document.createElement("audio");
		this.element = element;
		this.ownsElement = options.element === undefined;
		element.preload = options.preload ?? "metadata";
		if (options.crossOrigin !== undefined && options.crossOrigin !== null) {
			element.crossOrigin = options.crossOrigin;
		}

		this.readyPromise = new Promise<void>((resolve) => {
			this.resolveReady = resolve;
		});

		this.bindEvents();
		this.setSource(options.source);
	}

	private setSource(source: string | Blob | File): void {
		if (typeof source === "string") {
			this.element.src = source;
			return;
		}
		this.blobUrl = URL.createObjectURL(source);
		this.element.src = this.blobUrl;
	}

	private bindEvents(): void {
		const a = this.element;
		const onReady = () => this.resolveReady();
		a.addEventListener("loadedmetadata", onReady);
		a.addEventListener("canplay", onReady);
		a.addEventListener("play", () => this.emit("playing"));
		a.addEventListener("playing", () => this.emit("playing"));
		a.addEventListener("pause", () => this.emit(this.element.ended ? "ended" : "paused"));
		a.addEventListener("waiting", () => this.emit("buffering"));
		a.addEventListener("ended", () => this.emit("ended"));
	}

	private emit(state: PlaybackState): void {
		if (state === this.currentState) return;
		this.currentState = state;
		for (const listener of this.listeners) listener(state);
	}

	waitForReady(): Promise<void> {
		return this.readyPromise;
	}

	getPosition(): number {
		return this.element.currentTime * 1000;
	}

	seek(ms: number): void {
		this.element.currentTime = ms / 1000;
	}

	play(): void {
		void this.element.play();
	}

	pause(): void {
		this.element.pause();
	}

	isPlaying(): boolean {
		return !this.element.paused && !this.element.ended;
	}

	getState(): PlaybackState {
		return this.currentState;
	}

	getPlaybackRate(): number {
		return this.element.playbackRate;
	}

	setPlaybackRate(rate: number): void {
		this.element.playbackRate = clamp(rate, 0.25, 4);
	}

	getVolume(): number {
		return this.element.volume;
	}

	setVolume(level: number): void {
		this.element.volume = clamp(level, 0, 1);
	}

	isMuted(): boolean {
		return this.element.muted;
	}

	setMuted(muted: boolean): void {
		this.element.muted = muted;
	}

	onStateChange(callback: (state: PlaybackState) => void): () => void {
		this.listeners.add(callback);
		return () => {
			this.listeners.delete(callback);
		};
	}

	/**
	 * Escape hatch: returns the underlying <audio> element. Use to wire up
	 * Web Audio (`AudioContext.createMediaElementSource`), attach custom
	 * UI controls, or add extra event listeners.
	 */
	getElement(): HTMLAudioElement {
		return this.element;
	}

	destroy(): void {
		this.element.pause();
		this.element.removeAttribute("src");
		this.element.load();
		if (this.blobUrl) {
			URL.revokeObjectURL(this.blobUrl);
			this.blobUrl = null;
		}
		if (this.ownsElement && this.element.parentNode) {
			this.element.parentNode.removeChild(this.element);
		}
		this.listeners.clear();
	}
}
