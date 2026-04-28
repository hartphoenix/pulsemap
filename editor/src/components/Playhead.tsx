import type { CSSProperties } from "react";
import { COLORS } from "../constants";

interface PlayheadProps {
	positionX: number;
}

export function Playhead({ positionX }: PlayheadProps) {
	if (positionX < 0) return null;

	return (
		<div
			style={{
				...styles.line,
				transform: `translateX(${positionX}px)`,
			}}
		/>
	);
}

const styles: Record<string, CSSProperties> = {
	line: {
		position: "absolute",
		top: 0,
		bottom: 0,
		left: 72, // offset by lane label width
		width: 2,
		background: COLORS.playhead,
		zIndex: 10,
		pointerEvents: "none",
		willChange: "transform",
	},
};
