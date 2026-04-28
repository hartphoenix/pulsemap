import { useMemo } from "react";
import type { WordEvent } from "pulsemap/schema";
import { COLORS, LANE_HEIGHTS } from "../../constants";
import { Lane } from "../Lane";
import { findVisibleRange } from "./visibility";

interface WordLaneProps {
  words: WordEvent[];
  scrollMs: number;
  pxPerMs: number;
  viewportWidthPx: number;
}

export function WordLane({
  words,
  scrollMs,
  pxPerMs,
  viewportWidthPx,
}: WordLaneProps) {
  const viewportEndMs = scrollMs + viewportWidthPx / pxPerMs;
  const height = LANE_HEIGHTS.words;

  const visibleWords = useMemo(() => {
    const [start, end] = findVisibleRange(words, scrollMs, viewportEndMs);
    return words.slice(start, end).map((word, i) => {
      const idx = start + i;
      const endMs =
        word.end ??
        (idx + 1 < words.length ? words[idx + 1].t : undefined);
      return { ...word, endMs };
    });
  }, [words, scrollMs, viewportEndMs]);

  return (
    <Lane label="Words" height={height}>
      {visibleWords.map((word, i) => {
        const x = (word.t - scrollMs) * pxPerMs;
        const w = word.endMs
          ? (word.endMs - word.t) * pxPerMs
          : 40;
        return (
          <div
            key={`${word.t}-${i}`}
            style={{
              position: "absolute",
              left: x,
              top: 2,
              width: Math.max(w, 16),
              height: height - 4,
              background: `${COLORS.words}33`,
              border: `1px solid ${COLORS.words}55`,
              borderRadius: 2,
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              padding: "0 2px",
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: COLORS.words,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {word.text}
            </span>
          </div>
        );
      })}
    </Lane>
  );
}
