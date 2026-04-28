export type { AdapterRegistry, ResolveResult } from "./registry";
export { createRegistry } from "./registry";
export type { AdapterMatcher, PlaybackAdapter, PlaybackState } from "./types";
export type { YouTubeEmbedOptions } from "./youtube-embed";
export {
	parseYouTubeVideoId,
	YouTubeEmbedAdapter,
	youTubeEmbedMatcher,
} from "./youtube-embed";
