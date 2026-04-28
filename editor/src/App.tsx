import { TransportBar } from "./components/TransportBar";
import { useMap } from "./hooks/useMap";
import { usePlayback } from "./hooks/usePlayback";
import { parseEditorParams } from "./types";

function getMapId(): string | null {
	const path = window.location.pathname;
	// Strip leading slash, return null if empty
	const id = path.replace(/^\/+/, "");
	return id || null;
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

	const meta = map.metadata;

	return (
		<div style={styles.container}>
			<header style={styles.header}>
				<h1 style={styles.title}>{meta?.title ?? map.id}</h1>
				{meta?.artist && <span style={styles.artist}>{meta.artist}</span>}
				<div style={styles.metaRow}>
					{meta?.album && <span style={styles.metaTag}>{meta.album}</span>}
					{meta?.key && <span style={styles.metaTag}>{meta.key}</span>}
					{meta?.tempo && <span style={styles.metaTag}>{Math.round(meta.tempo)} BPM</span>}
					{meta?.time_signature && <span style={styles.metaTag}>{meta.time_signature}</span>}
				</div>
			</header>

			<TransportBar
				playing={playing}
				position={position}
				duration={map.duration_ms}
				playbackAvailable={playbackAvailable}
				containerId={containerId}
				onPlay={play}
				onPause={pause}
				onSeek={seek}
				onRateChange={setRate}
			/>

			<div style={styles.debugInfo}>
				<code>
					{map.id} | {Math.round(map.duration_ms / 1000)}s
					{map.lyrics ? ` | ${map.lyrics.length} lyric lines` : ""}
					{map.words ? ` | ${map.words.length} words` : ""}
					{map.chords ? ` | ${map.chords.length} chords` : ""}
					{map.beats ? ` | ${map.beats.length} beats` : ""}
					{params.lane ? ` | lane=${params.lane}` : ""}
					{params.index != null ? ` | index=${params.index}` : ""}
				</code>
			</div>
		</div>
	);
}

const styles: Record<string, React.CSSProperties> = {
	container: {
		maxWidth: "900px",
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
	debugInfo: {
		marginTop: "20px",
		padding: "8px 12px",
		background: "#12121e",
		borderRadius: "4px",
		fontSize: "12px",
		color: "#666",
	},
};
