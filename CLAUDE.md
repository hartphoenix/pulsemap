## PulseMap

Open-source protocol for mapping time-based media and layering
synchronized experiences on top. This repo contains the protocol
specification (map schema), bootstrap script (map generation pipeline),
map database utilities, and the Map Editor web app.

### Repo structure

```
schema/              # TypeScript type definitions for map format
sdk/
  adapters/          # PlaybackAdapter interface + reference implementations
  editor/            # Editor integration (openEditor, editorUrl, EditorTarget)
  playback.ts        # parsePlaybackTarget (URL → PlaybackTarget)
  index.ts           # SDK entry point (re-exports)
src/
  bootstrap/         # Map generation pipeline (audio → map JSON)
    stages/          # Pipeline stage wrappers (TypeScript)
    scripts/         # Python analysis scripts (Demucs, WhisperX, etc.)
    batch.ts         # Batch pipeline runner
  db/                # SQLite map database utilities (stub)
editor/              # Standalone Map Editor (Vite + React)
  src/
    state/           # EditorState, reducer, context (undo/redo)
    github/          # OAuth device flow, PR submission, diff generation
    persistence/     # localStorage save/restore, SHA-256 hashing
    validation/      # Real-time semantic validation
    components/      # Timeline, lanes, EditPanel, SubmitFlow
    hooks/           # useTimeline, useDrag, useBeatSnap, usePlayback
maps/                # Generated map JSON files (committed for distribution)
  midi/              # Per-stem MIDI files (SHA-256 named, committed)
.claude/             # Claude Code configuration
.github/             # CI workflows (lint/test, correction provenance, Pages deploy)
```

### Tech stack

- **Runtime:** Bun (default for all scripts, tests, server)
- **Language:** TypeScript (strict mode)
- **Linting:** Biome
- **Testing:** bun:test
- **Database:** SQLite via bun:sqlite

### Commands

```bash
bun install          # Install dependencies (root)
bun test             # Run tests
bun run lint         # Lint (check only)
bun run lint:fix     # Lint and auto-fix
bun run typecheck    # TypeScript type checking
bun run bootstrap    # Generate a map from a source (single song)
bun run batch        # Run pipeline on a batch of songs from JSON
bun run inspect      # Map inspector QA tool (localhost:3333)
```

Editor (separate app):
```bash
cd editor && bun install && bun run dev    # Dev server (localhost:5173)
cd editor && bun run build                 # Production build
cd editor && bun run typecheck             # Editor type checking
```

### Python environment

The bootstrap pipeline shells out to Python scripts for ML-heavy
analysis. A `.venv/` virtual environment at the project root contains
all Python dependencies. The pipeline auto-detects it, or set
`PULSEMAP_PYTHON=.venv/bin/python` explicitly.

Required Python packages: `demucs`, `whisperx`, `basic-pitch[onnx]`,
`torchcrepe`, `librosa`, `essentia`, `numpy`, `torchcodec`, `scipy`,
`soundfile`, `audio-separator`.

Pre-download models on first setup:
```bash
source .venv/bin/activate
python -c "from demucs.pretrained import get_model; get_model('htdemucs')"
python -c "import whisperx; whisperx.load_model('base', 'cpu', compute_type='int8', language='en')"
```

The MelBand RoFormer karaoke model for vocal separation auto-downloads
on first use (~1GB). To pre-download:
```bash
python -c "from audio_separator.separator import Separator; s = Separator(); s.load_model('mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt')"
```

### Conventions

- **Workflow:** Feature branches → PR → squash merge to main.
  Never commit directly to main.
- **PRs and merges require explicit instruction.** Do not create
  PRs or merge without the user explicitly asking.
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
  timestamps from WhisperX transcription. A map can have one, both, or
  neither. Note: LRCLIB `end` timestamps on lyric lines are
  unreliable — they're always "next line start," not when the vocal
  actually ends. The `words` array is the authoritative timing source.
- Text fields (`words[].text`, `lyrics[].text`, `chords[].chord`,
  `sections[].type`) enforce `minLength: 1` — empty strings are
  rejected by the schema.
- **Edit provenance lives in git, not the map.** The map JSON is the
  recording's structural data only. To find who corrected a map, run
  `git log --follow maps/<id>.json` — every correction PR's squash
  commit carries `Pulsemap-Map-ID:`, `Pulsemap-Words-Edits:` (etc.)
  trailers written by the editor.
- Source-agnostic: same map works across YouTube, Spotify, local files
- Musical data is transposable at render time (chords as standard names,
  MIDI as pitch numbers)
- MIDI is referenced by SHA-256 content hash, not embedded. Per-stem
  MIDI (drums, bass, vocals, other, backing) stored in `maps/midi/`.
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
- **Editor module:** `sdk/editor/` exports `openEditor()` and
  `editorUrl()` for any player to direct users to the Map Editor.
  `parsePlaybackTarget()` in `sdk/playback.ts` resolves URLs to
  platform + capabilities.

Players can use SDK adapters directly, extend them, or build their
own adapter contract. Community-contributed adapters accepted via PR.

### Bootstrap pipeline

Generates maps from audio/video sources (~147s per song full,
~65s light mode on Apple Silicon). Pipeline stages:

1. **Extract audio** (yt-dlp for URLs, direct for local files)
2. **Fingerprint** (fpcalc / Chromaprint → MusicBrainz ID)
3. **Source separation** (Demucs htdemucs, MPS GPU → 4 stems:
   vocals, drums, bass, other)
4. **Polyphony detection + lead isolation** (Phase 2.5):
   - Two-gate cascade: stereo mid/side ratio → Essentia
     MultiPitchKlapuri on loudest 15s window
   - If polyphonic: MelBand RoFormer karaoke model isolates
     lead vocals from backing vocals via `audio-separator`
   - Lead → torchcrepe, backing → basic-pitch
5. **Parallel analysis:**
   - Lyrics lookup (LRCLIB / YouTube VTT) → text cleanup →
     word-level alignment (WhisperX on vocal stem) →
     lyric offset correction (sliding-window Jaccard text similarity
     between LRCLIB lines and WhisperX clusters — detects and
     corrects YouTube intro offset)
   - Audio analysis (essentia → chords, beats, key, tempo)
   - Per-stem MIDI transcription: drums (librosa), bass
     (basic-pitch + pitch bends), vocals (torchcrepe + expressive:
     pitch bends, RMS velocity, pitch-derivative segmentation),
     other (basic-pitch + pitch bends), backing (basic-pitch,
     when polyphony detected)
6. **Post-processing:**
   - Chord cleanup (filter sub-16th-note artifacts, merge dupes)
   - Beat-align MIDI (write correct tempo header)
   - Bass-chord cross-validation (informational logging)
   - Lyric gap detection (flag missing repeated sections)
   - Empty text filter (remove words/lyrics/chords with empty text)
7. **Assembly** (validate schema, write map JSON + MIDI files)

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
- `--light` — light mode (see below)

The results log (`batch-results.json`) records every song's status,
timing, error messages, and populated fields. Written after each
song for crash recovery — restart with `--skip-existing` to resume.

Input JSON format:
```json
[{ "title": "...", "artist": "...", "url": "https://youtube.com/watch?v=..." }]
```

`songs-100.json` is the default catalog: 100 popular songs for adult
instrument learners (guitar, piano, ukulele, bass), spanning 1950s–
2020s across rock, pop, folk, R&B, indie, country, and soul. Generated
2026-04-23 via web research cross-referencing "beginner guitar songs",
"easy piano songs for adults", etc. YouTube URLs point to official
channels where possible but **have not been individually verified** —
videos may be taken down or replaced. Spot-check before bulk runs.

### Light mode

`--light` produces demo-ready maps (~65s/song) with lyrics,
per-word timestamps, chords, and beats — skipping MIDI
transcription and polyphony/vocal splitting. Demucs still runs
(vocal stem needed for WhisperX).

```bash
bun run bootstrap <source> --light           # Single song
bun run batch songs.json --light --limit 10  # Batch
```

Skipped stages: polyphony detection, MelBand RoFormer lead/backing
split, all 5 MIDI transcriptions, MIDI beat alignment,
cross-validation. Light-mode maps have
`analysis.mode.tool === "light"` in provenance.

### Lyric offset correction

YouTube versions often have intro silence or different intros that
shift all LRCLIB lyrics relative to the audio. The `lyric-offset`
stage detects and corrects this using sliding-window Jaccard text
similarity between LRCLIB line text and WhisperX word clusters.

For each candidate offset (-120s to +120s, 500ms steps), it shifts
LRCLIB lines and scores how well they text-match the nearest
WhisperX cluster. Correction is applied when: the offset exceeds
2s, avg similarity at the best offset is ≥25%, and improvement
over offset=0 is ≥15 percentage points.

Runs in both full and light mode. Does not handle cases where the
YouTube version has fundamentally different content than LRCLIB
(e.g., different edits, missing intros) — those need manual
correction in the editor.

### Map Editor

Standalone Vite + React web app in `editor/` for correcting map
data. DAW-style timeline with editable lanes, YouTube playback,
and GitHub PR submission.

- **URL pattern:** `/{mapId}?t=...&lane=...&index=...`
- **Map loading:** GitHub raw content (authenticated via stored
  OAuth token for 5000 req/hr, unauthenticated fallback 60/hr)
- **Playback:** YouTubeEmbedAdapter from the SDK. Degrades
  gracefully without audio — non-timing edits always work.
- **Timeline:** Horizontal scrolling lanes (sections, lyrics,
  words, chords, beats read-only). Zoom, follow mode, virtualized
  rendering via binary search.
- **Editing:** Click to select, drag to move/resize, double-click
  for inline text edit. Beat snapping (beat/half/quarter
  subdivision, Alt to bypass). Undo/redo (Cmd-Z/Shift-Z).
  Section split/merge. Arrow key nudge.
- **State:** `EditorState` with `original`/`working` PulseMap. Edits
  mutate `working` directly. In-session undo/redo uses snapshot
  stacks of `working` (capped, in-memory only — not persisted).
  Submission semantics are derived from a structural diff between
  `original` and `working`, not from a recorded action sequence,
  so net-zero edits produce zero diff entries by definition.
  Array sort-by-`t` invariant after every mutation.
- **Persistence:** localStorage auto-save (500ms debounce), keyed
  by map ID + original hash. `beforeunload` warning when dirty.
  JSON export for backup.
- **Validation:** Real-time semantic checks (timestamps in range,
  non-overlapping sections, non-empty text, end > start, chord
  format warning). Red/amber borders on invalid events.
  Submission blocked on errors.
- **GitHub submission:** OAuth web flow. Browser redirects to GitHub
  for authorization, returns with a code, then a small Netlify
  Function (`netlify/functions/oauth-token.ts`) does the
  code-for-token exchange server-side (GitHub's token endpoint
  doesn't send CORS headers, so a direct browser exchange is
  impossible). Function reads `GITHUB_CLIENT_ID`,
  `GITHUB_CLIENT_SECRET`, and `ALLOWED_ORIGIN` from Netlify env
  vars and runs at `https://pulsemap-editor.netlify.app/oauth/token`.
  Once authed, the editor forks the repo, creates a branch, commits
  the corrected map, and opens a PR with a structured diff from
  EditAction history. PR body ends with `Pulsemap-*` git trailers
  (`Pulsemap-Map-ID:`, `Pulsemap-Words-Edits:`, etc.) — these become
  part of the squash-merge commit on `main`, so edit provenance is
  queryable via `git log` without polluting the map JSON.
- **SDK integration:** Any player calls `openEditor()` from
  `sdk/editor/` to send users here. Pulseguide has context-menu
  integration on chords, words, sections, lyrics.

### Map Inspector (legacy QA tool)

Standalone HTML timeline viewer. Being superseded by the Map Editor
for all QA and correction workflows.

```bash
bun run inspect    # serves at http://localhost:3333
```

### Design decisions

**`lyrics` and `words` as independent arrays.** Line-level lyrics
(from LRCLIB/YouTube) and per-word timestamps (from forced alignment)
are stored as separate top-level arrays, not nested. They come from
different sources at different confidence levels. A map can have one,
both, or neither. Podcasts or speech might only have `words`. A
quick LRCLIB-only map might only have `lyrics`. Players choose which
to consume. When cross-referencing between them (e.g., gap detection),
matching normalizes for punctuation, case, and minor spelling
variations.

**No MIDI quantization.** MIDI note onsets stay exactly where the
transcription tool detected them. The beat-alignment stage only
writes the correct tempo header so players/DAWs know where beats
fall. The notes are ground truth — quantizing would destroy
feel/groove and is a lossy transformation inappropriate for a
reference document.

**Tool selection rationale:**
- **lv-chordia** for chords (not Essentia): Essentia only outputs
  basic triads (C, Am, Dm). lv-chordia detects ~170 chord types
  including 7ths, sus, slash chords. Essentia retained as fallback.
- **beat_this** for beats (not Essentia): Essentia assigns downbeats
  as "every 4th beat from index 0" with no musical awareness and
  outputs a single BPM. beat_this produces musically-aware downbeats,
  handles tempo changes, and enables time signature inference.
- **torchcrepe** for vocal MIDI (not basic-pitch): Continuous pitch
  tracking captures vibrato and pitch bends. Expressive mode adds
  per-frame pitch bend messages, RMS-based velocity, and
  pitch-derivative note segmentation. basic-pitch is for polyphonic
  note detection (used on bass, other, and backing vocal stems —
  with `multiple_pitch_bends=True` for per-note pitch bends).
- **librosa** for drum MIDI (not ADTLib/madmom): ADTLib and madmom
  couldn't install (Cython/build tooling issues). librosa onset
  detection + frequency-band classification on isolated drum stem.
- **MelBand RoFormer** for lead/backing vocal separation: Best
  published quality (SDR 11.1 dB lead) via python-audio-separator.
  Only runs when the polyphony detection gate fires.
- **Claude Haiku** for word reconciliation: **Disabled.** The
  infrastructure exists (`stages/reconcile-words.ts`) but Haiku
  consistently returns zero corrections despite clear WhisperX
  errors. The chunked line-bounded prompt approach was tested but
  the model doesn't reliably identify corrections. Needs prompt
  rework or a different model before re-enabling.

### Known limitations

- **Apple Silicon MPS + float64:** WhisperX alignment runs on CPU
  (int8 compute type) because Apple's MPS GPU doesn't support float64
  operations. Alignment takes ~5-10s per song on CPU (acceptable).
- **WhisperX text accuracy on sung lyrics.** WhisperX transcribes
  what it hears, not canonical lyrics. The `words` array carries
  raw WhisperX text (no reconciliation). The `lyrics` array carries
  canonical LRCLIB text. Players should prefer `lyrics` for display
  text and `words` for timing.
- **LRCLIB validation non-determinism.** WhisperX temperature
  sampling causes inconsistent mismatch detection across runs.
- **Bass-chord concordance is low (13-42%):** The cross-validation
  between bass MIDI pitch classes and chord roots produces mostly
  noise. Likely caused by basic-pitch quality on bass frequencies
  rather than wrong chords. The stage logs results but doesn't
  modify chord data.
- **Essentia key detection unreliable:** Sometimes confuses relative
  major/minor or gets the key entirely wrong (e.g., Revolution
  detected as F# major when chords clearly indicate Bb major). Key
  is metadata only, not display-critical.
- **No automated section labeling.** The `sections` field exists
  in the schema for manual entry via the editor but is not populated
  by the pipeline.
- **Polyphony gate false positives:** Heavy reverb/delay on solo
  vocals can trigger the mid/side ratio gate. The Klapuri second
  gate catches some of these but may detect overtones as multiple
  pitches.
