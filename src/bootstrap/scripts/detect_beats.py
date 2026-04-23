#!/usr/bin/env python3
"""Detect beats and downbeats using beat_this + librosa PLP for local tempo. JSON to stdout."""

import json
import sys


def main():
    if len(sys.argv) != 2:
        print(
            json.dumps({"error": "Usage: detect_beats.py <audio_path>"}),
            file=sys.stderr,
        )
        sys.exit(1)

    audio_path = sys.argv[1]

    # Redirect stdout during imports and model loading — beat_this/torch
    # print download progress to stdout which corrupts our JSON output
    import os

    real_stdout = sys.stdout
    sys.stdout = open(os.devnull, "w")

    try:
        import numpy as np
        import librosa
        from beat_this.inference import File2Beats
    except ImportError as e:
        sys.stdout = real_stdout
        print(f"Missing dependency: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        print("Running beat_this beat/downbeat detection...", file=sys.stderr)
        file2beats = File2Beats(device="cpu", dbn=False)
        beat_times, downbeat_times = file2beats(audio_path)

        # Restore stdout for our JSON output
        sys.stdout = real_stdout

        beat_times = sorted(beat_times.tolist())
        downbeat_times = sorted(downbeat_times.tolist())
        downbeat_set = set(round(d, 4) for d in downbeat_times)

        # Compute local tempo using librosa PLP
        print("Computing local tempo curve...", file=sys.stderr)
        y, sr = librosa.load(audio_path, sr=22050)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        plp_curve = librosa.beat.plp(onset_envelope=onset_env, sr=sr)
        plp_times = librosa.times_like(plp_curve, sr=sr)

        def local_bpm_at(time_sec):
            """Estimate local BPM from PLP curve at a given time."""
            idx = np.searchsorted(plp_times, time_sec)
            idx = min(idx, len(plp_times) - 1)
            # PLP gives pulse strength, not BPM directly.
            # Estimate BPM from inter-beat intervals in a local window.
            return None  # We'll compute from actual beat intervals instead

        # Build beat events with downbeat flags and local BPM
        beats = []
        current_measure_start = 0
        beats_in_measure = 0

        for i, t in enumerate(beat_times):
            is_downbeat = any(abs(t - d) < 0.05 for d in downbeat_times)

            # Compute local BPM from nearby beat intervals
            local_bpm = None
            window = 4  # use 4 surrounding beats
            nearby_beats = beat_times[max(0, i - window):min(len(beat_times), i + window + 1)]
            if len(nearby_beats) >= 2:
                intervals = [nearby_beats[j + 1] - nearby_beats[j]
                             for j in range(len(nearby_beats) - 1)]
                avg_interval = np.median(intervals)
                if avg_interval > 0:
                    local_bpm = round(60.0 / avg_interval, 1)

            beat_event = {
                "t": round(t * 1000),
                "downbeat": is_downbeat,
            }

            if is_downbeat:
                # Infer time signature from beats since last downbeat
                if beats_in_measure > 0:
                    # Only annotate if this is a new measure
                    pass
                beats_in_measure = 0
                current_measure_start = i

            beats_in_measure += 1

            # Add BPM on first beat and when it changes
            if local_bpm is not None:
                if i == 0:
                    beat_event["bpm"] = local_bpm
                elif len(beats) > 0 and "bpm" in beats[-1]:
                    prev_bpm = beats[-1]["bpm"]
                    if abs(local_bpm - prev_bpm) > 2.0:
                        beat_event["bpm"] = local_bpm
                elif len(beats) > 0:
                    # Walk back to find last BPM
                    for prev in reversed(beats):
                        if "bpm" in prev:
                            if abs(local_bpm - prev["bpm"]) > 2.0:
                                beat_event["bpm"] = local_bpm
                            break
                    else:
                        beat_event["bpm"] = local_bpm

            beats.append(beat_event)

        # Infer time signatures from downbeat spacing
        downbeat_indices = [i for i, b in enumerate(beats) if b["downbeat"]]
        time_sigs = {}
        for j in range(len(downbeat_indices) - 1):
            measure_len = downbeat_indices[j + 1] - downbeat_indices[j]
            measure_start_t = beats[downbeat_indices[j]]["t"]
            if measure_len in (2, 3, 4, 5, 6, 7):
                sig = f"{measure_len}/4"
                if measure_len == 6:
                    # Could be 6/8 or 6/4 — check beat interval
                    interval = (beats[downbeat_indices[j] + 1]["t"] -
                                beats[downbeat_indices[j]]["t"])
                    if interval < 300:  # fast subdivisions suggest 6/8
                        sig = "6/8"
                time_sigs[downbeat_indices[j]] = sig

        # Apply time signatures to beat events (sparse, only on change)
        prev_sig = None
        for idx, sig in sorted(time_sigs.items()):
            if sig != prev_sig:
                beats[idx]["time_sig"] = sig
                prev_sig = sig

        # If no time sig was set on the first beat, default to most common
        if beats and "time_sig" not in beats[0]:
            from collections import Counter
            sig_counts = Counter(time_sigs.values())
            if sig_counts:
                beats[0]["time_sig"] = sig_counts.most_common(1)[0][0]
            else:
                beats[0]["time_sig"] = "4/4"

        # Compute overall predominant tempo
        all_intervals = [beat_times[i + 1] - beat_times[i]
                         for i in range(len(beat_times) - 1)]
        if all_intervals:
            median_interval = float(np.median(all_intervals))
            predominant_bpm = round(60.0 / median_interval, 1)
        else:
            predominant_bpm = 120.0

        result = {
            "beats": beats,
            "tempo": predominant_bpm,
            "beat_count": len(beats),
            "downbeat_count": len(downbeat_indices),
        }

        print(json.dumps(result))

    except Exception as e:
        sys.stdout = real_stdout
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(f"Beat detection failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
