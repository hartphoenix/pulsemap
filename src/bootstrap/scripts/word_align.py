#!/usr/bin/env python3
"""Align line-level lyrics to word-level timestamps using stable-ts. JSON to stdout."""

import json
import sys


def main():
    if len(sys.argv) != 3:
        print(
            json.dumps(
                {"error": "Usage: word_align.py <vocal_stem_path> <lyrics_json_path>"}
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    vocal_path, lyrics_json_path = sys.argv[1], sys.argv[2]

    try:
        import stable_whisper
    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        with open(lyrics_json_path) as f:
            lines = json.load(f)

        text = "\n".join(line["text"] for line in lines)

        if not text.strip():
            print(json.dumps([]))
            return

        # MPS fails with float64 errors during alignment — use CPU
        print("Loading Whisper base model on cpu...", file=sys.stderr)
        model = stable_whisper.load_model("base", device="cpu")
        result = model.align(vocal_path, text, language="en")

        words = []
        for segment in result.segments:
            for word in segment.words:
                word_text = word.word.strip()
                if word_text:
                    words.append(
                        {
                            "t": round(word.start * 1000),
                            "text": word_text,
                            "end": round(word.end * 1000),
                        }
                    )

        print(json.dumps(words))

    except Exception as e:
        print(f"Word alignment failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
