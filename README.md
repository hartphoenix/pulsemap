<p align="center">
  <img src="docs/badges/pulsemap-logo.png" alt="PulseMap" width="360">
</p>

# PulseMap

**An open-source protocol for mapping time-based media and layering synchronized experiences on top.**

`alpha` · `v0.1.0` · `MIT`

A **map** describes the inherent structure of a recording — chords, lyrics, words, beats, sections, tempo, key, fingerprint, MIDI references. It's source-agnostic: the same map works whether you're playing from YouTube, Spotify, a local audio file, or live audio.

A **journey** is a path through that map with synchronized events — lessons, audio overdubs, annotations, lighting cues, anything. Journeys reference maps but never modify them. *One recording, one map, unlimited journeys.* PulseMap defines maps and ships a suggested journey reference shape; everything layered on top is open territory.

The schema, the SDK, the bootstrap pipeline, the deployed Map Editor, and the 100+ map dataset are all in this repo. The companion player [PulseGuide](https://hartphoenix.github.io/pulseguide/) is a separate repo that uses PulseMap as a dependency and demonstrates the full protocol in action.

## See it running

![PulseGuide playing a song — chord chart over synced lyrics](docs/screenshots/pulseguide-leadsheet.png)

| | |
|---|---|
| **PulseGuide** (live demo player) | <https://hartphoenix.github.io/pulseguide/> |
| **Map Editor** (correct any map) | <https://hartphoenix.github.io/pulsemap/editor/17416564-fb6e-471c-a4ad-0bfc45292cd9> |
| **Maps catalog** (100+ maps, JSON) | <https://hartphoenix.github.io/pulsemap/maps/manifest.json> |

## What a map looks like

```jsonc
{
  "version": "0.1.0",
  "id": "0cdc9b5b-b16b-4ff1-9f16-5b4ba76f1c17",   // MusicBrainz recording ID
  "duration_ms": 243030,
  "metadata": {
    "title": "Let It Be",
    "artist": "The Beatles",
    "key": "C major",
    "tempo": 69.8,
    "time_signature": "4/4"
  },
  "playback": [{
    "platform": "youtube",
    "uri": "https://www.youtube.com/watch?v=QDYfEBY9NM4",
    "id": "QDYfEBY9NM4",
    "capabilities": { "play": true, "pause": true, "seek": true, "volume": true, "mute": true }
  }],
  "lyrics":  [{ "t": 12670, "end": 17170, "text": "When I find myself in times of trouble" }],
  "words":   [{ "t": 12670, "end": 12880, "text": "When" }],
  "chords":  [{ "t":    20, "end":  1700, "chord": "C" }],
  "beats":   [{ "t":    40, "downbeat": true, "bpm": 72.3, "time_sig": "4/4" }],
  "sections": [],
  "midi": []
}
```

All timestamps are milliseconds. Musical data is transposable at render time. Per-field provenance lives in a top-level `analysis` field. Per-stem MIDI (drums, bass, vocals, other, backing) is referenced by SHA-256 content hash, not embedded. Full type definitions in [`schema/map.ts`](./schema/map.ts).

## Use it from your code

Install via the GitHub URL — npm publish is on the roadmap:

```jsonc
// package.json
{
  "dependencies": {
    "pulsemap": "github:hartphoenix/pulsemap"
  }
}
```

```ts
import { YouTubeEmbedAdapter, createRegistry, youTubeEmbedMatcher } from "pulsemap/sdk";
import type { PulseMap } from "pulsemap/schema";

const registry = createRegistry([youTubeEmbedMatcher]);
const { sourceId } = registry.resolve(map.playback[0].uri)!;

const adapter = new YouTubeEmbedAdapter({ elementId: "player", videoId: sourceId });
await adapter.waitForReady();
adapter.play();

adapter.onStateChange(state => console.log(state));   // "playing" | "paused" | "ended" | ...
setInterval(() => render(map, adapter.getPosition()), 50);
```

Adapters declare what they can do via a `PlaybackCapabilities` object — feature-detect before calling optional methods like `setPlaybackRate` or `setVolume`.

See [`sdk/README.md`](./sdk/README.md) for the full SDK reference and [`sdk/ADAPTERS.md`](./sdk/ADAPTERS.md) for building your own adapter.

## Adapter catalog

| Adapter | Platform | Status |
|---|---|---|
| `YouTubeEmbedAdapter` | YouTube | shipped |
| `HtmlAudioAdapter` | `<audio>` element (URL, Blob, File) | next |
| `WebAudioAdapter` | `AudioContext` graph | [good first issue](https://github.com/hartphoenix/pulsemap/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) |
| Spotify | Spotify Web Playback | open invitation |
| SoundCloud | Widget API | open invitation |
| Apple Music | MusicKit JS | open invitation |
| Bandcamp | embed | open invitation |
| HLS / DASH | Shaka Player | open invitation |

The adapter contract is small, public, and unowned. Build whatever adapters your app needs in your own repo, on your own terms — contribution back upstream is optional and appreciated.

## Repo structure

```
schema/              TypeScript types for the map format (and the suggested journey shape)
sdk/
  adapters/          PlaybackAdapter interface + reference adapters
  editor/            openEditor() / editorUrl() — link any player to the hosted editor
  playback.ts        parsePlaybackTarget(url) — URL → PlaybackTarget
  README.md          SDK reference
  ADAPTERS.md        How to build an adapter
src/
  bootstrap/         Map generation pipeline (audio → map JSON)
  db/                SQLite map database utilities
editor/              Standalone Map Editor (Vite + React) — deployed to GitHub Pages
maps/                Generated map JSON files (committed for distribution)
docs/proposals/      RFCs for protocol extensions
.github/             CI workflows + issue/PR templates
```

## Contribute

| Want to … | Where to go |
|---|---|
| Fix a chord, lyric, or timing in a map | Use the **[Map Editor](https://hartphoenix.github.io/pulsemap/editor/)** — it generates a PR with the right provenance. **Map corrections do not go through issues.** |
| Build an adapter for a platform | Read [`sdk/ADAPTERS.md`](./sdk/ADAPTERS.md), then file an [Adapter proposal](https://github.com/hartphoenix/pulsemap/issues/new?template=adapter-proposal.yml) issue |
| Report a bug or propose a change | Open an [issue](https://github.com/hartphoenix/pulsemap/issues/new/choose) |
| Hack on the schema, SDK, pipeline, or editor | Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) |

## Status

PulseMap is alpha. The map schema is stable in shape but not in semver — breaking changes are possible until `v1.0`. Versioning is unified: the package version *is* the schema version (see [`schema/VERSIONING.md`](./schema/VERSIONING.md)). Journeys are an open layer on top — the [`schema/journey.ts`](./schema/journey.ts) reference shape is a suggestion, not a controlled spec.

The flagship open problem is **windowed-fingerprint partial-audio recognition** — see [`docs/proposals/0001-windowed-fingerprints.md`](./docs/proposals/0001-windowed-fingerprints.md). If you've worked on audio fingerprinting, ANN search, or indexing, that proposal is where to start the conversation.

## Powered by PulseMap

Building on PulseMap? Drop a badge on your project's README, site, or pitch deck. Pick whichever fits the surrounding design — full kit (the four variants below plus a 2×2 contact sheet) lives in [`docs/badges/`](./docs/badges/).

<table>
  <tr>
    <td><a href="./docs/badges/"><img src="docs/badges/powered-by-pulsemap-dark-glass.png" alt="powered by PulseMap — dark glass" width="320"></a></td>
    <td><a href="./docs/badges/"><img src="docs/badges/powered-by-pulsemap-dark-metal.png" alt="powered by PulseMap — dark metal" width="320"></a></td>
  </tr>
  <tr>
    <td><a href="./docs/badges/"><img src="docs/badges/powered-by-pulsemap-dark-blue.png" alt="powered by PulseMap — dark blue" width="320"></a></td>
    <td><a href="./docs/badges/"><img src="docs/badges/powered-by-pulsemap-white.png" alt="powered by PulseMap — white" width="320"></a></td>
  </tr>
</table>

## License

MIT
