import { useState, useCallback, useRef, useEffect, useMemo, type CSSProperties } from "react";
import type { PulseMap } from "pulsemap/schema";
import { useTimeline } from "../hooks/useTimeline";
import { useBeatSnap, type SnapSubdivision } from "../hooks/useBeatSnap";
import { useEditor } from "../state/context";
import { deselectAction } from "../state/actions";
import { COLORS, LANE_ORDER, type LaneName } from "../constants";
import { Playhead } from "./Playhead";
import { LaneToggles } from "./LaneToggles";
import { EditPanel } from "./EditPanel";
import { BeatLane } from "./lanes/BeatLane";
import { ChordLane } from "./lanes/ChordLane";
import { LyricLane } from "./lanes/LyricLane";
import { WordLane } from "./lanes/WordLane";
import { SectionLane } from "./lanes/SectionLane";
import { DirtyIndicator } from "./DirtyIndicator";
import { ExportButton } from "./ExportButton";
import { GitHubAuth } from "./GitHubAuth";
import { SubmitFlow } from "./SubmitFlow";
import { ValidationPanel } from "./ValidationPanel";
import { validateMap } from "../validation/validate";
import type { ValidationIssue } from "../validation/types";
import type { EditableLane } from "../state/types";

interface TimelineProps {
  map: PulseMap;
  position: number;
  playing: boolean;
  onSeek: (ms: number) => void;
  ghToken: string | null;
  ghLogin: string | null;
  onAuthChange: (token: string | null, login: string | null) => void;
  playbackAvailable: boolean;
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

export function Timeline({
  map,
  position,
  playing,
  onSeek,
  ghToken,
  ghLogin,
  onAuthChange,
  playbackAvailable,
}: TimelineProps) {
  const { state, dispatch } = useEditor();
  const workingMap = state.working;

  const [showSubmitFlow, setShowSubmitFlow] = useState(false);

  const [visibility, setVisibility] = useState<Record<LaneName, boolean>>({
    sections: true,
    lyrics: true,
    words: true,
    chords: true,
    beats: true,
  });

  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapSubdivision, setSnapSubdivision] = useState<SnapSubdivision>("beat");

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
    durationMs: workingMap.duration_ms,
    position,
    playing,
  });

  const { snapToNearestBeat } = useBeatSnap({
    beats: workingMap.beats,
    enabled: snapEnabled,
    subdivision: snapSubdivision,
  });

  // Identity snap function when snap is disabled
  const snapFn = useCallback(
    (ms: number) => (snapEnabled ? snapToNearestBeat(ms) : ms),
    [snapEnabled, snapToNearestBeat],
  );

  // -- Validation --
  const validationIssues: ValidationIssue[] = useMemo(
    () => validateMap(workingMap),
    [workingMap],
  );

  const errorCount = useMemo(
    () => validationIssues.filter((i) => i.severity === "error").length,
    [validationIssues],
  );

  const canSubmit = errorCount === 0;

  /** Build per-lane Maps of index -> border color for validation */
  const validationColorsByLane = useMemo(() => {
    const map = new Map<EditableLane, Map<number, string>>();
    for (const issue of validationIssues) {
      if (issue.lane == null || issue.index == null) continue;
      if (!map.has(issue.lane)) map.set(issue.lane, new Map());
      const laneMap = map.get(issue.lane)!;
      // error trumps warning
      const existing = laneMap.get(issue.index);
      if (!existing || (existing !== "#ff4444" && issue.severity === "error")) {
        laneMap.set(
          issue.index,
          issue.severity === "error" ? "#ff4444" : "#ffaa00",
        );
      }
    }
    return map;
  }, [validationIssues]);

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
      if (ms >= 0 && ms <= workingMap.duration_ms) {
        onSeek(ms);
        disableFollow();
        // Deselect when clicking empty timeline area
        dispatch(deselectAction());
      }
    },
    [pxPerMs, scrollMs, workingMap.duration_ms, onSeek, disableFollow, dispatch],
  );

  const totalWidthPx = workingMap.duration_ms * pxPerMs;
  const playheadX = msToX(position);

  // Content area viewport width (total minus label column)
  const contentViewportWidth = Math.max(viewportWidth - 72, 100);

  return (
    <div style={styles.outerWrapper}>
      <div style={styles.wrapper}>
        <div style={styles.toolbar}>
          <div style={styles.toolbarLeft}>
            <LaneToggles
              map={workingMap}
              visibility={visibility}
              onToggle={toggleLane}
            />
            <DirtyIndicator dirty={state.dirty} editCount={state.history.length} />
            {state.dirty && <ExportButton map={workingMap} />}
            {!canSubmit && (
              <span style={styles.submitGate}>
                {errorCount} error{errorCount !== 1 ? "s" : ""} — fix before submitting
              </span>
            )}
            <div style={styles.separator} />
            <GitHubAuth onAuthChange={onAuthChange} />
            {state.dirty && ghToken && (
              <button
                type="button"
                onClick={() => setShowSubmitFlow(true)}
                disabled={!canSubmit}
                style={{
                  ...styles.submitButton,
                  ...(!canSubmit ? styles.submitButtonDisabled : {}),
                }}
              >
                Submit Correction
              </button>
            )}
          </div>
          <div style={styles.toolbarRight}>
            {/* Snap controls */}
            <button
              type="button"
              onClick={() => setSnapEnabled((s) => !s)}
              style={{
                ...styles.snapButton,
                ...(snapEnabled ? styles.snapButtonActive : {}),
              }}
              title={`Beat snap: ${snapEnabled ? "ON" : "OFF"} (hold Alt to temporarily disable)`}
            >
              Snap
            </button>
            {snapEnabled && (
              <select
                value={snapSubdivision}
                onChange={(e) => setSnapSubdivision(e.target.value as SnapSubdivision)}
                style={styles.subdivisionSelect}
              >
                <option value="beat">Beat</option>
                <option value="half">1/2</option>
                <option value="quarter">1/4</option>
              </select>
            )}

            <div style={styles.separator} />

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

        <div style={styles.timelineRow}>
          <div
            ref={setRefs}
            style={styles.scrollContainer}
            onClick={handleClick}
          >
            <div style={{ ...styles.innerTrack, width: totalWidthPx + 72 }}>
              <Playhead positionX={playheadX} />

              {LANE_ORDER.map((lane) => {
                if (!hasLaneData(workingMap, lane) || !visibility[lane]) return null;
                switch (lane) {
                  case "sections":
                    return (
                      <SectionLane
                        key={lane}
                        sections={workingMap.sections!}
                        scrollMs={scrollMs}
                        pxPerMs={pxPerMs}
                        viewportWidthPx={contentViewportWidth}
                        snapFn={snapFn}
                        snapEnabled={snapEnabled}
                        durationMs={workingMap.duration_ms}
                        validationColors={validationColorsByLane.get("sections")}
                      />
                    );
                  case "lyrics":
                    return (
                      <LyricLane
                        key={lane}
                        lyrics={workingMap.lyrics!}
                        scrollMs={scrollMs}
                        pxPerMs={pxPerMs}
                        viewportWidthPx={contentViewportWidth}
                        snapFn={snapFn}
                        snapEnabled={snapEnabled}
                        validationColors={validationColorsByLane.get("lyrics")}
                      />
                    );
                  case "words":
                    return (
                      <WordLane
                        key={lane}
                        words={workingMap.words!}
                        scrollMs={scrollMs}
                        pxPerMs={pxPerMs}
                        viewportWidthPx={contentViewportWidth}
                        snapFn={snapFn}
                        snapEnabled={snapEnabled}
                        validationColors={validationColorsByLane.get("words")}
                      />
                    );
                  case "chords":
                    return (
                      <ChordLane
                        key={lane}
                        chords={workingMap.chords!}
                        scrollMs={scrollMs}
                        pxPerMs={pxPerMs}
                        viewportWidthPx={contentViewportWidth}
                        snapFn={snapFn}
                        snapEnabled={snapEnabled}
                        validationColors={validationColorsByLane.get("chords")}
                      />
                    );
                  case "beats":
                    return (
                      <BeatLane
                        key={lane}
                        beats={workingMap.beats!}
                        scrollMs={scrollMs}
                        pxPerMs={pxPerMs}
                        viewportWidthPx={contentViewportWidth}
                      />
                    );
                }
              })}
            </div>
          </div>

          <EditPanel />
        </div>
      </div>

      {validationIssues.length > 0 && (
        <ValidationPanel issues={validationIssues} dispatch={dispatch} />
      )}

      {showSubmitFlow && ghToken && (
        <SubmitFlow
          map={workingMap}
          history={state.history}
          token={ghToken}
          playbackAvailable={playbackAvailable}
          errorCount={errorCount}
          onClose={() => setShowSubmitFlow(false)}
        />
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  outerWrapper: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginTop: 16,
  },
  wrapper: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  toolbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  toolbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  submitGate: {
    fontSize: 11,
    color: "#ff4444",
    fontWeight: 600,
  },
  snapButton: {
    padding: "4px 10px",
    background: "#2a2a4a",
    border: "1px solid #444",
    borderRadius: 4,
    color: "#888",
    fontSize: 12,
    cursor: "pointer",
  },
  snapButtonActive: {
    background: "#1a3a4a",
    borderColor: COLORS.beats,
    color: COLORS.beats,
  },
  subdivisionSelect: {
    padding: "3px 6px",
    background: "#2a2a4a",
    border: "1px solid #444",
    borderRadius: 4,
    color: "#ccc",
    fontSize: 12,
  },
  separator: {
    width: 1,
    height: 20,
    background: "#333",
    margin: "0 4px",
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
  timelineRow: {
    display: "flex",
    flexDirection: "row",
    gap: 0,
  },
  scrollContainer: {
    flex: 1,
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
  submitButton: {
    padding: "4px 10px",
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 4,
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  submitButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
};
