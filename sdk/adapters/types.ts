import type { PlaybackCapabilities } from "../../schema/map";

/**
 * Playback states an adapter can report.
 *
 * "unstarted" is the initial state before any media has played.
 * "ended" means playback reached the end of the media.
 * "buffering" means the adapter is loading data and cannot
 * report a reliable position.
 */
export type PlaybackState = "unstarted" | "playing" | "paused" | "buffering" | "ended";

/**
 * Common interface for controlling playback across platforms.
 *
 * The protocol defines PlaybackCapabilities as a catalog of what
 * platforms can do. This interface is the SDK's implementation of
 * that catalog — a common surface that players can program against
 * without knowing which platform is underneath.
 *
 * Not every adapter supports every method. Check `capabilities`
 * before calling optional methods (volume, mute, rate). Methods
 * for unsupported capabilities are safe to call but will no-op.
 *
 * Volume is normalized to 0–1. Adapters convert to/from the
 * platform's native range internally.
 */
export interface PlaybackAdapter {
	readonly platform: string;
	readonly capabilities: PlaybackCapabilities;

	/** Resolves when the adapter is ready to accept commands. */
	waitForReady(): Promise<void>;

	/** Current playback position in milliseconds. */
	getPosition(): number;

	/** Move the playhead to the given position in milliseconds. */
	seek(ms: number): void;

	play(): void;
	pause(): void;
	isPlaying(): boolean;
	getState(): PlaybackState;

	getPlaybackRate(): number;
	setPlaybackRate(rate: number): void;

	/** Volume as a float from 0 (silent) to 1 (max). */
	getVolume(): number;

	/** Set volume as a float from 0 (silent) to 1 (max). */
	setVolume(level: number): void;

	isMuted(): boolean;
	setMuted(muted: boolean): void;

	/**
	 * Subscribe to playback state changes. Returns an unsubscribe
	 * function. Listeners fire on discrete transitions (play, pause,
	 * ended, buffering), not on every position tick.
	 */
	onStateChange(callback: (state: PlaybackState) => void): () => void;

	/** Release all resources. The adapter is unusable after this. */
	destroy(): void;
}

/**
 * A function that checks whether a URL belongs to a given platform
 * and extracts the platform-specific ID if so. Used by the adapter
 * registry to resolve URLs to the correct adapter before
 * construction.
 */
export interface AdapterMatcher {
	readonly platform: string;
	match(url: string): string | null;
}
