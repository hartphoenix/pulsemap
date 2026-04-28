import { useState, useCallback, useRef, useEffect, type CSSProperties } from "react";
import type { PulseMap } from "pulsemap/schema";
import { useTimeline } from "../hooks/useTimeline";
import { COLORS, LANE_ORDER, type LaneName } from "../constants";
import { Playhead } from "./Playhead";
import { LaneToggles } from "./LaneToggles";
import { BeatLane } from "./lanes/BeatLane";
import { ChordLane } from "./lanes/ChordLane";
import { LyricLane } from "./lanes/LyricLane";
import { WordLane } from "./lanes/WordLane";
import { SectionLane } from "./lanes/SectionLane";

interface TimelineProps {
  map: PulseMap;
  position: number;
  playing: boolean;
  onSeek: (ms: number) => void;
}

function hasLaneData(map: PulseMap, lane: LaneName): boolean {
  switch (lane) {
    case "sections":
      return !!map.sections && map.sections.length > 0;
    case "lyrics":
      return !!map.lyrics && map.lyrics.length > 0;
    case "words":
      return !!map.words && map.words.length > 0;
    case "chords":
      return !!map.chords && map.chords.length > 0;
    case "beats":
      return !!map.beats && map.beats.length > 0;
  }
}

export function Timeline({ map, position, playing, onSeek }: TimelineProps) {
  const [visibility, setVisibility] = useState<Record<LaneName, boolean>>({
    sections: true,
    lyrics: true,
    words: true,
    chords: true,
    beats: true,
  });

  const [viewportWidth, setViewportWidth] = useState(800);
  const measureRef = useRef<HTMLDivElement | null>(null);

  const {
    scrollMs,
    pxPerMs,
    following,
    msToX,
    containerRef,
    enableFollow,
    disableFollow,
    zoomIn,
    zoomOut,
  } = useTimeline({
    durationMs: map.duration_ms,
    position,
    playing,
  });

  // Measure viewport width
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Merge container refs
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      (measureRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [containerRef],
  );

  const toggleLane = useCallback((lane: LaneName) => {
    setVisibility((prev) => ({ ...prev, [lane]: !prev[lane] }));
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only seek if clicking on the timeline content area (not lane labels)
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left + e.currentTarget.scrollLeft - 72; // subtract label width
      if (x < 0) return;
      const ms = x / pxPerMs + scrollMs;
      if (ms >= 0 && ms <= map.duration_ms) {
        onSeek(ms);
        disableFollow();
      }
    },
    [pxPerMs, scrollMs, map.duration_ms, onSeek, disableFollow],
  );

  const totalWidthPx = map.duration_ms * pxPerMs;
  const playheadX = msToX(position);

  // Content area viewport width (total minus label column)
  const contentViewportWidth = Math.max(viewportWidth - 72, 100);

  return (
    <div style={styles.wrapper}>
      <div style={styles.toolbar}>
        <LaneToggles
          map={map}
          visibility={visibility}
          onToggle={toggleLane}
        />
        <div style={styles.toolbarRight}>
          <button type="button" onClick={zoomOut} style={styles.zoomButton}>
            -
          </button>
          <span style={styles.zoomLabel}>
            {(pxPerMs * 1000).toFixed(0)} px/s
          </span>
          <button type="button" onClick={zoomIn} style={styles.zoomButton}>
            +
          </button>
          {!following && playing && (
            <button
              type="button"
              onClick={enableFollow}
              style={styles.followButton}
            >
              Follow
            </button>
          )}
        </div>
      </div>

      <div
        ref={setRefs}
        style={styles.scrollContainer}
        onClick={handleClick}
      >
        <div style={{ ...styles.innerTrack, width: totalWidthPx + 72 }}>
          <Playhead positionX={playheadX} />

          {LANE_ORDER.map((lane) => {
            if (!hasLaneData(map, lane) || !visibility[lane]) return null;
            switch (lane) {
              case "sections":
                return (
                  <SectionLane
                    key={lane}
                    sections={map.sections!}
                    scrollMs={scrollMs}
                    pxPerMs={pxPerMs}
                    viewportWidthPx={contentViewportWidth}
                  />
                );
              case "lyrics":
                return (
                  <LyricLane
                    key={lane}
                    lyrics={map.lyrics!}
                    scrollMs={scrollMs}
                    pxPerMs={pxPerMs}
                    viewportWidthPx={contentViewportWidth}
                  />
                );
              case "words":
                return (
                  <WordLane
                    key={lane}
                    words={map.words!}
                    scrollMs={scrollMs}
                    pxPerMs={pxPerMs}
                    viewportWidthPx={contentViewportWidth}
                  />
                );
              case "chords":
                return (
                  <ChordLane
                    key={lane}
                    chords={map.chords!}
                    scrollMs={scrollMs}
                    pxPerMs={pxPerMs}
                    viewportWidthPx={contentViewportWidth}
                  />
                );
              case "beats":
                return (
                  <BeatLane
                    key={lane}
                    beats={map.beats!}
                    scrollMs={scrollMs}
                    pxPerMs={pxPerMs}
                    viewportWidthPx={contentViewportWidth}
                  />
                );
            }
          })}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 16,
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  toolbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  zoomButton: {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#2a2a4a",
    border: "1px solid #444",
    borderRadius: 4,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  zoomLabel: {
    fontSize: 12,
    color: "#888",
    fontFamily: "monospace",
    minWidth: 60,
    textAlign: "center",
  },
  followButton: {
    padding: "4px 10px",
    background: "#2a2a4a",
    border: `1px solid ${COLORS.playhead}`,
    borderRadius: 4,
    color: COLORS.playhead,
    fontSize: 12,
    cursor: "pointer",
    marginLeft: 4,
  },
  scrollContainer: {
    overflowX: "auto",
    overflowY: "hidden",
    background: COLORS.background,
    borderRadius: 4,
    border: "1px solid #2a2a4a",
    cursor: "crosshair",
  },
  innerTrack: {
    position: "relative",
    minHeight: 40,
  },
};
