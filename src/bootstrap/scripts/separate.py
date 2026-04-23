#!/usr/bin/env python3
"""Run Demucs htdemucs source separation. Outputs stem paths as JSON to stdout."""

import json
import os
import sys


def get_device():
    import torch

    if torch.backends.mps.is_available():
        print("Using MPS (Apple Silicon GPU)", file=sys.stderr)
        return torch.device("mps")
    if torch.cuda.is_available():
        print("Using CUDA GPU", file=sys.stderr)
        return torch.device("cuda")
    print("Using CPU", file=sys.stderr)
    return torch.device("cpu")


def main():
    if len(sys.argv) != 3:
        print(
            json.dumps({"error": "Usage: separate.py <audio_path> <output_dir>"}),
            file=sys.stderr,
        )
        sys.exit(1)

    audio_path, output_dir = sys.argv[1], sys.argv[2]

    if not os.path.exists(audio_path):
        print(f"Audio file not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    try:
        import torch
        import torchaudio
        from demucs.apply import apply_model
        from demucs.audio import save_audio
        from demucs.pretrained import get_model
    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        device = get_device()

        print("Loading htdemucs model...", file=sys.stderr)
        model = get_model("htdemucs")
        model.to(device)
        model.eval()

        print(f"Loading audio: {audio_path}", file=sys.stderr)
        wav, sr = torchaudio.load(audio_path)

        if sr != model.samplerate:
            wav = torchaudio.functional.resample(wav, sr, model.samplerate)
            sr = model.samplerate

        ref = wav.mean(0)
        wav = (wav - ref.mean()) / ref.std()
        wav = wav.unsqueeze(0).to(device)

        print("Running separation...", file=sys.stderr)
        with torch.no_grad():
            sources = apply_model(model, wav, device=device)

        sources = sources.cpu() * ref.std() + ref.mean()

        stem_dir = os.path.join(output_dir, "stems")
        os.makedirs(stem_dir, exist_ok=True)

        stems = {}
        for i, stem_name in enumerate(model.sources):
            stem_path = os.path.join(stem_dir, f"{stem_name}.wav")
            save_audio(sources[0, i], stem_path, samplerate=sr)
            stems[stem_name] = stem_path
            print(f"  Saved {stem_name} stem", file=sys.stderr)

        print(json.dumps(stems))

    except Exception as e:
        print(f"Separation failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
