import { useMemo } from "react";
import type { LyricLine } from "pulsemap/schema";
import { COLORS, LANE_HEIGHTS } from "../../constants";
import { Lane } from "../Lane";
import { findVisibleRange } from "./visibility";

interface LyricLaneProps {
  lyrics: LyricLine[];
  scrollMs: number;
  pxPerMs: number;
  viewportWidthPx: number;
}

export function LyricLane({
  lyrics,
  scrollMs,
  pxPerMs,
  viewportWidthPx,
}: LyricLaneProps) {
  const viewportEndMs = scrollMs + viewportWidthPx / pxPerMs;
  const height = LANE_HEIGHTS.lyrics;

  const visibleLyrics = useMemo(() => {
    const [start, end] = findVisibleRange(lyrics, scrollMs, viewportEndMs);
    return lyrics.slice(start, end).map((line, i) => {
      const idx = start + i;
      const endMs =
        line.end ??
        (idx + 1 < lyrics.length ? lyrics[idx + 1].t : undefined);
      return { ...line, endMs };
    });
  }, [lyrics, scrollMs, viewportEndMs]);

  return (
    <Lane label="Lyrics" height={height}>
      {visibleLyrics.map((line, i) => {
        const x = (line.t - scrollMs) * pxPerMs;
        const w = line.endMs
          ? (line.endMs - line.t) * pxPerMs
          : 120;
        return (
          <div
            key={`${line.t}-${i}`}
            style={{
              position: "absolute",
              left: x,
              top: 2,
              width: Math.max(w, 30),
              height: height - 4,
              background: `${COLORS.lyrics}33`,
              border: `1px solid ${COLORS.lyrics}66`,
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              padding: "0 4px",
            }}
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
          </div>
        );
      })}
    </Lane>
  );
}
