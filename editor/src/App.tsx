import { useCallback } from "react";
import { Timeline } from "./components/Timeline";
import { TransportBar } from "./components/TransportBar";
import { useMap } from "./hooks/useMap";
import { usePlayback } from "./hooks/usePlayback";
import { parseEditorParams } from "./types";
import { EditorProvider, useEditor } from "./state/context";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useBeatSnap } from "./hooks/useBeatSnap";
import type { PulseMap } from "pulsemap/schema";

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
}) {
	const { state } = useEditor();
	const workingMap = state.working;

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
		if (!state.dirty) return;
		try {
			localStorage.setItem(
				`pulsemap-edit-${workingMap.id}`,
				JSON.stringify(workingMap),
			);
		} catch {
			// localStorage might be full or unavailable
		}
	}, [state.dirty, workingMap]);

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
