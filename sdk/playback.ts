import type { PlaybackTarget } from "../schema/map";

export function parsePlaybackTarget(url: string): PlaybackTarget | undefined {
	try {
		const parsed = new URL(url);

		if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
			const videoId = parsed.hostname.includes("youtu.be")
				? parsed.pathname.slice(1)
				: parsed.searchParams.get("v");

			return {
				platform: "youtube",
				uri: url,
				id: videoId || undefined,
				capabilities: {
					play: true,
					pause: true,
					seek: true,
					setPosition: true,
					getPosition: true,
					rate: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
					volume: true,
					mute: true,
				},
			};
		}

		if (parsed.hostname.includes("spotify.com")) {
			const trackMatch = parsed.pathname.match(/track\/(\w+)/);
			return {
				platform: "spotify",
				uri: url,
				id: trackMatch?.[1],
				capabilities: {
					play: true,
					pause: true,
					seek: true,
					setPosition: true,
					getPosition: true,
					volume: true,
				},
			};
		}

		return {
			platform: parsed.hostname,
			uri: url,
			capabilities: {},
		};
	} catch {
		return undefined;
	}
}
