import type { PulseMap } from "pulsemap/schema";
import { useCallback, useEffect, useRef, useState } from "react";
import { Timeline } from "./components/Timeline";
import { TransportBar } from "./components/TransportBar";
import { getStoredToken, storeToken, validateToken } from "./github/auth";
import { useBeatSnap } from "./hooks/useBeatSnap";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useMap } from "./hooks/useMap";
import { usePlayback } from "./hooks/usePlayback";
import { hashMap } from "./persistence/hash";
import { clearEditorState, loadEditorState, saveEditorState } from "./persistence/storage";
import { EditorProvider, useEditor } from "./state/context";
import { parseEditorParams } from "./types";

function getMapId(): string | null {
	const path = window.location.pathname;
	// Strip leading slash, return null if empty
	const id = path.replace(/^\/+/, "");
	return id || null;
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
	ghLogin,
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
	ghLogin: string | null;
	onAuthChange: (token: string | null, login: string | null) => void;
}) {
	const { state, dispatch } = useEditor();
	const workingMap = state.working;
	const restoredRef = useRef(false);

	// Compute and store original hash, then check for saved state
	useEffect(() => {
		if (restoredRef.current) return;
		restoredRef.current = true;

		hashMap(map).then((hash) => {
			const saved = loadEditorState(map.id);
			if (saved) {
				if (saved.originalHash === hash) {
					// Restore saved state
					dispatch({
						type: "load-saved",
						working: saved.working,
						history: saved.history,
						originalHash: hash,
					});
				} else {
					// Hash mismatch — upstream changed
					const discard = window.confirm(
						"The upstream map has been updated since your last edit. Discard local changes?",
					);
					if (discard) {
						clearEditorState(map.id);
					} else {
						// Keep local changes even though upstream differs
						dispatch({
							type: "load-saved",
							working: saved.working,
							history: saved.history,
							originalHash: hash,
						});
					}
				}
			}
			// Store originalHash for auto-save even if no saved state
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
		if (!state.originalHash) return; // hash not yet computed
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

	const { snapToNearestBeat } = useBeatSnap({
		beats: workingMap.beats,
		enabled: true,
		subdivision: "beat",
	});

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
		snapEnabled: true,
		snapFn: snapToNearestBeat,
	});

	const meta = workingMap.metadata;
	const params = parseEditorParams(window.location.search);

	return (
		<>
			<header style={styles.header}>
				<h1 style={styles.title}>{meta?.title ?? workingMap.id}</h1>
				{meta?.artist && <span style={styles.artist}>{meta.artist}</span>}
				<div style={styles.metaRow}>
					{meta?.album && <span style={styles.metaTag}>{meta.album}</span>}
					{meta?.key && <span style={styles.metaTag}>{meta.key}</span>}
					{meta?.tempo && <span style={styles.metaTag}>{Math.round(meta.tempo)} BPM</span>}
					{meta?.time_signature && <span style={styles.metaTag}>{meta.time_signature}</span>}
					{state.dirty && <span style={styles.dirtyTag}>Edited</span>}
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
				map={workingMap}
				position={position}
				playing={playing}
				onSeek={onSeek}
				ghToken={ghToken}
				ghLogin={ghLogin}
				onAuthChange={onAuthChange}
				playbackAvailable={playbackAvailable}
			/>

			<div style={styles.debugInfo}>
				<code>
					{workingMap.id} | {Math.round(workingMap.duration_ms / 1000)}s
					{workingMap.lyrics ? ` | ${workingMap.lyrics.length} lyric lines` : ""}
					{workingMap.words ? ` | ${workingMap.words.length} words` : ""}
					{workingMap.chords ? ` | ${workingMap.chords.length} chords` : ""}
					{workingMap.beats ? ` | ${workingMap.beats.length} beats` : ""}
					{state.history.length > 0 ? ` | ${state.history.length} edits` : ""}
					{params.lane ? ` | lane=${params.lane}` : ""}
					{params.index != null ? ` | index=${params.index}` : ""}
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
	const [ghLogin, setGhLogin] = useState<string | null>(null);
	// Initialize from stored token
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
					ghLogin={ghLogin}
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
		marginBottom: "20px",
	},
	artist: {
		fontSize: "16px",
		color: "#aaa",
	},
	metaRow: {
		display: "flex",
		gap: "8px",
		marginTop: "8px",
		flexWrap: "wrap",
	},
	metaTag: {
		padding: "2px 8px",
		background: "#2a2a4a",
		borderRadius: "3px",
		fontSize: "13px",
		color: "#bbb",
	},
	dirtyTag: {
		padding: "2px 8px",
		background: "#3a3a00",
		borderRadius: "3px",
		fontSize: "13px",
		color: "#ffcc00",
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
