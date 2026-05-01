import { type Static, Type } from "@sinclair/typebox";

export const SECTION_TYPES = [
	"intro",
	"verse",
	"pre-chorus",
	"chorus",
	"bridge",
	"solo",
	"interlude",
	"outro",
	"coda",
] as const;

export type SectionType = (typeof SECTION_TYPES)[number] | (string & {});

export const FingerprintSchema = Type.Object({
	chromaprint: Type.String({
		description: "Base64-encoded Chromaprint fingerprint string.",
	}),
	algorithm: Type.Number({
		description: "Chromaprint algorithm version used to generate the fingerprint.",
	}),
	duration: Type.Number({
		description: "Duration of the source audio in milliseconds (as seen by fpcalc).",
	}),
});
export type Fingerprint = Static<typeof FingerprintSchema>;

export const MapMetadataSchema = Type.Object({
	title: Type.Optional(Type.String()),
	artist: Type.Optional(Type.String()),
	album: Type.Optional(Type.String()),
	key: Type.Optional(
		Type.String({
			description: 'Predominant key (e.g. "C major", "F# minor").',
		}),
	),
	tempo: Type.Optional(Type.Number({ description: "Predominant tempo in BPM." })),
	time_signature: Type.Optional(
		Type.String({
			description: 'Time signature (e.g. "4/4", "3/4", "6/8").',
		}),
	),
	extra: Type.Optional(
		Type.Record(
			Type.String(),
			Type.Union([Type.String(), Type.Number(), Type.Array(Type.String())]),
		),
	),
});
export type MapMetadata = Static<typeof MapMetadataSchema>;

export const PlaybackCapabilitiesSchema = Type.Object({
	play: Type.Optional(Type.Boolean()),
	pause: Type.Optional(Type.Boolean()),
	seek: Type.Optional(Type.Boolean()),
	setPosition: Type.Optional(Type.Boolean()),
	getPosition: Type.Optional(Type.Boolean()),
	rate: Type.Optional(Type.Union([Type.Literal("continuous"), Type.Array(Type.Number())])),
	volume: Type.Optional(Type.Boolean()),
	mute: Type.Optional(Type.Boolean()),
});
export type PlaybackCapabilities = Static<typeof PlaybackCapabilitiesSchema>;

export const PlaybackRestrictionsSchema = Type.Object(
	{
		mobile_embed: Type.Optional(
			Type.Boolean({
				description: "Whether embedded playback works on mobile devices.",
			}),
		),
	},
	{ additionalProperties: true },
);
export type PlaybackRestrictions = Static<typeof PlaybackRestrictionsSchema>;

export const PlaybackTargetSchema = Type.Object({
	platform: Type.String({ description: "Platform identifier." }),
	uri: Type.Optional(Type.String({ description: "URI for this instance." })),
	id: Type.Optional(Type.String({ description: "Platform-specific ID." })),
	capabilities: PlaybackCapabilitiesSchema,
	restrictions: Type.Optional(PlaybackRestrictionsSchema),
	added: Type.Optional(Type.String({ description: "ISO 8601 date when added or last verified." })),
});
export type PlaybackTarget = Static<typeof PlaybackTargetSchema>;

export const MidiTrackSchema = Type.Object({
	index: Type.Number(),
	label: Type.String(),
});
export type MidiTrack = Static<typeof MidiTrackSchema>;

export const MidiReferenceSchema = Type.Object({
	sha256: Type.String({
		description: "SHA-256 hash of the .mid file.",
	}),
	duration_ms: Type.Number({
		description: "Duration of the MIDI file in milliseconds.",
	}),
	offset_ms: Type.Optional(
		Type.Number({
			description: "Timing offset in ms if MIDI doesn't start at map t=0.",
		}),
	),
	uri: Type.Optional(Type.String({ description: "URI hint for where to obtain the file." })),
	tracks: Type.Optional(Type.Array(MidiTrackSchema)),
});
export type MidiReference = Static<typeof MidiReferenceSchema>;

export const BeatEventSchema = Type.Object({
	t: Type.Number({ description: "Beat time in milliseconds." }),
	downbeat: Type.Boolean({ description: "Whether this beat is a downbeat." }),
	bpm: Type.Optional(
		Type.Number({
			description: "BPM at this beat (sparse: only when changing).",
		}),
	),
	time_sig: Type.Optional(
		Type.String({
			description: "Time signature at this beat (sparse: only when changing).",
		}),
	),
});
export type BeatEvent = Static<typeof BeatEventSchema>;

export const AnalysisProvenanceSchema = Type.Object({
	tool: Type.String({
		description: "Tool or method that produced this field.",
	}),
	version: Type.Optional(Type.String()),
	date: Type.Optional(Type.String({ description: "ISO 8601 date when analysis was performed." })),
	manual: Type.Optional(
		Type.Boolean({
			description: "Whether manually reviewed or corrected.",
		}),
	),
});
export type AnalysisProvenance = Static<typeof AnalysisProvenanceSchema>;

export const LyricLineSchema = Type.Object({
	t: Type.Number({ description: "Start time in milliseconds." }),
	text: Type.String({ minLength: 1 }),
	end: Type.Optional(Type.Number({ description: "End time in ms." })),
});
export type LyricLine = Static<typeof LyricLineSchema>;

export const WordEventSchema = Type.Object({
	t: Type.Number({ description: "Start time in milliseconds." }),
	text: Type.String({ minLength: 1, description: "Single word text." }),
	end: Type.Optional(Type.Number({ description: "End time in ms." })),
});
export type WordEvent = Static<typeof WordEventSchema>;

export const ChordEventSchema = Type.Object({
	t: Type.Number({ description: "Start time in milliseconds." }),
	chord: Type.String({
		minLength: 1,
		description: 'Chord name using standard notation (e.g. "Cmaj7", "F#m", "Bb/D").',
	}),
	end: Type.Optional(Type.Number({ description: "End time in ms." })),
});
export type ChordEvent = Static<typeof ChordEventSchema>;

export const SectionSchema = Type.Object({
	t: Type.Number({ description: "Start time in milliseconds." }),
	type: Type.String({
		minLength: 1,
		description: "Structural type (e.g. verse, chorus, solo).",
	}),
	label: Type.Optional(Type.String({ description: "Freeform label for display." })),
	end: Type.Number({ description: "End time in milliseconds." }),
});
export type Section = Static<typeof SectionSchema>;

export const PulseMapSchema = Type.Object({
	version: Type.String({
		description:
			"Schema version (semver). Matches the PulseMap package version: one source of truth, one number. See schema/VERSIONING.md.",
	}),
	id: Type.String({ description: "MusicBrainz recording ID." }),
	duration_ms: Type.Number({
		description: "Total duration of the recording in milliseconds.",
	}),
	fingerprint: Type.Optional(FingerprintSchema),
	metadata: Type.Optional(MapMetadataSchema),
	playback: Type.Optional(Type.Array(PlaybackTargetSchema)),
	lyrics: Type.Optional(Type.Array(LyricLineSchema)),
	words: Type.Optional(Type.Array(WordEventSchema)),
	chords: Type.Optional(Type.Array(ChordEventSchema)),
	beats: Type.Optional(Type.Array(BeatEventSchema)),
	sections: Type.Optional(Type.Array(SectionSchema)),
	midi: Type.Optional(Type.Array(MidiReferenceSchema)),
	analysis: Type.Optional(Type.Record(Type.String(), AnalysisProvenanceSchema)),
});
export type PulseMap = Static<typeof PulseMapSchema>;
