# PulseMap Adapter SDK

Reference playback adapters for the PulseMap protocol. Use these to build players that consume PulseMap files.

## Quick start

```typescript
import {
  YouTubeEmbedAdapter,
  youTubeEmbedMatcher,
  createRegistry,
} from "pulsemap/sdk";

// Resolve a URL to a platform
const registry = createRegistry([youTubeEmbedMatcher]);
const result = registry.resolve("https://youtube.com/watch?v=abc123");
// { platform: "youtube", sourceId: "abc123" }

// Create an adapter
const adapter = new YouTubeEmbedAdapter({
  elementId: "player",
  videoId: result.sourceId,
});

await adapter.waitForReady();
adapter.play();

// Poll for position
setInterval(() => {
  console.log(adapter.getPosition()); // ms
}, 50);

// React to state changes
adapter.onStateChange((state) => {
  console.log(state); // "playing", "paused", "ended", etc.
});

// Check capabilities before using optional features
if (adapter.capabilities.volume) {
  adapter.setVolume(0.5); // 0-1 normalized
}
```

## PlaybackAdapter interface

Every adapter implements `PlaybackAdapter`:

| Method | Description |
|--------|-------------|
| `waitForReady()` | Resolves when the adapter can accept commands |
| `getPosition()` | Current position in milliseconds |
| `seek(ms)` | Move playhead to position |
| `play()` / `pause()` | Control playback |
| `isPlaying()` | Whether media is currently playing |
| `getState()` | Current state: `unstarted`, `playing`, `paused`, `buffering`, `ended` |
| `getPlaybackRate()` / `setPlaybackRate(rate)` | Speed control |
| `getVolume()` / `setVolume(level)` | Volume (0-1 normalized) |
| `isMuted()` / `setMuted(muted)` | Mute control |
| `onStateChange(callback)` | Subscribe to state transitions; returns unsubscribe function |
| `capabilities` | `PlaybackCapabilities` object declaring what this adapter supports |
| `destroy()` | Release all resources |

## Adapter registry

The registry resolves URLs to the platform that can handle them:

```typescript
const registry = createRegistry([youTubeEmbedMatcher]);
registry.register(myCustomMatcher); // add more at runtime

const result = registry.resolve(url);
if (result) {
  // result.platform, result.sourceId
}
```

## Building a custom adapter

Implement `PlaybackAdapter` and provide an `AdapterMatcher`:

```typescript
import type { PlaybackAdapter, AdapterMatcher } from "pulsemap/sdk";

export const myMatcher: AdapterMatcher = {
  platform: "my-platform",
  match(url: string): string | null {
    // return source ID if this URL is yours, null otherwise
  },
};

export class MyAdapter implements PlaybackAdapter {
  readonly platform = "my-platform";
  readonly capabilities = { play: true, pause: true, getPosition: true };
  // ... implement the interface
}
```

Contributions welcome — if your adapter works well, consider opening a PR to add it to the SDK.

## Available adapters

| Adapter | Platform | Environment |
|---------|----------|-------------|
| `YouTubeEmbedAdapter` | YouTube | Browser (iframe API) |
