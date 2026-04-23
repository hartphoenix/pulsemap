## PulseMap

Open-source protocol for mapping time-based media and layering
synchronized experiences on top. This repo contains the protocol
specification (map schema), bootstrap script (map generation pipeline),
and map database utilities.

### Repo structure

```
schema/              # TypeScript type definitions for map format
sdk/
  adapters/          # PlaybackAdapter interface + reference implementations
sdk/index.ts         # SDK entry point (re-exports)
src/
  bootstrap/         # Map generation pipeline (audio → map JSON)
    stages/          # Pipeline stage wrappers (TypeScript)
    scripts/         # Python analysis scripts (Demucs, stable-ts, etc.)
    batch.ts         # Batch pipeline runner
  db/                # SQLite map database utilities (stub)
maps/                # Generated map JSON files (committed for distribution)
  midi/              # Per-stem MIDI files (SHA-256 named, committed)
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
bun run bootstrap    # Generate a map from a source (single song)
bun run batch        # Run pipeline on a batch of songs from JSON
```

### Python environment

The bootstrap pipeline shells out to Python scripts for ML-heavy
analysis. A `.venv/` virtual environment at the project root contains
all Python dependencies. The pipeline auto-detects it, or set
`PULSEMAP_PYTHON=.venv/bin/python` explicitly.

Required Python packages: `demucs`, `stable-ts`, `basic-pitch[onnx]`,
`torchcrepe`, `librosa`, `essentia`, `numpy`, `torchcodec`.

Pre-download models on first setup:
```bash
source .venv/bin/activate
python -c "from demucs.pretrained import get_model; get_model('htdemucs')"
python -c "import whisper; whisper.load_model('base')"
```

### Conventions

- **Workflow:** Feature branches → PR → squash merge to main.
  Never commit directly to main.
- **Commits:** Meaningful messages, commit working states frequently.
- **PRs:** One logical change per PR. Keep them small and focused.
- **Tests:** Add tests when behavior matters. Use `bun:test`.
- **Timestamps:** All timestamps in milliseconds throughout the codebase.
- **Map IDs:** MusicBrainz recording IDs.
- **No audio files committed.** Maps reference playback targets
  by URI/ID. MIDI files are committed to `maps/midi/` for
  distribution, named by SHA-256 content hash.

### Map schema

Maps are JSON files describing the structure of a recording:
- Required: `version`, `id` (MusicBrainz recording ID), `duration_ms`
- Optional: `fingerprint`, `metadata`, `playback`, `lyrics`, `words`,
  `chords`, `beats`, `sections`, `midi`, `analysis`
- `lyrics` and `words` are independent peer arrays (Model C). `lyrics`
  has line-level text from lyric databases. `words` has per-word
  timestamps from forced alignment. A map can have one, both, or neither.
- Source-agnostic: same map works across YouTube, Spotify, local files
- Musical data is transposable at render time (chords as standard names,
  MIDI as pitch numbers)
- MIDI is referenced by SHA-256 content hash, not embedded. Per-stem
  MIDI (drums, bass, vocals, other) stored in `maps/midi/`.
- Provenance for analyzed fields tracked in top-level `analysis` field
- `playback` lists known platforms with structured capability objects.
  `restrictions` (e.g., `mobile_embed: false`) flags platform limits.
- `metadata.extra` extends typed fields using MusicBrainz Picard tag keys

### Adapter SDK

Reference playback adapters for common platforms. Any player can
import these directly. The protocol defines `PlaybackCapabilities`
as a catalog of what platforms can do; the SDK provides ready-to-use
implementations.

- **Interface:** `PlaybackAdapter` in `sdk/adapters/types.ts`
- **Registry:** `createRegistry()` resolves URLs to platform + source ID
- **Adapters:** `YouTubeEmbedAdapter` (iframe API, web + iPad)
- **Volume:** Normalized 0–1 across all adapters
- **State events:** `onStateChange()` for discrete transitions;
  `getPosition()` for polling
- **Capabilities:** Each adapter exposes a `capabilities` object
  matching `PlaybackCapabilities` from the schema

Players can use SDK adapters directly, extend them, or build their
own adapter contract. Community-contributed adapters accepted via PR.

### Bootstrap pipeline

Generates maps from audio/video sources (~47s per song on Apple
Silicon). Pipeline stages:

1. **Extract audio** (yt-dlp for URLs, direct for local files)
2. **Fingerprint** (fpcalc / Chromaprint → MusicBrainz ID)
3. **Source separation** (Demucs htdemucs, MPS GPU → 4 stems:
   vocals, drums, bass, other)
4. **Parallel analysis:**
   - Lyrics lookup (LRCLIB / YouTube VTT) → text cleanup →
     word-level alignment (stable-ts on vocal stem)
   - Audio analysis (essentia → chords, beats, sections, key, tempo)
   - Per-stem MIDI transcription: drums (librosa), bass
     (basic-pitch), vocals (torchcrepe), other (basic-pitch)
5. **Post-processing:**
   - Chord cleanup (filter sub-16th-note artifacts, merge dupes)
   - Beat-align MIDI (write correct tempo header)
   - Bass-chord cross-validation (informational logging)
   - Lyric gap detection (flag missing repeated sections)
6. **Assembly** (validate schema, write map JSON + MIDI files)

### Batch pipeline

Runs the bootstrap pipeline on a list of songs from a JSON file.

```bash
PULSEMAP_PYTHON=.venv/bin/python bun run batch songs.json [options]
```

Options:
- `--skip-existing` — skip songs already successfully mapped
- `--start N` — resume from song N (0-indexed)
- `--limit N` — process at most N songs
- `--log path` — results log path (default: `batch-results.json`)
- `--concurrency N` — parallel pipelines (default: 1, GPU-bound)

The results log (`batch-results.json`) records every song's status,
timing, error messages, and populated fields. Written after each
song for crash recovery — restart with `--skip-existing` to resume.

Input JSON format:
```json
[{ "title": "...", "artist": "...", "url": "https://youtube.com/watch?v=..." }]
```
