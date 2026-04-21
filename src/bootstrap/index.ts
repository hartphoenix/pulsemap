import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AnalysisProvenance, PlaybackTarget, PulseMap } from "../../schema/map";
import { assertValid } from "../validate";
import { PipelineLogger } from "./logger";
import { analyzeAudio } from "./stages/analyze";
import { extractAudio } from "./stages/extract-audio";
import { fingerprint as computeFingerprint } from "./stages/fingerprint";
import { lookupRecording } from "./stages/lookup";
import {
	cleanYouTubeTitle,
	extractYouTubeLyrics,
	lookupLyrics,
	searchLyrics,
} from "./stages/lyrics";
import { extractMidi } from "./stages/midi";

export interface BootstrapOptions {
	id?: string;
	output?: string;
	acoustIdKey?: string;
}

const SCHEMA_VERSION = "0.1.0";

export async function bootstrap(source: string, options: BootstrapOptions = {}): Promise<PulseMap> {
	const log = new PipelineLogger();
	const workDir = join(process.env.TMPDIR || "/tmp", `pulsemap-${Date.now()}`);
	await mkdir(workDir, { recursive: true });

	try {
		log.stage("extract");
		const audio = await extractAudio(source, workDir);
		log.stageOk("extract", audio.sourceUrl ? `url (${audio.title || "untitled"})` : "local file");

		log.stage("fingerprint");
		const fp = await computeFingerprint(audio.path);
		const durationMs = fp.duration;
		const durSec = (durationMs / 1000).toFixed(0);
		log.stageOk("fingerprint", `${durSec}s duration, algorithm v${fp.algorithm}`);

		let recordingId = options.id;
		let title = audio.title;
		let artist = audio.artist;
		let album: string | undefined;
		let mbTitle: string | undefined;
		let mbArtist: string | undefined;

		if (!recordingId) {
			log.stage("lookup");
			try {
				const recording = await lookupRecording(fp.chromaprint, fp.duration, options.acoustIdKey);
				recordingId = recording.id;
				mbTitle = recording.title;
				mbArtist = recording.artist;
				album = recording.album;
				title = mbTitle || title;
				artist = mbArtist || artist;
				log.stageOk("lookup", `"${mbTitle}" by ${mbArtist} (score: ${recording.score.toFixed(2)})`);
			} catch (err) {
				log.stageFail("lookup", err instanceof Error ? err.message : String(err));
				throw new Error(
					`Could not identify recording. Provide --id <musicbrainz-id> manually.\n  Cause: ${err instanceof Error ? err.message : err}`,
				);
			}
		} else {
			log.info(`Using provided ID: ${recordingId}`);
		}

		log.info("Running parallel analysis stages...");

		const [lyrics, midi, analysis] = await Promise.all([
			(async () => {
				log.stage("lyrics");
				try {
					// Strategy 1: YouTube subtitles (timed to this exact recording)
					if (audio.sourceUrl?.includes("youtube.com") || audio.sourceUrl?.includes("youtu.be")) {
						const ytLyrics = await extractYouTubeLyrics(audio.sourceUrl, workDir);
						if (ytLyrics) {
							log.stageOk("lyrics", `${ytLyrics.length} lines (youtube subtitles)`);
							return ytLyrics;
						}
					}

					// Strategy 2: LRCLIB with MusicBrainz metadata
					if (mbArtist && mbTitle) {
						const result = await lookupLyrics(mbArtist, mbTitle);
						if (result) {
							log.stageOk("lyrics", `${result.length} synced lines (lrclib)`);
							return result;
						}
					}

					// Strategy 3: LRCLIB with cleaned yt-dlp metadata
					if (audio.artist && audio.title) {
						const cleanedTitle = cleanYouTubeTitle(audio.title, audio.artist);
						const cleanedArtist = audio.artist
							.replace(/\s*(?:Official|VEVO|- Topic)\s*$/i, "")
							.trim();
						if (cleanedTitle !== mbTitle || cleanedArtist !== mbArtist) {
							const result = await lookupLyrics(cleanedArtist, cleanedTitle);
							if (result) {
								log.stageOk("lyrics", `${result.length} synced lines (lrclib, cleaned query)`);
								return result;
							}
						}
					}

					// Strategy 4: LRCLIB search
					const searchQuery = `${artist} ${title}`;
					const result = await searchLyrics(searchQuery);
					if (result) {
						log.stageOk("lyrics", `${result.length} synced lines (lrclib search)`);
						return result;
					}

					log.stageOk("lyrics", "no synced lyrics found");
					return undefined;
				} catch (err) {
					log.stageFail("lyrics", err instanceof Error ? err.message : String(err));
					return undefined;
				}
			})(),
			(async () => {
				log.stageSkip("midi", "disabled (basic-pitch quality issues)");
				return undefined;
			})(),
			(async () => {
				log.stage("analysis");
				try {
					const result = await analyzeAudio(audio.path);
					if (result) {
						const parts: string[] = [];
						if (result.tempo) parts.push(`${result.tempo} BPM`);
						if (result.key) parts.push(`${result.key} ${result.scale || ""}`.trim());
						if (result.beats) parts.push(`${result.beats.length} beats`);
						if (result.chords) parts.push(`${result.chords.length} chords`);
						if (result.sections) parts.push(`${result.sections.length} sections`);
						log.stageOk("analysis", parts.join(", ") || "no data returned");
					} else {
						log.stageFail("analysis", "no output");
					}
					return result;
				} catch (err) {
					log.stageFail("analysis", err instanceof Error ? err.message : String(err));
					return undefined;
				}
			})(),
		]);

		log.info("Assembling map...");
		const today = new Date().toISOString().slice(0, 10);
		const provenance: Record<string, AnalysisProvenance> = {};

		provenance.fingerprint = { tool: "fpcalc", version: "1.6.0", date: today };

		const map: PulseMap = {
			version: SCHEMA_VERSION,
			id: recordingId,
			duration_ms: durationMs,
			fingerprint: fp,
		};

		if (title || artist || album || analysis?.key || analysis?.tempo) {
			map.metadata = {};
			if (title) map.metadata.title = title;
			if (artist) map.metadata.artist = artist;
			if (album) map.metadata.album = album;
			if (analysis?.key) {
				map.metadata.key = `${analysis.key} ${analysis.scale || ""}`.trim();
			}
			if (analysis?.tempo) map.metadata.tempo = analysis.tempo;
			if (analysis?.time_signature) map.metadata.time_signature = analysis.time_signature;
		}

		if (audio.sourceUrl) {
			const target = parsePlaybackTarget(audio.sourceUrl);
			if (target) {
				target.added = today;
				map.playback = [target];
			}
		}

		if (lyrics?.length) {
			map.lyrics = lyrics;
			provenance.lyrics = { tool: "lrclib", date: today };
		}

		if (analysis?.chords?.length) {
			map.chords = analysis.chords;
			provenance.chords = { tool: "essentia", date: today };
		}

		if (analysis?.beats?.length) {
			map.beats = analysis.beats;
			provenance.beats = { tool: "essentia", date: today };
		}

		if (analysis?.sections?.length) {
			map.sections = analysis.sections;
			provenance.sections = { tool: "essentia", date: today };
		}

		map.analysis = provenance;

		assertValid(map);

		const mapFields: string[] = [];
		if (map.fingerprint) mapFields.push("fingerprint");
		if (map.metadata) mapFields.push("metadata");
		if (map.playback) mapFields.push("playback");
		if (map.lyrics) mapFields.push(`lyrics(${map.lyrics.length})`);
		if (map.chords) mapFields.push(`chords(${map.chords.length})`);
		if (map.beats) mapFields.push(`beats(${map.beats.length})`);
		if (map.sections) mapFields.push(`sections(${map.sections.length})`);
		if (map.midi) mapFields.push(`midi(${map.midi.length})`);

		const outputPath = options.output || join("maps", `${recordingId}.json`);
		await mkdir(dirname(outputPath), { recursive: true });
		await Bun.write(outputPath, `${JSON.stringify(map, null, 2)}\n`);
		log.info(`Map written to ${outputPath}`);

		log.summary(mapFields);

		return map;
	} finally {
		const proc = Bun.spawn(["rm", "-rf", workDir], {
			stdout: "ignore",
			stderr: "ignore",
		});
		await proc.exited;
	}
}

function parsePlaybackTarget(url: string): PlaybackTarget | undefined {
	try {
		const parsed = new URL(url);

		if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
			const videoId = parsed.hostname.includes("youtu.be")
				? parsed.pathname.slice(1)
				: parsed.searchParams.get("v");

			return {
				platform: "youtube",
				uri: url,
				id: videoId || undefined,
				capabilities: {
					play: true,
					pause: true,
					seek: true,
					setPosition: true,
					getPosition: true,
					rate: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
					volume: true,
					mute: true,
				},
			};
		}

		if (parsed.hostname.includes("spotify.com")) {
			const trackMatch = parsed.pathname.match(/track\/(\w+)/);
			return {
				platform: "spotify",
				uri: url,
				id: trackMatch?.[1],
				capabilities: {
					play: true,
					pause: true,
					seek: true,
					setPosition: true,
					getPosition: true,
					volume: true,
				},
			};
		}

		return {
			platform: parsed.hostname,
			uri: url,
			capabilities: {},
		};
	} catch {
		return undefined;
	}
}
