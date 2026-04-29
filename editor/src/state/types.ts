import type { PulseMap } from "pulsemap/schema";

/** Lanes that support editing (beats are read-only) */
export type EditableLane = "chords" | "words" | "lyrics" | "sections";

export interface Selection {
	lane: EditableLane;
	index: number;
}

/**
 * Dispatched edits. Not stored — the working map is the source of truth.
 * The reducer applies each action directly to working and pushes a
 * snapshot to undoStack for in-session undo.
 */
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
			type: "resize-start";
			lane: EditableLane;
			index: number;
			before: { t: number };
			after: { t: number };
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
	| { type: "load-saved"; working: PulseMap; originalHash: string };

export interface EditorState {
	original: PulseMap;
	working: PulseMap;
	/** Snapshots of `working` taken before each apply, for in-session undo. */
	undoStack: PulseMap[];
	/** Snapshots popped by undo, available for redo. */
	redoStack: PulseMap[];
	selection: Selection | null;
	dirty: boolean;
	originalHash: string;
}
