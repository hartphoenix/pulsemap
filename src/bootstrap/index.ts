import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
	AnalysisProvenance,
	MidiReference,
	PlaybackTarget,
	PulseMap,
	WordEvent,
} from "../../schema/map";
import { assertValid } from "../validate";
import { PipelineLogger } from "./logger";
import { analyzeAudio } from "./stages/analyze";
import { beatAlignMidi } from "./stages/beat-align-midi";
import { cleanChords } from "./stages/clean-chords";
import { cleanLyrics } from "./stages/clean-lyrics";
import { crossValidateBassChords } from "./stages/cross-validate";
import { detectBeats } from "./stages/detect-beats";
import { detectChords } from "./stages/detect-chords";
import { extractAudio } from "./stages/extract-audio";
import { fingerprint as computeFingerprint } from "./stages/fingerprint";
import { crossValidateMidiChords, inferChordsMidi } from "./stages/infer-chords-midi";
import { lookupRecording } from "./stages/lookup";
import {
	cleanYouTubeTitle,
	extractYouTubeLyrics,
	lookupLyrics,
	searchLyrics,
} from "./stages/lyrics";
import { type StemPaths, separateAudio } from "./stages/separate";
import { type TranscriptionResult, transcribeStem } from "./stages/transcribe";
import { alignWords } from "./stages/word-align";

export interface BootstrapOptions {
	id?: string;
	output?: string;
	acoustIdKey?: string;
	skipSeparation?: boolean;
}

const SCHEMA_VERSION = "0.1.0";

export async function bootstrap(source: string, options: BootstrapOptions = {}): Promise<PulseMap> {
	const log = new PipelineLogger();
	const workDir = join(process.env.TMPDIR || "/tmp", `pulsemap-${Date.now()}`);
	await mkdir(workDir, { recursive: true });

	try {
		// === Phase 1: Sequential setup ===
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

		// === Phase 2: Source separation ===
		let stems: StemPaths | undefined;

		if (options.skipSeparation) {
			log.stageSkip("separate", "skipped via --skip-separation");
		} else {
			log.stage("separate");
			try {
				stems = await separateAudio(audio.path, workDir);
				if (stems) {
					const stemNames = Object.keys(stems).filter((k) => stems?.[k as keyof StemPaths]);
					log.stageOk("separate", `${stemNames.length} stems: ${stemNames.join(", ")}`);
				} else {
					log.stageFail("separate", "no output");
				}
			} catch (err) {
				log.stageFail("separate", err instanceof Error ? err.message : String(err));
			}
		}

		// === Phase 3: Parallel analysis ===
		log.info("Running parallel analysis stages...");

		const [lyricsResult, analysis, lvChords, beatResult, bassMidi, vocalMidi, drumMidi, otherMidi] =
			await Promise.all([
				// Lyrics chain: fetch → clean → word-align
				(async () => {
					log.stage("lyrics");
					let rawLyrics: Awaited<ReturnType<typeof lookupLyrics>> | undefined;
					try {
						if (audio.sourceUrl?.includes("youtube.com") || audio.sourceUrl?.includes("youtu.be")) {
							const ytLyrics = await extractYouTubeLyrics(audio.sourceUrl, workDir);
							if (ytLyrics) {
								log.stageOk("lyrics", `${ytLyrics.length} lines (youtube subtitles)`);
								rawLyrics = ytLyrics;
							}
						}

						if (!rawLyrics && mbArtist && mbTitle) {
							const result = await lookupLyrics(mbArtist, mbTitle);
							if (result) {
								log.stageOk("lyrics", `${result.length} synced lines (lrclib)`);
								rawLyrics = result;
							}
						}

						if (!rawLyrics && audio.artist && audio.title) {
							const cleanedTitle = cleanYouTubeTitle(audio.title, audio.artist);
							const cleanedArtist = audio.artist
								.replace(/\s*(?:Official|VEVO|- Topic)\s*$/i, "")
								.trim();
							if (cleanedTitle !== mbTitle || cleanedArtist !== mbArtist) {
								const result = await lookupLyrics(cleanedArtist, cleanedTitle);
								if (result) {
									log.stageOk("lyrics", `${result.length} synced lines (lrclib, cleaned query)`);
									rawLyrics = result;
								}
							}
						}

						if (!rawLyrics) {
							const searchQuery = `${artist} ${title}`;
							const result = await searchLyrics(searchQuery);
							if (result) {
								log.stageOk("lyrics", `${result.length} synced lines (lrclib search)`);
								rawLyrics = result;
							}
						}

						if (!rawLyrics) {
							log.stageOk("lyrics", "no synced lyrics found");
						}
					} catch (err) {
						log.stageFail("lyrics", err instanceof Error ? err.message : String(err));
					}

					const cleanedLyrics = rawLyrics ? cleanLyrics(rawLyrics) : undefined;
					if (cleanedLyrics && rawLyrics && cleanedLyrics.length < rawLyrics.length) {
						log.detail(
							`clean-lyrics: ${rawLyrics.length} → ${cleanedLyrics.length} lines (${rawLyrics.length - cleanedLyrics.length} decorative lines removed)`,
						);
					}

					let words: WordEvent[] | undefined;
					let lrclibValidated = true;
					if (stems?.vocals) {
						log.stage("word-align");
						try {
							const result = await alignWords(
								stems.vocals,
								cleanedLyrics?.length ? cleanedLyrics : undefined,
								workDir,
							);
							if (result) {
								words = result.words;
								lrclibValidated = result.lrclibValidated;
								const parts = [`${words.length} words`, result.source.replace("_", " ")];
								if (!result.lrclibValidated && cleanedLyrics?.length) {
									parts.push(
										`LRCLIB mismatch (${result.lrclibOffsetMs != null ? `${(result.lrclibOffsetMs / 1000).toFixed(1)}s offset` : "unknown offset"})`,
									);
								}
								log.stageOk("word-align", parts.join(", "));
							} else {
								log.stageFail("word-align", "no words returned");
							}
						} catch (err) {
							log.stageFail("word-align", err instanceof Error ? err.message : String(err));
						}
					} else {
						log.stageSkip("word-align", "no vocal stem");
					}

					return { lyrics: cleanedLyrics, words, lrclibValidated };
				})(),

				// Analysis (unchanged)
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

				// Chord detection (lv-chordia — large vocabulary)
				(async () => {
					log.stage("chords");
					try {
						const result = await detectChords(audio.path);
						if (result) {
							log.stageOk("chords", `${result.length} chords (lv-chordia)`);
						} else {
							log.stageFail("chords", "no chords detected");
						}
						return result;
					} catch (err) {
						log.stageFail("chords", err instanceof Error ? err.message : String(err));
						return undefined;
					}
				})(),

				// Beat & downbeat detection (beat_this)
				(async () => {
					log.stage("beats");
					try {
						const result = await detectBeats(audio.path);
						if (result) {
							log.stageOk(
								"beats",
								`${result.beatCount} beats, ${result.downbeatCount} downbeats, ${result.tempo} BPM (beat_this)`,
							);
						} else {
							log.stageFail("beats", "no beats detected");
						}
						return result;
					} catch (err) {
						log.stageFail("beats", err instanceof Error ? err.message : String(err));
						return undefined;
					}
				})(),

				// Bass MIDI
				(async (): Promise<TranscriptionResult | undefined> => {
					if (!stems?.bass) {
						log.stageSkip("transcribe-bass", "no bass stem");
						return undefined;
					}
					log.stage("transcribe-bass");
					try {
						const result = await transcribeStem(stems.bass, "bass", workDir, durationMs);
						if (result) log.stageOk("transcribe-bass", `${result.noteCount} notes`);
						else log.stageFail("transcribe-bass", "no notes detected");
						return result;
					} catch (err) {
						log.stageFail("transcribe-bass", err instanceof Error ? err.message : String(err));
						return undefined;
					}
				})(),

				// Vocal MIDI
				(async (): Promise<TranscriptionResult | undefined> => {
					if (!stems?.vocals) {
						log.stageSkip("transcribe-vocals", "no vocal stem");
						return undefined;
					}
					log.stage("transcribe-vocals");
					try {
						const result = await transcribeStem(stems.vocals, "vocals", workDir, durationMs);
						if (result) log.stageOk("transcribe-vocals", `${result.noteCount} notes`);
						else log.stageFail("transcribe-vocals", "no notes detected");
						return result;
					} catch (err) {
						log.stageFail("transcribe-vocals", err instanceof Error ? err.message : String(err));
						return undefined;
					}
				})(),

				// Drum MIDI
				(async (): Promise<TranscriptionResult | undefined> => {
					if (!stems?.drums) {
						log.stageSkip("transcribe-drums", "no drum stem");
						return undefined;
					}
					log.stage("transcribe-drums");
					try {
						const result = await transcribeStem(stems.drums, "drums", workDir, durationMs);
						if (result) log.stageOk("transcribe-drums", `${result.noteCount} notes`);
						else log.stageFail("transcribe-drums", "no notes detected");
						return result;
					} catch (err) {
						log.stageFail("transcribe-drums", err instanceof Error ? err.message : String(err));
						return undefined;
					}
				})(),

				// Other MIDI (lower confidence)
				(async (): Promise<TranscriptionResult | undefined> => {
					if (!stems?.other) {
						log.stageSkip("transcribe-other", "no other stem");
						return undefined;
					}
					log.stage("transcribe-other");
					try {
						const result = await transcribeStem(stems.other, "other", workDir, durationMs);
						if (result) log.stageOk("transcribe-other", `${result.noteCount} notes`);
						else log.stageFail("transcribe-other", "no notes detected");
						return result;
					} catch (err) {
						log.stageFail("transcribe-other", err instanceof Error ? err.message : String(err));
						return undefined;
					}
				})(),
			]);

		// === Phase 4: Post-processing ===
		log.info("Running post-processing...");

		// Use beat_this beats, fall back to Essentia
		const finalBeats = beatResult?.beats ?? analysis?.beats;
		const beatSource = beatResult ? "beat_this" : "essentia";
		const finalTempo = beatResult?.tempo ?? analysis?.tempo;

		// Use lv-chordia chords (rich vocabulary) with Essentia as fallback
		const rawChords = lvChords ?? analysis?.chords;
		const chordSource = lvChords ? "lv-chordia" : "essentia";
		let finalChords = rawChords;
		if (rawChords && finalBeats?.length) {
			log.stage("clean-chords");
			const key = analysis?.key ? `${analysis.key} ${analysis.scale || ""}`.trim() : undefined;
			finalChords = cleanChords(rawChords, { beats: finalBeats, key });
			log.stageOk(
				"clean-chords",
				`${rawChords.length} → ${finalChords.length} chords (${chordSource})`,
			);
		}

		// Beat-align MIDI files
		const midiResults: TranscriptionResult[] = [bassMidi, vocalMidi, drumMidi, otherMidi].filter(
			(r): r is TranscriptionResult => r != null,
		);
		const alignedMidiRefs: MidiReference[] = [];

		if (midiResults.length > 0 && finalBeats?.length) {
			for (const midi of midiResults) {
				log.stage(`beat-align-${midi.label}`);
				try {
					const aligned = await beatAlignMidi(midi.filePath, finalBeats, workDir, midi.label);
					alignedMidiRefs.push({
						sha256: aligned.sha256,
						duration_ms: aligned.durationMs || durationMs,
						tracks: [{ index: 0, label: midi.label }],
					});

					// Copy aligned MIDI to output directory
					const midiOutDir = join(dirname(options.output || "maps/out"), "midi");
					await mkdir(midiOutDir, { recursive: true });
					await copyFile(aligned.alignedPath, join(midiOutDir, `${aligned.sha256}.mid`));

					log.stageOk(`beat-align-${midi.label}`, "aligned to beat grid");
				} catch (err) {
					log.stageFail(
						`beat-align-${midi.label}`,
						err instanceof Error ? err.message : String(err),
					);
					// Fall back to unaligned
					alignedMidiRefs.push(midi.reference);
					const midiOutDir = join(dirname(options.output || "maps/out"), "midi");
					await mkdir(midiOutDir, { recursive: true });
					await copyFile(midi.filePath, join(midiOutDir, `${midi.reference.sha256}.mid`));
				}
			}
		} else if (midiResults.length > 0) {
			for (const midi of midiResults) {
				alignedMidiRefs.push(midi.reference);
				const midiOutDir = join(dirname(options.output || "maps/out"), "midi");
				await mkdir(midiOutDir, { recursive: true });
				await copyFile(midi.filePath, join(midiOutDir, `${midi.reference.sha256}.mid`));
			}
		}

		// Bass-chord cross-validation
		if (bassMidi && finalChords?.length) {
			log.stage("cross-validate");
			try {
				const validation = await crossValidateBassChords(bassMidi.filePath, finalChords);
				log.stageOk(
					"cross-validate",
					`${(validation.concordance * 100).toFixed(0)}% concordance, ${validation.conflicts.length} conflicts`,
				);
				if (validation.conflicts.length > 0) {
					const sample = validation.conflicts.slice(0, 3);
					for (const c of sample) {
						log.detail(
							`  conflict at ${(c.t / 1000).toFixed(1)}s: bass=${c.bassPitch} vs chord=${c.chord}`,
						);
					}
				}
			} catch (err) {
				log.stageFail("cross-validate", err instanceof Error ? err.message : String(err));
			}
		}

		// MIDI-inferred chord cross-validation
		if (bassMidi && otherMidi && finalBeats?.length && finalChords?.length) {
			log.stage("midi-chords");
			try {
				const midiChords = await inferChordsMidi(
					bassMidi.filePath,
					otherMidi.filePath,
					finalBeats,
					workDir,
				);
				if (midiChords) {
					const validation = crossValidateMidiChords(midiChords, finalChords);
					log.stageOk(
						"midi-chords",
						`${midiChords.length} chords inferred, ${(validation.concordance * 100).toFixed(0)}% agree with ${chordSource}`,
					);
					if (validation.conflicts.length > 0) {
						const sample = validation.conflicts.slice(0, 3);
						for (const c of sample) {
							log.detail(
								`  conflict at ${(c.t / 1000).toFixed(1)}s: midi=${c.midiChord} vs audio=${c.audioChord}`,
							);
						}
					}
				} else {
					log.stageOk("midi-chords", "no chords inferred from MIDI");
				}
			} catch (err) {
				log.stageFail("midi-chords", err instanceof Error ? err.message : String(err));
			}
		}

		// Lyric gap detection
		if (lyricsResult.words?.length) {
			const sortedWords = [...lyricsResult.words].sort((a, b) => a.t - b.t);
			const gaps: Array<{ start: number; end: number }> = [];
			for (let i = 0; i < sortedWords.length - 1; i++) {
				const end = sortedWords[i].end ?? sortedWords[i].t;
				const nextStart = sortedWords[i + 1].t;
				if (nextStart - end > 5000) {
					gaps.push({ start: end, end: nextStart });
				}
			}
			// Check gap at end of song
			const lastWord = sortedWords[sortedWords.length - 1];
			const lastWordEnd = lastWord.end ?? lastWord.t;
			if (durationMs - lastWordEnd > 10000) {
				gaps.push({ start: lastWordEnd, end: durationMs });
			}
			if (gaps.length > 0) {
				log.detail(`lyric-gaps: ${gaps.length} gaps detected`);
				for (const g of gaps) {
					log.detail(
						`  ${(g.start / 1000).toFixed(1)}s–${(g.end / 1000).toFixed(1)}s (${((g.end - g.start) / 1000).toFixed(0)}s)`,
					);
				}
			}
		}

		// === Phase 5: Assembly ===
		log.info("Assembling map...");
		const today = new Date().toISOString().slice(0, 10);
		const provenance: Record<string, AnalysisProvenance> = {};

		provenance.fingerprint = { tool: "fpcalc", version: "1.6.0", date: today };

		if (stems) {
			provenance.separation = { tool: "demucs", version: "htdemucs", date: today };
		}

		const map: PulseMap = {
			version: SCHEMA_VERSION,
			id: recordingId,
			duration_ms: durationMs,
			fingerprint: fp,
		};

		if (title || artist || album || analysis?.key || finalTempo) {
			map.metadata = {};
			if (title) map.metadata.title = title;
			if (artist) map.metadata.artist = artist;
			if (album) map.metadata.album = album;
			if (analysis?.key) {
				map.metadata.key = `${analysis.key} ${analysis.scale || ""}`.trim();
			}
			if (finalTempo) map.metadata.tempo = finalTempo;
			if (finalBeats?.length) {
				const firstTimeSig = finalBeats.find((b) => b.time_sig)?.time_sig;
				if (firstTimeSig) map.metadata.time_signature = firstTimeSig;
			} else if (analysis?.time_signature) {
				map.metadata.time_signature = analysis.time_signature;
			}
		}

		if (audio.sourceUrl) {
			const target = parsePlaybackTarget(audio.sourceUrl);
			if (target) {
				target.added = today;
				if (audio.playableInEmbed === false) {
					target.restrictions = { mobile_embed: false };
				}
				map.playback = [target];
			}
		}

		if (lyricsResult.lyrics?.length) {
			map.lyrics = lyricsResult.lyrics;
			provenance.lyrics = { tool: "lrclib", date: today };
		}

		if (lyricsResult.words?.length) {
			map.words = lyricsResult.words;
			const wordTool = lyricsResult.lrclibValidated ? "stable-ts+prompted" : "stable-ts+transcribe";
			provenance.words = { tool: wordTool, date: today };
		}

		if (finalChords?.length) {
			map.chords = finalChords;
			provenance.chords = { tool: `${chordSource}+cleanup`, date: today };
		}

		if (finalBeats?.length) {
			map.beats = finalBeats;
			provenance.beats = { tool: beatSource, date: today };
		}

		if (alignedMidiRefs.length > 0) {
			map.midi = alignedMidiRefs;
			for (const ref of alignedMidiRefs) {
				const label = ref.tracks?.[0]?.label;
				if (label) {
					const tool =
						label === "vocals" ? "torchcrepe" : label === "drums" ? "librosa" : "basic-pitch";
					provenance[`midi-${label}`] = { tool, date: today };
				}
			}
		}

		map.analysis = provenance;

		assertValid(map);

		const mapFields: string[] = [];
		if (map.fingerprint) mapFields.push("fingerprint");
		if (map.metadata) mapFields.push("metadata");
		if (map.playback) mapFields.push("playback");
		if (map.lyrics) mapFields.push(`lyrics(${map.lyrics.length})`);
		if (map.words) mapFields.push(`words(${map.words.length})`);
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
