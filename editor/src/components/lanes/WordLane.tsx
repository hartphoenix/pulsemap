import { useMemo, useCallback } from "react";
import type { WordEvent } from "pulsemap/schema";
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

interface WordLaneProps {
  words: WordEvent[];
  scrollMs: number;
  pxPerMs: number;
  viewportWidthPx: number;
  snapFn: (ms: number) => number;
  snapEnabled: boolean;
  /** Per-index border color override for validation indicators */
  validationColors?: Map<number, string>;
}

export function WordLane({
  words,
  scrollMs,
  pxPerMs,
  viewportWidthPx,
  snapFn,
  snapEnabled,
  validationColors,
}: WordLaneProps) {
  const viewportEndMs = scrollMs + viewportWidthPx / pxPerMs;
  const height = LANE_HEIGHTS.words;
  const { state, dispatch } = useEditor();

  const visibleWords = useMemo(() => {
    const [start, end] = findVisibleRange(words, scrollMs, viewportEndMs);
    return words.slice(start, end).map((word, i) => {
      const idx = start + i;
      const endMs =
        word.end ??
        (idx + 1 < words.length ? words[idx + 1].t : undefined);
      return { ...word, endMs, globalIdx: idx };
    });
  }, [words, scrollMs, viewportEndMs]);

  const handleSelect = useCallback(
    (idx: number) => dispatch(selectAction("words", idx)),
    [dispatch],
  );

  const handleMove = useCallback(
    (idx: number, beforeT: number, newT: number) => {
      dispatch(moveAction("words", idx, beforeT, newT));
    },
    [dispatch],
  );

  const handleResizeEnd = useCallback(
    (idx: number, beforeEnd: number | undefined, newEnd: number) => {
      dispatch(resizeAction("words", idx, beforeEnd, newEnd));
    },
    [dispatch],
  );

  return (
    <Lane label="Words" height={height}>
      {visibleWords.map((word) => {
        const x = (word.t - scrollMs) * pxPerMs;
        const w = word.endMs
          ? (word.endMs - word.t) * pxPerMs
          : 40;
        const selected =
          state.selection?.lane === "words" &&
          state.selection?.index === word.globalIdx;

        return (
          <EventBlock
            key={`word-${word.globalIdx}`}
            x={x}
            width={Math.max(w, 16)}
            height={height}
            selected={selected}
            color={COLORS.words}
            startMs={word.t}
            endMs={word.end}
            pxPerMs={pxPerMs}
            snapFn={snapFn}
            snapEnabled={snapEnabled}
            onClick={() => handleSelect(word.globalIdx)}
            onMove={(newT) => handleMove(word.globalIdx, word.t, newT)}
            borderColor={validationColors?.get(word.globalIdx)}
            onResizeEnd={
              word.end != null
                ? (newEnd) => handleResizeEnd(word.globalIdx, word.end, newEnd)
                : undefined
            }
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
          </EventBlock>
        );
      })}
    </Lane>
  );
}
