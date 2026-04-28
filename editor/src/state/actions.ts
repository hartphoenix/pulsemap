import type { EditableLane, EditorDispatchAction } from "./types";

/** Move an event to a new time */
export function moveAction(
	lane: EditableLane,
	index: number,
	beforeT: number,
	afterT: number,
): EditorDispatchAction {
	return {
		type: "apply",
		action: {
			type: "move",
			lane,
			index,
			before: { t: beforeT },
			after: { t: afterT },
		},
	};
}

/** Resize an event's start time (changes t, keeps end fixed) */
export function resizeStartAction(
	lane: EditableLane,
	index: number,
	beforeT: number,
	afterT: number,
): EditorDispatchAction {
	return {
		type: "apply",
		action: {
			type: "resize-start",
			lane,
			index,
			before: { t: beforeT },
			after: { t: afterT },
		},
	};
}

/** Resize an event's end time */
export function resizeAction(
	lane: EditableLane,
	index: number,
	beforeEnd: number | undefined,
	afterEnd: number | undefined,
): EditorDispatchAction {
	return {
		type: "apply",
		action: {
			type: "resize",
			lane,
			index,
			before: { end: beforeEnd },
			after: { end: afterEnd },
		},
	};
}

/** Edit a text field on an event */
export function editTextAction(
	lane: EditableLane,
	index: number,
	field: string,
	before: string,
	after: string,
): EditorDispatchAction {
	return {
		type: "apply",
		action: {
			type: "edit-text",
			lane,
			index,
			field,
			before,
			after,
		},
	};
}

/** Edit an arbitrary field on an event */
export function editFieldAction(
	lane: EditableLane,
	index: number,
	field: string,
	before: unknown,
	after: unknown,
): EditorDispatchAction {
	return {
		type: "apply",
		action: {
			type: "edit-field",
			lane,
			index,
			field,
			before,
			after,
		},
	};
}

/** Insert a new event */
export function insertAction(
	lane: EditableLane,
	index: number,
	value: unknown,
): EditorDispatchAction {
	return {
		type: "apply",
		action: {
			type: "insert",
			lane,
			index,
			value,
		},
	};
}

/** Delete an event */
export function deleteAction(
	lane: EditableLane,
	index: number,
	value: unknown,
): EditorDispatchAction {
	return {
		type: "apply",
		action: {
			type: "delete",
			lane,
			index,
			value,
		},
	};
}

/** Select an event */
export function selectAction(lane: EditableLane, index: number): EditorDispatchAction {
	return { type: "select", selection: { lane, index } };
}

/** Deselect */
export function deselectAction(): EditorDispatchAction {
	return { type: "deselect" };
}

/** Undo */
export function undoAction(): EditorDispatchAction {
	return { type: "undo" };
}

/** Redo */
export function redoAction(): EditorDispatchAction {
	return { type: "redo" };
}
