#!/usr/bin/env python3
"""Word-level transcription with vocabulary priming and LRCLIB validation. JSON to stdout.

Strategy:
1. Run unprompted transcription to get baseline STT word clusters.
2. If LRCLIB lyrics are provided, validate LRCLIB timestamps against
   STT word cluster timing to detect recording mismatch.
3. Run prompted transcription (initial_prompt=lyrics text) for the final
   output. The model decides all timing freely but uses the lyrics as a
   vocabulary/language prior for better text accuracy.
"""

import json
import sys


def main():
    if len(sys.argv) < 2:
        print("Usage: word_align.py <vocal_stem_path> [lyrics_json_path]", file=sys.stderr)
        sys.exit(1)

    vocal_path = sys.argv[1]
    lyrics_json_path = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        import stable_whisper
    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        print("Loading Whisper base model on cpu...", file=sys.stderr)
        model = stable_whisper.load_model("base", device="cpu")

        # Load LRCLIB lyrics if provided
        lrclib_lines = None
        lyrics_text = None
        if lyrics_json_path:
            try:
                with open(lyrics_json_path) as f:
                    lrclib_lines = json.load(f)
                lyrics_text = "\n".join(line["text"] for line in lrclib_lines)
                if not lyrics_text.strip():
                    lyrics_text = None
            except Exception:
                lrclib_lines = None

        # Phase 1: Unprompted transcription (for LRCLIB validation)
        lrclib_validated = False
        lrclib_offset_ms = None

        if lrclib_lines and len(lrclib_lines) > 0:
            print("Running baseline transcription for LRCLIB validation...", file=sys.stderr)
            baseline = model.transcribe(vocal_path, language="en")

            lrclib_validated, lrclib_offset_ms = validate_lrclib(
                lrclib_lines, baseline
            )
            status = "validated" if lrclib_validated else "MISMATCH"
            offset_str = f"{lrclib_offset_ms/1000:+.1f}s" if lrclib_offset_ms is not None else "?"
            print(f"LRCLIB {status} (median offset: {offset_str})", file=sys.stderr)

        # Phase 2: Prompted transcription (final output)
        prompt = lyrics_text if lyrics_text else None
        mode = "prompted" if prompt else "unprompted"
        print(f"Running {mode} transcription...", file=sys.stderr)
        result = model.transcribe(vocal_path, language="en", initial_prompt=prompt)

        words = []
        for segment in result.segments:
            for word in segment.words:
                text = word.word.strip()
                if text:
                    words.append({
                        "t": round(word.start * 1000),
                        "text": text,
                        "end": round(word.end * 1000),
                    })

        output = {
            "words": words,
            "lrclib_validated": lrclib_validated,
            "lrclib_offset_ms": lrclib_offset_ms,
            "source": "prompted_transcription" if prompt else "free_transcription",
        }

        print(json.dumps(output))

    except Exception as e:
        print(f"Word alignment failed: {e}", file=sys.stderr)
        sys.exit(1)


def validate_lrclib(lrclib_lines, stt_result):
    """Compare LRCLIB line timestamps against STT word cluster timestamps.

    Clusters STT words by gaps >1s to approximate line-level grouping,
    then compares cluster starts against LRCLIB line starts.

    Returns (validated: bool, median_offset_ms: float|None).
    """
    stt_words = []
    for seg in stt_result.segments:
        for word in seg.words:
            text = word.word.strip()
            if text:
                stt_words.append(round(word.start * 1000))

    if len(stt_words) < 3:
        return False, None

    stt_words.sort()
    cluster_starts = [stt_words[0]]
    for i in range(1, len(stt_words)):
        if stt_words[i] - stt_words[i - 1] > 1000:
            cluster_starts.append(stt_words[i])

    if not cluster_starts:
        return False, None

    lyric_lines = [
        l for l in lrclib_lines
        if l.get("text", "").strip()
        and not (l["text"].strip().startswith("(") and l["text"].strip().endswith(")"))
    ]

    if not lyric_lines:
        return False, None

    offsets = []
    for ll in lyric_lines:
        ll_t = ll["t"]
        best_dist = float("inf")
        best_offset = None
        for cs in cluster_starts:
            dist = abs(cs - ll_t)
            if dist < best_dist:
                best_dist = dist
                best_offset = ll_t - cs
        if best_offset is not None and best_dist < 60000:
            offsets.append(best_offset)

    if len(offsets) < 3:
        return False, None

    offsets.sort()
    median = offsets[len(offsets) // 2]
    within_threshold = sum(1 for o in offsets if abs(o - median) < 3000)
    consistency = within_threshold / len(offsets)

    validated = abs(median) < 5000 and consistency >= 0.6
    return validated, round(median)


if __name__ == "__main__":
    main()
