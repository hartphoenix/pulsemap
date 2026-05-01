# PulseMap Adapter SDK

Reference playback adapters for the PulseMap protocol. Use these to build players that consume PulseMap files, or implement your own.

## Why this exists

Every player that wants to consume PulseMap data needs to control playback on *some* underlying media source — YouTube, Spotify, an `<audio>` element, a Web Audio graph, a DAW host. The protocol defines [`PlaybackCapabilities`](../schema/map.ts) as a *catalog* of what platforms can do (play, pause, seek, rate, volume, mute). The SDK ships an implementation of that catalog: the `PlaybackAdapter` interface and a few reference adapters.

Programming against `PlaybackAdapter` instead of the platform's native API means the rest of your app — sync engine, lead sheet rendering, lyric highlighting, recording, corrections — does not need to know whether the source is YouTube or local audio. You swap adapters; everything downstream just works.

The adapter contract is small, public, and unowned. Build whatever adapters your app needs in your own repo, on your own terms. If you want to contribute one back upstream the handshake is documented in [`ADAPTERS.md`](./ADAPTERS.md), but that's optional.

## Used in

- [PulseGuide](https://hartphoenix.github.io/pulseguide/) ([repo](https://github.com/hartphoenix/pulseguide)) — synced lead-sheet player. Imports the SDK directly via `pulsemap/sdk`.

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

Implement `PlaybackAdapter` and (optionally) provide an `AdapterMatcher`:

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

Full walk-through: [`ADAPTERS.md`](./ADAPTERS.md) — anatomy of a 50-line adapter, capability declaration, testing patterns, and the optional handshake for upstreaming.

## Available adapters

| Adapter | Platform | Environment |
|---------|----------|-------------|
| `YouTubeEmbedAdapter` | YouTube | Browser (iframe API) |
| `HtmlAudioAdapter` | `<audio>` element (URL, Blob, File) | Browser |

## Wanted — open invitations

Each row links to the [adapter-proposal issue template](https://github.com/hartphoenix/pulsemap/issues/new?template=adapter-proposal.yml). If you're already building one for your own app, you don't need to file an issue first — feel free to ship it as a PR directly.

| Adapter | Platform |
|---|---|
| `WebAudioAdapter` | `AudioContext` graph + analyzer |
| `SpotifyAdapter` | Spotify Web Playback (premium) |
| `SoundCloudAdapter` | SoundCloud Widget API |
| `AppleMusicAdapter` | MusicKit JS |
| `BandcampAdapter` | Bandcamp embed |
| `HlsAdapter` / `DashAdapter` | Shaka Player (live and pre-recorded streams) |
| Native DAW bridge | OSC / MIDI / WebSocket to a host (Ableton, Reaper, Logic) |
