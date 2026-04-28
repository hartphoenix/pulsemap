import type { PulseMap } from "pulsemap/schema";
import { useEffect } from "react";
import { deleteAction, deselectAction, moveAction, redoAction, undoAction } from "../state/actions";
import { useEditor } from "../state/context";
import type { EditableLane } from "../state/types";

interface UseKeyboardShortcutsOptions {
	onPlayPause: () => void;
	onSave: () => void;
	snapEnabled: boolean;
	snapFn: (ms: number) => number;
	nudgeMs: number;
}

function getLaneEvents(map: PulseMap, lane: EditableLane): unknown[] | undefined {
	return map[lane] as unknown[] | undefined;
}

export function useKeyboardShortcuts({
	onPlayPause,
	onSave,
	snapEnabled,
	snapFn,
	nudgeMs,
}: UseKeyboardShortcutsOptions): void {
	const { state, dispatch } = useEditor();

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.tagName === "SELECT" ||
				target.isContentEditable
			) {
				return;
			}

			const isMeta = e.metaKey || e.ctrlKey;

			if (e.key === " " && !isMeta) {
				e.preventDefault();
				onPlayPause();
				return;
			}

			if (isMeta && e.key === "z") {
				e.preventDefault();
				if (e.shiftKey) {
					dispatch(redoAction());
				} else {
					dispatch(undoAction());
				}
				return;
			}

			if (isMeta && e.key === "s") {
				e.preventDefault();
				onSave();
				return;
			}

			if ((e.key === "Delete" || e.key === "Backspace") && state.selection) {
				e.preventDefault();
				const { lane, index } = state.selection;
				const events = getLaneEvents(state.working, lane);
				if (events && index < events.length) {
					dispatch(deleteAction(lane, index, events[index]));
				}
				return;
			}

			if (e.key === "Escape") {
				dispatch(deselectAction());
				return;
			}

			if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && state.selection) {
				e.preventDefault();
				const { lane, index } = state.selection;
				const events = getLaneEvents(state.working, lane);
				if (!events || index >= events.length) return;

				const event = events[index] as { t: number };
				const direction = e.key === "ArrowLeft" ? -1 : 1;

				let newT = event.t + direction * nudgeMs;
				if (snapEnabled) {
					newT = snapFn(newT);
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
	}, [state.selection, state.working, dispatch, onPlayPause, onSave, snapEnabled, snapFn, nudgeMs]);
}
