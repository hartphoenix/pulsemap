import { useMemo, useCallback } from "react";
import type { Section } from "pulsemap/schema";
import { COLORS, LANE_HEIGHTS } from "../../constants";
import { Lane } from "../Lane";
import { EventBlock } from "../EventBlock";
import { findVisibleRange } from "./visibility";
import { useEditor } from "../../state/context";
import {
  selectAction,
  moveAction,
  resizeAction,
  resizeStartAction,
  insertAction,
} from "../../state/actions";

interface SectionLaneProps {
  sections: Section[];
  scrollMs: number;
  pxPerMs: number;
  viewportWidthPx: number;
  snapFn: (ms: number) => number;
  snapEnabled: boolean;
  durationMs: number;
  /** Per-index border color override for validation indicators */
  validationColors?: Map<number, string>;
}

/** Rotate through a small palette so adjacent sections differ */
const SECTION_PALETTE = [
  "#6c5ce7",
  "#00b894",
  "#e17055",
  "#0984e3",
  "#fdcb6e",
  "#e84393",
  "#00cec9",
  "#d63031",
];

export function SectionLane({
  sections,
  scrollMs,
  pxPerMs,
  viewportWidthPx,
  snapFn,
  snapEnabled,
  durationMs,
  validationColors,
}: SectionLaneProps) {
  const viewportStartMs = Math.max(0, scrollMs - 72 / pxPerMs);
  const viewportEndMs = scrollMs + viewportWidthPx / pxPerMs;
  const height = LANE_HEIGHTS.sections;
  const { state, dispatch } = useEditor();

  const visibleSections = useMemo(() => {
    const [start, end] = findVisibleRange(sections, viewportStartMs, viewportEndMs);
    return sections.slice(start, end).map((s, i) => ({
      ...s,
      colorIdx: (start + i) % SECTION_PALETTE.length,
      globalIdx: start + i,
    }));
  }, [sections, viewportStartMs, viewportEndMs]);

  const handleSelect = useCallback(
    (idx: number) => dispatch(selectAction("sections", idx)),
    [dispatch],
  );

  const handleMove = useCallback(
    (idx: number, beforeT: number, newT: number) => {
      // Clamp to adjacent section boundaries
      const prev = idx > 0 ? sections[idx - 1] : null;
      const next = idx + 1 < sections.length ? sections[idx + 1] : null;
      const section = sections[idx];
      const duration = section.end - section.t;

      let clampedT = newT;
      if (prev && clampedT < prev.end) clampedT = prev.end;
      if (next && clampedT + duration > next.t) clampedT = next.t - duration;
      clampedT = Math.max(0, clampedT);

      dispatch(moveAction("sections", idx, beforeT, clampedT));
    },
    [dispatch, sections],
  );

  const handleResizeEnd = useCallback(
    (idx: number, beforeEnd: number, newEnd: number) => {
      // Clamp: don't overlap next section
      const next = idx + 1 < sections.length ? sections[idx + 1] : null;
      let clampedEnd = newEnd;
      if (next && clampedEnd > next.t) clampedEnd = next.t;
      clampedEnd = Math.min(clampedEnd, durationMs);
      clampedEnd = Math.max(clampedEnd, sections[idx].t + 10); // min 10ms
      dispatch(resizeAction("sections", idx, beforeEnd, clampedEnd));
    },
    [dispatch, sections, durationMs],
  );

  const handleResizeStart = useCallback(
    (idx: number, beforeT: number, newT: number) => {
      const prev = idx > 0 ? sections[idx - 1] : null;
      let clampedT = newT;
      if (prev && clampedT < prev.end) clampedT = prev.end;
      clampedT = Math.max(0, clampedT);
      clampedT = Math.min(clampedT, sections[idx].end - 10);
      dispatch(resizeStartAction("sections", idx, beforeT, clampedT));
    },
    [dispatch, sections],
  );

  // Find gaps between sections for insert buttons
  const gaps = useMemo(() => {
    const result: { startMs: number; endMs: number; insertIdx: number }[] = [];
    // Gap before first section
    if (sections.length === 0 || sections[0].t > 0) {
      result.push({
        startMs: 0,
        endMs: sections.length > 0 ? sections[0].t : durationMs,
        insertIdx: 0,
      });
    }
    // Gaps between sections
    for (let i = 0; i + 1 < sections.length; i++) {
      if (sections[i].end < sections[i + 1].t - 10) {
        result.push({
          startMs: sections[i].end,
          endMs: sections[i + 1].t,
          insertIdx: i + 1,
        });
      }
    }
    // Gap after last section
    if (sections.length > 0 && sections[sections.length - 1].end < durationMs - 10) {
      result.push({
        startMs: sections[sections.length - 1].end,
        endMs: durationMs,
        insertIdx: sections.length,
      });
    }
    return result;
  }, [sections, durationMs]);

  const handleInsert = useCallback(
    (startMs: number, endMs: number, insertIdx: number) => {
      const newSection: Section = {
        t: startMs,
        end: endMs,
        type: "verse",
      };
      dispatch(insertAction("sections", insertIdx, newSection));
    },
    [dispatch],
  );

  return (
    <Lane label="Sections" height={height}>
      {/* Insert buttons for gaps */}
      {gaps.map((gap) => {
        const gapX = gap.startMs * pxPerMs;
        const gapW = (gap.endMs - gap.startMs) * pxPerMs;
        const scrollPx = scrollMs * pxPerMs;
        if (gapX + gapW < scrollPx || gapX > scrollPx + viewportWidthPx || gapW < 20) return null;
        return (
          <div
            key={`gap-${gap.insertIdx}`}
            style={{
              position: "absolute",
              left: gapX + gapW / 2 - 10,
              top: height / 2 - 10,
              width: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#2a2a4a",
              border: "1px dashed #555",
              borderRadius: "50%",
              cursor: "pointer",
              fontSize: 14,
              color: "#888",
              zIndex: 3,
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleInsert(gap.startMs, gap.endMs, gap.insertIdx);
            }}
            title="Insert section"
          >
            +
          </div>
        );
      })}

      {visibleSections.map((section) => {
        const x = section.t * pxPerMs;
        const w = (section.end - section.t) * pxPerMs;
        const color = SECTION_PALETTE[section.colorIdx];
        const selected =
          state.selection?.lane === "sections" &&
          state.selection?.index === section.globalIdx;

        return (
          <EventBlock
            key={`section-${section.globalIdx}`}
            x={x}
            width={w}
            height={height}
            selected={selected}
            color={color}
            startMs={section.t}
            endMs={section.end}
            pxPerMs={pxPerMs}
            snapFn={snapFn}
            snapEnabled={snapEnabled}
            borderColor={validationColors?.get(section.globalIdx)}
            top={0}
            onClick={() => handleSelect(section.globalIdx)}
            onMove={(newT) => handleMove(section.globalIdx, section.t, newT)}
            onResizeStart={(newT) => handleResizeStart(section.globalIdx, section.t, newT)}
            onResizeEnd={(newEnd) => handleResizeEnd(section.globalIdx, section.end, newEnd)}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: COLORS.sections,
                whiteSpace: "nowrap",
                textTransform: "capitalize",
                padding: "0 2px",
              }}
            >
              {section.label ?? section.type}
            </span>
          </EventBlock>
        );
      })}
    </Lane>
  );
}
