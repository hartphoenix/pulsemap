import type { PulseMap } from "pulsemap/schema";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { COLORS, LANE_ORDER, type LaneName } from "../constants";
import { type SnapSubdivision, useBeatSnap } from "../hooks/useBeatSnap";
import { useTimeline } from "../hooks/useTimeline";
import { deselectAction } from "../state/actions";
import { useEditor } from "../state/context";
import type { EditableLane } from "../state/types";
import type { ValidationIssue } from "../validation/types";
import { EditPanel } from "./EditPanel";
import { LaneToggles } from "./LaneToggles";
import { Playhead } from "./Playhead";
import { ValidationPanel } from "./ValidationPanel";
import { BeatLane } from "./lanes/BeatLane";
import { ChordLane } from "./lanes/ChordLane";
import { LyricLane } from "./lanes/LyricLane";
import { SectionLane } from "./lanes/SectionLane";
import { WordLane } from "./lanes/WordLane";

interface TimelineProps {
	map: PulseMap;
	position: number;
	playing: boolean;
	onSeek: (ms: number) => void;
	snapEnabled: boolean;
	snapSubdivision: SnapSubdivision;
	onSnapEnabledChange: (enabled: boolean) => void;
	onSnapSubdivisionChange: (subdivision: SnapSubdivision) => void;
	validationIssues: ValidationIssue[];
	validationColorsByLane: Map<EditableLane, Map<number, string>>;
	errorCount: number;
}

function hasLaneData(map: PulseMap, lane: LaneName): boolean {
	switch (lane) {
		case "sections":
			return !!map.sections && map.sections.length > 0;
		case "lyrics":
			return !!map.lyrics && map.lyrics.length > 0;
		case "words":
			return !!map.words && map.words.length > 0;
		case "chords":
			return !!map.chords && map.chords.length > 0;
		case "beats":
			return !!map.beats && map.beats.length > 0;
	}
}

export function Timeline({
	map,
	position,
	playing,
	onSeek,
	snapEnabled,
	snapSubdivision,
	onSnapEnabledChange,
	onSnapSubdivisionChange,
	validationIssues,
	validationColorsByLane,
	errorCount,
}: TimelineProps) {
	const { state, dispatch } = useEditor();
	const workingMap = state.working;

	const [visibility, setVisibility] = useState<Record<LaneName, boolean>>({
		sections: true,
		lyrics: true,
		words: true,
		chords: true,
		beats: true,
	});

	const [viewportWidth, setViewportWidth] = useState(800);
	const measureRef = useRef<HTMLDivElement | null>(null);

	const {
		scrollMs,
		pxPerMs,
		following,
		msToX,
		containerRef,
		enableFollow,
		disableFollow,
		zoomIn,
		zoomOut,
	} = useTimeline({
		durationMs: workingMap.duration_ms,
		position,
		playing,
	});

	const { snapToNearestBeat } = useBeatSnap({
		beats: workingMap.beats,
		enabled: snapEnabled,
		subdivision: snapSubdivision,
	});

	const snapFn = useCallback(
		(ms: number) => (snapEnabled ? snapToNearestBeat(ms) : ms),
		[snapEnabled, snapToNearestBeat],
	);

	// Measure viewport width
	useEffect(() => {
		const el = measureRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setViewportWidth(entry.contentRect.width);
			}
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// Merge container refs
	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			(containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
			(measureRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
		},
		[containerRef],
	);

	const toggleLane = useCallback((lane: LaneName) => {
		setVisibility((prev) => ({ ...prev, [lane]: !prev[lane] }));
	}, []);

	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const rect = e.currentTarget.getBoundingClientRect();
			const x = e.clientX - rect.left + e.currentTarget.scrollLeft - 72;
			if (x < 0) return;
			const ms = x / pxPerMs;
			if (ms >= 0 && ms <= workingMap.duration_ms) {
				onSeek(ms);
				disableFollow();
				dispatch(deselectAction());
			}
		},
		[pxPerMs, scrollMs, workingMap.duration_ms, onSeek, disableFollow, dispatch],
	);

	const totalWidthPx = workingMap.duration_ms * pxPerMs;
	const playheadX = msToX(position);

	const contentViewportWidth = Math.max(viewportWidth - 72, 100);

	return (
		<div style={styles.outerWrapper}>
			<div style={styles.wrapper}>
				<div style={styles.toolbar}>
					<div style={styles.toolbarLeft}>
						<LaneToggles map={workingMap} visibility={visibility} onToggle={toggleLane} />
					</div>
					<div style={styles.toolbarRight}>
						<button
							type="button"
							onClick={() => onSnapEnabledChange(!snapEnabled)}
							style={{
								...styles.snapButton,
								...(snapEnabled ? styles.snapButtonActive : {}),
							}}
							title={`Beat snap: ${snapEnabled ? "ON" : "OFF"} (hold Alt to temporarily disable)`}
						>
							Snap
						</button>
						{snapEnabled && (
							<select
								value={snapSubdivision}
								onChange={(e) => onSnapSubdivisionChange(e.target.value as SnapSubdivision)}
								style={styles.subdivisionSelect}
							>
								<option value="beat">Beat</option>
								<option value="half">1/2</option>
								<option value="quarter">1/4</option>
							</select>
						)}

						<div style={styles.separator} />

						<button type="button" onClick={zoomOut} style={styles.zoomButton}>
							-
						</button>
						<span style={styles.zoomLabel}>{(pxPerMs * 1000).toFixed(0)} px/s</span>
						<button type="button" onClick={zoomIn} style={styles.zoomButton}>
							+
						</button>
						{!following && playing && (
							<button type="button" onClick={enableFollow} style={styles.followButton}>
								Follow
							</button>
						)}
					</div>
				</div>

				<div style={styles.timelineRow}>
					<div ref={setRefs} style={styles.scrollContainer} onClick={handleClick}>
						<div style={{ ...styles.innerTrack, width: totalWidthPx + 72 }}>
							<Playhead positionX={playheadX} />

							{LANE_ORDER.map((lane) => {
								if (!hasLaneData(workingMap, lane) || !visibility[lane]) return null;
								switch (lane) {
									case "sections":
										return (
											<SectionLane
												key={lane}
												sections={workingMap.sections!}
												scrollMs={scrollMs}
												pxPerMs={pxPerMs}
												viewportWidthPx={contentViewportWidth}
												snapFn={snapFn}
												snapEnabled={snapEnabled}
												durationMs={workingMap.duration_ms}
												validationColors={validationColorsByLane.get("sections")}
											/>
										);
									case "lyrics":
										return (
											<LyricLane
												key={lane}
												lyrics={workingMap.lyrics!}
												scrollMs={scrollMs}
												pxPerMs={pxPerMs}
												viewportWidthPx={contentViewportWidth}
												snapFn={snapFn}
												snapEnabled={snapEnabled}
												validationColors={validationColorsByLane.get("lyrics")}
											/>
										);
									case "words":
										return (
											<WordLane
												key={lane}
												words={workingMap.words!}
												scrollMs={scrollMs}
												pxPerMs={pxPerMs}
												viewportWidthPx={contentViewportWidth}
												snapFn={snapFn}
												snapEnabled={snapEnabled}
												validationColors={validationColorsByLane.get("words")}
											/>
										);
									case "chords":
										return (
											<ChordLane
												key={lane}
												chords={workingMap.chords!}
												scrollMs={scrollMs}
												pxPerMs={pxPerMs}
												viewportWidthPx={contentViewportWidth}
												snapFn={snapFn}
												snapEnabled={snapEnabled}
												validationColors={validationColorsByLane.get("chords")}
											/>
										);
									case "beats":
										return (
											<BeatLane
												key={lane}
												beats={workingMap.beats!}
												scrollMs={scrollMs}
												pxPerMs={pxPerMs}
												viewportWidthPx={contentViewportWidth}
											/>
										);
								}
							})}
						</div>
					</div>

					{state.selection && <EditPanel />}
				</div>
			</div>

			{validationIssues.length > 0 && (
				<ValidationPanel issues={validationIssues} dispatch={dispatch} />
			)}
		</div>
	);
}

const styles: Record<string, CSSProperties> = {
	outerWrapper: {
		display: "flex",
		flexDirection: "column",
		gap: 4,
		marginTop: 16,
	},
	wrapper: {
		display: "flex",
		flexDirection: "column",
		gap: 8,
	},
	toolbar: {
		display: "flex",
		justifyContent: "space-between",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
	},
	toolbarLeft: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
	toolbarRight: {
		display: "flex",
		alignItems: "center",
		gap: 6,
	},
	snapButton: {
		padding: "4px 10px",
		background: "#2a2a4a",
		border: "1px solid #444",
		borderRadius: 4,
		color: "#888",
		fontSize: 12,
		cursor: "pointer",
	},
	snapButtonActive: {
		background: "#1a3a4a",
		borderColor: COLORS.beats,
		color: COLORS.beats,
	},
	subdivisionSelect: {
		padding: "3px 6px",
		background: "#2a2a4a",
		border: "1px solid #444",
		borderRadius: 4,
		color: "#ccc",
		fontSize: 12,
	},
	separator: {
		width: 1,
		height: 20,
		background: "#333",
		margin: "0 4px",
	},
	zoomButton: {
		width: 28,
		height: 28,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		background: "#2a2a4a",
		border: "1px solid #444",
		borderRadius: 4,
		color: "#fff",
		fontSize: 16,
		fontWeight: 700,
		cursor: "pointer",
	},
	zoomLabel: {
		fontSize: 12,
		color: "#888",
		fontFamily: "monospace",
		minWidth: 60,
		textAlign: "center",
	},
	followButton: {
		padding: "4px 10px",
		background: "#2a2a4a",
		border: `1px solid ${COLORS.playhead}`,
		borderRadius: 4,
		color: COLORS.playhead,
		fontSize: 12,
		cursor: "pointer",
		marginLeft: 4,
	},
	timelineRow: {
		display: "flex",
		flexDirection: "row",
		gap: 0,
	},
	scrollContainer: {
		flex: 1,
		overflowX: "auto",
		overflowY: "hidden",
		background: COLORS.background,
		borderRadius: 4,
		border: "1px solid #2a2a4a",
		cursor: "crosshair",
	},
	innerTrack: {
		position: "relative",
		minHeight: 40,
	},
};
