import type { CSSProperties } from "react";
import { COLORS } from "../constants";

interface SnapIndicatorProps {
	/** Snap point positions in px (already converted from ms) */
	snapPointsPx: number[];
	/** Height of the timeline content area */
	height: number;
}

/**
 * Renders vertical guide lines at beat snap positions
 * during drag operations.
 */
export function SnapIndicator({ snapPointsPx, height }: SnapIndicatorProps) {
	if (snapPointsPx.length === 0) return null;

	return (
		<>
			{snapPointsPx.map((px) => (
				<div
					key={px}
					style={{
						...styles.line,
						left: px,
						height,
					}}
				/>
			))}
		</>
	);
}

const styles: Record<string, CSSProperties> = {
	line: {
		position: "absolute",
		top: 0,
		width: 1,
		background: COLORS.beats,
		opacity: 0.3,
		pointerEvents: "none",
		zIndex: 4,
	},
};
