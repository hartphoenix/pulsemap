import type { PlaybackCapabilities } from "../../schema/map";
import type { AdapterMatcher, PlaybackAdapter, PlaybackState } from "./types";

declare namespace YT {
	enum PlayerState {
		UNSTARTED = -1,
		ENDED = 0,
		PLAYING = 1,
		PAUSED = 2,
		BUFFERING = 3,
		CUED = 5,
	}

	interface PlayerOptions {
		width?: number | string;
		height?: number | string;
		videoId?: string;
		playerVars?: Record<string, unknown>;
		events?: {
			onReady?: (event: { target: Player }) => void;
			onStateChange?: (event: { data: PlayerState }) => void;
			onError?: (event: { data: number }) => void;
		};
	}

	class Player {
		constructor(elementId: string | HTMLElement, options: PlayerOptions);
		playVideo(): void;
		pauseVideo(): void;
		seekTo(seconds: number, allowSeekAhead?: boolean): void;
		getCurrentTime(): number;
		getDuration(): number;
		getPlayerState(): PlayerState;
		setPlaybackRate(rate: number): void;
		getPlaybackRate(): number;
		getAvailablePlaybackRates(): number[];
		getVolume(): number;
		setVolume(volume: number): void;
		isMuted(): boolean;
		mute(): void;
		unMute(): void;
		getVideoData(): { video_id: string; title: string; author: string };
		destroy(): void;
	}
}

interface YTWindow {
	onYouTubeIframeAPIReady?: () => void;
	YT?: typeof YT;
}

let apiLoaded = false;
let apiReady = false;
const apiReadyCallbacks: (() => void)[] = [];

function ensureApi(): Promise<void> {
	if (apiReady) return Promise.resolve();
	return new Promise<void>((resolve) => {
		apiReadyCallbacks.push(resolve);
		if (apiLoaded) return;
		apiLoaded = true;
		const tag = document.createElement("script");
		tag.src = "https://www.youtube.com/iframe_api";
		document.head.appendChild(tag);
		(window as YTWindow).onYouTubeIframeAPIReady = () => {
			apiReady = true;
			for (const cb of apiReadyCallbacks) cb();
			apiReadyCallbacks.length = 0;
		};
	});
}

function ytStateToPlaybackState(state: YT.PlayerState): PlaybackState {
	switch (state) {
		case YT.PlayerState.PLAYING:
			return "playing";
		case YT.PlayerState.PAUSED:
			return "paused";
		case YT.PlayerState.BUFFERING:
			return "buffering";
		case YT.PlayerState.ENDED:
			return "ended";
		default:
			return "unstarted";
	}
}

/**
 * Extract a YouTube video ID from a URL. Returns null if the URL
 * is not a recognized YouTube format.
 */
export function parseYouTubeVideoId(url: string): string | null {
	try {
		const u = new URL(url);
		if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
		if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
	} catch {
		// not a valid URL
	}
	return null;
}

export const youTubeEmbedMatcher: AdapterMatcher = {
	platform: "youtube",
	match: parseYouTubeVideoId,
};

export interface YouTubeEmbedOptions {
	elementId: string;
	videoId: string;
	playerVars?: Record<string, unknown>;
}

const YOUTUBE_CAPABILITIES: PlaybackCapabilities = {
	play: true,
	pause: true,
	seek: true,
	setPosition: true,
	getPosition: true,
	rate: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
	volume: true,
	mute: true,
};

export class YouTubeEmbedAdapter implements PlaybackAdapter {
	readonly platform = "youtube";
	readonly capabilities: PlaybackCapabilities = YOUTUBE_CAPABILITIES;

	private player: YT.Player | null = null;
	private ready = false;
	private readyPromise: Promise<void>;
	private resolveReady!: () => void;
	private stateListeners = new Set<(state: PlaybackState) => void>();
	private currentState: PlaybackState = "unstarted";

	constructor(private options: YouTubeEmbedOptions) {
		this.readyPromise = new Promise<void>((resolve) => {
			this.resolveReady = resolve;
		});
		this.init();
	}

	private async init() {
		await ensureApi();
		this.player = new YT.Player(this.options.elementId, {
			videoId: this.options.videoId,
			playerVars: {
				autoplay: 0,
				controls: 1,
				modestbranding: 1,
				rel: 0,
				playsinline: 1,
				...this.options.playerVars,
			},
			events: {
				onReady: () => {
					this.ready = true;
					this.resolveReady();
				},
				onStateChange: (event) => {
					const newState = ytStateToPlaybackState(event.data);
					if (newState !== this.currentState) {
						this.currentState = newState;
						for (const listener of this.stateListeners) {
							listener(newState);
						}
					}
				},
			},
		});
	}

	waitForReady(): Promise<void> {
		return this.readyPromise;
	}

	getPosition(): number {
		if (!this.ready || !this.player) return 0;
		return this.player.getCurrentTime() * 1000;
	}

	seek(ms: number): void {
		if (!this.ready || !this.player) return;
		this.player.seekTo(ms / 1000, true);
	}

	play(): void {
		if (!this.ready || !this.player) return;
		this.player.playVideo();
	}

	pause(): void {
		if (!this.ready || !this.player) return;
		this.player.pauseVideo();
	}

	isPlaying(): boolean {
		if (!this.ready || !this.player) return false;
		return this.player.getPlayerState() === YT.PlayerState.PLAYING;
	}

	getState(): PlaybackState {
		return this.currentState;
	}

	getPlaybackRate(): number {
		if (!this.ready || !this.player) return 1;
		return this.player.getPlaybackRate();
	}

	setPlaybackRate(rate: number): void {
		if (!this.ready || !this.player) return;
		this.player.setPlaybackRate(rate);
	}

	getVolume(): number {
		if (!this.ready || !this.player) return 1;
		return this.player.getVolume() / 100;
	}

	setVolume(level: number): void {
		if (!this.ready || !this.player) return;
		this.player.setVolume(Math.round(level * 100));
	}

	isMuted(): boolean {
		if (!this.ready || !this.player) return false;
		return this.player.isMuted();
	}

	setMuted(muted: boolean): void {
		if (!this.ready || !this.player) return;
		if (muted) this.player.mute();
		else this.player.unMute();
	}

	onStateChange(callback: (state: PlaybackState) => void): () => void {
		this.stateListeners.add(callback);
		return () => this.stateListeners.delete(callback);
	}

	/** YouTube-specific: get the video title from the player. */
	getVideoTitle(): string {
		if (!this.ready || !this.player) return "";
		return this.player.getVideoData().title;
	}

	destroy(): void {
		this.player?.destroy();
		this.player = null;
		this.ready = false;
		this.stateListeners.clear();
	}
}
