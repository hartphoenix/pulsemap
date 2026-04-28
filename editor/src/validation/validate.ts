/**
 * Semantic validation of a working PulseMap.
 * Runs after every edit; returns an array of issues.
 */
import { Value } from "@sinclair/typebox/value";
import { PulseMapSchema, type PulseMap, type Section } from "pulsemap/schema";
import type { EditableLane } from "../state/types";
import type { ValidationIssue } from "./types";

/** Chord name regex: starts with A-G, optional # or b */
const CHORD_ROOT_RE = /^[A-G][#b]?/;

export function validateMap(map: PulseMap): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const duration = map.duration_ms;

  // 1. Schema check
  if (!Value.Check(PulseMapSchema, map)) {
    issues.push({
      severity: "error",
      message: "Map fails schema validation",
    });
  }

  // Helper: check timestamp range
  function checkRange(
    lane: EditableLane,
    arr: { t: number; end?: number }[] | undefined,
  ) {
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) {
      const ev = arr[i];
      if (ev.t < 0 || ev.t > duration) {
        issues.push({
          severity: "error",
          lane,
          index: i,
          message: `Start time ${ev.t}ms is outside [0, ${duration}]`,
        });
      }
      if (ev.end != null) {
        if (ev.end < 0 || ev.end > duration) {
          issues.push({
            severity: "error",
            lane,
            index: i,
            message: `End time ${ev.end}ms is outside [0, ${duration}]`,
          });
        }
        // 5. end > t
        if (ev.end <= ev.t) {
          issues.push({
            severity: "error",
            lane,
            index: i,
            message: `End time (${ev.end}ms) must be after start (${ev.t}ms)`,
          });
        }
      }
    }
  }

  // 2. Timestamp range checks
  checkRange("chords", map.chords as { t: number; end?: number }[] | undefined);
  checkRange("words", map.words as { t: number; end?: number }[] | undefined);
  checkRange("lyrics", map.lyrics as { t: number; end?: number }[] | undefined);
  checkRange("sections", map.sections as { t: number; end?: number }[] | undefined);

  // 3. Non-overlapping sections
  if (map.sections && map.sections.length > 1) {
    const secs = map.sections as Section[];
    for (let i = 0; i + 1 < secs.length; i++) {
      if (secs[i].end > secs[i + 1].t) {
        issues.push({
          severity: "error",
          lane: "sections",
          index: i,
          message: `Section overlaps with next (end ${secs[i].end}ms > next start ${secs[i + 1].t}ms)`,
        });
      }
    }
  }

  // 4. Non-empty text
  if (map.words) {
    for (let i = 0; i < map.words.length; i++) {
      if (!map.words[i].text || map.words[i].text.trim() === "") {
        issues.push({
          severity: "error",
          lane: "words",
          index: i,
          message: "Word text is empty",
        });
      }
    }
  }
  if (map.lyrics) {
    for (let i = 0; i < map.lyrics.length; i++) {
      if (!map.lyrics[i].text || map.lyrics[i].text.trim() === "") {
        issues.push({
          severity: "error",
          lane: "lyrics",
          index: i,
          message: "Lyric line text is empty",
        });
      }
    }
  }
  if (map.chords) {
    for (let i = 0; i < map.chords.length; i++) {
      if (!map.chords[i].chord || map.chords[i].chord.trim() === "") {
        issues.push({
          severity: "error",
          lane: "chords",
          index: i,
          message: "Chord name is empty",
        });
      }
    }
  }

  // 6. Chord name format warning
  if (map.chords) {
    for (let i = 0; i < map.chords.length; i++) {
      const name = map.chords[i].chord;
      if (name && !CHORD_ROOT_RE.test(name)) {
        issues.push({
          severity: "warning",
          lane: "chords",
          index: i,
          message: `Chord "${name}" doesn't start with a standard root (A-G)`,
        });
      }
    }
  }

  return issues;
}
