#!/usr/bin/env python3
"""Separate lead vocals from backing vocals using MelBand RoFormer. JSON to stdout."""

import json
import os
import sys


def main():
    if len(sys.argv) != 3:
        print(
            json.dumps({"error": "Usage: separate_vocals.py <vocal_stem_path> <output_dir>"}),
            file=sys.stderr,
        )
        sys.exit(1)

    vocal_path = sys.argv[1]
    output_dir = sys.argv[2]

    try:
        from audio_separator.separator import Separator
    except ImportError:
        print(
            "audio-separator is not installed. "
            "Install with: pip install audio-separator[cpu]",
            file=sys.stderr,
        )
        sys.exit(1)

    if not os.path.isfile(vocal_path):
        print(f"Vocal stem not found: {vocal_path}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    print("Loading MelBand RoFormer karaoke model...", file=sys.stderr)
    separator = Separator(output_dir=output_dir)
    separator.load_model("mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt")

    print(f"Separating vocals: {vocal_path}", file=sys.stderr)
    output_files = separator.separate(vocal_path)

    if not output_files or len(output_files) < 2:
        print(f"Expected 2 output files, got {len(output_files) if output_files else 0}", file=sys.stderr)
        sys.exit(1)

    # The separator produces two files. Identify which is lead vs backing
    # by checking filenames for known suffixes. The karaoke model typically
    # labels the primary stem as "(Vocals)" and the secondary as "(Instrumental)".
    # The "Vocals" output is the lead; "Instrumental" is the backing/harmony.
    lead_path = None
    backing_path = None

    for f in output_files:
        lower = os.path.basename(f).lower()
        if "vocal" in lower or "primary" in lower:
            lead_path = f
        elif "instrumental" in lower or "secondary" in lower or "no_vocal" in lower:
            backing_path = f

    # Fallback: if naming convention didn't match, use positional order
    # (first = primary/lead, second = secondary/backing)
    if lead_path is None or backing_path is None:
        lead_path = output_files[0]
        backing_path = output_files[1]

    print(f"Lead vocals: {lead_path}", file=sys.stderr)
    print(f"Backing vocals: {backing_path}", file=sys.stderr)

    print(json.dumps({
        "lead_vocals": lead_path,
        "backing_vocals": backing_path,
    }))


if __name__ == "__main__":
    main()
