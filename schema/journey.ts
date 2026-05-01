/**
 * SUGGESTED REFERENCE SHAPE — not a controlled spec.
 *
 * PulseMap controls maps. Journeys are an open layer on top.
 *
 * You may use this type as-is, extend it, fork it, or define your own
 * journey types and version systems entirely. PulseMap will not break
 * your journey schema, because it does not own it. There is no
 * compatibility commitment between this file and any consumer's
 * journey storage.
 *
 * The shapes below reflect common cases — synchronized audio recording,
 * pinned annotation, lesson sequence, lighting cue list — written down
 * so consumers who want a starting point have one. The recording
 * shape is informed by PulseGuide's lived implementation
 * (https://github.com/hartphoenix/pulseguide), which currently uses
 * its own local Journey type at version "0.2".
 *
 * This file is intentionally NOT re-exported from `pulsemap/sdk`.
 * Authors who want this type import it explicitly from
 * `pulsemap/schema/journey`.
 */

import { type Static, Type } from "@sinclair/typebox";

/**
 * Common fields every journey shares. The `version` field is open —
 * pick whatever scheme makes sense for your journey type (semver, date,
 * freeform). PulseMap will not interpret it.
 */
export const JourneyBaseSchema = Type.Object({
	version: Type.String({
		description: "Author-chosen version. PulseMap does not interpret this field.",
	}),
	id: Type.String({ description: "Stable journey id." }),
	map_id: Type.String({
		description: "PulseMap id this journey targets.",
	}),
	type: Type.String({
		description:
			"Discriminator. Reference shapes use 'recording', 'annotation', 'lesson', 'lighting'.",
	}),
	created_at: Type.String({ description: "ISO 8601 timestamp." }),
});
export type JourneyBase = Static<typeof JourneyBaseSchema>;

/**
 * Synchronized audio recording over a map. The PulseGuide reference
 * implementation captures microphone audio while a map plays back,
 * then renders it back in sync at view time.
 *
 * `playback_offset_ms` is additive: effective playback start =
 * `start_offset_ms + playback_offset_ms`. Positive shifts the recording
 * later in map-time, negative earlier. PulseGuide initializes this
 * from `AudioContext.outputLatency` and lets users nudge by ear,
 * clamped to ±2000.
 */
export const RecordingJourneySchema = Type.Composite([
	JourneyBaseSchema,
	Type.Object({
		type: Type.Literal("recording"),
		start_offset_ms: Type.Number({
			description: "Map-time at recording start.",
		}),
		duration_ms: Type.Number(),
		playback_offset_ms: Type.Number({
			description: "Additive timing offset applied at playback. Suggested clamp ±2000.",
		}),
		audio: Type.Object({
			mime: Type.String(),
			uri: Type.Optional(Type.String()),
			sha256: Type.Optional(Type.String()),
		}),
	}),
]);
export type RecordingJourney = Static<typeof RecordingJourneySchema>;

/** Stub: a single text/markdown note pinned at a map-time. */
export const AnnotationJourneySchema = Type.Composite([
	JourneyBaseSchema,
	Type.Object({
		type: Type.Literal("annotation"),
		t: Type.Number({ description: "Map-time in milliseconds." }),
		text: Type.String(),
		author: Type.Optional(Type.String()),
	}),
]);
export type AnnotationJourney = Static<typeof AnnotationJourneySchema>;

/** Stub: an ordered sequence of lesson steps keyed to map-time ranges. */
export const LessonJourneySchema = Type.Composite([
	JourneyBaseSchema,
	Type.Object({
		type: Type.Literal("lesson"),
		steps: Type.Array(
			Type.Object({
				t_start: Type.Number(),
				t_end: Type.Number(),
				title: Type.String(),
				body: Type.Optional(Type.String()),
			}),
		),
	}),
]);
export type LessonJourney = Static<typeof LessonJourneySchema>;

/**
 * Stub: cue list for stage lighting / DMX / Hue. `cue` is an opaque
 * payload — its shape is up to the lighting driver.
 */
export const LightingJourneySchema = Type.Composite([
	JourneyBaseSchema,
	Type.Object({
		type: Type.Literal("lighting"),
		cues: Type.Array(
			Type.Object({
				t: Type.Number(),
				cue: Type.Unknown(),
			}),
		),
	}),
]);
export type LightingJourney = Static<typeof LightingJourneySchema>;

/**
 * Convenience union of the reference shapes. Authors who define their
 * own journey types should not include them in this union; build your
 * own discriminated union in your own code.
 */
export type Journey = RecordingJourney | AnnotationJourney | LessonJourney | LightingJourney;
