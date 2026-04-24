#!/usr/bin/env python3
"""Word-level transcription with LRCLIB validation and text correction. JSON to stdout.

Strategy:
1. Free-transcribe the vocal stem to get STT words with accurate timing.
2. If LRCLIB lyrics are provided, validate timestamps against STT word
   clusters to detect recording mismatch.
3. If LRCLIB validates: replace STT word text with LRCLIB text (better
   spelling/punctuation) while keeping STT timing.
4. If LRCLIB mismatches or absent: output raw STT words.
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

        # Load LRCLIB lyrics
        lrclib_lines = None
        if lyrics_json_path:
            try:
                with open(lyrics_json_path) as f:
                    lrclib_lines = json.load(f)
                if not lrclib_lines:
                    lrclib_lines = None
            except Exception:
                lrclib_lines = None

        # Phase 1: Free transcription
        print("Running free transcription...", file=sys.stderr)
        result = model.transcribe(vocal_path, language="en")

        stt_words = []
        for segment in result.segments:
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
                lrclib_lines, result
            )
            status = "validated" if lrclib_validated else "MISMATCH"
            offset_str = f"{lrclib_offset_ms/1000:+.1f}s" if lrclib_offset_ms is not None else "?"
            print(f"LRCLIB {status} (median offset: {offset_str})", file=sys.stderr)

        # Phase 3: Text correction or raw output
        if lrclib_validated and lrclib_lines:
            corrected = correct_text(stt_words, lrclib_lines)
            matched = sum(1 for w in corrected if w.get("_corrected"))
            total = len(corrected)
            print(
                f"Text correction: {matched}/{total} words matched to LRCLIB",
                file=sys.stderr,
            )
            words = [{"t": w["t"], "text": w["text"], "end": w["end"]} for w in corrected]
            source = "hybrid"
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


def correct_text(stt_words, lrclib_lines):
    """Replace STT word text with LRCLIB text, keeping STT timing.

    Groups STT words into clusters (gap >1s), matches each cluster to
    the nearest LRCLIB line, then distributes LRCLIB words across the
    cluster's timestamps.
    """
    if not stt_words or not lrclib_lines:
        return stt_words

    # Filter to actual lyric lines
    lyric_lines = [
        l for l in lrclib_lines
        if l.get("text", "").strip()
        and not (l["text"].strip().startswith("(") and l["text"].strip().endswith(")"))
    ]
    if not lyric_lines:
        return stt_words

    # Build clusters from STT words
    clusters = []
    current = [stt_words[0]]
    for i in range(1, len(stt_words)):
        gap = stt_words[i]["t"] - (stt_words[i - 1].get("end", stt_words[i - 1]["t"]))
        if gap > 1000:
            clusters.append(current)
            current = [stt_words[i]]
        else:
            current.append(stt_words[i])
    clusters.append(current)

    # Match each cluster to nearest LRCLIB line
    used_lines = set()
    result = []

    for cluster in clusters:
        cluster_start = cluster[0]["t"]
        cluster_end = cluster[-1].get("end", cluster[-1]["t"])

        # Find best matching LRCLIB line (nearest by start time, not yet used)
        best_line = None
        best_dist = float("inf")
        best_idx = -1
        for i, ll in enumerate(lyric_lines):
            if i in used_lines:
                continue
            dist = abs(ll["t"] - cluster_start)
            if dist < best_dist:
                best_dist = dist
                best_line = ll
                best_idx = i

        # Only match if reasonably close (within 5s)
        if best_line and best_dist < 5000:
            used_lines.add(best_idx)
            lrclib_words = best_line["text"].split()

            if len(lrclib_words) == len(cluster):
                # Perfect word count match: 1:1 replacement
                for stt_w, lrc_text in zip(cluster, lrclib_words):
                    result.append({
                        "t": stt_w["t"],
                        "text": lrc_text,
                        "end": stt_w["end"],
                        "_corrected": True,
                    })
            elif len(lrclib_words) <= len(cluster):
                # LRCLIB has fewer words: assign to first N STT timestamps
                for j, lrc_text in enumerate(lrclib_words):
                    result.append({
                        "t": cluster[j]["t"],
                        "text": lrc_text,
                        "end": cluster[j]["end"] if j < len(lrclib_words) - 1 else cluster[-1]["end"],
                        "_corrected": True,
                    })
            else:
                # LRCLIB has more words: interpolate timestamps
                duration = cluster_end - cluster_start
                for j, lrc_text in enumerate(lrclib_words):
                    frac = j / max(len(lrclib_words) - 1, 1)
                    t = round(cluster_start + frac * duration * 0.9)
                    end_frac = (j + 1) / max(len(lrclib_words), 1)
                    end = round(cluster_start + end_frac * duration)
                    result.append({
                        "t": t,
                        "text": lrc_text,
                        "end": end,
                        "_corrected": True,
                    })
        else:
            # No match: keep STT words as-is
            for w in cluster:
                result.append({**w, "_corrected": False})

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
