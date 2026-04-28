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
        from pretty_midi import PrettyMIDI, Instrument, Note, PitchBend, ControlChange
        import numpy as np
        from scipy.ndimage import median_filter
    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        print(
            "Install with: pip install torchcrepe torchaudio pretty_midi numpy scipy",
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

        # --- RMS velocity ---
        # Compute per-frame RMS using hop-aligned windows on the raw waveform.
        audio_np = audio.squeeze().cpu().numpy()
        n_frames = len(pitch)
        rms = np.zeros(n_frames, dtype=np.float32)
        for i in range(n_frames):
            start_sample = i * hop_length
            end_sample = min(start_sample + hop_length, len(audio_np))
            frame = audio_np[start_sample:end_sample]
            rms[i] = np.sqrt(np.mean(frame ** 2)) if len(frame) > 0 else 0.0

        max_rms = np.percentile(rms[rms > 0], 95) if np.any(rms > 0) else 1.0
        max_rms = max(max_rms, 1e-8)

        def rms_to_velocity(frame_rms_values):
            mean_rms = np.mean(frame_rms_values) if len(frame_rms_values) > 0 else 0.0
            v = np.sqrt(mean_rms / max_rms) * 127.0
            return int(np.clip(round(v), 1, 127))

        # --- Pitch-derivative segmentation helpers ---
        confidence_threshold = 0.5
        min_note_duration_ms = 60
        # 80-100 cents per hop = 0.8-1.0 semitones — use 0.9 as threshold
        pitch_derivative_threshold = 0.9  # semitones per hop

        hop_sec = hop_length / sr

        # Convert pitch to MIDI pitch array; set unvoiced frames to NaN
        midi_pitch_raw = np.where(
            (periodicity >= confidence_threshold) & (pitch > 0),
            12.0 * np.log2(np.maximum(pitch, 1e-8) / 440.0) + 69.0,
            np.nan,
        )

        # Compute |df0/dt| in semitones per hop, median-filtered over 5 frames
        voiced = ~np.isnan(midi_pitch_raw)
        pitch_deriv = np.zeros(n_frames, dtype=np.float32)
        for i in range(1, n_frames):
            if voiced[i] and voiced[i - 1]:
                pitch_deriv[i] = abs(midi_pitch_raw[i] - midi_pitch_raw[i - 1])
        pitch_deriv_smooth = median_filter(pitch_deriv, size=5)

        # --- Build note segments ---
        # A segment boundary occurs at:
        #   1. voiced→unvoiced or unvoiced→voiced transition
        #   2. voiced→voiced with pitch derivative exceeding threshold
        segments = []  # list of (start_idx, end_idx_exclusive)
        seg_start = None

        for i in range(n_frames):
            is_voiced = voiced[i]
            if is_voiced:
                if seg_start is None:
                    seg_start = i
                else:
                    # Check if pitch derivative forces a split
                    if pitch_deriv_smooth[i] >= pitch_derivative_threshold:
                        segments.append((seg_start, i))
                        seg_start = i
            else:
                if seg_start is not None:
                    segments.append((seg_start, i))
                    seg_start = None

        if seg_start is not None:
            segments.append((seg_start, n_frames))

        # --- MIDI construction ---
        BEND_RANGE_SEMITONES = 2.0

        midi = PrettyMIDI()
        instrument = Instrument(program=0, name="vocals")

        # Set pitch bend range via RPN at time 0:
        # CC 101=0, CC 100=0, CC 6=<range>, CC 38=0
        for cc_num, cc_val in [(101, 0), (100, 0), (6, int(BEND_RANGE_SEMITONES)), (38, 0)]:
            instrument.control_changes.append(ControlChange(cc_num, cc_val, time=0.0))

        for seg_start_idx, seg_end_idx in segments:
            seg_frames = list(range(seg_start_idx, seg_end_idx))
            if not seg_frames:
                continue

            t_start = seg_start_idx * hop_sec
            t_end = seg_end_idx * hop_sec
            duration_ms = (t_end - t_start) * 1000.0

            if duration_ms < min_note_duration_ms:
                continue

            pitches_in_seg = midi_pitch_raw[seg_start_idx:seg_end_idx]
            valid_pitches = pitches_in_seg[~np.isnan(pitches_in_seg)]
            if len(valid_pitches) == 0:
                continue

            base_pitch = int(np.clip(round(np.median(valid_pitches)), 0, 127))
            velocity = rms_to_velocity(rms[seg_start_idx:seg_end_idx])

            instrument.notes.append(
                Note(velocity=velocity, pitch=base_pitch, start=t_start, end=t_end)
            )

            # Per-frame pitch bend messages
            for frame_idx in seg_frames:
                if np.isnan(midi_pitch_raw[frame_idx]):
                    continue
                deviation = midi_pitch_raw[frame_idx] - base_pitch
                # MIDI pitch bend: 0 = full down, 8192 = center, 16383 = full up
                bend_normalized = deviation / BEND_RANGE_SEMITONES
                bend_value = int(np.clip(round(bend_normalized * 8191), -8192, 8191)) + 8192
                t_frame = frame_idx * hop_sec
                instrument.pitch_bends.append(PitchBend(bend_value, time=t_frame))

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
