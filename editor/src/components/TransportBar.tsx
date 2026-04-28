import { useState } from "react";

interface TransportBarProps {
	playing: boolean;
	position: number;
	duration: number;
	playbackAvailable: boolean;
	containerId: string;
	onPlay: () => void;
	onPause: () => void;
	onSeek: (ms: number) => void;
	onRateChange: (rate: number) => void;
}

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	const tenths = Math.floor((ms % 1000) / 100);
	return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

export function TransportBar({
	playing,
	position,
	duration,
	playbackAvailable,
	containerId,
	onPlay,
	onPause,
	onSeek,
	onRateChange,
}: TransportBarProps) {
	const [videoVisible, setVideoVisible] = useState(true);

	return (
		<div style={styles.wrapper}>
			{!playbackAvailable && (
				<div style={styles.warning}>No playback available — timing changes are unverified.</div>
			)}

			<div style={videoVisible ? styles.playerContainer : styles.playerContainerHidden}>
				<div id={containerId} style={styles.player} />
			</div>

			<div style={styles.controls}>
				<button
					type="button"
					onClick={playing ? onPause : onPlay}
					style={styles.playButton}
					disabled={!playbackAvailable}
				>
					{playing ? "Pause" : "Play"}
				</button>

				{playbackAvailable && (
					<button
						type="button"
						onClick={() => setVideoVisible((v) => !v)}
						style={styles.toggleButton}
					>
						{videoVisible ? "Hide Video" : "Show Video"}
					</button>
				)}

				<span style={styles.time}>{formatTime(position)}</span>

				<input
					type="range"
					min={0}
					max={duration}
					value={position}
					onChange={(e) => onSeek(Number(e.target.value))}
					style={styles.scrubber}
					disabled={!playbackAvailable}
				/>

				<span style={styles.time}>{formatTime(duration)}</span>

				<select
					onChange={(e) => onRateChange(Number(e.target.value))}
					defaultValue={1}
					style={styles.rateSelect}
					disabled={!playbackAvailable}
				>
					{RATES.map((r) => (
						<option key={r} value={r}>
							{r}x
						</option>
					))}
				</select>
			</div>
		</div>
	);
}

const styles: Record<string, React.CSSProperties> = {
	wrapper: {
		display: "flex",
		flexDirection: "column",
		gap: "12px",
	},
	warning: {
		padding: "8px 12px",
		background: "#3a2a00",
		border: "1px solid #665500",
		borderRadius: "4px",
		color: "#ffcc00",
		fontSize: "13px",
	},
	playerContainer: {
		width: "100%",
		maxWidth: "640px",
	},
	playerContainerHidden: {
		position: "fixed",
		left: -9999,
		top: -9999,
		width: 640,
		height: 360,
	},
	player: {
		width: "100%",
		aspectRatio: "16 / 9",
	},
	controls: {
		display: "flex",
		alignItems: "center",
		gap: "10px",
	},
	playButton: {
		padding: "6px 16px",
		background: "#2a2a4a",
		border: "1px solid #444",
		borderRadius: "4px",
		color: "#fff",
		cursor: "pointer",
		fontSize: "14px",
		minWidth: "70px",
	},
	toggleButton: {
		padding: "4px 10px",
		background: "#2a2a4a",
		border: "1px solid #444",
		borderRadius: "4px",
		color: "#aaa",
		cursor: "pointer",
		fontSize: "12px",
	},
	time: {
		fontFamily: "monospace",
		fontSize: "14px",
		color: "#aaa",
		minWidth: "60px",
	},
	scrubber: {
		flex: 1,
		accentColor: "#6c63ff",
	},
	rateSelect: {
		padding: "4px 8px",
		background: "#2a2a4a",
		border: "1px solid #444",
		borderRadius: "4px",
		color: "#fff",
		fontSize: "13px",
	},
};
