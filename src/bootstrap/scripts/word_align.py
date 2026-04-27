#!/usr/bin/env python3
"""Word-level alignment using WhisperX transcription + wav2vec2 phoneme alignment.

Transcribes the vocal stem with WhisperX (base model), aligns at phoneme
level with wav2vec2, and optionally validates LRCLIB line timestamps
against the discovered word clusters.

Usage: word_align.py <vocal_stem_path> [lyrics_json_path]
"""

import json
import sys


def main():
    if len(sys.argv) < 2:
        print("Usage: word_align.py <vocal_stem_path> [lyrics_json_path]", file=sys.stderr)
        sys.exit(1)

    vocal_path = sys.argv[1]
    lyrics_json_path = sys.argv[2] if len(sys.argv) > 2 else None

    lrclib_lines = None
    if lyrics_json_path:
        try:
            with open(lyrics_json_path) as f:
                lrclib_lines = json.load(f)
            if not lrclib_lines:
                lrclib_lines = None
        except Exception:
            lrclib_lines = None

    # whisperx's log_utils.setup_logging() adds a StreamHandler(sys.stdout).
    # Patch it to use stderr before importing whisperx.
    import logging
    import whisperx.log_utils as _log_utils

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
    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
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

        # LRCLIB validation
        lrclib_validated = False
        lrclib_offset_ms = None
        if lrclib_lines:
            lrclib_validated, lrclib_offset_ms = validate_lrclib(
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
        sys.stderr.flush()

        output = {
            "words": words,
            "lrclib_validated": lrclib_validated,
            "lrclib_offset_ms": lrclib_offset_ms,
            "source": "whisperx",
        }
        sys.stdout.write(json.dumps(output))
        sys.stdout.flush()

    except Exception as e:
        print(f"WhisperX alignment failed: {e}", file=sys.stderr)
        sys.exit(1)


def validate_lrclib(lrclib_lines, segments):
    """Validate LRCLIB line timestamps against WhisperX word clusters."""
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
