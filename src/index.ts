export type {
	AnalysisProvenance,
	BeatEvent,
	ChordEvent,
	CorrectionEntry,
	Fingerprint,
	LyricLine,
	MapMetadata,
	MidiReference,
	MidiTrack,
	PlaybackCapabilities,
	PlaybackRestrictions,
	PlaybackTarget,
	PulseMap,
	Section,
	SectionType,
	WordEvent,
} from "../schema/map";

export {
	AnalysisProvenanceSchema,
	BeatEventSchema,
	ChordEventSchema,
	CorrectionEntrySchema,
	FingerprintSchema,
	LyricLineSchema,
	MapMetadataSchema,
	MidiReferenceSchema,
	MidiTrackSchema,
	PlaybackCapabilitiesSchema,
	PlaybackRestrictionsSchema,
	PlaybackTargetSchema,
	PulseMapSchema,
	SECTION_TYPES,
	SectionSchema,
	WordEventSchema,
} from "../schema/map";
export type { BootstrapOptions } from "./bootstrap/index";
export { bootstrap } from "./bootstrap/index";
export { assertValid, validate } from "./validate";
