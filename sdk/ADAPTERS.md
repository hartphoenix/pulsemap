# Building adapters for PulseMap

This document exists to **enable**, not gatekeep.

The adapter contract is small, public, and unowned. Build whatever adapters your app needs, in whatever repo, on whatever timeline, with whatever capabilities make sense for your use case. PulseMap will not break your adapter — it does not own your adapter.

If you ever want to contribute one back upstream, the [last section](#contributing-back-upstream-optional) describes the handshake that makes it easy. That contribution is fully optional and genuinely appreciated, but it is not a precondition for using the protocol.

## What an adapter is

An adapter is a small class that wraps a media-playback primitive (a YouTube iframe, an HTML `<audio>` element, a Web Audio graph, a remote DAW host, anything) and exposes the same `PlaybackAdapter` interface so the rest of your app — sync engine, lead-sheet rendering, lyric highlighting, recording, corrections — does not need to know what's underneath.

```ts
export interface PlaybackAdapter {
  readonly platform: string;
  readonly capabilities: PlaybackCapabilities;

  waitForReady(): Promise<void>;
  getPosition(): number;        // milliseconds
  seek(ms: number): void;
  play(): void;
  pause(): void;
  isPlaying(): boolean;
  getState(): PlaybackState;    // "unstarted" | "playing" | "paused" | "buffering" | "ended"

  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
  getVolume(): number;          // 0–1 normalized
  setVolume(level: number): void;
  isMuted(): boolean;
  setMuted(muted: boolean): void;

  onStateChange(cb: (state: PlaybackState) => void): () => void;   // returns unsubscribe
  destroy(): void;
}
```

Full type definitions: [`sdk/adapters/types.ts`](./adapters/types.ts).

## Capability declaration

[`PlaybackCapabilities`](../schema/map.ts) is a *catalog* of what platforms can do. Each adapter declares what it supports so consumers can feature-detect:

```ts
const YOUTUBE_CAPABILITIES: PlaybackCapabilities = {
  play: true,
  pause: true,
  seek: true,
  setPosition: true,
  getPosition: true,
  rate: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],   // discrete options
  volume: true,
  mute: true,
};

const HTML_AUDIO_CAPABILITIES: PlaybackCapabilities = {
  play: true,
  pause: true,
  seek: true,
  setPosition: true,
  getPosition: true,
  rate: "continuous",        // any positive number
  volume: true,
  mute: true,
};
```

Methods for unsupported capabilities are safe to call but should no-op. Consumers check `adapter.capabilities.<feature>` before using optional features.

## Build one for your own use, today

Reference adapters in [`sdk/adapters/`](./adapters/) — copy one as a starting point. The two reference implementations (`YouTubeEmbedAdapter` and `HtmlAudioAdapter`) cover the two most common shapes: an iframe-with-message-bus platform and a direct DOM media element.

The minimum viable adapter is around 50 lines of mostly-mechanical code:

```ts
import type { PlaybackAdapter, AdapterMatcher, PlaybackState } from "pulsemap/sdk";
import type { PlaybackCapabilities } from "pulsemap/schema";

export const myMatcher: AdapterMatcher = {
  platform: "my-platform",
  match(url: string): string | null {
    // Return a stable source ID if this URL belongs to your platform, else null.
    // Used by the registry to route URLs to the right adapter.
    return null;
  },
};

const CAPABILITIES: PlaybackCapabilities = {
  play: true,
  pause: true,
  seek: true,
  getPosition: true,
};

export class MyAdapter implements PlaybackAdapter {
  readonly platform = "my-platform";
  readonly capabilities = CAPABILITIES;

  private listeners = new Set<(s: PlaybackState) => void>();
  private state: PlaybackState = "unstarted";
  private readyPromise: Promise<void>;

  constructor(/* whatever your platform needs */) {
    this.readyPromise = this.init();
  }

  private async init() { /* boot the platform, set up event listeners */ }

  waitForReady() { return this.readyPromise; }
  getPosition() { /* return ms */ return 0; }
  seek(ms: number) { /* ... */ }
  play() { /* ... */ }
  pause() { /* ... */ }
  isPlaying() { return this.state === "playing"; }
  getState() { return this.state; }

  // Optional methods — implement what your platform supports; no-op the rest.
  getPlaybackRate() { return 1; }
  setPlaybackRate(_rate: number) {}
  getVolume() { return 1; }
  setVolume(_level: number) {}
  isMuted() { return false; }
  setMuted(_muted: boolean) {}

  onStateChange(cb: (s: PlaybackState) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(state: PlaybackState) {
    this.state = state;
    for (const l of this.listeners) l(state);
  }

  destroy() { this.listeners.clear(); /* release platform resources */ }
}
```

That's the whole shape.

## Matchers and the registry

Matchers are *optional*. They exist for apps that want URL → adapter routing — give the registry a list of URLs, get back the right platform and source ID:

```ts
import { createRegistry, youTubeEmbedMatcher } from "pulsemap/sdk";

const registry = createRegistry([youTubeEmbedMatcher, myMatcher]);
const result = registry.resolve("https://example.com/track/123");
// { platform: "my-platform", sourceId: "123" }   or null
```

Many adapters don't need a matcher — if your app constructs the adapter directly (e.g. you always know it's HtmlAudio because the user uploaded a file), skip the matcher entirely.

## Testing your adapter

The simplest path is unit-testing the matcher (no DOM needed) and integration-testing the adapter with `happy-dom` or a similar lightweight DOM shim. See [`test/adapters/`](../test/adapters/) for examples.

For consumers writing tests against *their own* code that uses the SDK, a `MockAdapter` (in-memory clock, no DOM) would be useful. That's filed as a [good first issue](https://github.com/hartphoenix/pulsemap/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22+mock) — feel free to take it.

## Contributing back upstream (optional)

If you've built an adapter that's broadly useful, here's the handshake:

1. **Open an [adapter proposal](https://github.com/hartphoenix/pulsemap/issues/new?template=adapter-proposal.yml) issue** so we can align on naming, capability matrix, and any platform-specific quirks. (Skip this step if your adapter is small and uncontroversial — go straight to a PR.)
2. **Open a PR** that includes:
   - The adapter file in `sdk/adapters/<platform>.ts`
   - A matcher (if one makes sense for your platform)
   - Exports in `sdk/adapters/index.ts` and `sdk/index.ts`
   - Tests in `test/adapters/<platform>.test.ts`
   - A row in the `sdk/README.md` adapters table
3. **Capability matrix should be honest** — declare only what your adapter actually supports. Methods for unsupported capabilities should no-op, not throw.
4. **No hidden platform escape hatches** unless documented. If your adapter exposes platform-specific methods (e.g. `getElement()` on `HtmlAudioAdapter`), document why and what consumers can do with them.

That's it. No CLA, no formal contributor agreement — just the MIT license you're already under by submitting.
