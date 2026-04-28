#!/usr/bin/env python3
"""Transcribe a pitched audio stem to MIDI using basic-pitch. JSON summary to stdout."""

import json
import os
import sys


def main():
    if len(sys.argv) != 4:
        print(
            json.dumps(
                {
                    "error": "Usage: transcribe_pitched.py <stem_path> <output_midi_path> <stem_label>"
                }
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    stem_path, output_path, label = sys.argv[1], sys.argv[2], sys.argv[3]

    # Redirect stdout to devnull during import and predict —
    # basic-pitch prints verbose debug info (isfinite, shape, dtype)
    # to stdout on every frame, which corrupts our JSON output
    real_stdout = sys.stdout
    sys.stdout = open(os.devnull, "w")

    try:
        from basic_pitch.inference import predict
    except ImportError as e:
        sys.stdout = real_stdout
        print(f"Missing dependency: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        onset_threshold = 0.5
        frame_threshold = 0.3
        minimum_note_length = 58

        if label == "other":
            onset_threshold = 0.45
            frame_threshold = 0.25

        model_output, midi_data, note_events = predict(
            stem_path,
            onset_threshold=onset_threshold,
            frame_threshold=frame_threshold,
            minimum_note_length=minimum_note_length,
            multiple_pitch_bends=True,
        )

        midi_data.write(output_path)

        note_count = sum(len(inst.notes) for inst in midi_data.instruments)
        duration_sec = midi_data.get_end_time()

        # Restore stdout for our JSON output
        sys.stdout = real_stdout
        print(
            json.dumps(
                {
                    "midi_path": output_path,
                    "label": label,
                    "note_count": note_count,
                    "duration_ms": round(duration_sec * 1000),
                }
            )
        )

    except Exception as e:
        sys.stdout = real_stdout
        print(f"Transcription failed for {label}: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
