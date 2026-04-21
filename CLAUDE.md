## PulseMap

Open-source protocol for mapping time-based media and layering
synchronized experiences on top. This repo contains the protocol
specification (map schema), bootstrap script (map generation pipeline),
and map database utilities.

### Repo structure

```
schema/              # TypeScript type definitions for map format
src/
  bootstrap/         # Map generation pipeline (audio → map JSON)
  db/                # SQLite map database utilities
.claude/             # Claude Code configuration
.github/             # CI workflows, dependabot
```

### Tech stack

- **Runtime:** Bun (default for all scripts, tests, server)
- **Language:** TypeScript (strict mode)
- **Linting:** Biome
- **Testing:** bun:test
- **Database:** SQLite via bun:sqlite

### Commands

```bash
bun install          # Install dependencies
bun test             # Run tests
bun run lint         # Lint (check only)
bun run lint:fix     # Lint and auto-fix
bun run typecheck    # TypeScript type checking
bun run bootstrap    # Generate a map from a source
```

### Conventions

- **Workflow:** Feature branches → PR → squash merge to main.
  Never commit directly to main.
- **Commits:** Meaningful messages, commit working states frequently.
- **PRs:** One logical change per PR. Keep them small and focused.
- **Tests:** Add tests when behavior matters. Use `bun:test`.
- **Timestamps:** All timestamps in milliseconds throughout the codebase.
- **Map IDs:** MusicBrainz recording IDs.
- **No audio or MIDI files committed.** Maps reference playback
  targets by URI/ID and MIDI files by content hash.

### Map schema

Maps are JSON files describing the structure of a recording:
- Required: `version`, `id` (MusicBrainz recording ID), `duration_ms`
- Optional: `fingerprint`, `metadata`, `playback`, `lyrics`, `chords`,
  `beats`, `sections`, `midi`, `analysis`
- Source-agnostic: same map works across YouTube, Spotify, local files
- Musical data is transposable at render time (chords as standard names,
  MIDI as pitch numbers)
- MIDI is referenced by SHA-256 content hash, not embedded
- Provenance for analyzed fields tracked in top-level `analysis` field
- `playback` lists known platforms with structured capability objects
- `metadata.extra` extends typed fields using MusicBrainz Picard tag keys

### Bootstrap pipeline

Generates maps from audio/video sources. Pipeline stages:
1. Audio extraction (yt-dlp for URLs, direct for local files)
2. Fingerprinting (fpcalc / Chromaprint)
3. Lyrics lookup (LRCLIB API)
4. MIDI extraction (basic-pitch)
5. Chord/beat/section analysis (essentia)
6. Map assembly and validation
