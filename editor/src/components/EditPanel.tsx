import type { ChordEvent, LyricLine, Section, WordEvent } from "pulsemap/schema";
import { SECTION_TYPES } from "pulsemap/schema";
import { type CSSProperties, useCallback } from "react";
import { COLORS } from "../constants";
import {
	deleteAction,
	editTextAction,
	insertAction,
	moveAction,
	resizeAction,
} from "../state/actions";
import { useEditor } from "../state/context";
import type { EditableLane } from "../state/types";

function formatMs(ms: number): string {
	const s = ms / 1000;
	return s.toFixed(3);
}

function parseMs(value: string): number | null {
	const n = Number.parseFloat(value) * 1000;
	return Number.isFinite(n) ? n : null;
}

/** Get a single event from the working map */
function getEvent(map: Record<string, unknown>, lane: EditableLane, index: number): unknown | null {
	const arr = map[lane] as unknown[] | undefined;
	if (!arr || index >= arr.length) return null;
	return arr[index];
}

export function EditPanel() {
	const { state, dispatch } = useEditor();
	const { selection, working } = state;

	if (!selection) {
		return (
			<div style={styles.panel}>
				<div style={styles.empty}>Select an event to edit</div>
			</div>
		);
	}

	const { lane, index } = selection;
	const event = getEvent(working as unknown as Record<string, unknown>, lane, index);
	if (!event) {
		return (
			<div style={styles.panel}>
				<div style={styles.empty}>Event not found</div>
			</div>
		);
	}

	return (
		<div style={styles.panel}>
			<div style={styles.header}>
				<span style={{ color: COLORS[lane], fontWeight: 600, textTransform: "capitalize" }}>
					{lane}
				</span>
				<span style={styles.indexBadge}>#{index}</span>
			</div>

			{lane === "chords" && (
				<ChordFields event={event as ChordEvent} lane={lane} index={index} dispatch={dispatch} />
			)}
			{lane === "sections" && (
				<SectionFields
					event={event as Section}
					lane={lane}
					index={index}
					dispatch={dispatch}
					working={working}
				/>
			)}
			{lane === "words" && (
				<WordFields event={event as WordEvent} lane={lane} index={index} dispatch={dispatch} />
			)}
			{lane === "lyrics" && (
				<LyricFields event={event as LyricLine} lane={lane} index={index} dispatch={dispatch} />
			)}

			<div style={styles.actions}>
				<button
					type="button"
					style={styles.deleteButton}
					onClick={() => dispatch(deleteAction(lane, index, event))}
				>
					Delete
				</button>
			</div>

			<div style={styles.shortcuts}>
				<div style={styles.shortcutRow}>
					<kbd style={styles.kbd}>Del</kbd> Delete
				</div>
				<div style={styles.shortcutRow}>
					<kbd style={styles.kbd}>Esc</kbd> Deselect
				</div>
				<div style={styles.shortcutRow}>
					<kbd style={styles.kbd}>Cmd+Z</kbd> Undo
				</div>
				<div style={styles.shortcutRow}>
					<kbd style={styles.kbd}>Cmd+Shift+Z</kbd> Redo
				</div>
				<div style={styles.shortcutRow}>
					<kbd style={styles.kbd}>Left/Right</kbd> Nudge
				</div>
			</div>
		</div>
	);
}

// -- Field editors for each lane type --

interface FieldProps<T> {
	event: T;
	lane: EditableLane;
	index: number;
	dispatch: (action: ReturnType<typeof editTextAction>) => void;
}

function TimeField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number;
	onChange: (ms: number) => void;
}) {
	return (
		<label style={styles.field}>
			<span style={styles.fieldLabel}>{label}</span>
			<input
				type="text"
				style={styles.input}
				value={formatMs(value)}
				onChange={(e) => {
					const ms = parseMs(e.target.value);
					if (ms !== null) onChange(ms);
				}}
			/>
			<span style={styles.fieldUnit}>s</span>
		</label>
	);
}

function TextField({
	label,
	value,
	onChange,
	multiline = false,
}: {
	label: string;
	value: string;
	onChange: (text: string) => void;
	multiline?: boolean;
}) {
	if (multiline) {
		return (
			<label style={styles.field}>
				<span style={styles.fieldLabel}>{label}</span>
				<textarea
					style={{ ...styles.input, minHeight: 60, resize: "vertical" }}
					value={value}
					onChange={(e) => onChange(e.target.value)}
				/>
			</label>
		);
	}
	return (
		<label style={styles.field}>
			<span style={styles.fieldLabel}>{label}</span>
			<input
				type="text"
				style={styles.input}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
		</label>
	);
}

function ChordFields({ event, lane, index, dispatch }: FieldProps<ChordEvent>) {
	return (
		<div style={styles.fields}>
			<TimeField
				label="Start"
				value={event.t}
				onChange={(ms) => dispatch(moveAction(lane, index, event.t, ms))}
			/>
			<TextField
				label="Chord"
				value={event.chord}
				onChange={(text) => dispatch(editTextAction(lane, index, "chord", event.chord, text))}
			/>
			{event.end != null && (
				<TimeField
					label="End"
					value={event.end}
					onChange={(ms) => dispatch(resizeAction(lane, index, event.end, ms))}
				/>
			)}
		</div>
	);
}

function SectionFields({
	event,
	lane,
	index,
	dispatch,
	working,
}: FieldProps<Section> & { working: Record<string, unknown> }) {
	const sections = (working as unknown as { sections?: Section[] }).sections;

	const handleSplit = useCallback(
		(atMs: number) => {
			if (atMs <= event.t || atMs >= event.end) return;
			// Resize current section to end at split point
			dispatch(resizeAction(lane, index, event.end, atMs));
			// Insert new section after split point
			const newSection: Section = {
				t: atMs,
				end: event.end,
				type: event.type,
				label: event.label,
			};
			dispatch(insertAction(lane, index + 1, newSection));
		},
		[event, lane, index, dispatch],
	);

	// Check for adjacent sections for merge
	const canMergeNext =
		sections && index + 1 < sections.length && Math.abs(sections[index + 1].t - event.end) < 10;

	const handleMerge = useCallback(() => {
		if (!sections || index + 1 >= sections.length) return;
		const next = sections[index + 1];
		// Extend current section's end to next section's end
		dispatch(resizeAction(lane, index, event.end, next.end));
		// Delete the next section
		dispatch(deleteAction(lane, index + 1, next));
	}, [sections, event, lane, index, dispatch]);

	return (
		<div style={styles.fields}>
			<TimeField
				label="Start"
				value={event.t}
				onChange={(ms) => dispatch(moveAction(lane, index, event.t, ms))}
			/>
			<label style={styles.field}>
				<span style={styles.fieldLabel}>Type</span>
				<select
					style={styles.input}
					value={
						SECTION_TYPES.includes(event.type as (typeof SECTION_TYPES)[number])
							? event.type
							: "__custom"
					}
					onChange={(e) => {
						const val = e.target.value;
						if (val !== "__custom") {
							dispatch(editTextAction(lane, index, "type", event.type, val));
						}
					}}
				>
					{SECTION_TYPES.map((st) => (
						<option key={st} value={st}>
							{st}
						</option>
					))}
					{!SECTION_TYPES.includes(event.type as (typeof SECTION_TYPES)[number]) && (
						<option value="__custom">{event.type}</option>
					)}
				</select>
			</label>
			<TextField
				label="Label"
				value={event.label ?? ""}
				onChange={(text) =>
					dispatch(editTextAction(lane, index, "label", event.label ?? "", text || ""))
				}
			/>
			<TimeField
				label="End"
				value={event.end}
				onChange={(ms) => dispatch(resizeAction(lane, index, event.end, ms))}
			/>
			<div style={styles.sectionActions}>
				<button
					type="button"
					style={styles.actionButton}
					onClick={() => {
						const mid = event.t + (event.end - event.t) / 2;
						handleSplit(mid);
					}}
				>
					Split at midpoint
				</button>
				{canMergeNext && (
					<button type="button" style={styles.actionButton} onClick={handleMerge}>
						Merge with next
					</button>
				)}
			</div>
		</div>
	);
}

function WordFields({ event, lane, index, dispatch }: FieldProps<WordEvent>) {
	return (
		<div style={styles.fields}>
			<TimeField
				label="Start"
				value={event.t}
				onChange={(ms) => dispatch(moveAction(lane, index, event.t, ms))}
			/>
			<TextField
				label="Text"
				value={event.text}
				onChange={(text) => dispatch(editTextAction(lane, index, "text", event.text, text))}
			/>
			{event.end != null && (
				<TimeField
					label="End"
					value={event.end}
					onChange={(ms) => dispatch(resizeAction(lane, index, event.end, ms))}
				/>
			)}
		</div>
	);
}

function LyricFields({ event, lane, index, dispatch }: FieldProps<LyricLine>) {
	return (
		<div style={styles.fields}>
			<TimeField
				label="Start"
				value={event.t}
				onChange={(ms) => dispatch(moveAction(lane, index, event.t, ms))}
			/>
			<TextField
				label="Text"
				value={event.text}
				onChange={(text) => dispatch(editTextAction(lane, index, "text", event.text, text))}
				multiline
			/>
			{event.end != null && (
				<TimeField
					label="End"
					value={event.end}
					onChange={(ms) => dispatch(resizeAction(lane, index, event.end, ms))}
				/>
			)}
		</div>
	);
}

const styles: Record<string, CSSProperties> = {
	panel: {
		width: 280,
		minWidth: 280,
		background: "#12121e",
		borderLeft: "1px solid #2a2a4a",
		padding: 16,
		display: "flex",
		flexDirection: "column",
		gap: 16,
		overflowY: "auto",
		fontSize: 13,
		color: "#e0e0e0",
	},
	empty: {
		color: "#666",
		fontSize: 13,
		textAlign: "center",
		marginTop: 40,
	},
	header: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		paddingBottom: 8,
		borderBottom: "1px solid #2a2a4a",
	},
	indexBadge: {
		fontSize: 11,
		color: "#888",
		fontFamily: "monospace",
	},
	fields: {
		display: "flex",
		flexDirection: "column",
		gap: 10,
	},
	field: {
		display: "flex",
		flexDirection: "column",
		gap: 3,
	},
	fieldLabel: {
		fontSize: 11,
		color: "#888",
		textTransform: "uppercase",
		letterSpacing: "0.05em",
	},
	fieldUnit: {
		fontSize: 11,
		color: "#666",
		marginTop: 2,
	},
	input: {
		background: "#1a1a2e",
		border: "1px solid #333",
		borderRadius: 3,
		padding: "5px 8px",
		color: "#e0e0e0",
		fontSize: 13,
		fontFamily: "monospace",
		outline: "none",
		width: "100%",
		boxSizing: "border-box" as const,
	},
	actions: {
		marginTop: 8,
	},
	deleteButton: {
		width: "100%",
		padding: "6px 12px",
		background: "#3a1a1a",
		border: "1px solid #662222",
		borderRadius: 4,
		color: "#ff6666",
		fontSize: 13,
		cursor: "pointer",
	},
	sectionActions: {
		display: "flex",
		flexDirection: "column",
		gap: 6,
		marginTop: 4,
	},
	actionButton: {
		padding: "5px 10px",
		background: "#2a2a4a",
		border: "1px solid #444",
		borderRadius: 3,
		color: "#ccc",
		fontSize: 12,
		cursor: "pointer",
		textAlign: "center" as const,
	},
	shortcuts: {
		marginTop: "auto",
		paddingTop: 12,
		borderTop: "1px solid #2a2a4a",
		display: "flex",
		flexDirection: "column",
		gap: 4,
	},
	shortcutRow: {
		display: "flex",
		alignItems: "center",
		gap: 6,
		fontSize: 11,
		color: "#666",
	},
	kbd: {
		display: "inline-block",
		padding: "1px 5px",
		background: "#1a1a2e",
		border: "1px solid #333",
		borderRadius: 3,
		fontSize: 10,
		fontFamily: "monospace",
		color: "#aaa",
	},
};
