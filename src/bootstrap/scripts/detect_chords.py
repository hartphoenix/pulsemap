#!/usr/bin/env python3
"""Detect chords using lv-chordia (large vocabulary). JSON to stdout."""

import json
import sys


def main():
    if len(sys.argv) != 2:
        print(
            json.dumps({"error": "Usage: detect_chords.py <audio_path>"}),
            file=sys.stderr,
        )
        sys.exit(1)

    audio_path = sys.argv[1]

    try:
        from lv_chordia.chord_recognition import chord_recognition
    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        print("Running lv-chordia chord recognition...", file=sys.stderr)
        results = chord_recognition(audio_path, chord_dict_name="submission")

        chords = []
        for entry in results:
            start_ms = round(entry["start_time"] * 1000)
            end_ms = round(entry["end_time"] * 1000)
            chord_label = entry["chord"]

            if chord_label == "N" or chord_label == "X":
                continue

            # Convert JAMS notation (C:maj7) to standard notation (Cmaj7)
            chord_name = jams_to_standard(chord_label)

            chords.append({"t": start_ms, "chord": chord_name, "end": end_ms})

        print(json.dumps(chords))

    except Exception as e:
        print(f"Chord detection failed: {e}", file=sys.stderr)
        sys.exit(1)


def jams_to_standard(jams_chord):
    """Convert JAMS chord notation to standard lead sheet notation.

    JAMS: 'C:maj7', 'F#:min', 'Bb:7', 'G:sus4', 'D:min7/b3'
    Standard: 'Cmaj7', 'F#m', 'Bb7', 'Gsus4', 'Dm7/Bb'
    """
    if ":" not in jams_chord:
        return jams_chord

    parts = jams_chord.split(":")
    root = parts[0]
    quality_and_bass = parts[1] if len(parts) > 1 else ""

    # Handle slash chords: quality/bass_interval
    bass_part = ""
    if "/" in quality_and_bass:
        quality, bass_interval = quality_and_bass.rsplit("/", 1)
        bass_note = interval_to_note(root, bass_interval)
        if bass_note:
            bass_part = f"/{bass_note}"
    else:
        quality = quality_and_bass

    # Map JAMS quality names to standard notation
    quality_map = {
        "maj": "",
        "min": "m",
        "aug": "aug",
        "dim": "dim",
        "maj7": "maj7",
        "min7": "m7",
        "7": "7",
        "dim7": "dim7",
        "hdim7": "m7b5",
        "minmaj7": "mMaj7",
        "maj6": "6",
        "min6": "m6",
        "9": "9",
        "maj9": "maj9",
        "min9": "m9",
        "11": "11",
        "13": "13",
        "sus2": "sus2",
        "sus4": "sus4",
        "sus4(b7)": "7sus4",
        "sus4(b7,9)": "9sus4",
        "1": "5",
        "(1,5)": "5",
    }

    std_quality = quality_map.get(quality, quality)
    return f"{root}{std_quality}{bass_part}"


# Interval-to-note mapping for slash chord bass notes
NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

INTERVAL_SEMITONES = {
    "1": 0,
    "b2": 1,
    "2": 2,
    "b3": 3,
    "3": 4,
    "4": 5,
    "b5": 6,
    "5": 7,
    "#5": 8,
    "b6": 8,
    "6": 9,
    "b7": 10,
    "7": 11,
}


def note_to_index(note):
    for i, n in enumerate(NOTES):
        if n == note:
            return i
    for i, n in enumerate(FLAT_NOTES):
        if n == note:
            return i
    return None


def interval_to_note(root, interval):
    root_idx = note_to_index(root)
    semitones = INTERVAL_SEMITONES.get(interval)
    if root_idx is None or semitones is None:
        return None
    target_idx = (root_idx + semitones) % 12
    # Use flats for flat roots, sharps otherwise
    if "b" in root:
        return FLAT_NOTES[target_idx]
    return NOTES[target_idx]


if __name__ == "__main__":
    main()
