import type { CSSProperties } from "react";
import { LANE_ORDER, COLORS, type LaneName } from "../constants";
import type { PulseMap } from "pulsemap/schema";

interface LaneTogglesProps {
  map: PulseMap;
  visibility: Record<LaneName, boolean>;
  onToggle: (lane: LaneName) => void;
}

const LANE_COLORS: Record<LaneName, string> = {
  sections: COLORS.sections,
  lyrics: COLORS.lyrics,
  words: COLORS.words,
  chords: COLORS.chords,
  beats: COLORS.beats,
};

function hasData(map: PulseMap, lane: LaneName): boolean {
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

export function LaneToggles({ map, visibility, onToggle }: LaneTogglesProps) {
  return (
    <div style={styles.container}>
      {LANE_ORDER.map((lane) => {
        if (!hasData(map, lane)) return null;
        return (
          <label key={lane} style={styles.label}>
            <input
              type="checkbox"
              checked={visibility[lane]}
              onChange={() => onToggle(lane)}
              style={{ accentColor: LANE_COLORS[lane] }}
            />
            <span style={{ color: LANE_COLORS[lane] }}>{lane}</span>
          </label>
        );
      })}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  label: {
    display: "flex",
    gap: 4,
    alignItems: "center",
    fontSize: 13,
    cursor: "pointer",
    textTransform: "capitalize",
  },
};
