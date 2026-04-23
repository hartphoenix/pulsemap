#!/usr/bin/env python3
"""Transcribe vocal melody using torchcrepe for pitch tracking. JSON summary to stdout."""

import json
import sys


def main():
    if len(sys.argv) != 3:
        print(
            json.dumps(
                {"error": "Usage: transcribe_vocals.py <vocal_stem_path> <output_midi_path>"}
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    vocal_path, output_path = sys.argv[1], sys.argv[2]

    try:
        import torch
        import torchcrepe
        import torchaudio
        from pretty_midi import PrettyMIDI, Instrument, Note
        import numpy as np
    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        print(
            "Install with: pip install torchcrepe torchaudio pretty_midi numpy",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        audio, sr = torchaudio.load(vocal_path)
        if audio.shape[0] > 1:
            audio = audio.mean(dim=0, keepdim=True)

        if sr != 16000:
            resampler = torchaudio.transforms.Resample(sr, 16000)
            audio = resampler(audio)
            sr = 16000

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        audio = audio.to(device)

        hop_length = 160  # 10ms at 16kHz
        pitch, periodicity = torchcrepe.predict(
            audio,
            sr,
            hop_length=hop_length,
            fmin=80,
            fmax=800,
            model="tiny",
            batch_size=512,
            device=device,
            return_periodicity=True,
        )

        pitch = pitch.squeeze().cpu().numpy()
        periodicity = periodicity.squeeze().cpu().numpy()

        confidence_threshold = 0.5
        min_note_duration_ms = 60

        midi = PrettyMIDI()
        instrument = Instrument(program=0, name="vocals")

        hop_sec = hop_length / sr
        in_note = False
        note_start = 0.0
        note_pitches = []

        for i in range(len(pitch)):
            t = i * hop_sec
            conf = periodicity[i]
            freq = pitch[i]

            if conf >= confidence_threshold and freq > 0:
                midi_pitch = 12 * np.log2(freq / 440.0) + 69
                if not in_note:
                    in_note = True
                    note_start = t
                    note_pitches = [midi_pitch]
                else:
                    note_pitches.append(midi_pitch)
            else:
                if in_note:
                    duration_ms = (t - note_start) * 1000
                    if duration_ms >= min_note_duration_ms and note_pitches:
                        avg_pitch = int(round(np.median(note_pitches)))
                        avg_pitch = max(0, min(127, avg_pitch))
                        instrument.notes.append(
                            Note(
                                velocity=80,
                                pitch=avg_pitch,
                                start=note_start,
                                end=t,
                            )
                        )
                    in_note = False
                    note_pitches = []

        if in_note and note_pitches:
            t_end = len(pitch) * hop_sec
            duration_ms = (t_end - note_start) * 1000
            if duration_ms >= min_note_duration_ms:
                avg_pitch = int(round(np.median(note_pitches)))
                avg_pitch = max(0, min(127, avg_pitch))
                instrument.notes.append(
                    Note(velocity=80, pitch=avg_pitch, start=note_start, end=t_end)
                )

        midi.instruments.append(instrument)
        midi.write(output_path)

        note_count = len(instrument.notes)
        duration_ms = round(midi.get_end_time() * 1000) if note_count > 0 else 0

        print(
            json.dumps(
                {
                    "midi_path": output_path,
                    "label": "vocals",
                    "note_count": note_count,
                    "duration_ms": duration_ms,
                }
            )
        )

    except Exception as e:
        print(f"Vocal transcription failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
