# Contributing to PulseMap

Thank you for considering a contribution. PulseMap is a small, alpha-stage project, and there's room for help across the protocol, the SDK, the bootstrap pipeline, the editor, and the map dataset itself.

## Three ways to contribute

### 1. Map data corrections (chord, lyric, timing edits)

**Use the [Map Editor](https://hartphoenix.github.io/pulsemap/editor/), not GitHub issues.**

The editor signs in with your GitHub account, lets you fix individual events in a song's map (chords, lyrics, words, sections), and submits a PR with a structured diff. Edit provenance lives in the squash-merge commit message as `Pulsemap-*` git trailers — queryable via `git log --follow maps/<id>.json` without bloating the map JSON itself.

Issues are not the right channel for this — they don't carry the provenance the editor produces, and a typed-out correction is harder to review than the editor's structural diff. The "New issue" page at the top has a contact link routing you to the editor for exactly this reason.

If a map is *fundamentally* wrong (wrong recording, missing entirely, wrong duration), file a bug report instead.

### 2. Adapters, schema, SDK, pipeline

Open an issue first or jump straight to a PR — both are welcome.

- **New adapters:** read [`sdk/ADAPTERS.md`](./sdk/ADAPTERS.md), then file an [adapter proposal](https://github.com/hartphoenix/pulsemap/issues/new?template=adapter-proposal.yml) issue or open a PR. Building an adapter for your own app does not require contributing it back; the upstream handshake is fully optional.
- **Schema additions or breaking changes:** open an issue, or write a proposal in [`docs/proposals/`](./docs/proposals/) (see `0001-windowed-fingerprints.md` as a template). The schema follows unified semver with the package — see [`schema/VERSIONING.md`](./schema/VERSIONING.md).
- **Bootstrap pipeline (audio analysis, MIDI transcription, etc.):** see `src/bootstrap/` and the relevant tool notes in `CLAUDE.md`.
- **Editor:** the standalone Vite/React app in `editor/`.

### 3. Journeys

Journeys (synchronized experiences layered over a map — recordings, lessons, annotations, lighting cues, anything) are an **open layer** on top of PulseMap. The protocol does not own journey schemas. The reference shape in [`schema/journey.ts`](./schema/journey.ts) is a *suggestion* for one common case; you're free to fork it, extend it, version it differently, or write your own journey types entirely. PulseMap will not break your journey schema, because it does not own it.

If you build something interesting and want to surface it as a working example, open a PR adding a "Used in" entry to [`sdk/README.md`](./sdk/README.md).

## Development setup

```bash
bun install
bun test
bun run typecheck
bun run lint
```

Editor (separate app):

```bash
cd editor
bun install
bun run dev      # localhost:5173
```

The bootstrap pipeline shells out to Python; see the project's top-level `CLAUDE.md` for setup details if you want to regenerate maps.

## Pull requests

- Feature branch → PR → squash merge to `main`. Never commit directly to `main`.
- One logical change per PR. Keep them small and focused.
- Conventional commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- Add tests when behavior matters; use `bun:test`. Don't add tests for ceremony.
- All timestamps in milliseconds throughout the codebase.

## Code style

- TypeScript strict mode.
- [Biome](https://biomejs.dev/) for lint and format. Run `bun run lint:fix` before pushing.
- Default to writing no comments. Add a comment only when the *why* is non-obvious — a hidden constraint, a subtle invariant, a workaround for a specific bug.
- Prefer editing existing files over creating new ones when reasonable.

## License

By contributing, you agree to license your contribution under the MIT License (see `LICENSE`).
