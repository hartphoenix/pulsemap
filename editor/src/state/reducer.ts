import type { PulseMap } from "pulsemap/schema";
import type { EditAction, EditableLane, EditorDispatchAction, EditorState } from "./types";

const UNDO_LIMIT = 100;

/** Deep clone a PulseMap (JSON-safe) */
function cloneMap(map: PulseMap): PulseMap {
	return JSON.parse(JSON.stringify(map));
}

/** Stable JSON for equality checks. Stable enough — both maps are produced by us. */
function stableEqual(a: PulseMap, b: PulseMap): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function getLaneArray(map: PulseMap, lane: EditableLane): unknown[] {
	if (!map[lane]) {
		(map as Record<string, unknown>)[lane] = [];
	}
	return map[lane] as unknown[];
}

function sortByT(arr: unknown[]): void {
	arr.sort((a, b) => (a as { t: number }).t - (b as { t: number }).t);
}

function findIndexByT(arr: unknown[], t: number, startHint: number): number {
	for (let i = 0; i < arr.length; i++) {
		if ((arr[i] as { t: number }).t === t) return i;
	}
	return Math.min(Math.max(startHint, 0), arr.length - 1);
}

/** Mutate `working` in place to apply one edit action. */
function applyEdit(working: PulseMap, action: EditAction): void {
	const arr = getLaneArray(working, action.lane);

	switch (action.type) {
		case "move": {
			const event = arr[action.index] as { t: number; end?: number };
			if (event.end != null) {
				const duration = event.end - event.t;
				event.end = action.after.t + duration;
			}
			event.t = action.after.t;
			break;
		}
		case "resize": {
			const event = arr[action.index] as Record<string, unknown>;
			if (action.after.end !== undefined) event.end = action.after.end;
			else delete event.end;
			break;
		}
		case "resize-start": {
			const event = arr[action.index] as { t: number };
			event.t = action.after.t;
			break;
		}
		case "edit-text":
		case "edit-field": {
			const event = arr[action.index] as Record<string, unknown>;
			event[action.field] = action.after;
			break;
		}
		case "insert":
			arr.splice(action.index, 0, JSON.parse(JSON.stringify(action.value)));
			break;
		case "delete":
			arr.splice(action.index, 1);
			break;
	}
}

/**
 * After mutating an array, re-sort by t and update the selection index
 * to follow the event that was at oldIndex with the given target t.
 */
function resortAndTrackSelection(
	state: EditorState,
	lane: EditableLane,
	targetT: number,
	oldIndex: number,
): EditorState {
	const arr = getLaneArray(state.working, lane);
	sortByT(arr);
	if (state.selection?.lane === lane) {
		const newIdx = findIndexByT(arr, targetT, oldIndex);
		return { ...state, selection: { lane, index: newIdx } };
	}
	return state;
}

export function editorReducer(state: EditorState, dispatch: EditorDispatchAction): EditorState {
	switch (dispatch.type) {
		case "load":
			return {
				original: cloneMap(dispatch.map),
				working: cloneMap(dispatch.map),
				undoStack: [],
				redoStack: [],
				selection: null,
				dirty: false,
				originalHash: "",
			};

		case "load-saved": {
			const working = cloneMap(dispatch.working);
			return {
				...state,
				working,
				undoStack: [],
				redoStack: [],
				selection: null,
				dirty: !stableEqual(state.original, working),
				originalHash: dispatch.originalHash,
			};
		}

		case "apply": {
			const { action } = dispatch;
			const snapshot = cloneMap(state.working);
			const working = cloneMap(state.working);
			applyEdit(working, action);

			const undoStack = [...state.undoStack, snapshot];
			if (undoStack.length > UNDO_LIMIT) undoStack.shift();

			const newState: EditorState = {
				...state,
				working,
				undoStack,
				redoStack: [],
				dirty: !stableEqual(state.original, working),
			};

			let targetT: number;
			switch (action.type) {
				case "move":
				case "resize-start":
					targetT = action.after.t;
					break;
				case "delete":
					return { ...newState, selection: null };
				case "insert":
					targetT = (action.value as { t: number }).t;
					return resortAndTrackSelection(
						{ ...newState, selection: { lane: action.lane, index: action.index } },
						action.lane,
						targetT,
						action.index,
					);
				default:
					targetT = (getLaneArray(working, action.lane)[action.index] as { t: number }).t;
					break;
			}

			return resortAndTrackSelection(newState, action.lane, targetT, action.index);
		}

		case "undo": {
			if (state.undoStack.length === 0) return state;
			const previous = state.undoStack[state.undoStack.length - 1];
			return {
				...state,
				working: cloneMap(previous),
				undoStack: state.undoStack.slice(0, -1),
				redoStack: [...state.redoStack, cloneMap(state.working)],
				selection: null,
				dirty: !stableEqual(state.original, previous),
			};
		}

		case "redo": {
			if (state.redoStack.length === 0) return state;
			const next = state.redoStack[state.redoStack.length - 1];
			return {
				...state,
				working: cloneMap(next),
				undoStack: [...state.undoStack, cloneMap(state.working)],
				redoStack: state.redoStack.slice(0, -1),
				selection: null,
				dirty: !stableEqual(state.original, next),
			};
		}

		case "select":
			return { ...state, selection: dispatch.selection };

		case "deselect":
			return { ...state, selection: null };

		default:
			return state;
	}
}

export function createInitialState(map: PulseMap): EditorState {
	return {
		original: cloneMap(map),
		working: cloneMap(map),
		undoStack: [],
		redoStack: [],
		selection: null,
		dirty: false,
		originalHash: "",
	};
}
