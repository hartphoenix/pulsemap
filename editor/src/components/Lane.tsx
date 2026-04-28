import type { CSSProperties, ReactNode } from "react";
import { COLORS } from "../constants";

interface LaneProps {
	label: string;
	height: number;
	children: ReactNode;
}

export function Lane({ label, height, children }: LaneProps) {
	return (
		<div style={{ ...styles.lane, height }}>
			<div style={styles.label}>{label}</div>
			<div style={{ ...styles.content, height }}>{children}</div>
		</div>
	);
}

const styles: Record<string, CSSProperties> = {
	lane: {
		display: "flex",
		flexDirection: "row",
		position: "relative",
		borderBottom: "1px solid #1a1a2e",
	},
	label: {
		position: "sticky",
		left: 0,
		width: 72,
		minWidth: 72,
		display: "flex",
		alignItems: "center",
		justifyContent: "flex-end",
		paddingRight: 8,
		fontSize: 11,
		fontWeight: 600,
		color: "#888",
		textTransform: "uppercase",
		letterSpacing: "0.05em",
		background: COLORS.background,
		zIndex: 11,
	},
	content: {
		position: "relative",
		flex: 1,
		overflow: "hidden",
		background: COLORS.laneBg,
	},
};
