import type { AdapterMatcher } from "./types";

/**
 * Resolves a URL to the platform and source ID that can handle it.
 * Returns null if no registered matcher recognizes the URL.
 *
 * Usage:
 *   const registry = createRegistry([youTubeEmbedMatcher]);
 *   const result = registry.resolve("https://youtube.com/watch?v=abc");
 *   // { platform: "youtube", sourceId: "abc" }
 */
export interface ResolveResult {
	platform: string;
	sourceId: string;
}

export interface AdapterRegistry {
	resolve(url: string): ResolveResult | null;
	register(matcher: AdapterMatcher): void;
}

export function createRegistry(matchers: AdapterMatcher[] = []): AdapterRegistry {
	const registered = [...matchers];

	return {
		resolve(url: string): ResolveResult | null {
			for (const matcher of registered) {
				const sourceId = matcher.match(url);
				if (sourceId !== null) {
					return { platform: matcher.platform, sourceId };
				}
			}
			return null;
		},

		register(matcher: AdapterMatcher) {
			registered.push(matcher);
		},
	};
}
