# PulseMap

An open-source protocol for mapping time-based media and layering synchronized experiences on top.

## What is PulseMap?

A **map** describes the inherent structure of a song or recording — chords, lyrics, beats, sections, tempo, fingerprint. It's source-agnostic: the same map works whether you're playing from YouTube, Spotify, a local file, or live audio.

A **journey** describes a path through that map with synchronized events — lessons, visualizations, annotations, lighting cues, anything. Journeys reference maps but never modify them. One recording, one map, unlimited journeys.

## Protocol

Maps and journeys are JSON files. See [`schema/`](./schema/) for the format specification.

### Map (required fields)

```json
{
  "version": "0.1",
  "id": "<MusicBrainz recording ID>",
  "duration_ms": 234000
}
```

Optional fields: `fingerprint`, `metadata`, `playback`, `lyrics`, `chords`, `beats`, `sections`, `midi`, `analysis`.

All timestamps are in milliseconds. Musical data is transposable at render time. Provenance for analyzed fields is tracked in `analysis`.

### Bootstrap

The bootstrap script generates maps from audio or video sources:

```bash
bun run bootstrap -- --url "https://youtube.com/watch?v=..."
```

Pipeline: audio → fpcalc (fingerprint) → LRCLIB (lyrics) → basic-pitch (MIDI) → essentia (chords, beats, sections) → map JSON.

## Development

```bash
bun install
bun test
bun run lint
bun run typecheck
```

## License

MIT
