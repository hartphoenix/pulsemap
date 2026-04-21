export type {
	PulseMap,
	MapMetadata,
	Fingerprint,
	PlaybackTarget,
	PlaybackCapabilities,
	MidiReference,
	MidiTrack,
	BeatEvent,
	AnalysisProvenance,
	LyricLine,
	ChordEvent,
	SectionType,
	Section,
} from "../schema/map";

export {
	PulseMapSchema,
	MapMetadataSchema,
	FingerprintSchema,
	PlaybackTargetSchema,
	PlaybackCapabilitiesSchema,
	MidiReferenceSchema,
	MidiTrackSchema,
	BeatEventSchema,
	AnalysisProvenanceSchema,
	LyricLineSchema,
	ChordEventSchema,
	SectionSchema,
	SECTION_TYPES,
} from "../schema/map";

export { validate, assertValid } from "./validate";
export { bootstrap } from "./bootstrap/index";
export type { BootstrapOptions } from "./bootstrap/index";
