#!/usr/bin/env python3
"""Fetch section headers and media from Genius. JSON to stdout.

Usage: fetch_genius_sections.py <artist> <title>

Requires GENIUS_API_TOKEN env var and lyricsgenius package.
Output: {
  "sections": [{"header": "Verse 1", "lines": ["line1", "line2"]}, ...],
  "media": [{"provider": "youtube", "url": "..."}, ...]
}
"""

import json
import os
import re
import sys


def main():
    if len(sys.argv) != 3:
        print("Usage: fetch_genius_sections.py <artist> <title>", file=sys.stderr)
        sys.exit(1)

    artist, title = sys.argv[1], sys.argv[2]

    token = os.environ.get("GENIUS_API_TOKEN")
    if not token:
        print("GENIUS_API_TOKEN not set", file=sys.stderr)
        sys.exit(1)

    try:
        import lyricsgenius
        import requests
    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        sys.exit(1)

    genius = lyricsgenius.Genius(token)
    genius.verbose = False
    genius.remove_section_headers = False

    song = genius.search_song(title, artist)
    if not song or not song.lyrics:
        print(json.dumps({"sections": [], "media": []}))
        return

    # Parse sections with their lyric lines
    lines = song.lyrics.split("\n")
    header_pattern = re.compile(r"^\[([^\]]+)\]$")

    sections = []
    current_section = None

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        match = header_pattern.match(stripped)
        if match:
            current_section = {"header": match.group(1).strip(), "lines": []}
            sections.append(current_section)
        elif current_section is not None:
            current_section["lines"].append(stripped)

    # Fetch media from full API
    media = []
    api_path = getattr(song, "api_path", None)
    if api_path:
        try:
            headers = {"Authorization": f"Bearer {token}"}
            r = requests.get(
                f"https://api.genius.com{api_path}",
                headers=headers,
                params={"text_format": "plain"},
                timeout=10,
            )
            if r.status_code == 200:
                song_data = r.json().get("response", {}).get("song", {})
                raw_media = song_data.get("media", [])
                for m in raw_media:
                    entry = {"provider": m.get("provider"), "url": m.get("url")}
                    if "native_uri" in m:
                        entry["native_uri"] = m["native_uri"]
                    media.append(entry)
        except Exception as e:
            print(f"Media fetch warning: {e}", file=sys.stderr)

    print(json.dumps({"sections": sections, "media": media}))


if __name__ == "__main__":
    main()
