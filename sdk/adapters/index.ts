export type { AdapterMatcher, PlaybackAdapter, PlaybackState } from "./types";
export { createRegistry } from "./registry";
export type { AdapterRegistry, ResolveResult } from "./registry";
export {
	parseYouTubeVideoId,
	YouTubeEmbedAdapter,
	youTubeEmbedMatcher,
} from "./youtube-embed";
export type { YouTubeEmbedOptions } from "./youtube-embed";
