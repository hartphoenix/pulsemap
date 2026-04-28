import type { PulseMap } from "pulsemap/schema";
import type { PlaybackState } from "pulsemap/sdk/adapters/types";
import { YouTubeEmbedAdapter, parseYouTubeVideoId } from "pulsemap/sdk/adapters/youtube";
import { useCallback, useEffect, useRef, useState } from "react";

const CONTAINER_ID = "pulsemap-yt-player";

interface UsePlaybackResult {
	/** ID for the container div that the YouTube iframe mounts into */
	containerId: string;
	play: () => void;
	pause: () => void;
	seek: (ms: number) => void;
	setRate: (rate: number) => void;
	/** Whether a YouTube playback target was found */
	playbackAvailable: boolean;
	/** Whether currently playing */
	playing: boolean;
	/** Current position in ms */
	position: number;
}

function findYouTubeVideoId(map: PulseMap): string | null {
	if (!map.playback) return null;
	for (const target of map.playback) {
		if (!target.platform.includes("youtube")) continue;
		// Try the id field first, then parse from uri
		if (target.id) return target.id;
		if (target.uri) {
			const parsed = parseYouTubeVideoId(target.uri);
			if (parsed) return parsed;
		}
	}
	return null;
}

export function usePlayback(map: PulseMap | null): UsePlaybackResult {
	const adapterRef = useRef<YouTubeEmbedAdapter | null>(null);
	const rafRef = useRef<number>(0);
	const [playing, setPlaying] = useState(false);
	const [position, setPosition] = useState(0);
	const [playbackAvailable, setPlaybackAvailable] = useState(false);

	const videoId = map ? findYouTubeVideoId(map) : null;

	useEffect(() => {
		// Clean up previous adapter
		if (adapterRef.current) {
			cancelAnimationFrame(rafRef.current);
			adapterRef.current.destroy();
			adapterRef.current = null;
		}

		if (!videoId) {
			setPlaybackAvailable(false);
			setPlaying(false);
			setPosition(0);
			return;
		}

		// Make sure the container element exists before creating the adapter
		const container = document.getElementById(CONTAINER_ID);
		if (!container) {
			setPlaybackAvailable(false);
			return;
		}

		const adapter = new YouTubeEmbedAdapter({
			elementId: CONTAINER_ID,
			videoId,
		});
		adapterRef.current = adapter;
		setPlaybackAvailable(true);

		const unsubscribe = adapter.onStateChange((state: PlaybackState) => {
			setPlaying(state === "playing");
		});

		// Position polling loop
		function tick() {
			if (adapterRef.current) {
				setPosition(adapterRef.current.getPosition());
			}
			rafRef.current = requestAnimationFrame(tick);
		}
		rafRef.current = requestAnimationFrame(tick);

		return () => {
			unsubscribe();
			cancelAnimationFrame(rafRef.current);
			adapter.destroy();
			adapterRef.current = null;
		};
	}, [videoId]);

	const play = useCallback(() => adapterRef.current?.play(), []);
	const pause = useCallback(() => adapterRef.current?.pause(), []);
	const seek = useCallback((ms: number) => adapterRef.current?.seek(ms), []);
	const setRate = useCallback((rate: number) => adapterRef.current?.setPlaybackRate(rate), []);

	return {
		containerId: CONTAINER_ID,
		play,
		pause,
		seek,
		setRate,
		playbackAvailable,
		playing,
		position,
	};
}
