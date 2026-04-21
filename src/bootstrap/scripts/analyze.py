#!/usr/bin/env python3
"""Audio analysis for pulsemap bootstrap. Outputs JSON to stdout."""

import json
import sys


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: analyze.py <audio_path>"}))
        sys.exit(1)

    audio_path = sys.argv[1]

    try:
        import essentia
        import essentia.standard as es
        import numpy as np
    except ImportError as e:
        print(
            f"Missing dependency: {e}. Install with: pip3 install essentia\n"
            f"  Python: {sys.executable}\n"
            f"  sys.path: {sys.path}",
            file=sys.stderr,
        )
        sys.exit(1)

    result = {}
    sample_rate = 44100

    audio = es.MonoLoader(filename=audio_path, sampleRate=sample_rate)()
    duration_sec = len(audio) / float(sample_rate)

    # --- Beat tracking + tempo ---
    try:
        rhythm = es.RhythmExtractor2013(method="multifeature")
        bpm, beat_positions, confidence, _, _ = rhythm(audio)

        result["tempo"] = round(float(bpm), 1)

        # essentia doesn't estimate time signature; default to 4/4
        time_sig = "4/4"
        beats_per_measure = 4
        result["time_signature"] = time_sig

        beats = []
        for i, pos in enumerate(beat_positions):
            beat = {
                "t": round(float(pos) * 1000),
                "downbeat": (i % beats_per_measure) == 0,
            }
            if i == 0:
                beat["bpm"] = round(float(bpm), 1)
                beat["time_sig"] = time_sig
            beats.append(beat)

        result["beats"] = beats
    except Exception as e:
        print(f"Beat tracking failed: {e}", file=sys.stderr)

    # --- Key detection (temperley profile for better major/minor discrimination) ---
    try:
        key, scale, strength = es.KeyExtractor(profileType="temperley")(audio)
        result["key"] = str(key)
        result["scale"] = str(scale)
    except Exception as e:
        print(f"Key detection failed: {e}", file=sys.stderr)

    # --- Chord detection via HPCP ---
    try:
        frame_size = 8192
        hop_size = 2048

        windowing = es.Windowing(type="blackmanharris62")
        spectrum_algo = es.Spectrum(size=frame_size)
        spectral_peaks = es.SpectralPeaks(
            sampleRate=sample_rate,
            maxPeaks=60,
            magnitudeThreshold=0.00001,
            minFrequency=20,
            maxFrequency=3500,
        )
        hpcp_algo = es.HPCP(
            size=36,
            referenceFrequency=440,
            harmonics=8,
            bandPreset=True,
            minFrequency=20,
            maxFrequency=3500,
        )

        hpcps = []
        for frame in es.FrameGenerator(
            audio, frameSize=frame_size, hopSize=hop_size, startFromZero=True
        ):
            windowed = windowing(frame)
            spec = spectrum_algo(windowed)
            freqs, mags = spectral_peaks(spec)
            h = hpcp_algo(freqs, mags)
            hpcps.append(h)

        if hpcps:
            hpcp_array = np.array(hpcps)
            chords_algo = es.ChordsDetection(
                hopSize=hop_size, sampleRate=sample_rate
            )
            chord_labels, strengths = chords_algo(hpcp_array)

            hop_duration_ms = (hop_size / float(sample_rate)) * 1000
            chord_events = []
            current_chord = None
            start_t = 0.0

            for i, label in enumerate(chord_labels):
                label = str(label)
                if label != current_chord:
                    if current_chord is not None:
                        chord_events.append(
                            {
                                "t": round(start_t),
                                "chord": current_chord,
                                "end": round(i * hop_duration_ms),
                            }
                        )
                    current_chord = label
                    start_t = i * hop_duration_ms

            if current_chord is not None:
                chord_events.append(
                    {"t": round(start_t), "chord": current_chord}
                )

            result["chords"] = chord_events
    except Exception as e:
        print(f"Chord detection failed: {e}", file=sys.stderr)

    # --- Section segmentation via spectral novelty ---
    try:
        seg_frame_size = 4096
        seg_hop_size = 2048

        windowing2 = es.Windowing(type="hann")
        spectrum2 = es.Spectrum(size=seg_frame_size)
        mfcc_algo = es.MFCC(numberCoefficients=13)

        mfccs = []
        for frame in es.FrameGenerator(
            audio,
            frameSize=seg_frame_size,
            hopSize=seg_hop_size,
            startFromZero=True,
        ):
            windowed = windowing2(frame)
            spec = spectrum2(windowed)
            _, coeffs = mfcc_algo(spec)
            mfccs.append(coeffs)

        mfcc_array = np.array(mfccs)

        if len(mfcc_array) > 100:
            seg_hop_sec = seg_hop_size / float(sample_rate)

            # Frame-to-frame spectral distance
            diffs = np.linalg.norm(np.diff(mfcc_array, axis=0), axis=1)

            # Smooth with ~3 second window
            smooth_frames = max(1, int(3.0 / seg_hop_sec))
            kernel = np.ones(smooth_frames) / smooth_frames
            novelty = np.convolve(diffs, kernel, mode="same")

            # Peak detection: local maxima above threshold, min 8s apart
            min_distance = int(8.0 / seg_hop_sec)
            threshold = np.mean(novelty) + 0.7 * np.std(novelty)

            peaks = []
            for i in range(1, len(novelty) - 1):
                if (
                    novelty[i] > threshold
                    and novelty[i] >= novelty[i - 1]
                    and novelty[i] >= novelty[i + 1]
                ):
                    if not peaks or (i - peaks[-1]) >= min_distance:
                        peaks.append(i)

            boundaries = [0] + [p + 1 for p in peaks] + [len(mfcc_array)]

            sections = []
            for i in range(len(boundaries) - 1):
                start_sec = boundaries[i] * seg_hop_sec
                end_sec = boundaries[i + 1] * seg_hop_sec
                if end_sec - start_sec < 2.0 and (
                    i == 0 or i == len(boundaries) - 2
                ):
                    continue
                sections.append(
                    {
                        "t": round(start_sec * 1000),
                        "type": "section",
                        "label": f"Section {len(sections) + 1}",
                        "end": round(end_sec * 1000),
                    }
                )

            result["sections"] = sections
    except Exception as e:
        print(f"Section segmentation failed: {e}", file=sys.stderr)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
