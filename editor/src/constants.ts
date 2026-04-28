/** Timeline color scheme */
export const COLORS = {
  background: "#1a1a2e",
  laneBg: "#0d1b2a",
  beats: "#64ffda",
  chords: "#ffd93d",
  lyrics: "#c4b5fd",
  words: "#a78bfa",
  sections: "#6c5ce7",
  playhead: "#ff4757",
} as const;

/** Lane heights in pixels */
export const LANE_HEIGHTS = {
  sections: 40,
  lyrics: 36,
  words: 28,
  chords: 36,
  beats: 24,
} as const;

/** Default zoom: pixels per millisecond */
export const DEFAULT_PX_PER_MS = 0.15;

/** Minimum and maximum zoom bounds */
export const MIN_PX_PER_MS = 0.01;
export const MAX_PX_PER_MS = 2.0;

/** Playhead position as fraction of viewport width when following */
export const FOLLOW_OFFSET_FRACTION = 0.25;

/** Zoom speed multiplier for wheel events */
export const ZOOM_FACTOR = 1.1;

/** Lane names in display order (top to bottom) */
export const LANE_ORDER = [
  "sections",
  "lyrics",
  "words",
  "chords",
  "beats",
] as const;

export type LaneName = (typeof LANE_ORDER)[number];
