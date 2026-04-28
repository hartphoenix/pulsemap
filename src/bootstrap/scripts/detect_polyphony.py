#!/usr/bin/env python3
"""Detect vocal polyphony using a two-gate cascade. JSON to stdout."""

import json
import sys


def rms(arr):
    import numpy as np
    return float(np.sqrt(np.mean(arr ** 2)))


def find_loudest_window(audio, sr, window_sec=15):
    """Return the mono audio slice from the loudest 15-second window."""
    import numpy as np

    window_samples = int(window_sec * sr)
    if len(audio) <= window_samples:
        return audio

    step = sr  # 1-second steps
    best_rms = -1.0
    best_start = 0

    for start in range(0, len(audio) - window_samples + 1, step):
        chunk = audio[start:start + window_samples]
        r = rms(chunk)
        if r > best_rms:
            best_rms = r
            best_start = start

    return audio[best_start:best_start + window_samples]


def gate2_klapuri(audio_mono, sr):
    """
    Run MultiPitchKlapuri on a mono window.
    Returns (polyphonic: bool, percent_polyphonic: float).
    """
    import numpy as np
    import essentia.standard as es

    frame_size = 2048
    hop_size = 128

    detector = es.MultiPitchKlapuri(frameSize=frame_size, hopSize=hop_size,
                                    sampleRate=sr)
    pitches = detector(audio_mono)  # list of frames, each a list of pitches

    total_frames = len(pitches)
    if total_frames == 0:
        return False, 0.0

    poly_frames = sum(1 for frame in pitches if len(frame) >= 2)
    percent = poly_frames / total_frames

    return percent > 0.30, round(percent * 100, 1)


def main():
    if len(sys.argv) != 2:
        print(
            json.dumps({"error": "Usage: detect_polyphony.py <vocal_stem_path>"}),
            file=sys.stderr,
        )
        sys.exit(1)

    vocal_path = sys.argv[1]

    try:
        import numpy as np
        import soundfile as sf
    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        sys.exit(1)

    print("Loading vocal stem...", file=sys.stderr)
    try:
        audio, sr = sf.read(vocal_path, always_2d=True)
    except Exception as e:
        print(f"Failed to load audio: {e}", file=sys.stderr)
        sys.exit(1)

    # audio shape: (samples, channels)
    channels = audio.shape[1]
    gate1_ratio = None

    if channels >= 2:
        print("Gate 1: mid/side ratio...", file=sys.stderr)
        left = audio[:, 0].astype(np.float64)
        right = audio[:, 1].astype(np.float64)
        mid = (left + right) / 2.0
        side = (left - right) / 2.0

        mid_rms = rms(mid)
        if mid_rms < 1e-9:
            # Silent mid — treat as ambiguous, fall through to Gate 2
            print("Gate 1: mid channel silent, skipping to Gate 2", file=sys.stderr)
            gate1_ratio = 0.0
            mono = mid
        else:
            gate1_ratio = rms(side) / mid_rms
            print(f"Gate 1: ratio = {gate1_ratio:.4f}", file=sys.stderr)

            if gate1_ratio < 0.05:
                print("Gate 1: solo (ratio below 0.05)", file=sys.stderr)
                print(json.dumps({
                    "polyphonic": False,
                    "gate1_ratio": round(gate1_ratio, 4),
                    "method": "mid_side",
                }))
                return

            if gate1_ratio > 0.15:
                print("Gate 1: polyphonic (ratio above 0.15)", file=sys.stderr)
                print(json.dumps({
                    "polyphonic": True,
                    "gate1_ratio": round(gate1_ratio, 4),
                    "method": "mid_side",
                }))
                return

            print("Gate 1: ambiguous, proceeding to Gate 2", file=sys.stderr)
            mono = mid
    else:
        print("Gate 1: mono input, skipping to Gate 2", file=sys.stderr)
        mono = audio[:, 0].astype(np.float64)

    # Gate 2: MultiPitchKlapuri on loudest 15s window
    print("Gate 2: finding loudest 15s window...", file=sys.stderr)
    window = find_loudest_window(mono, sr, window_sec=15)

    print("Gate 2: running MultiPitchKlapuri...", file=sys.stderr)
    try:
        import essentia  # noqa: F401
    except ImportError as e:
        print(f"Missing essentia dependency: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        polyphonic, gate2_percent = gate2_klapuri(window.astype(np.float32), sr)
    except Exception as e:
        print(f"Gate 2 failed: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Gate 2: {gate2_percent}% polyphonic frames", file=sys.stderr)

    result = {
        "polyphonic": polyphonic,
        "gate2_percent": gate2_percent,
        "method": "klapuri",
    }
    if gate1_ratio is not None:
        result["gate1_ratio"] = round(gate1_ratio, 4)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
