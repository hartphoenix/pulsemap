# PulseMap versioning

PulseMap follows **standard semver**, with **one source of truth**: the PulseMap package version *is* the schema version. There is one number for both.

## What `version` means in a map file

A map's top-level `version` field equals the PulseMap package version it was authored against:

```json
{
  "version": "0.1.0",
  "id": "0cdc9b5b-...",
  "duration_ms": 243030
}
```

When the PulseMap package releases `0.2.0`, new maps written from that point use `"version": "0.2.0"`. Existing maps are not rewritten — they continue to declare the version they were authored against.

## Bump rules

| Bump | What's allowed | What this implies for consumers |
|---|---|---|
| **Major** (`0.x → 1.0`, `1.x → 2.0`) | Breaking schema changes: removed fields, renamed fields, changed semantics, narrowed value spaces | Consumers must check `version` and may need to upgrade |
| **Minor** (`0.1.x → 0.2.x`) | Additive only: new optional fields, new enum members in non-exhaustive positions | Same-major consumers continue to work; new fields are simply absent on older maps |
| **Patch** (`0.1.0 → 0.1.1`) | No schema shape change. Implementation, doc, or pipeline fixes only | Consumers do not need to change anything |

Same-major versions are forward-compatible for consumers: a `0.1.x` consumer reads any `0.1.y` map.

## Pre-1.0 caveat

PulseMap is alpha. Until `v1.0`, breaking changes can land in minor bumps if the alternative is shipping ugly long-term tradeoffs. We will document any such break clearly in the release notes and the CHANGELOG once that exists.

## Journeys are out of scope

PulseMap does not version journeys. Journey schemas live above this file in the layering:

- The reference shapes in `schema/journey.ts` carry their own `version` field, which **PulseMap does not interpret**.
- Journey authors are free to use whatever version system makes sense for their journey type — semver, dates, integers, freeform strings, or no version at all.
- A breaking change in PulseMap (the map schema) does not break journeys, because journeys reference maps by id, not by structure.
- A breaking change in your journey schema does not affect PulseMap.

This separation is deliberate: it lets the journey ecosystem evolve faster than the map protocol without coupling.

## How to record a breaking change

Once we have a `CHANGELOG.md`, every breaking change goes there with:

- The previous shape and the new shape (concrete examples, not just type signatures).
- A migration path for existing data (one of: "no migration needed — additive," "consumers tolerate both," "tooling provided," "manual rewrite").
- The PR that introduced it.
