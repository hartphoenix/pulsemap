import type { CSSProperties } from "react";

interface DirtyIndicatorProps {
	dirty: boolean;
}

export function DirtyIndicator({ dirty }: DirtyIndicatorProps) {
	if (!dirty) return null;

	return (
		<span style={styles.indicator}>
			<span style={styles.dot} />
			Unsaved
		</span>
	);
}

const styles: Record<string, CSSProperties> = {
	indicator: {
		display: "inline-flex",
		alignItems: "center",
		gap: 4,
		fontSize: 12,
		color: "#ffcc00",
	},
	dot: {
		display: "inline-block",
		width: 6,
		height: 6,
		borderRadius: "50%",
		background: "#ffcc00",
	},
};
