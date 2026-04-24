#!/usr/bin/env python3
"""Word-level alignment with LRCLIB mismatch detection. JSON to stdout.

Strategy:
1. Free-transcribe the vocal stem (no text bias) to get STT words with timestamps.
2. If LRCLIB lyrics are provided, compare STT segment timing against LRCLIB line
   timing to detect recording mismatch.
3. If LRCLIB validates: run forced alignment (best text quality + audio timing).
4. If LRCLIB mismatches or is absent: output free transcription words.
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

        # Phase 1: Free transcription
        print("Running free transcription...", file=sys.stderr)
        stt_result = model.transcribe(vocal_path, language="en")

        stt_words = []
        for segment in stt_result.segments:
            for word in segment.words:
                text = word.word.strip()
                if text:
                    stt_words.append({
                        "t": round(word.start * 1000),
                        "text": text,
                        "end": round(word.end * 1000),
                    })

        # Phase 2: LRCLIB validation (if lyrics provided)
        lrclib_lines = None
        if lyrics_json_path:
            try:
                with open(lyrics_json_path) as f:
                    lrclib_lines = json.load(f)
            except Exception:
                lrclib_lines = None

        lrclib_validated = False
        lrclib_offset_ms = None

        if lrclib_lines and len(lrclib_lines) > 0 and len(stt_words) > 0:
            lrclib_validated, lrclib_offset_ms = validate_lrclib(
                lrclib_lines, stt_result
            )
            status = "validated" if lrclib_validated else "MISMATCH"
            offset_str = f"{lrclib_offset_ms/1000:+.1f}s" if lrclib_offset_ms is not None else "?"
            print(
                f"LRCLIB {status} (median offset: {offset_str})",
                file=sys.stderr,
            )

        # Phase 3: Choose output source
        if lrclib_validated and lrclib_lines:
            text = "\n".join(line["text"] for line in lrclib_lines)
            if text.strip():
                print("Running forced alignment with LRCLIB text...", file=sys.stderr)
                aligned_result = model.align(vocal_path, text, language="en")
                aligned_words = []
                for segment in aligned_result.segments:
                    for word in segment.words:
                        text_clean = word.word.strip()
                        if text_clean:
                            aligned_words.append({
                                "t": round(word.start * 1000),
                                "text": text_clean,
                                "end": round(word.end * 1000),
                            })
                output = {
                    "words": aligned_words,
                    "lrclib_validated": True,
                    "lrclib_offset_ms": lrclib_offset_ms,
                    "source": "forced_alignment",
                }
            else:
                output = {
                    "words": stt_words,
                    "lrclib_validated": False,
                    "lrclib_offset_ms": lrclib_offset_ms,
                    "source": "free_transcription",
                }
        else:
            output = {
                "words": stt_words,
                "lrclib_validated": lrclib_validated,
                "lrclib_offset_ms": lrclib_offset_ms,
                "source": "free_transcription",
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
    # Build word-level clusters from STT (gap > 1s = new cluster)
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

    # Filter non-lyric LRCLIB lines
    lyric_lines = [
        l for l in lrclib_lines
        if l.get("text", "").strip()
        and not (l["text"].strip().startswith("(") and l["text"].strip().endswith(")"))
    ]

    if not lyric_lines:
        return False, None

    # For each LRCLIB line, find the nearest STT cluster start
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
