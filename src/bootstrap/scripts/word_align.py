#!/usr/bin/env python3
"""Word-level forced alignment with LRCLIB validation and last-word fix.

Strategy:
1. Free-transcribe for LRCLIB validation (detect recording mismatch).
2. If LRCLIB validates: run forced alignment, then fix last-word-per-line
   displacement using LRCLIB line structure to define word groups.
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
        if lrclib_validated and lyrics_text and lrclib_lines:
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

            fixed_count = fix_last_word_displacement(words, lrclib_lines)
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


def fix_last_word_displacement(words, lrclib_lines):
    """Fix last-word-per-line displacement using LRCLIB line structure.

    Walks through forced-alignment words, grouping them by LRCLIB line
    word counts. For each group's last word, checks if its onset gap is
    abnormally large vs the group's typical spacing. If so, pulls it back.
    """
    if not words or not lrclib_lines:
        return 0

    # Build line word counts from LRCLIB
    line_word_counts = []
    for line in lrclib_lines:
        text = line.get("text", "").strip()
        if text:
            line_word_counts.append(len(text.split()))

    # Walk forced-alignment words, assigning to lines by count
    pos = 0
    fixed = 0

    for line_count in line_word_counts:
        if pos + line_count > len(words):
            break
        if line_count < 3:
            pos += line_count
            continue

        group = words[pos:pos + line_count]

        # Compute inter-word gaps within group (excluding last)
        gaps = []
        for i in range(len(group) - 2):
            gap = group[i + 1]["t"] - group[i].get("end", group[i]["t"])
            if gap >= 0:
                gaps.append(gap)

        if not gaps:
            pos += line_count
            continue

        median_gap = sorted(gaps)[len(gaps) // 2]

        # Check last word
        last = group[-1]
        prev = group[-2]
        last_gap = last["t"] - prev.get("end", prev["t"])

        if last_gap > max(median_gap * 3, 500):
            # Compute typical word duration
            durs = [g.get("end", g["t"]) - g["t"] for g in group[:-1] if g.get("end", g["t"]) - g["t"] > 0]
            typical_dur = sorted(durs)[len(durs) // 2] if durs else 300

            new_start = prev.get("end", prev["t"]) + min(median_gap, 200)
            new_end = new_start + typical_dur

            last["t"] = round(new_start)
            last["end"] = round(new_end)
            fixed += 1

        pos += line_count

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
