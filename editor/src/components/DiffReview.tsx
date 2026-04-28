import { type CSSProperties, useCallback } from "react";
import type { DiffChange } from "../github/diff";

interface DiffReviewProps {
	changes: DiffChange[];
	checkedIndices: Set<number>;
	onToggle: (index: number) => void;
	playbackAvailable: boolean;
	errorCount: number;
}

export function DiffReview({
	changes,
	checkedIndices,
	onToggle,
	playbackAvailable,
	errorCount,
}: DiffReviewProps) {
	// Per-field summary
	const fieldCounts: Record<string, number> = {};
	for (const c of changes) {
		if (checkedIndices.has(changes.indexOf(c))) {
			fieldCounts[c.lane] = (fieldCounts[c.lane] || 0) + 1;
		}
	}
	const fieldSummary = Object.entries(fieldCounts)
		.map(([field, count]) => `${count} ${field}`)
		.join(", ");

	const handleToggle = useCallback((i: number) => () => onToggle(i), [onToggle]);

	return (
		<div style={styles.container}>
			<div style={styles.header}>
				<span style={styles.summary}>
					{checkedIndices.size} of {changes.length} changes selected
					{fieldSummary && ` (${fieldSummary})`}
				</span>

				<span style={errorCount > 0 ? styles.validationError : styles.validationOk}>
					{errorCount > 0
						? `${errorCount} validation error${errorCount !== 1 ? "s" : ""}`
						: "Validation passed"}
				</span>
			</div>

			{!playbackAvailable && (
				<div style={styles.playbackNotice}>
					Edited without audio playback — reviewers will note this in the PR.
				</div>
			)}

			<div style={styles.changeList}>
				{changes.map((change, i) => (
					<label key={`${change.lane}-${change.action.type}-${i}`} style={styles.changeRow}>
						<input
							type="checkbox"
							checked={checkedIndices.has(i)}
							onChange={handleToggle(i)}
							style={styles.checkbox}
						/>
						<span style={styles.changeText}>{change.description}</span>
					</label>
				))}
			</div>

			{changes.length === 0 && <div style={styles.empty}>No changes to review.</div>}
		</div>
	);
}

const styles: Record<string, CSSProperties> = {
	container: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
	},
	header: {
		display: "flex",
		justifyContent: "space-between",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
	},
	summary: {
		fontSize: 13,
		color: "#8b949e",
	},
	validationOk: {
		fontSize: 12,
		color: "#3fb950",
		fontWeight: 600,
	},
	validationError: {
		fontSize: 12,
		color: "#ff4444",
		fontWeight: 600,
	},
	playbackNotice: {
		padding: "8px 12px",
		background: "#2d2a00",
		border: "1px solid #5a5300",
		borderRadius: 4,
		fontSize: 13,
		color: "#e3b341",
	},
	changeList: {
		display: "flex",
		flexDirection: "column",
		gap: 4,
		maxHeight: 300,
		overflowY: "auto",
	},
	changeRow: {
		display: "flex",
		alignItems: "flex-start",
		gap: 8,
		padding: "4px 8px",
		borderRadius: 3,
		cursor: "pointer",
		fontSize: 13,
		color: "#c9d1d9",
		background: "#161b22",
	},
	checkbox: {
		marginTop: 2,
		flexShrink: 0,
	},
	changeText: {
		fontFamily: "monospace",
		fontSize: 12,
		lineHeight: "1.4",
		wordBreak: "break-all",
	},
	empty: {
		color: "#484f58",
		fontSize: 13,
		fontStyle: "italic",
	},
};
