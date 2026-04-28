import { useMemo } from "react";
import type { ChordEvent } from "pulsemap/schema";
import { COLORS, LANE_HEIGHTS } from "../../constants";
import { Lane } from "../Lane";
import { findVisibleRange } from "./visibility";

interface ChordLaneProps {
  chords: ChordEvent[];
  scrollMs: number;
  pxPerMs: number;
  viewportWidthPx: number;
}

export function ChordLane({
  chords,
  scrollMs,
  pxPerMs,
  viewportWidthPx,
}: ChordLaneProps) {
  const viewportEndMs = scrollMs + viewportWidthPx / pxPerMs;
  const height = LANE_HEIGHTS.chords;

  const visibleChords = useMemo(() => {
    const [start, end] = findVisibleRange(chords, scrollMs, viewportEndMs);
    return chords.slice(start, end).map((chord, i) => {
      const idx = start + i;
      const endMs =
        chord.end ?? (idx + 1 < chords.length ? chords[idx + 1].t : undefined);
      return { ...chord, endMs };
    });
  }, [chords, scrollMs, viewportEndMs]);

  return (
    <Lane label="Chords" height={height}>
      {visibleChords.map((chord, i) => {
        const x = (chord.t - scrollMs) * pxPerMs;
        const w = chord.endMs
          ? (chord.endMs - chord.t) * pxPerMs
          : 60; // fallback width
        return (
          <div
            key={`${chord.t}-${i}`}
            style={{
              position: "absolute",
              left: x,
              top: 2,
              width: Math.max(w, 20),
              height: height - 4,
              background: COLORS.chords,
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#1a1a2e",
                whiteSpace: "nowrap",
                padding: "0 4px",
              }}
            >
              {chord.chord}
            </span>
          </div>
        );
      })}
    </Lane>
  );
}
