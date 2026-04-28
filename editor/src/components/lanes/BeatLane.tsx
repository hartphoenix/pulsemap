import { useMemo } from "react";
import type { BeatEvent } from "pulsemap/schema";
import { COLORS, LANE_HEIGHTS } from "../../constants";
import { Lane } from "../Lane";
import { findVisibleRange } from "./visibility";

interface BeatLaneProps {
  beats: BeatEvent[];
  scrollMs: number;
  pxPerMs: number;
  viewportWidthPx: number;
}

export function BeatLane({
  beats,
  scrollMs,
  pxPerMs,
  viewportWidthPx,
}: BeatLaneProps) {
  const viewportEndMs = scrollMs + viewportWidthPx / pxPerMs;
  const height = LANE_HEIGHTS.beats;

  const visibleBeats = useMemo(() => {
    const [start, end] = findVisibleRange(beats, scrollMs, viewportEndMs);
    return beats.slice(start, end);
  }, [beats, scrollMs, viewportEndMs]);

  return (
    <Lane label="Beats" height={height}>
      {visibleBeats.map((beat, i) => {
        const x = (beat.t - scrollMs) * pxPerMs;
        const lineHeight = beat.downbeat ? height : height * 0.7;
        const opacity = beat.downbeat ? 1 : 0.5;
        const width = beat.downbeat ? 2 : 1;
        return (
          <div
            key={`${beat.t}-${i}`}
            style={{
              position: "absolute",
              left: x,
              bottom: 0,
              width,
              height: lineHeight,
              background: COLORS.beats,
              opacity,
            }}
          />
        );
      })}
    </Lane>
  );
}
