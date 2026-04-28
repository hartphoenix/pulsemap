import { useCallback } from "react";
import { deselectAction, selectAction } from "../state/actions";
import { useEditor } from "../state/context";
import type { EditableLane, Selection } from "../state/types";

interface UseSelectionResult {
	selection: Selection | null;
	select: (lane: EditableLane, index: number) => void;
	deselect: () => void;
	isSelected: (lane: EditableLane, index: number) => boolean;
}

export function useSelection(): UseSelectionResult {
	const { state, dispatch } = useEditor();

	const select = useCallback(
		(lane: EditableLane, index: number) => {
			dispatch(selectAction(lane, index));
		},
		[dispatch],
	);

	const deselect = useCallback(() => {
		dispatch(deselectAction());
	}, [dispatch]);

	const isSelected = useCallback(
		(lane: EditableLane, index: number) => {
			return state.selection?.lane === lane && state.selection?.index === index;
		},
		[state.selection],
	);

	return {
		selection: state.selection,
		select,
		deselect,
		isSelected,
	};
}
