#!/usr/bin/env python3
"""Infer chords from bass + other stem MIDI using pitch class analysis. JSON to stdout."""

import json
import sys


def main():
    if len(sys.argv) != 4:
        print(
            json.dumps(
                {
                    "error": "Usage: infer_chords_midi.py <bass_midi_path> <other_midi_path> <beats_json_path>"
                }
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    bass_midi_path, other_midi_path, beats_json_path = sys.argv[1], sys.argv[2], sys.argv[3]

    try:
        import pretty_midi
        from pychord import find_chords_from_notes
    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        bass_midi = pretty_midi.PrettyMIDI(bass_midi_path)
        other_midi = pretty_midi.PrettyMIDI(other_midi_path)

        with open(beats_json_path) as f:
            beats = json.load(f)

        if len(beats) < 2:
            print(json.dumps([]))
            return

        NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

        def midi_to_note_name(midi_num):
            return NOTE_NAMES[midi_num % 12]

        def get_notes_in_range(midi_obj, start_s, end_s):
            notes = []
            for inst in midi_obj.instruments:
                for note in inst.notes:
                    if note.start < end_s and note.end > start_s:
                        overlap = min(note.end, end_s) - max(note.start, start_s)
                        notes.append((note.pitch, overlap, note.velocity))
            return notes

        chords = []
        prev_chord = None

        for i in range(len(beats) - 1):
            beat_start = beats[i]["t"] / 1000.0
            beat_end = beats[i + 1]["t"] / 1000.0

            bass_notes = get_notes_in_range(bass_midi, beat_start, beat_end)
            other_notes = get_notes_in_range(other_midi, beat_start, beat_end)

            if not other_notes:
                continue

            # Find dominant bass note (longest duration)
            bass_note_name = None
            if bass_notes:
                bass_notes.sort(key=lambda x: -x[1])
                bass_note_name = midi_to_note_name(bass_notes[0][0])

            # Collect pitch classes from other stem, weighted by duration
            pitch_class_weight = {}
            for pitch, dur, vel in other_notes:
                pc = midi_to_note_name(pitch)
                pitch_class_weight[pc] = pitch_class_weight.get(pc, 0) + dur * vel

            # Top note names by weight
            sorted_pcs = sorted(pitch_class_weight.items(), key=lambda x: -x[1])
            top_notes = [pc for pc, _ in sorted_pcs[:6]]

            if len(top_notes) < 2:
                continue

            # Try pychord matching
            try:
                matches = find_chords_from_notes(top_notes)
                if matches:
                    chord_name = str(matches[0])

                    # Add slash bass if different from chord root
                    if bass_note_name and not chord_name.startswith(bass_note_name):
                        chord_root = chord_name[0]
                        if len(chord_name) > 1 and chord_name[1] in ("#", "b"):
                            chord_root = chord_name[:2]
                        if bass_note_name != chord_root:
                            chord_name = f"{chord_name}/{bass_note_name}"

                    start_ms = round(beat_start * 1000)
                    end_ms = round(beat_end * 1000)

                    # Merge with previous if same chord
                    if prev_chord and prev_chord["chord"] == chord_name:
                        prev_chord["end"] = end_ms
                    else:
                        chord_event = {"t": start_ms, "chord": chord_name, "end": end_ms}
                        chords.append(chord_event)
                        prev_chord = chord_event
            except Exception:
                continue

        print(json.dumps(chords))

    except Exception as e:
        print(f"MIDI chord inference failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
