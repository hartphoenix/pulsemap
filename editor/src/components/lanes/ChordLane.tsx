import type { ChordEvent } from "pulsemap/schema";
import { useCallback, useMemo } from "react";
import { COLORS, LANE_HEIGHTS } from "../../constants";
import { moveAction, resizeAction, resizeStartAction, selectAction } from "../../state/actions";
import { useEditor } from "../../state/context";
import { EventBlock } from "../EventBlock";
import { Lane } from "../Lane";
import { findVisibleRange } from "./visibility";

interface ChordLaneProps {
	chords: ChordEvent[];
	scrollMs: number;
	pxPerMs: number;
	viewportWidthPx: number;
	snapFn: (ms: number) => number;
	snapEnabled: boolean;
	/** Per-index border color override for validation indicators */
	validationColors?: Map<number, string>;
}

export function ChordLane({
	chords,
	scrollMs,
	pxPerMs,
	viewportWidthPx,
	snapFn,
	snapEnabled,
	validationColors,
}: ChordLaneProps) {
	const viewportStartMs = Math.max(0, scrollMs - 72 / pxPerMs);
	const viewportEndMs = scrollMs + viewportWidthPx / pxPerMs;
	const height = LANE_HEIGHTS.chords;
	const { state, dispatch } = useEditor();

	const visibleChords = useMemo(() => {
		const [start, end] = findVisibleRange(chords, viewportStartMs, viewportEndMs);
		return chords.slice(start, end).map((chord, i) => {
			const idx = start + i;
			const endMs = chord.end ?? (idx + 1 < chords.length ? chords[idx + 1].t : undefined);
			return { ...chord, endMs, globalIdx: idx };
		});
	}, [chords, viewportStartMs, viewportEndMs]);

	const handleSelect = useCallback(
		(idx: number) => dispatch(selectAction("chords", idx)),
		[dispatch],
	);

	const handleMove = useCallback(
		(idx: number, beforeT: number, newT: number) => {
			dispatch(moveAction("chords", idx, beforeT, newT));
		},
		[dispatch],
	);

	const handleResizeStart = useCallback(
		(idx: number, beforeT: number, newT: number) => {
			dispatch(resizeStartAction("chords", idx, beforeT, Math.max(0, newT)));
		},
		[dispatch],
	);

	const handleResizeEnd = useCallback(
		(idx: number, beforeEnd: number | undefined, newEnd: number) => {
			dispatch(resizeAction("chords", idx, beforeEnd, newEnd));
		},
		[dispatch],
	);

	return (
		<Lane label="Chords" height={height}>
			{visibleChords.map((chord) => {
				const x = chord.t * pxPerMs;
				const w = chord.endMs ? (chord.endMs - chord.t) * pxPerMs : 60;
				const selected =
					state.selection?.lane === "chords" && state.selection?.index === chord.globalIdx;

				return (
					<EventBlock
						key={`chord-${chord.globalIdx}`}
						x={x}
						width={w}
						height={height}
						selected={selected}
						color={COLORS.chords}
						startMs={chord.t}
						endMs={chord.end}
						pxPerMs={pxPerMs}
						snapFn={snapFn}
						snapEnabled={snapEnabled}
						onClick={() => handleSelect(chord.globalIdx)}
						onMove={(newT) => handleMove(chord.globalIdx, chord.t, newT)}
						borderColor={validationColors?.get(chord.globalIdx)}
						onResizeStart={(newT) => handleResizeStart(chord.globalIdx, chord.t, newT)}
						onResizeEnd={
							chord.end != null
								? (newEnd) => handleResizeEnd(chord.globalIdx, chord.end, newEnd)
								: undefined
						}
					>
						<span
							style={{
								fontSize: 11,
								fontWeight: 700,
								color: "#1a1a2e",
								whiteSpace: "nowrap",
							}}
						>
							{chord.chord}
						</span>
					</EventBlock>
				);
			})}
		</Lane>
	);
}
