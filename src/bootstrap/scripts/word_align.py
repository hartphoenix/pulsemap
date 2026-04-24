#!/usr/bin/env python3
"""Word-level forced alignment with LRCLIB validation and last-word fix.

Strategy:
1. Free-transcribe for LRCLIB validation (detect recording mismatch).
2. If LRCLIB validates: run forced alignment, then fix last-word-per-line
   displacement (where forced alignment pushes the final word late because
   LRCLIB end timestamps = next line start, not actual vocal end).
3. If LRCLIB mismatches: output raw STT words.
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

        # Phase 1: Free transcription (for LRCLIB validation only)
        print("Running free transcription for validation...", file=sys.stderr)
        stt_result = model.transcribe(vocal_path, language="en")

        # Phase 2: LRCLIB validation
        lrclib_validated = False
        lrclib_offset_ms = None

        if lrclib_lines and lyrics_text:
            lrclib_validated, lrclib_offset_ms = validate_lrclib(
                lrclib_lines, stt_result
            )
            status = "validated" if lrclib_validated else "MISMATCH"
            offset_str = f"{lrclib_offset_ms/1000:+.1f}s" if lrclib_offset_ms is not None else "?"
            print(f"LRCLIB {status} (median offset: {offset_str})", file=sys.stderr)

        # Phase 3: Forced alignment + last-word fix, or raw STT
        if lrclib_validated and lyrics_text:
            print("Running forced alignment...", file=sys.stderr)
            aligned_result = model.align(vocal_path, lyrics_text, language="en")

            words = []
            for segment in aligned_result.segments:
                for word in segment.words:
                    text = word.word.strip()
                    if text:
                        words.append({
                            "t": round(word.start * 1000),
                            "text": text,
                            "end": round(word.end * 1000),
                        })

            fixed_count = fix_last_word_displacement(words)
            print(f"Last-word fix: {fixed_count} words adjusted", file=sys.stderr)
            source = "forced_alignment"
        else:
            words = []
            for segment in stt_result.segments:
                for word in segment.words:
                    text = word.word.strip()
                    if text:
                        words.append({
                            "t": round(word.start * 1000),
                            "text": text,
                            "end": round(word.end * 1000),
                        })
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


def fix_last_word_displacement(words):
    """Fix last-word-per-line timing displacement from forced alignment.

    Groups words into clusters (gap >1s). For each cluster with 3+ words,
    checks if the last word's onset gap is abnormally large compared to the
    cluster's typical inter-word spacing. If so, pulls the last word back
    to just after the second-to-last word.
    """
    if len(words) < 3:
        return 0

    # Build clusters
    clusters = [[0]]  # indices into words
    for i in range(1, len(words)):
        gap = words[i]["t"] - words[i - 1].get("end", words[i - 1]["t"])
        if gap > 1000:
            clusters.append([i])
        else:
            clusters[-1].append(i)

    fixed = 0
    for cluster_indices in clusters:
        if len(cluster_indices) < 3:
            continue

        # Compute inter-word gaps within this cluster (excluding last)
        gaps = []
        for j in range(len(cluster_indices) - 2):
            idx_a = cluster_indices[j]
            idx_b = cluster_indices[j + 1]
            gap = words[idx_b]["t"] - words[idx_a].get("end", words[idx_a]["t"])
            gaps.append(gap)

        if not gaps:
            continue

        median_gap = sorted(gaps)[len(gaps) // 2]

        # Check last word
        last_idx = cluster_indices[-1]
        prev_idx = cluster_indices[-2]
        last_gap = words[last_idx]["t"] - words[prev_idx].get("end", words[prev_idx]["t"])

        # If last word gap is >3x the median gap and >500ms, it's displaced
        if last_gap > max(median_gap * 3, 500):
            # Compute typical word duration in this cluster
            durs = []
            for ci in cluster_indices[:-1]:
                dur = words[ci].get("end", words[ci]["t"]) - words[ci]["t"]
                if dur > 0:
                    durs.append(dur)
            typical_dur = sorted(durs)[len(durs) // 2] if durs else 300

            new_start = words[prev_idx].get("end", words[prev_idx]["t"]) + min(median_gap, 200)
            new_end = new_start + typical_dur

            words[last_idx]["t"] = round(new_start)
            words[last_idx]["end"] = round(new_end)
            fixed += 1

    return fixed


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
