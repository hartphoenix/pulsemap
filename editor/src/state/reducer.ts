import type { PulseMap } from "pulsemap/schema";
import type {
  EditAction,
  EditableLane,
  EditorDispatchAction,
  EditorState,
} from "./types";

/** Deep clone a PulseMap (JSON-safe) */
function cloneMap(map: PulseMap): PulseMap {
  return JSON.parse(JSON.stringify(map));
}

/** Get the mutable array for a lane from a PulseMap, creating it if absent */
function getLaneArray(map: PulseMap, lane: EditableLane): unknown[] {
  if (!map[lane]) {
    (map as Record<string, unknown>)[lane] = [];
  }
  return map[lane] as unknown[];
}

/** Sort an array of timed events by t */
function sortByT(arr: unknown[]): void {
  arr.sort((a, b) => (a as { t: number }).t - (b as { t: number }).t);
}

/**
 * Find the new index of an event after sorting, given its old `t` value
 * and the new `t` value (for moves) or unchanged `t` (for other actions).
 */
function findIndexByT(arr: unknown[], t: number, startHint: number): number {
  // Exact match first
  for (let i = 0; i < arr.length; i++) {
    if ((arr[i] as { t: number }).t === t) return i;
  }
  // Fallback: closest to hint
  return Math.min(startHint, arr.length - 1);
}

/** Apply the "after" side of an action to a working map */
function applyForward(map: PulseMap, action: EditAction): void {
  const arr = getLaneArray(map, action.lane);

  switch (action.type) {
    case "move": {
      const event = arr[action.index] as { t: number };
      // Preserve duration if the event has an end
      const asEnd = event as { t: number; end?: number };
      if (asEnd.end != null) {
        const duration = asEnd.end - asEnd.t;
        asEnd.end = action.after.t + duration;
      }
      event.t = action.after.t;
      break;
    }
    case "resize": {
      const event = arr[action.index] as Record<string, unknown>;
      if (action.after.end !== undefined) {
        event.end = action.after.end;
      } else {
        delete event.end;
      }
      break;
    }
    case "edit-text": {
      const event = arr[action.index] as Record<string, unknown>;
      event[action.field] = action.after;
      break;
    }
    case "edit-field": {
      const event = arr[action.index] as Record<string, unknown>;
      event[action.field] = action.after;
      break;
    }
    case "insert": {
      arr.splice(action.index, 0, JSON.parse(JSON.stringify(action.value)));
      break;
    }
    case "delete": {
      arr.splice(action.index, 1);
      break;
    }
  }
}

/** Apply the "before" side of an action (undo) to a working map */
function applyBackward(map: PulseMap, action: EditAction): void {
  const arr = getLaneArray(map, action.lane);

  switch (action.type) {
    case "move": {
      // We need to find the event at the "after" position and move it back
      const idx = findIndexByT(arr, action.after.t, action.index);
      const event = arr[idx] as { t: number; end?: number };
      if (event.end != null) {
        const duration = event.end - event.t;
        event.end = action.before.t + duration;
      }
      event.t = action.before.t;
      break;
    }
    case "resize": {
      const event = arr[action.index] as Record<string, unknown>;
      if (action.before.end !== undefined) {
        event.end = action.before.end;
      } else {
        delete event.end;
      }
      break;
    }
    case "edit-text": {
      const event = arr[action.index] as Record<string, unknown>;
      event[action.field] = action.before;
      break;
    }
    case "edit-field": {
      const event = arr[action.index] as Record<string, unknown>;
      event[action.field] = action.before;
      break;
    }
    case "insert": {
      // Undo insert = delete
      arr.splice(action.index, 1);
      break;
    }
    case "delete": {
      // Undo delete = insert
      arr.splice(
        action.index,
        0,
        JSON.parse(JSON.stringify(action.value)),
      );
      break;
    }
  }
}

/**
 * After mutating the lane array, re-sort by t and update the selection
 * index to follow the event that was at `oldIndex` with `targetT`.
 */
function resortAndTrackSelection(
  state: EditorState,
  lane: EditableLane,
  targetT: number,
  oldIndex: number,
): EditorState {
  const arr = getLaneArray(state.working, lane);
  sortByT(arr);

  // Update selection to track the moved event
  if (state.selection?.lane === lane) {
    const newIdx = findIndexByT(arr, targetT, oldIndex);
    return {
      ...state,
      selection: { lane, index: newIdx },
    };
  }
  return state;
}

export function editorReducer(
  state: EditorState,
  dispatch: EditorDispatchAction,
): EditorState {
  switch (dispatch.type) {
    case "load": {
      return {
        original: cloneMap(dispatch.map),
        working: cloneMap(dispatch.map),
        history: [],
        redoStack: [],
        selection: null,
        dirty: false,
      };
    }

    case "apply": {
      const { action } = dispatch;
      const working = cloneMap(state.working);
      const newState: EditorState = {
        ...state,
        working,
        history: [...state.history, action],
        redoStack: [],
        dirty: true,
      };

      applyForward(working, action);

      // Determine target t for selection tracking
      let targetT: number;
      switch (action.type) {
        case "move":
          targetT = action.after.t;
          break;
        case "delete":
          // Deselect on delete
          return {
            ...newState,
            selection: null,
          };
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
      if (state.history.length === 0) return state;
      const action = state.history[state.history.length - 1];
      const working = cloneMap(state.working);

      applyBackward(working, action);

      const newState: EditorState = {
        ...state,
        working,
        history: state.history.slice(0, -1),
        redoStack: [...state.redoStack, action],
        dirty: state.history.length > 1,
      };

      const arr = getLaneArray(working, action.lane);
      sortByT(arr);

      // Track selection
      if (action.type === "delete") {
        // Undo delete: reselect the restored event
        const targetT = (action.value as { t: number }).t;
        const idx = findIndexByT(arr, targetT, action.index);
        return { ...newState, selection: { lane: action.lane, index: idx } };
      }
      if (action.type === "insert") {
        // Undo insert: deselect
        return { ...newState, selection: null };
      }
      if (action.type === "move") {
        const idx = findIndexByT(arr, action.before.t, action.index);
        return { ...newState, selection: { lane: action.lane, index: idx } };
      }

      return newState;
    }

    case "redo": {
      if (state.redoStack.length === 0) return state;
      const action = state.redoStack[state.redoStack.length - 1];
      const working = cloneMap(state.working);

      applyForward(working, action);

      const newState: EditorState = {
        ...state,
        working,
        history: [...state.history, action],
        redoStack: state.redoStack.slice(0, -1),
        dirty: true,
      };

      const arr = getLaneArray(working, action.lane);
      sortByT(arr);

      if (action.type === "delete") {
        return { ...newState, selection: null };
      }
      if (action.type === "move") {
        const idx = findIndexByT(arr, action.after.t, action.index);
        return { ...newState, selection: { lane: action.lane, index: idx } };
      }
      if (action.type === "insert") {
        const targetT = (action.value as { t: number }).t;
        const idx = findIndexByT(arr, targetT, action.index);
        return { ...newState, selection: { lane: action.lane, index: idx } };
      }

      return newState;
    }

    case "select": {
      return { ...state, selection: dispatch.selection };
    }

    case "deselect": {
      return { ...state, selection: null };
    }

    default:
      return state;
  }
}

export function createInitialState(map: PulseMap): EditorState {
  return {
    original: cloneMap(map),
    working: cloneMap(map),
    history: [],
    redoStack: [],
    selection: null,
    dirty: false,
  };
}
