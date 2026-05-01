# RFC 0001 — Windowed fingerprints for partial-audio recognition

**Status:** draft · **Authors:** @hartphoenix · **Created:** 2026-05-01

This is a written design proposal. Code is intentionally not yet shipped — the proposal exists so contributors with audio fingerprinting / approximate-search / indexing background can engage with the open questions before we commit to an implementation.

## Motivation

Today, a PulseMap's `fingerprint` field carries a **single Chromaprint** computed over the entire recording. This is useful for full-track identification *after* you already have the whole audio (the AcoustID flow: fingerprint a file → match it to a MusicBrainz recording id).

What it doesn't unlock: **identifying a song from a brief sample of its audio.** "Hold a phone up to whatever's playing for 5–10 seconds, get back the chord chart, lyrics, and the rest of the map."

That capability would extend PulseMap from "structured data about songs you already know" to "structured data you can find from a fragment." Concrete app categories it unlocks:

- **Live-music education** — student plays a snippet, app shows the chord chart from that point onward.
- **Busking aids** — pull up lyrics for whatever the band on the corner is playing right now.
- **"Name that tune"** — gameplay around partial recognition.
- **Classroom tools** — teacher plays a clip; lesson scaffolds appear synchronized.
- **Accessibility** — synchronized captions / chord overlays on whatever is currently audible.
- **Agent-driven "what's playing now"** — an agent with mic permission and a PulseMap library can answer the question structurally.

This is the kind of capability that turns a protocol from interesting to indispensable, and it's a *natural* extension of work the schema already does (Chromaprint over the whole track) — just over windows.

## Proposed schema addition

Add a peer field on `PulseMapSchema`, alongside the existing `fingerprint`:

```ts
export const FingerprintWindowSchema = Type.Object({
  t_start_ms: Type.Number(),
  t_end_ms: Type.Number(),
  chromaprint: Type.String({ description: "Base64-encoded Chromaprint over this window." }),
  algorithm: Type.Number({ description: "Chromaprint algorithm version." }),
});

// inside PulseMapSchema:
fingerprint_windows: Type.Optional(Type.Array(FingerprintWindowSchema)),
```

Output is **additive**: existing maps stay valid; the new field is optional. No major version bump required.

**Suggested defaults** (subject to refinement during implementation):

- Window size: ~10s — long enough for stable Chromaprint, short enough that any 5–10s sample lands inside or partially overlaps one.
- Hop size: ~2s — overlapping windows. Trades index size for matcher robustness.
- Algorithm: same Chromaprint version as the full-track print for consistency.

A 4-minute song produces ~120 windows. Per-window Chromaprint is small (~hundreds of bytes), so the on-disk overhead is roughly 1× to 2× the existing single-print field.

## Pipeline implications

A new bootstrap stage runs Chromaprint on overlapping windows of the source audio. Two implementation paths:

1. **Direct Chromaprint library bindings** (e.g. `pyacoustid`, `chromaprint-rs`). Far more efficient than shelling out to `fpcalc -length N -ts T` per window — we hold the audio buffer once and slide a Chromaprint over it.
2. **`fpcalc` per window** — works, but ~120 process spawns per song is slow.

Approach (1) is the recommended path. The stage is independent of the existing fingerprint stage and can run in parallel with other analysis.

Re-running the pipeline on the existing 100+ map catalog is GPU-free and CPU-cheap relative to Demucs / WhisperX / torchcrepe — likely 5–10 minutes for the whole catalog.

## Matching backend — the open question

Schema and pipeline are the easy half. The harder half is **how a runtime client identifies a song from a captured snippet**. There are multiple valid approaches, and picking one is the load-bearing design decision this RFC is asking for help on.

### Option A: brute-force scan

For each candidate map in the catalog, slide the query fingerprint over the map's windows and score by Chromaprint Hamming similarity. Rank.

- **Pro:** Trivially correct, easy to reason about, ships in a weekend.
- **Pro:** Works at our current scale (~100 maps).
- **Con:** Doesn't scale to thousands of maps in the browser. Doesn't scale at all to community-contributed maps without a server.
- **Verdict:** Reasonable MVP. Insufficient long-term.

### Option B: LSH / MinHash over Chromaprint chunks

Index the chromaprint windows with locality-sensitive hashing — `audfprint`-style. Query becomes a near-constant-time hash lookup with candidate scoring.

- **Pro:** Well-trodden ground in the audio fingerprinting literature.
- **Pro:** Runs in the browser at modest catalog sizes.
- **Con:** Tuning the hash bands and bin sizes is fiddly.
- **Reference:** [audfprint](https://github.com/dpwe/audfprint), the academic literature around landmark fingerprinting.

### Option C: vector index over learned embeddings

Replace (or augment) Chromaprint with embeddings from an audio model (CLAP, MERT, etc.) and use FAISS / Annoy / Vespa.

- **Pro:** State-of-the-art recall, especially against background noise / lossy capture.
- **Con:** Requires a non-trivial ML dependency, an inference path on the client, and a separate index format. Departs from the protocol's "Chromaprint, period" stance.
- **Verdict:** Promising as a successor but probably not the MVP.

### Option D: re-use AcoustID infrastructure

AcoustID already runs a global fingerprint database. Their endpoints are tuned for full-track matching. Could we extend or layer on top?

- **Pro:** Existing global infrastructure, MusicBrainz integration we already use.
- **Con:** Their model is full-track. They would have to extend.
- **Verdict:** Worth a conversation with their team but not a starting point we can drive ourselves.

### Option E: reference matcher service vs. client-side library

Orthogonal to A–D. The matcher could be:

- **Server:** PulseMap (or a community runner) hosts an endpoint that takes a fingerprint and returns a map id + offset. Adds infrastructure cost but keeps the catalog hot in memory.
- **Client:** Ship the matching logic and the index format as a library; consumers download the index for the catalog they care about and run lookup locally.

The client-side path aligns with PulseMap's "open data, no required service" ethos. The server-side path scales better past tens of thousands of maps.

The right answer is probably "ship a client-side reference library AND let consumers run their own matcher service from the same code."

## Privacy and licensing

Chromaprint can run client-side. **Captured audio never needs to leave the user's device** — only the (small, non-reversible) fingerprint is sent for matching, if any matching happens off-device at all.

This is a strong privacy story for the live-mic use cases (classroom, busking, agent observation) and worth stating explicitly in any consumer-facing UI built on top.

## Open invitation

This RFC is intentionally not a finished design. If you've worked on:

- Audio fingerprinting (Chromaprint, audfprint, Shazam-style landmarks)
- Approximate nearest-neighbor search (FAISS, Annoy, ScaNN, HNSW)
- LSH / MinHash for high-dimensional retrieval
- Audio embedding models (CLAP, MERT, etc.)
- Real-time microphone capture for music recognition

…this is exactly where to plug in. Open a discussion or comment on the issue tracking this RFC.

## Tracking issue

To be filed alongside the merge of this proposal.

## Status / next steps

1. Land this RFC as a draft.
2. Open `good first issue`-flavored stubs for: pipeline stage implementation, MVP brute-force matcher, demo client (microphone → fingerprint → match → map view).
3. Iterate on the matching backend choice based on contributor input before committing to schema.
