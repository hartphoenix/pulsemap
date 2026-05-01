# Maps

Generated PulseMap JSON files, one per recording, named by MusicBrainz recording ID.

A map describes the structural content of a recording — chords, lyrics, beats, etc. It does not carry edit history. See [`schema/map.ts`](../schema/map.ts) for the field-level type definitions.

## Edit provenance

Maps are corrected over time through PRs from the [Map Editor](https://hartphoenix.github.io/pulsemap/editor/). The editor writes `Pulsemap-*` git trailers into the PR body; those ride into the squash-merge commit on `main`, so edit history is queryable from `git log` without bloating the map JSON itself.

```bash
# Every commit that touched a map
git log --follow maps/<map-id>.json

# Just the structured trailers from correction PRs for one map
git log --format='%(trailers:key=Pulsemap-Map-ID,key=Pulsemap-Words-Edits,key=Pulsemap-Lyrics-Edits)' \
  --grep='Pulsemap-Map-ID: <map-id>'
```

Trailers currently emitted by the editor:

- `Pulsemap-Map-ID:` — MusicBrainz recording ID of the corrected map.
- `Pulsemap-<Lane>-Edits:` — count of edits per lane (e.g. `Pulsemap-Words-Edits: 13`).
- `Pulsemap-Playback-Available:` — whether the editor had audio playback when the corrections were made.

The PR's author is the person who submitted the corrections; the merge date is the commit's `committer` date. Both are recovered via `git log` directly — they don't need their own trailers.
