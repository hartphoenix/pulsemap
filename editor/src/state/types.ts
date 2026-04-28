import type { PulseMap } from "pulsemap/schema";

/** Lanes that support editing (beats are read-only) */
export type EditableLane = "chords" | "words" | "lyrics" | "sections";

export interface Selection {
  lane: EditableLane;
  index: number;
}

export type EditAction =
  | {
      type: "move";
      lane: EditableLane;
      index: number;
      before: { t: number };
      after: { t: number };
    }
  | {
      type: "resize";
      lane: EditableLane;
      index: number;
      before: { end?: number };
      after: { end?: number };
    }
  | {
      type: "edit-text";
      lane: EditableLane;
      index: number;
      field: string;
      before: string;
      after: string;
    }
  | {
      type: "edit-field";
      lane: EditableLane;
      index: number;
      field: string;
      before: unknown;
      after: unknown;
    }
  | {
      type: "insert";
      lane: EditableLane;
      index: number;
      value: unknown;
    }
  | {
      type: "delete";
      lane: EditableLane;
      index: number;
      value: unknown;
    };

export type EditorDispatchAction =
  | { type: "apply"; action: EditAction }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; selection: Selection }
  | { type: "deselect" }
  | { type: "load"; map: PulseMap }
  | { type: "load-saved"; working: PulseMap; history: EditAction[]; originalHash: string };

export interface EditorState {
  original: PulseMap;
  working: PulseMap;
  history: EditAction[];
  redoStack: EditAction[];
  selection: Selection | null;
  dirty: boolean;
  originalHash: string;
}
