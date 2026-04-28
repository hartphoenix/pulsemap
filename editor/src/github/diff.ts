/**
 * Generate human-readable diff summaries from EditAction[] history.
 */
import type { EditAction, EditableLane } from "../state/types";

export interface DiffChange {
	/** Human-readable description of the change */
	description: string;
	/** Which lane was affected */
	lane: EditableLane;
	/** The original EditAction */
	action: EditAction;
}

export interface DiffSummary {
	/** One-line summary like "3 chords modified, 2 sections added" */
	summary: string;
	/** Individual human-readable changes */
	changes: DiffChange[];
	/** Count of changes per field, for pulsemap-correction metadata */
	fieldCounts: Record<string, number>;
}

function formatMs(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

function describeAction(action: EditAction): string {
	switch (action.type) {
		case "move":
			return (
				`${action.lane}[${action.index}]: ` +
				`Repositioned ${formatMs(action.before.t)} -> ${formatMs(action.after.t)}`
			);
		case "resize":
			return (
				`${action.lane}[${action.index}]: ` +
				`End changed ${action.before.end != null ? `${action.before.end}ms` : "none"} -> ` +
				`${action.after.end != null ? `${action.after.end}ms` : "none"}`
			);
		case "edit-text":
			return (
				`${action.lane}[${action.index}]: ` +
				`Changed "${action.before}" -> "${action.after}" at ${action.field}`
			);
		case "edit-field":
			return (
				`${action.lane}[${action.index}]: ` +
				`${action.field} changed from ${JSON.stringify(action.before)} ` +
				`to ${JSON.stringify(action.after)}`
			);
		case "insert":
			return `${action.lane}: Added ${describeInsertedValue(action)} at index ${action.index}`;
		case "delete":
			return `${action.lane}[${action.index}]: Deleted ${describeDeletedValue(action)}`;
	}
}

function describeInsertedValue(action: EditAction & { type: "insert" }): string {
	const val = action.value as Record<string, unknown>;
	if (action.lane === "chords" && val.chord) return `"${val.chord}"`;
	if (action.lane === "sections" && val.label) return `"${val.label}"`;
	if ((action.lane === "words" || action.lane === "lyrics") && val.text) return `"${val.text}"`;
	return "item";
}

function describeDeletedValue(action: EditAction & { type: "delete" }): string {
	const val = action.value as Record<string, unknown>;
	if (action.lane === "chords" && val.chord) return `"${val.chord}"`;
	if (action.lane === "sections" && val.label) return `"${val.label}"`;
	if ((action.lane === "words" || action.lane === "lyrics") && val.text) return `"${val.text}"`;
	return "item";
}

export function generateDiffSummary(history: EditAction[]): DiffSummary {
	const changes: DiffChange[] = history.map((action) => ({
		description: describeAction(action),
		lane: action.lane,
		action,
	}));

	// Count changes per lane
	const fieldCounts: Record<string, number> = {};
	for (const action of history) {
		fieldCounts[action.lane] = (fieldCounts[action.lane] || 0) + 1;
	}

	// Build summary string
	const parts: string[] = [];
	for (const [field, count] of Object.entries(fieldCounts)) {
		parts.push(`${count} ${field}`);
	}
	const summary = parts.length > 0 ? parts.join(", ") : "no changes";

	return { summary, changes, fieldCounts };
}
