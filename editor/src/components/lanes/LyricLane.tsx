import type { LyricLine } from "pulsemap/schema";
import { useCallback, useMemo } from "react";
import { COLORS, LANE_HEIGHTS } from "../../constants";
import { moveAction, resizeAction, resizeStartAction, selectAction } from "../../state/actions";
import { useEditor } from "../../state/context";
import { EventBlock } from "../EventBlock";
import { Lane } from "../Lane";
import { findVisibleRange } from "./visibility";

interface LyricLaneProps {
	lyrics: LyricLine[];
	scrollMs: number;
	pxPerMs: number;
	viewportWidthPx: number;
	snapFn: (ms: number) => number;
	snapEnabled: boolean;
	/** Per-index border color override for validation indicators */
	validationColors?: Map<number, string>;
}

export function LyricLane({
	lyrics,
	scrollMs,
	pxPerMs,
	viewportWidthPx,
	snapFn,
	snapEnabled,
	validationColors,
}: LyricLaneProps) {
	const viewportStartMs = Math.max(0, scrollMs - 72 / pxPerMs);
	const viewportEndMs = scrollMs + viewportWidthPx / pxPerMs;
	const height = LANE_HEIGHTS.lyrics;
	const { state, dispatch } = useEditor();

	const visibleLyrics = useMemo(() => {
		const [start, end] = findVisibleRange(lyrics, viewportStartMs, viewportEndMs);
		return lyrics.slice(start, end).map((line, i) => {
			const idx = start + i;
			const endMs = line.end ?? (idx + 1 < lyrics.length ? lyrics[idx + 1].t : undefined);
			return { ...line, endMs, globalIdx: idx };
		});
	}, [lyrics, viewportStartMs, viewportEndMs]);

	const handleSelect = useCallback(
		(idx: number) => dispatch(selectAction("lyrics", idx)),
		[dispatch],
	);

	const handleMove = useCallback(
		(idx: number, beforeT: number, newT: number) => {
			dispatch(moveAction("lyrics", idx, beforeT, newT));
		},
		[dispatch],
	);

	const handleResizeStart = useCallback(
		(idx: number, beforeT: number, newT: number) => {
			dispatch(resizeStartAction("lyrics", idx, beforeT, Math.max(0, newT)));
		},
		[dispatch],
	);

	const handleResizeEnd = useCallback(
		(idx: number, beforeEnd: number | undefined, newEnd: number) => {
			dispatch(resizeAction("lyrics", idx, beforeEnd, newEnd));
		},
		[dispatch],
	);

	return (
		<Lane label="Lyrics" height={height}>
			{visibleLyrics.map((line) => {
				const x = line.t * pxPerMs;
				const w = line.endMs ? (line.endMs - line.t) * pxPerMs : 120;
				const selected =
					state.selection?.lane === "lyrics" && state.selection?.index === line.globalIdx;

				return (
					<EventBlock
						key={`lyric-${line.globalIdx}`}
						x={x}
						width={w}
						height={height}
						selected={selected}
						color={COLORS.lyrics}
						startMs={line.t}
						endMs={line.end}
						pxPerMs={pxPerMs}
						snapFn={snapFn}
						snapEnabled={snapEnabled}
						onClick={() => handleSelect(line.globalIdx)}
						onMove={(newT) => handleMove(line.globalIdx, line.t, newT)}
						borderColor={validationColors?.get(line.globalIdx)}
						onResizeStart={(newT) => handleResizeStart(line.globalIdx, line.t, newT)}
						onResizeEnd={
							line.end != null
								? (newEnd) => handleResizeEnd(line.globalIdx, line.end, newEnd)
								: undefined
						}
					>
						<span
							style={{
								fontSize: 11,
								color: COLORS.lyrics,
								whiteSpace: "nowrap",
								overflow: "hidden",
								textOverflow: "ellipsis",
							}}
						>
							{line.text}
						</span>
					</EventBlock>
				);
			})}
		</Lane>
	);
}
