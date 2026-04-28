import type { BeatEvent, PulseMap } from "pulsemap/schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DirtyIndicator } from "./components/DirtyIndicator";
import { ExportButton } from "./components/ExportButton";
import { GitHubAuth } from "./components/GitHubAuth";
import { SubmitFlow } from "./components/SubmitFlow";
import { Timeline } from "./components/Timeline";
import { TransportBar } from "./components/TransportBar";
import { getStoredToken, validateToken } from "./github/auth";
import { type SnapSubdivision, useBeatSnap } from "./hooks/useBeatSnap";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useMap } from "./hooks/useMap";
import { usePlayback } from "./hooks/usePlayback";
import { hashMap } from "./persistence/hash";
import { clearEditorState, loadEditorState, saveEditorState } from "./persistence/storage";
import { EditorProvider, useEditor } from "./state/context";
import type { EditableLane } from "./state/types";
import { parseEditorParams } from "./types";
import type { ValidationIssue } from "./validation/types";
import { validateMap } from "./validation/validate";

function getMapId(): string | null {
	const base = import.meta.env.BASE_URL ?? "/";
	const params = new URLSearchParams(window.location.search);
	const route = params.get("route");
	const path = route ?? window.location.pathname;
	const id = path.startsWith(base) ? path.slice(base.length) : path.replace(/^\/+/, "");
	if (route && id) {
		params.delete("route");
		const qs = params.toString();
		window.history.replaceState(null, "", `${base}${id}${qs ? `?${qs}` : ""}`);
	}
	return id || null;
}

function getHalfBeatMs(beats: BeatEvent[] | undefined): number {
	if (!beats || beats.length < 2) return 250;
	const gaps: number[] = [];
	for (let i = 1; i < beats.length; i++) {
		gaps.push(beats[i].t - beats[i - 1].t);
	}
	gaps.sort((a, b) => a - b);
	const median = gaps[Math.floor(gaps.length / 2)];
	return median / 2;
}

/** Inner editor component that has access to EditorProvider context */
function EditorContent({
	map,
	playing,
	position,
	containerId,
	playbackAvailable,
	onPlay,
	onPause,
	onSeek,
	onRateChange,
	ghToken,
	onAuthChange,
}: {
	map: PulseMap;
	playing: boolean;
	position: number;
	containerId: string;
	playbackAvailable: boolean;
	onPlay: () => void;
	onPause: () => void;
	onSeek: (ms: number) => void;
	onRateChange: (rate: number) => void;
	ghToken: string | null;
	onAuthChange: (token: string | null, login: string | null) => void;
}) {
	const { state, dispatch } = useEditor();
	const workingMap = state.working;
	const restoredRef = useRef(false);

	// -- Snap state (lifted from Timeline) --
	const [snapEnabled, setSnapEnabled] = useState(false);
	const [snapSubdivision, setSnapSubdivision] = useState<SnapSubdivision>("half");

	// -- Submit flow state (lifted from Timeline) --
	const [showSubmitFlow, setShowSubmitFlow] = useState(false);

	// Compute and store original hash, then check for saved state
	useEffect(() => {
		if (restoredRef.current) return;
		restoredRef.current = true;

		hashMap(map).then((hash) => {
			const saved = loadEditorState(map.id);
			if (saved) {
				if (saved.originalHash === hash) {
					dispatch({
						type: "load-saved",
						working: saved.working,
						history: saved.history,
						originalHash: hash,
					});
				} else {
					const discard = window.confirm(
						"The upstream map has been updated since your last edit. Discard local changes?",
					);
					if (discard) {
						clearEditorState(map.id);
					} else {
						dispatch({
							type: "load-saved",
							working: saved.working,
							history: saved.history,
							originalHash: hash,
						});
					}
				}
			}
			if (!saved) {
				dispatch({
					type: "load-saved",
					working: map,
					history: [],
					originalHash: hash,
				});
			}
		});
	}, [map, dispatch]);

	// Auto-save on every state change (debounced 500ms)
	useEffect(() => {
		if (!state.originalHash) return;
		if (state.dirty) {
			saveEditorState(map.id, state.working, state.history, state.originalHash);
		}
	}, [state.working, state.dirty, state.history, state.originalHash, map.id]);

	// beforeunload warning when dirty
	useEffect(() => {
		if (!state.dirty) return;
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault();
		};
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [state.dirty]);

	// -- Validation (lifted from Timeline) --
	const validationIssues: ValidationIssue[] = useMemo(() => validateMap(workingMap), [workingMap]);

	const errorCount = useMemo(
		() => validationIssues.filter((i) => i.severity === "error").length,
		[validationIssues],
	);

	const canSubmit = errorCount === 0;

	const validationColorsByLane = useMemo(() => {
		const m = new Map<EditableLane, Map<number, string>>();
		for (const issue of validationIssues) {
			if (issue.lane == null || issue.index == null) continue;
			if (!m.has(issue.lane)) m.set(issue.lane, new Map());
			const laneMap = m.get(issue.lane)!;
			const existing = laneMap.get(issue.index);
			if (!existing || (existing !== "#ff4444" && issue.severity === "error")) {
				laneMap.set(issue.index, issue.severity === "error" ? "#ff4444" : "#ffaa00");
			}
		}
		return m;
	}, [validationIssues]);

	// -- Beat snap for keyboard shortcuts --
	const { snapToNearestBeat } = useBeatSnap({
		beats: workingMap.beats,
		enabled: snapEnabled,
		subdivision: snapSubdivision,
	});

	const halfBeatMs = useMemo(() => getHalfBeatMs(workingMap.beats), [workingMap.beats]);

	const handlePlayPause = useCallback(() => {
		if (playing) {
			onPause();
		} else {
			onPlay();
		}
	}, [playing, onPlay, onPause]);

	const handleSave = useCallback(() => {
		if (!state.dirty || !state.originalHash) return;
		saveEditorState(map.id, state.working, state.history, state.originalHash);
	}, [state.dirty, state.working, state.history, state.originalHash, map.id]);

	useKeyboardShortcuts({
		onPlayPause: handlePlayPause,
		onSave: handleSave,
		snapEnabled,
		snapFn: snapToNearestBeat,
		nudgeMs: halfBeatMs,
	});

	const meta = workingMap.metadata;

	return (
		<>
			<header style={styles.header}>
				<div style={styles.headerLeft}>
					<h1 style={styles.title}>{meta?.title ?? workingMap.id}</h1>
					{meta?.artist && <span style={styles.artist}>{meta.artist}</span>}
					<div style={styles.metaRow}>
						{meta?.album && <span style={styles.metaTag}>{meta.album}</span>}
						{meta?.key && <span style={styles.metaTag}>{meta.key}</span>}
						{meta?.tempo && <span style={styles.metaTag}>{Math.round(meta.tempo)} BPM</span>}
						{meta?.time_signature && <span style={styles.metaTag}>{meta.time_signature}</span>}
					</div>
				</div>
				<div style={styles.headerRight}>
					<DirtyIndicator dirty={state.dirty} editCount={state.history.length} />
					{state.dirty && (
						<button
							type="button"
							style={styles.discardButton}
							onClick={() => {
								if (window.confirm("Discard all changes? This cannot be undone.")) {
									clearEditorState(map.id);
									dispatch({
										type: "load-saved",
										working: map,
										history: [],
										originalHash: state.originalHash,
									});
								}
							}}
						>
							Discard Changes
						</button>
					)}
					{state.dirty && <ExportButton map={workingMap} />}
					{!canSubmit && (
						<span style={styles.submitGate}>
							{errorCount} error{errorCount !== 1 ? "s" : ""} — fix before submitting
						</span>
					)}
					<GitHubAuth onAuthChange={onAuthChange} />
					{state.dirty && ghToken && (
						<button
							type="button"
							onClick={() => setShowSubmitFlow(true)}
							disabled={!canSubmit}
							style={{
								...styles.submitButton,
								...(!canSubmit ? styles.submitButtonDisabled : {}),
							}}
						>
							Submit Correction
						</button>
					)}
				</div>
			</header>

			<TransportBar
				playing={playing}
				position={position}
				duration={workingMap.duration_ms}
				playbackAvailable={playbackAvailable}
				containerId={containerId}
				onPlay={onPlay}
				onPause={onPause}
				onSeek={onSeek}
				onRateChange={onRateChange}
			/>

			<Timeline
				position={position}
				playing={playing}
				onSeek={onSeek}
				snapEnabled={snapEnabled}
				snapSubdivision={snapSubdivision}
				onSnapEnabledChange={setSnapEnabled}
				onSnapSubdivisionChange={setSnapSubdivision}
				validationIssues={validationIssues}
				validationColorsByLane={validationColorsByLane}
			/>

			{showSubmitFlow && ghToken && (
				<SubmitFlow
					map={workingMap}
					history={state.history}
					token={ghToken}
					playbackAvailable={playbackAvailable}
					errorCount={errorCount}
					onClose={() => setShowSubmitFlow(false)}
				/>
			)}

			<div style={styles.debugInfo}>
				<code>
					{workingMap.id} | {Math.round(workingMap.duration_ms / 1000)}s
					{workingMap.lyrics ? ` | ${workingMap.lyrics.length} lyric lines` : ""}
					{workingMap.words ? ` | ${workingMap.words.length} words` : ""}
					{workingMap.chords ? ` | ${workingMap.chords.length} chords` : ""}
					{workingMap.beats ? ` | ${workingMap.beats.length} beats` : ""}
					{state.history.length > 0 ? ` | ${state.history.length} edits` : ""}
				</code>
			</div>
		</>
	);
}

export function App() {
	const mapId = getMapId();
	const params = parseEditorParams(window.location.search);
	const { map, loading, error } = useMap(mapId);
	const { containerId, play, pause, seek, setRate, playbackAvailable, playing, position } =
		usePlayback(map);

	// --- GitHub OAuth state ---
	const [ghToken, setGhToken] = useState<string | null>(null);
	const [, setGhLogin] = useState<string | null>(null);
	const tokenInitialized = useRef(false);
	useEffect(() => {
		if (tokenInitialized.current) return;
		tokenInitialized.current = true;
		const token = getStoredToken();
		if (token) {
			validateToken(token).then((user) => {
				if (user) {
					setGhToken(token);
					setGhLogin(user.login);
				}
			});
		}
	}, []);

	const handleAuthChange = useCallback((token: string | null, login: string | null) => {
		setGhToken(token);
		setGhLogin(login);
	}, []);

	// Seek to ?t= param on first load
	if (params.t != null && map && playbackAvailable && position === 0) {
		seek(params.t);
	}

	if (!mapId) {
		return (
			<div style={styles.container}>
				<div style={styles.empty}>
					<h1 style={styles.title}>PulseMap Editor</h1>
					<p style={styles.hint}>
						Open a map by navigating to <code>/{"{mapId}"}</code>
					</p>
				</div>
			</div>
		);
	}

	if (loading) {
		return (
			<div style={styles.container}>
				<div style={styles.status}>Loading map {mapId}...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div style={styles.container}>
				<div style={styles.error}>
					<strong>Error:</strong> {error}
				</div>
			</div>
		);
	}

	if (!map) return null;

	return (
		<div style={styles.container}>
			<EditorProvider map={map}>
				<EditorContent
					map={map}
					playing={playing}
					position={position}
					containerId={containerId}
					playbackAvailable={playbackAvailable}
					onPlay={play}
					onPause={pause}
					onSeek={seek}
					onRateChange={setRate}
					ghToken={ghToken}
					onAuthChange={handleAuthChange}
				/>
			</EditorProvider>
		</div>
	);
}

const styles: Record<string, React.CSSProperties> = {
	container: {
		maxWidth: 1200,
		margin: "0 auto",
		padding: "24px",
		fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
		color: "#e0e0e0",
		background: "#1a1a2e",
		minHeight: "100vh",
	},
	empty: {
		textAlign: "center",
		marginTop: "120px",
	},
	title: {
		margin: "0 0 4px 0",
		fontSize: "22px",
		fontWeight: 600,
		color: "#fff",
	},
	hint: {
		color: "#888",
		fontSize: "15px",
	},
	status: {
		padding: "20px",
		color: "#888",
		fontSize: "15px",
	},
	error: {
		padding: "12px 16px",
		background: "#3a1a1a",
		border: "1px solid #662222",
		borderRadius: "4px",
		color: "#ff6666",
		fontSize: "14px",
	},
	header: {
		display: "flex",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: "20px",
		gap: 16,
		flexWrap: "wrap",
	},
	headerLeft: {
		display: "flex",
		flexDirection: "column",
		gap: 4,
	},
	headerRight: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
	artist: {
		fontSize: "16px",
		color: "#aaa",
	},
	metaRow: {
		display: "flex",
		gap: "8px",
		marginTop: "4px",
		flexWrap: "wrap",
	},
	metaTag: {
		padding: "2px 8px",
		background: "#2a2a4a",
		borderRadius: "3px",
		fontSize: "13px",
		color: "#bbb",
	},
	submitGate: {
		fontSize: 11,
		color: "#ff4444",
		fontWeight: 600,
	},
	discardButton: {
		padding: "4px 10px",
		background: "#3a1a1a",
		border: "1px solid #6a3a3a",
		borderRadius: 4,
		color: "#ff8888",
		fontSize: 12,
		cursor: "pointer",
	},
	submitButton: {
		padding: "4px 10px",
		background: "#238636",
		border: "1px solid #2ea043",
		borderRadius: 4,
		color: "#fff",
		fontSize: 12,
		fontWeight: 600,
		cursor: "pointer",
	},
	submitButtonDisabled: {
		opacity: 0.5,
		cursor: "not-allowed",
	},
	debugInfo: {
		marginTop: "20px",
		padding: "8px 12px",
		background: "#12121e",
		borderRadius: "4px",
		fontSize: "12px",
		color: "#666",
	},
};
