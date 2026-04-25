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

    if method not in ("a", "b", "c", "d", "e"):
        print(f"Unknown method: {method}. Use a, b, c, d, or e.", file=sys.stderr)
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

    if method == "e":
        run_whisperx_align(vocal_path, lrclib_lines)
    elif method in ("c", "d"):
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


def run_whisperx_align(vocal_path, lrclib_lines):
    """Method E: wav2vec2 forced alignment of LRCLIB text on vocal stem."""
    import logging
    import whisperx.log_utils as _log_utils

    def _setup_stderr(level="warning", log_file=None):
        logger = logging.getLogger("whisperx")
        logger.handlers.clear()
        handler = logging.StreamHandler(sys.stderr)
        handler.setLevel(logging.WARNING)
        logger.addHandler(handler)
        logger.setLevel(logging.WARNING)
        logger.propagate = False
    _log_utils.setup_logging = _setup_stderr
    _setup_stderr()

    try:
        import whisperx
        import torch
    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        sys.exit(1)

    if not lrclib_lines:
        print("No LRCLIB lyrics for method E", file=sys.stderr)
        sys.exit(1)

    try:
        # Build segments from LRCLIB lines
        segments = []
        for line in lrclib_lines:
            text = line.get("text", "").strip()
            if not text:
                continue
            segments.append({
                "text": text,
                "start": line["t"] / 1000,
                "end": line.get("end", line["t"] + 3000) / 1000,
            })

        print("Loading wav2vec2 alignment model...", file=sys.stderr)
        device = "cpu"
        align_model, metadata = whisperx.load_align_model(language_code="en", device=device)

        print(f"Aligning {len(segments)} LRCLIB lines with wav2vec2...", file=sys.stderr)
        audio = whisperx.load_audio(vocal_path)
        aligned = whisperx.align(
            segments, align_model, metadata, audio, device,
            return_char_alignments=False,
        )

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

        print(f"wav2vec2 aligned {len(words)} words", file=sys.stderr)
        sys.stderr.flush()
        output = {
            "words": words,
            "lrclib_validated": True,
            "lrclib_offset_ms": 0,
            "source": "whisperx_align",
        }
        sys.stdout.write(json.dumps(output))
        sys.stdout.flush()

    except Exception as e:
        print(f"wav2vec2 alignment failed: {e}", file=sys.stderr)
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
            corrected_count = correct_words_with_llm(words, lrclib_lines)
            print(f"LLM correction: {corrected_count}/{len(words)} words corrected", file=sys.stderr)
            source = "whisperx+llm"

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


def correct_words_with_llm(words, lrclib_lines, model="gemma3:1b", ollama_url="http://localhost:11434"):
    """Correct WhisperX word text using a local LLM via Ollama.

    Sends sliding windows of WhisperX words + LRCLIB reference text to the
    model. The model fixes transcription errors without changing word count.
    Returns total count of corrected words.
    """
    import urllib.request

    if not words or not lrclib_lines:
        return 0

    lyric_lines = [
        l for l in lrclib_lines
        if l.get("text", "").strip()
        and not (l["text"].strip().startswith("(") and l["text"].strip().endswith(")"))
    ]
    if not lyric_lines:
        return 0

    # Build reference text (all lyrics as a flat word sequence)
    all_ref_words = []
    for ll in lyric_lines:
        all_ref_words.extend(ll["text"].split())

    # Process in sliding windows of ~40-60 words
    window_size = 50
    step = 40
    corrected = 0
    pos = 0

    while pos < len(words):
        end = min(pos + window_size, len(words))
        chunk = words[pos:end]

        # Find the corresponding reference window
        ref_start = max(0, pos - 10)
        ref_end = min(len(all_ref_words), pos + window_size + 10)
        ref_chunk = all_ref_words[ref_start:ref_end]

        if not ref_chunk:
            pos += step
            continue

        whisperx_texts = [w["text"] for w in chunk]
        ref_text = " ".join(ref_chunk)

        corrected_texts = _call_ollama(ref_text, whisperx_texts, model, ollama_url)

        if corrected_texts and len(corrected_texts) == len(chunk):
            for i, new_text in enumerate(corrected_texts):
                if new_text != chunk[i]["text"]:
                    chunk[i]["text"] = new_text
                    corrected += 1
        else:
            print(f"  LLM window {pos}-{end}: rejected (count mismatch or error)", file=sys.stderr)

        pos += step

    return corrected


def _call_ollama(ref_text, whisperx_texts, model, ollama_url):
    """Call Ollama API to correct a window of words using numbered list format."""
    import urllib.request

    # Build numbered list
    numbered = "\n".join(f"{i+1}. {w}" for i, w in enumerate(whisperx_texts))
    count = len(whisperx_texts)

    prompt = (
        f"Reference words:\n{ref_text}\n\n"
        f"Numbered list ({count} items):\n{numbered}"
    )

    payload = json.dumps({
        "model": model,
        "system": f"Fix errors in the numbered list using the reference words. Output exactly {count} numbered lines. Keep every position. Change only wrong words.",
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0},
    }).encode()

    try:
        req = urllib.request.Request(
            f"{ollama_url}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            response_text = result.get("response", "").strip()
            return _parse_numbered_list(response_text, count)
    except Exception as e:
        print(f"  Ollama error: {e}", file=sys.stderr)
        return None


def _parse_numbered_list(text, expected_count):
    """Parse a numbered list response back into a word list."""
    import re
    lines = text.strip().split("\n")
    words = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Match "1. word" or "1: word" or just "1 word"
        m = re.match(r"^\d+[\.\:\)\s]+\s*(.*)", line)
        if m:
            word = m.group(1).strip()
            if word:
                words.append(word)
    if len(words) == expected_count:
        return words
    return None


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
