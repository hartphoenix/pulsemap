#!/usr/bin/env python3
"""Word-level alignment: forced alignment anchored by free transcription timing.

Strategy:
1. Free-transcribe the vocal stem for timing anchors + LRCLIB validation.
2. Run forced alignment with LRCLIB text for full word coverage.
3. Merge: snap forced-alignment words to nearby STT timing where available,
   cap duration anomalies elsewhere.
4. If LRCLIB mismatches: output raw STT words.
"""

import json
import sys


MAX_WORD_DUR_MS = 2000


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

        # Load LRCLIB lyrics
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

        # Phase 1: Free transcription (timing anchors + validation)
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

        # Phase 2: LRCLIB validation
        lrclib_validated = False
        lrclib_offset_ms = None

        if lrclib_lines and len(stt_words) > 0:
            lrclib_validated, lrclib_offset_ms = validate_lrclib(
                lrclib_lines, stt_result
            )
            status = "validated" if lrclib_validated else "MISMATCH"
            offset_str = f"{lrclib_offset_ms/1000:+.1f}s" if lrclib_offset_ms is not None else "?"
            print(f"LRCLIB {status} (median offset: {offset_str})", file=sys.stderr)

        # Phase 3: Forced alignment + merge, or raw STT
        if lrclib_validated and lyrics_text:
            print("Running forced alignment with LRCLIB text...", file=sys.stderr)
            aligned_result = model.align(vocal_path, lyrics_text, language="en")

            forced_words = []
            for segment in aligned_result.segments:
                for word in segment.words:
                    text = word.word.strip()
                    if text:
                        forced_words.append({
                            "t": round(word.start * 1000),
                            "text": text,
                            "end": round(word.end * 1000),
                        })

            merged = merge_with_anchors(forced_words, stt_words)
            anchored = sum(1 for w in merged if w.get("_anchored"))
            capped = sum(1 for w in merged if w.get("_capped"))
            print(
                f"Merge: {len(merged)} words, {anchored} anchored to STT, {capped} duration-capped",
                file=sys.stderr,
            )
            words = [{"t": w["t"], "text": w["text"], "end": w["end"]} for w in merged]
            source = "anchored_alignment"
        else:
            words = stt_words
            source = "free_transcription"

        output = {
            "words": words,
            "lrclib_validated": lrclib_validated,
            "lrclib_offset_ms": lrclib_offset_ms,
            "source": source,
        }
        print(json.dumps(output))

    except Exception as e:
        print(f"Word alignment failed: {e}", file=sys.stderr)
        sys.exit(1)


def merge_with_anchors(forced_words, stt_words):
    """Snap forced-alignment timing to nearby STT words, cap long durations.

    For each forced-alignment word, find the nearest STT word with matching
    text (normalized). If within 3s, adopt the STT timing. Otherwise keep
    forced-alignment timing but cap duration.
    """
    if not forced_words:
        return forced_words

    result = []
    used_stt = set()

    for fw in forced_words:
        fw_norm = fw["text"].lower().strip(".,!?;:'\"")

        best_stt = None
        best_dist = float("inf")
        best_idx = -1

        for i, sw in enumerate(stt_words):
            if i in used_stt:
                continue
            sw_norm = sw["text"].lower().strip(".,!?;:'\"")
            if sw_norm != fw_norm:
                continue
            dist = abs(sw["t"] - fw["t"])
            if dist < best_dist and dist < 3000:
                best_dist = dist
                best_stt = sw
                best_idx = i

        if best_stt is not None:
            used_stt.add(best_idx)
            result.append({
                "t": best_stt["t"],
                "text": fw["text"],
                "end": best_stt["end"],
                "_anchored": True,
                "_capped": False,
            })
        else:
            dur = fw["end"] - fw["t"]
            end = fw["end"]
            capped = False
            if dur > MAX_WORD_DUR_MS:
                end = fw["t"] + MAX_WORD_DUR_MS
                capped = True
            result.append({
                "t": fw["t"],
                "text": fw["text"],
                "end": end,
                "_anchored": False,
                "_capped": capped,
            })

    return result


def validate_lrclib(lrclib_lines, stt_result):
    """Compare LRCLIB line timestamps against STT word cluster timestamps."""
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
