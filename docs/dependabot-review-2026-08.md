# Dependabot security review — 2026-08

45 open Dependabot alerts on `main` as of 2026-08-12 (24 high, 15 moderate,
6 low), all in the Python ML pipeline (`requirements.txt`) — zero touch the
TypeScript/Bun side (`package.json`/`bun.lock`).

## Status

**Done:** 39/45 alerts (20 of 24 highs) closed by batch-bumping 8 transitive
packages — see `security/dependabot-batch-bump-2026-08` branch / PR.
aiohttp, Pillow, nltk, urllib3, soupsieve, idna, Mako, msgpack. All
patch/minor bumps, none imported directly by pipeline code, verified
import-clean including downstream consumers (demucs, audio_separator,
basic_pitch, whisperx).

**Open — needs a decision, not a mechanical fix:**

## 1. torch 2.8.0 → 2.13.0

- **Direct dependency**, pinned in `requirements.in`. `torchaudio` must move
  in lockstep (currently `==2.8.0`).
- Fixes 1 moderate + 2 low CVEs.
- 5 minor versions is exactly the kind of jump that can shift Apple Silicon
  MPS kernel behavior — this repo already has a documented MPS limitation
  (`README`/`CLAUDE.md`: WhisperX alignment forced to CPU because MPS
  doesn't support float64). torchcrepe, demucs, basic-pitch, essentia, and
  coremltools all sit downstream of torch's ABI and would need re-verifying.

**Options:**

| Option | Effort | Risk | Outcome |
|---|---|---|---|
| A. Bump straight to 2.13.0, re-run the full pipeline on one song end-to-end | Medium (one real pipeline run, ~2-3 min) | Catches MPS regressions before they ship, but a regression means debugging which of 5 stages is affected | All 3 CVEs fixed |
| B. Step through intermediate torch releases to isolate what (if anything) breaks | High | Lowest risk of an untraceable regression | All 3 CVEs fixed, more confidence in *why* |
| C. Land on torch 2.9.1 or 2.10.0 now, defer the last hop | Low | Residual exposure is 1 low-severity CVE | 2 of 3 CVEs fixed today |

No recommendation baked in — this is a local dev/inference pipeline, not a
production service, so the cost of a subtle MPS regression (debugging time)
has to be weighed against the cost of carrying 1 low-severity CVE a while
longer. Whoever picks this up should re-run a real song through
`bun run bootstrap <source> --light` after whichever option is chosen and
confirm MIDI/timing output looks sane before merging.

## 2. transformers 4.57.6 → 5.5.0

- **Transitive**, pulled in by `whisperx`. Not directly imported by pipeline
  code.
- Fixes 1 moderate + 2 (of the "high" bucket's remainder).
- v4→v5 is transformers' own major-version line — historically includes API
  removals (generation config defaults, tokenizer behavior changes).

**Options:**

| Option | Effort | Risk | Outcome |
|---|---|---|---|
| A. Wait for whisperx to declare v5 support and pull it in via a routine `pip install --upgrade whisperx` | Low | Lowest — whisperx's own maintainers do the compatibility work | Unblocks naturally, timeline unknown |
| B. Force the pin now (`pip install transformers==5.5.0`) and manually verify WhisperX's model-loading + transcription path still works | Medium | Real risk of an unsupported dependency combination if whisperx pins `transformers<5` internally | Unblocks now if it works |

**First step for whoever picks this up:** check whether `whisperx`'s own
`setup.py`/`pyproject.toml` caps `transformers<5` — if so, option B may not
even resolve without overriding the constraint, which changes the
risk/effort calculus toward option A.

## Not urgent / reframe

The raw severity labels overstate real-world risk here: this pipeline runs
locally, on-demand, against audio Hart chooses to process — it's not a
network-facing service. Most of the "high" alerts (Pillow, nltk, etc.) are
in libraries with no untrusted-input attack surface in this codebase (no
image handling from untrusted sources, no server exposure). The one
partial exception already addressed: `aiohttp` handles outbound HTTP for
model downloads, so a compromised download source is a plausible (if
unlikely) trigger — that's why it was first in the batch-fix priority
order, and it's now fixed.

No alerts were found to be outright false positives — every one has a
published patched version and a real CVE/GHSA behind it.
