#!/usr/bin/env python3
"""Word-level alignment with multiple methods and LRCLIB validation.

Methods:
  a - Baseline: forced alignment (base model, no VAD) + last-word fix
  b - Enhanced: forced alignment (base model, VAD + min_word_dur) + last-word fix
  c - WhisperX: wav2vec2 phoneme-level CTC alignment
  d - WhisperX + LRCLIB text correction: C's timing with LRCLIB text where matched

Usage: word_align.py <method> <vocal_stem_path> [lyrics_json_path]
"""

import json
import sys


def main():
    if len(sys.argv) < 3:
        print("Usage: word_align.py <method:a|b|c> <vocal_stem_path> [lyrics_json_path]", file=sys.stderr)
        sys.exit(1)

    method = sys.argv[1]
    vocal_path = sys.argv[2]
    lyrics_json_path = sys.argv[3] if len(sys.argv) > 3 else None

    if method not in ("a", "b", "c", "d"):
        print(f"Unknown method: {method}. Use a, b, c, or d.", file=sys.stderr)
        sys.exit(1)

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

    if method in ("c", "d"):
        run_whisperx(vocal_path, lrclib_lines, lyrics_text, correct_text=(method == "d"))
    else:
        run_stable_ts(method, vocal_path, lrclib_lines, lyrics_text)


def run_stable_ts(method, vocal_path, lrclib_lines, lyrics_text):
    try:
        import stable_whisper
    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        print("Loading Whisper base model on cpu...", file=sys.stderr)
        model = stable_whisper.load_model("base", device="cpu")

        # Phase 1: Free transcription (for LRCLIB validation)
        print("Running free transcription for validation...", file=sys.stderr)
        stt_result = model.transcribe(vocal_path, language="en")

        # Phase 2: LRCLIB validation
        lrclib_validated = False
        lrclib_offset_ms = None

        if lrclib_lines and lyrics_text:
            lrclib_validated, lrclib_offset_ms = validate_lrclib(lrclib_lines, stt_result)
            status = "validated" if lrclib_validated else "MISMATCH"
            offset_str = f"{lrclib_offset_ms/1000:+.1f}s" if lrclib_offset_ms is not None else "?"
            print(f"LRCLIB {status} (median offset: {offset_str})", file=sys.stderr)

        # Phase 3: Forced alignment (method-specific params)
        if lrclib_validated and lyrics_text:
            print(f"Running forced alignment (method {method})...", file=sys.stderr)

            if method == "a":
                aligned_result = model.align(vocal_path, lyrics_text, language="en")
            elif method == "b":
                aligned_result = model.align(
                    vocal_path, lyrics_text, language="en",
                    vad=True, vad_threshold=0.25,
                    min_word_dur=0.05,
                    nonspeech_error=0.25,
                )

            words = extract_words(aligned_result)
            fixed_count = fix_last_word_displacement(words, lrclib_lines)
            print(f"Last-word fix: {fixed_count} words adjusted", file=sys.stderr)
            source = f"forced_alignment_{method}"
        else:
            words = extract_words(stt_result)
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


def run_whisperx(vocal_path, lrclib_lines, lyrics_text, correct_text=False):
    # whisperx's log_utils.setup_logging() adds a StreamHandler(sys.stdout).
    # Patch it to use stderr before importing whisperx.
    import logging
    import whisperx.log_utils as _log_utils

    _orig_setup = _log_utils.setup_logging
    def _setup_stderr(level="warning", log_file=None):
        logger = logging.getLogger("whisperx")
        logger.handlers.clear()
        handler = logging.StreamHandler(sys.stderr)
        handler.setLevel(logging.WARNING)
        handler.setFormatter(logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))
        logger.addHandler(handler)
        logger.setLevel(logging.WARNING)
        logger.propagate = False
    _log_utils.setup_logging = _setup_stderr
    _setup_stderr()

    try:
        import whisperx
        import torch
    except ImportError as e:
        print(f"Missing dependency for method c: {e}", file=sys.stderr)
        print("Install with: pip install whisperx", file=sys.stderr)
        sys.exit(1)

    try:
        device = "cpu"
        compute_type = "int8"

        print("Loading WhisperX base model...", file=sys.stderr)
        model = whisperx.load_model("base", device, compute_type=compute_type, language="en")

        print("Transcribing with WhisperX...", file=sys.stderr)
        audio = whisperx.load_audio(vocal_path)
        result = model.transcribe(audio, batch_size=8, language="en")

        print("Loading wav2vec2 alignment model...", file=sys.stderr)
        align_model, metadata = whisperx.load_align_model(language_code="en", device=device)

        print("Running phoneme-level alignment...", file=sys.stderr)
        aligned = whisperx.align(
            result["segments"], align_model, metadata, audio, device,
            return_char_alignments=False,
        )

        # LRCLIB validation (reuse the WhisperX transcription segments)
        lrclib_validated = False
        lrclib_offset_ms = None
        if lrclib_lines:
            lrclib_validated, lrclib_offset_ms = validate_lrclib_from_segments(
                lrclib_lines, aligned.get("segments", [])
            )
            status = "validated" if lrclib_validated else "MISMATCH"
            offset_str = f"{lrclib_offset_ms/1000:+.1f}s" if lrclib_offset_ms is not None else "?"
            print(f"LRCLIB {status} (median offset: {offset_str})", file=sys.stderr)

        words = []
        for seg in aligned.get("segments", []):
            for w in seg.get("words", []):
                if "start" in w and "word" in w:
                    text = w["word"].strip()
                    if text:
                        words.append({
                            "t": round(w["start"] * 1000),
                            "text": text,
                            "end": round(w.get("end", w["start"] + 0.3) * 1000),
                        })

        print(f"WhisperX produced {len(words)} words", file=sys.stderr)

        source = "whisperx"
        if correct_text and lrclib_validated and lrclib_lines:
            corrected_count = correct_words_from_lrclib(words, lrclib_lines)
            print(f"Text correction: {corrected_count}/{len(words)} words corrected", file=sys.stderr)
            source = "whisperx+lrclib"

        sys.stderr.flush()
        output = {
            "words": words,
            "lrclib_validated": lrclib_validated,
            "lrclib_offset_ms": lrclib_offset_ms,
            "source": source,
        }
        sys.stdout.write(json.dumps(output))
        sys.stdout.flush()

    except Exception as e:
        print(f"WhisperX alignment failed: {e}", file=sys.stderr)
        sys.exit(1)


def correct_words_from_lrclib(words, lrclib_lines):
    """Replace WhisperX word text with LRCLIB text where timing matches.

    Groups WhisperX words into clusters (gap >1s), matches each cluster
    to the nearest LRCLIB line by timestamp, then walks through words
    sequentially replacing text. Preserves WhisperX timing entirely.
    Returns count of corrected words.
    """
    if not words or not lrclib_lines:
        return 0

    import re

    def normalize(text):
        return re.sub(r"[^\w\s]", "", text.lower()).strip()

    # Filter to actual lyric lines
    lyric_lines = [
        l for l in lrclib_lines
        if l.get("text", "").strip()
        and not (l["text"].strip().startswith("(") and l["text"].strip().endswith(")"))
    ]
    if not lyric_lines:
        return 0

    # Build clusters from WhisperX words (gap > 1s = new cluster)
    clusters = []
    current = [0]
    for i in range(1, len(words)):
        gap = words[i]["t"] - words[i - 1].get("end", words[i - 1]["t"])
        if gap > 1000:
            clusters.append(current)
            current = [i]
        else:
            current.append(i)
    clusters.append(current)

    # Match each cluster to nearest LRCLIB line
    used_lines = set()
    corrected = 0

    for cluster_indices in clusters:
        cluster_start = words[cluster_indices[0]]["t"]

        # Find nearest unmatched LRCLIB line within 5s
        best_line_idx = None
        best_dist = float("inf")
        for li, ll in enumerate(lyric_lines):
            if li in used_lines:
                continue
            dist = abs(ll["t"] - cluster_start)
            if dist < best_dist:
                best_dist = dist
                best_line_idx = li

        if best_line_idx is None or best_dist > 5000:
            continue

        used_lines.add(best_line_idx)
        lrclib_words = lyric_lines[best_line_idx]["text"].split()

        if len(lrclib_words) == len(cluster_indices):
            # Perfect word count: 1:1 replacement
            for ci, lw in zip(cluster_indices, lrclib_words):
                words[ci]["text"] = lw
                corrected += 1
        elif len(lrclib_words) < len(cluster_indices):
            # LRCLIB has fewer words — sequential match with fuzzy alignment
            li = 0
            for ci in cluster_indices:
                if li >= len(lrclib_words):
                    break
                wx_norm = normalize(words[ci]["text"])
                lr_norm = normalize(lrclib_words[li])
                # Match if first chars agree or very similar
                if wx_norm and lr_norm and (
                    wx_norm[0] == lr_norm[0] or
                    _levenshtein_ratio(wx_norm, lr_norm) > 0.5
                ):
                    words[ci]["text"] = lrclib_words[li]
                    corrected += 1
                    li += 1
        else:
            # LRCLIB has more words — assign to available slots
            ci_idx = 0
            for lw in lrclib_words:
                if ci_idx >= len(cluster_indices):
                    break
                ci = cluster_indices[ci_idx]
                wx_norm = normalize(words[ci]["text"])
                lr_norm = normalize(lw)
                if wx_norm and lr_norm and (
                    wx_norm[0] == lr_norm[0] or
                    _levenshtein_ratio(wx_norm, lr_norm) > 0.5
                ):
                    words[ci]["text"] = lw
                    corrected += 1
                    ci_idx += 1
                else:
                    ci_idx += 1

    return corrected


def _levenshtein_ratio(a, b):
    """Quick Levenshtein similarity ratio (0-1)."""
    if not a or not b:
        return 0
    max_len = max(len(a), len(b))
    if max_len == 0:
        return 1
    # Simple distance computation
    n, m = len(a), len(b)
    if n > m:
        a, b = b, a
        n, m = m, n
    prev = list(range(n + 1))
    for j in range(1, m + 1):
        curr = [j] + [0] * n
        for i in range(1, n + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            curr[i] = min(curr[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost)
        prev = curr
    return 1 - (prev[n] / max_len)


def extract_words(result):
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
    return words


def validate_lrclib_from_segments(lrclib_lines, segments):
    """Validate LRCLIB against WhisperX segment-level word timestamps."""
    stt_words = []
    for seg in segments:
        for w in seg.get("words", []):
            if "start" in w:
                stt_words.append(round(w["start"] * 1000))

    if len(stt_words) < 3:
        return False, None

    stt_words.sort()
    cluster_starts = [stt_words[0]]
    for i in range(1, len(stt_words)):
        if stt_words[i] - stt_words[i - 1] > 1000:
            cluster_starts.append(stt_words[i])

    return _compare_clusters(lrclib_lines, cluster_starts)


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

    return _compare_clusters(lrclib_lines, cluster_starts)


def _compare_clusters(lrclib_lines, cluster_starts):
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


def fix_last_word_displacement(words, lrclib_lines):
    """Fix last-word-per-line displacement using LRCLIB line structure."""
    if not words or not lrclib_lines:
        return 0

    line_word_counts = []
    for line in lrclib_lines:
        text = line.get("text", "").strip()
        if text:
            line_word_counts.append(len(text.split()))

    pos = 0
    fixed = 0

    for line_count in line_word_counts:
        if pos + line_count > len(words):
            break
        if line_count < 3:
            pos += line_count
            continue

        group = words[pos:pos + line_count]

        gaps = []
        for i in range(len(group) - 2):
            gap = group[i + 1]["t"] - group[i].get("end", group[i]["t"])
            if gap >= 0:
                gaps.append(gap)

        if not gaps:
            pos += line_count
            continue

        median_gap = sorted(gaps)[len(gaps) // 2]

        last = group[-1]
        prev = group[-2]
        last_gap = last["t"] - prev.get("end", prev["t"])

        if last_gap > max(median_gap * 3, 500):
            durs = [g.get("end", g["t"]) - g["t"] for g in group[:-1] if g.get("end", g["t"]) - g["t"] > 0]
            typical_dur = sorted(durs)[len(durs) // 2] if durs else 300

            new_start = prev.get("end", prev["t"]) + min(median_gap, 200)
            new_end = new_start + typical_dur

            last["t"] = round(new_start)
            last["end"] = round(new_end)
            fixed += 1

        pos += line_count

    return fixed


if __name__ == "__main__":
    main()
