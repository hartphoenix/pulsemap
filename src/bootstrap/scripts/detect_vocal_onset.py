"""Detect first vocal onset in a wav file via RMS energy threshold."""

import sys
import json
import numpy as np
import soundfile as sf

def detect_vocal_onset(path: str, frame_ms: int = 50, threshold_db: float = -40.0) -> dict:
    audio, sr = sf.read(path)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    frame_len = int(sr * frame_ms / 1000)
    hop = frame_len

    threshold_linear = 10 ** (threshold_db / 20)

    for i in range(0, len(audio) - frame_len, hop):
        frame = audio[i : i + frame_len]
        rms = np.sqrt(np.mean(frame ** 2))
        if rms > threshold_linear:
            onset_ms = int(i / sr * 1000)
            return {"onset_ms": onset_ms, "rms_db": round(20 * np.log10(rms + 1e-10), 1)}

    return {"onset_ms": -1, "rms_db": None}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: detect_vocal_onset.py <vocal_stem.wav> [--threshold-db <dB>]", file=sys.stderr)
        sys.exit(1)

    path = sys.argv[1]
    threshold = -40.0
    for i, arg in enumerate(sys.argv):
        if arg == "--threshold-db" and i + 1 < len(sys.argv):
            threshold = float(sys.argv[i + 1])

    result = detect_vocal_onset(path, threshold_db=threshold)
    print(json.dumps(result))
