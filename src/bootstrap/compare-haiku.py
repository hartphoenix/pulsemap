"""Compare no-haiku vs haiku word corrections across test maps."""

import json

songs = [
    ("1ef66ec6-e03a-494b-bcd9-d0cf3953cc62", "Wonderwall"),
    ("bf7e5e81-163b-4515-b461-4317db5a0fd1", "Wish You Were Here"),
    ("61fc790f-624d-44d0-8b12-8c8ae4560b41", "The Nitty Gritty"),
    ("6d298ded-56bd-43d1-b333-0ebac7ca4180", "Revolution"),
]

for fid, title in songs:
    old = json.load(open(f"maps/comparison-no-haiku/{fid}.json"))
    new = json.load(open(f"maps/{fid}.json"))

    old_words = old.get("words", [])
    new_words = new.get("words", [])

    print(f"=== {title} ===")
    print(f"  Words: {len(old_words)} -> {len(new_words)}")

    diffs = 0
    samples = []
    min_len = min(len(old_words), len(new_words))
    for i in range(min_len):
        if old_words[i]["text"] != new_words[i]["text"]:
            diffs += 1
            if len(samples) < 5:
                samples.append((old_words[i]["text"], new_words[i]["text"], old_words[i]["t"]))

    print(f"  Text changes: {diffs}/{min_len} words differ")

    new_prov = new.get("analysis", {})
    reconciled = "words-reconciled" in new_prov
    print(f"  Haiku reconciled: {reconciled}")

    if samples:
        print(f"  Sample corrections:")
        for old_text, new_text, t in samples:
            print(f'    {t}ms: "{old_text}" -> "{new_text}"')
    print()
