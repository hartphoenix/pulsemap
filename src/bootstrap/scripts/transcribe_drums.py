#!/usr/bin/env python3
"""Transcribe drum hits from isolated drum stem using librosa. JSON summary to stdout."""

import json
import sys


# General MIDI drum map
GM_KICK = 36
GM_SNARE = 38
GM_HIHAT_CLOSED = 42

KICK_FREQ_MAX = 200
SNARE_FREQ_MAX = 2000


def main():
    if len(sys.argv) != 3:
        print(
            json.dumps(
                {"error": "Usage: transcribe_drums.py <drum_stem_path> <output_midi_path>"}
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    drum_path, output_path = sys.argv[1], sys.argv[2]

    try:
        import librosa
        import numpy as np
        from pretty_midi import PrettyMIDI, Instrument, Note
    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        y, sr = librosa.load(drum_path, sr=44100, mono=True)

        onset_frames = librosa.onset.onset_detect(
            y=y, sr=sr, hop_length=512, backtrack=True, units="frames"
        )
        onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=512)
        onset_strengths = librosa.onset.onset_strength(
            y=y, sr=sr, hop_length=512
        )

        S = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))
        freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)

        kick_bins = freqs < KICK_FREQ_MAX
        snare_bins = (freqs >= KICK_FREQ_MAX) & (freqs < SNARE_FREQ_MAX)
        hihat_bins = freqs >= SNARE_FREQ_MAX

        midi = PrettyMIDI()
        instrument = Instrument(program=0, is_drum=True, name="drums")

        for i, frame_idx in enumerate(onset_frames):
            if frame_idx >= S.shape[1]:
                continue

            spectrum = S[:, frame_idx]
            kick_energy = float(np.sum(spectrum[kick_bins]))
            snare_energy = float(np.sum(spectrum[snare_bins]))
            hihat_energy = float(np.sum(spectrum[hihat_bins]))

            total = kick_energy + snare_energy + hihat_energy
            if total < 1e-6:
                continue

            onset_t = float(onset_times[i])
            note_duration = 0.05  # 50ms for drum hits

            # Velocity from onset strength
            if i < len(onset_strengths):
                raw_vel = onset_strengths[frame_idx] if frame_idx < len(onset_strengths) else 0.5
            else:
                raw_vel = 0.5
            velocity = max(30, min(127, int(raw_vel * 127)))

            kick_ratio = kick_energy / total
            snare_ratio = snare_energy / total
            hihat_ratio = hihat_energy / total

            # Classify by dominant frequency band
            if kick_ratio > 0.4:
                instrument.notes.append(
                    Note(velocity=velocity, pitch=GM_KICK, start=onset_t, end=onset_t + note_duration)
                )
            if snare_ratio > 0.3:
                instrument.notes.append(
                    Note(velocity=velocity, pitch=GM_SNARE, start=onset_t, end=onset_t + note_duration)
                )
            if hihat_ratio > 0.3:
                instrument.notes.append(
                    Note(
                        velocity=max(30, velocity - 20),
                        pitch=GM_HIHAT_CLOSED,
                        start=onset_t,
                        end=onset_t + note_duration,
                    )
                )

        midi.instruments.append(instrument)
        midi.write(output_path)

        note_count = len(instrument.notes)
        duration_ms = round(midi.get_end_time() * 1000) if note_count > 0 else 0

        print(
            json.dumps(
                {
                    "midi_path": output_path,
                    "label": "drums",
                    "note_count": note_count,
                    "duration_ms": duration_ms,
                }
            )
        )

    except Exception as e:
        print(f"Drum transcription failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
