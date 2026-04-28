import { useEffect } from "react";
import { useEditor } from "../state/context";
import {
  undoAction,
  redoAction,
  deleteAction,
  deselectAction,
  moveAction,
} from "../state/actions";
import type { PulseMap } from "pulsemap/schema";
import type { EditableLane } from "../state/types";

interface UseKeyboardShortcutsOptions {
  onPlayPause: () => void;
  onSave: () => void;
  snapEnabled: boolean;
  snapFn: (ms: number) => number;
}

/** Get the event array for an editable lane */
function getLaneEvents(map: PulseMap, lane: EditableLane): unknown[] | undefined {
  return map[lane] as unknown[] | undefined;
}

export function useKeyboardShortcuts({
  onPlayPause,
  onSave,
  snapEnabled,
  snapFn,
}: UseKeyboardShortcutsOptions): void {
  const { state, dispatch } = useEditor();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      // Don't capture when typing in inputs
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      const isMeta = e.metaKey || e.ctrlKey;

      // Space: play/pause
      if (e.key === " " && !isMeta) {
        e.preventDefault();
        onPlayPause();
        return;
      }

      // Cmd+Z: undo, Cmd+Shift+Z: redo
      if (isMeta && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          dispatch(redoAction());
        } else {
          dispatch(undoAction());
        }
        return;
      }

      // Cmd+S: save
      if (isMeta && e.key === "s") {
        e.preventDefault();
        onSave();
        return;
      }

      // Delete/Backspace: delete selected event
      if ((e.key === "Delete" || e.key === "Backspace") && state.selection) {
        e.preventDefault();
        const { lane, index } = state.selection;
        const events = getLaneEvents(state.working, lane);
        if (events && index < events.length) {
          dispatch(deleteAction(lane, index, events[index]));
        }
        return;
      }

      // Escape: deselect
      if (e.key === "Escape") {
        dispatch(deselectAction());
        return;
      }

      // Left/Right arrows: nudge selected event
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && state.selection) {
        e.preventDefault();
        const { lane, index } = state.selection;
        const events = getLaneEvents(state.working, lane);
        if (!events || index >= events.length) return;

        const event = events[index] as { t: number };
        const direction = e.key === "ArrowLeft" ? -1 : 1;

        let newT: number;
        if (snapEnabled) {
          // Nudge by one snap grid unit
          const testT = event.t + direction * 1; // tiny offset to find next grid point
          const snapped = snapFn(testT);
          // If snap didn't move us, nudge further
          if (Math.abs(snapped - event.t) < 0.5) {
            // Find next snap point by searching further
            newT = snapFn(event.t + direction * 100);
          } else {
            newT = snapped;
          }
        } else {
          newT = event.t + direction * 10;
        }

        newT = Math.max(0, newT);
        if (newT !== event.t) {
          dispatch(moveAction(lane, index, event.t, newT));
        }
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [state.selection, state.working, dispatch, onPlayPause, onSave, snapEnabled, snapFn]);
}
