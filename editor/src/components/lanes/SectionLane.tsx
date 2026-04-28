import { useMemo } from "react";
import type { Section } from "pulsemap/schema";
import { COLORS, LANE_HEIGHTS } from "../../constants";
import { Lane } from "../Lane";
import { findVisibleRange } from "./visibility";

interface SectionLaneProps {
  sections: Section[];
  scrollMs: number;
  pxPerMs: number;
  viewportWidthPx: number;
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
}: SectionLaneProps) {
  const viewportEndMs = scrollMs + viewportWidthPx / pxPerMs;
  const height = LANE_HEIGHTS.sections;

  const visibleSections = useMemo(() => {
    const [start, end] = findVisibleRange(sections, scrollMs, viewportEndMs);
    return sections.slice(start, end).map((s, i) => ({
      ...s,
      colorIdx: (start + i) % SECTION_PALETTE.length,
    }));
  }, [sections, scrollMs, viewportEndMs]);

  return (
    <Lane label="Sections" height={height}>
      {visibleSections.map((section, i) => {
        const x = (section.t - scrollMs) * pxPerMs;
        const w = (section.end - section.t) * pxPerMs;
        const color = SECTION_PALETTE[section.colorIdx];
        return (
          <div
            key={`${section.t}-${i}`}
            style={{
              position: "absolute",
              left: x,
              top: 0,
              width: Math.max(w, 20),
              height,
              background: `${color}33`,
              borderLeft: `2px solid ${color}`,
              display: "flex",
              alignItems: "center",
              padding: "0 6px",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: COLORS.sections,
                whiteSpace: "nowrap",
                textTransform: "capitalize",
              }}
            >
              {section.label ?? section.type}
            </span>
          </div>
        );
      })}
    </Lane>
  );
}
