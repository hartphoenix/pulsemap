import { useMemo, useCallback } from "react";
import type { LyricLine } from "pulsemap/schema";
import { COLORS, LANE_HEIGHTS } from "../../constants";
import { Lane } from "../Lane";
import { EventBlock } from "../EventBlock";
import { findVisibleRange } from "./visibility";
import { useEditor } from "../../state/context";
import {
  selectAction,
  moveAction,
  resizeAction,
} from "../../state/actions";

interface LyricLaneProps {
  lyrics: LyricLine[];
  scrollMs: number;
  pxPerMs: number;
  viewportWidthPx: number;
  snapFn: (ms: number) => number;
  snapEnabled: boolean;
}

export function LyricLane({
  lyrics,
  scrollMs,
  pxPerMs,
  viewportWidthPx,
  snapFn,
  snapEnabled,
}: LyricLaneProps) {
  const viewportEndMs = scrollMs + viewportWidthPx / pxPerMs;
  const height = LANE_HEIGHTS.lyrics;
  const { state, dispatch } = useEditor();

  const visibleLyrics = useMemo(() => {
    const [start, end] = findVisibleRange(lyrics, scrollMs, viewportEndMs);
    return lyrics.slice(start, end).map((line, i) => {
      const idx = start + i;
      const endMs =
        line.end ??
        (idx + 1 < lyrics.length ? lyrics[idx + 1].t : undefined);
      return { ...line, endMs, globalIdx: idx };
    });
  }, [lyrics, scrollMs, viewportEndMs]);

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

  const handleResizeEnd = useCallback(
    (idx: number, beforeEnd: number | undefined, newEnd: number) => {
      dispatch(resizeAction("lyrics", idx, beforeEnd, newEnd));
    },
    [dispatch],
  );

  return (
    <Lane label="Lyrics" height={height}>
      {visibleLyrics.map((line) => {
        const x = (line.t - scrollMs) * pxPerMs;
        const w = line.endMs
          ? (line.endMs - line.t) * pxPerMs
          : 120;
        const selected =
          state.selection?.lane === "lyrics" &&
          state.selection?.index === line.globalIdx;

        return (
          <EventBlock
            key={`lyric-${line.globalIdx}`}
            x={x}
            width={Math.max(w, 30)}
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
