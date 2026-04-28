import { type CSSProperties, type ReactNode, useCallback, useRef, useState } from "react";
import { type DragMode, useDrag } from "../hooks/useDrag";

interface EventBlockProps {
	/** Left position in px (already offset from scrollMs) */
	x: number;
	/** Width in px */
	width: number;
	/** Height in px */
	height: number;
	/** Whether this event is selected */
	selected: boolean;
	/** Color for the selection highlight */
	color: string;
	/** Start time in ms (for drag calculations) */
	startMs: number;
	/** End time in ms (for resize calculations) */
	endMs?: number;
	/** Pixels per ms for coordinate conversion */
	pxPerMs: number;
	/** Snap function */
	snapFn: (ms: number) => number;
	/** Whether snap is enabled */
	snapEnabled: boolean;
	/** Content to render inside the block */
	children: ReactNode;
	/** Called when the block is clicked (select) */
	onClick?: () => void;
	/** Called when dragging completes a move */
	onMove?: (newT: number) => void;
	/** Called when resizing the start edge completes */
	onResizeStart?: (newT: number) => void;
	/** Called when resizing the end edge completes */
	onResizeEnd?: (newEnd: number) => void;
	/** Called on double-click */
	onDoubleClick?: () => void;
	/** Top offset within the lane */
	top?: number;
	/** Override border color (for validation indicators) */
	borderColor?: string;
}

const RESIZE_HANDLE_WIDTH = 6;

export function EventBlock({
	x,
	width,
	height,
	selected,
	color,
	startMs,
	endMs,
	pxPerMs,
	snapFn,
	snapEnabled,
	children,
	onClick,
	onMove,
	onResizeStart,
	onResizeEnd,
	onDoubleClick,
	top = 2,
	borderColor: borderColorOverride,
}: EventBlockProps) {
	const [dragOffset, setDragOffset] = useState<{ dx: number; mode: DragMode } | null>(null);
	const [hovered, setHovered] = useState(false);
	const blockRef = useRef<HTMLDivElement>(null);

	const handleDragMove = useCallback(
		(deltaMs: number, _currentMs: number, mode: DragMode) => {
			if (mode === "move") {
				setDragOffset({ dx: deltaMs * pxPerMs, mode });
			} else if (mode === "resize-start") {
				setDragOffset({ dx: deltaMs * pxPerMs, mode });
			} else if (mode === "resize-end") {
				setDragOffset({ dx: deltaMs * pxPerMs, mode });
			}
		},
		[pxPerMs],
	);

	const handleDragEnd = useCallback(
		(_deltaMs: number, currentMs: number, mode: DragMode) => {
			setDragOffset(null);
			if (mode === "move") {
				onMove?.(currentMs);
			} else if (mode === "resize-start") {
				onResizeStart?.(currentMs);
			} else if (mode === "resize-end") {
				onResizeEnd?.(currentMs);
			}
		},
		[onMove, onResizeStart, onResizeEnd],
	);

	const { startDrag } = useDrag({
		pxPerMs,
		snapFn,
		snapEnabled,
		onDragMove: handleDragMove,
		onDragEnd: handleDragEnd,
	});

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			const relX = e.clientX - rect.left;
			const blockWidth = rect.width;

			if (relX <= RESIZE_HANDLE_WIDTH && onResizeStart) {
				startDrag(e, "resize-start", startMs);
			} else if (relX >= blockWidth - RESIZE_HANDLE_WIDTH && onResizeEnd && endMs != null) {
				startDrag(e, "resize-end", endMs);
			} else {
				startDrag(e, "move", startMs);
			}
		},
		[startDrag, startMs, endMs, onResizeStart, onResizeEnd],
	);

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onClick?.();
		},
		[onClick],
	);

	const handleDblClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onDoubleClick?.();
		},
		[onDoubleClick],
	);

	// Compute visual position during drag
	let visualX = x;
	let visualWidth = width;
	if (dragOffset) {
		if (dragOffset.mode === "move") {
			visualX = x + dragOffset.dx;
		} else if (dragOffset.mode === "resize-start") {
			visualX = x + dragOffset.dx;
			visualWidth = width - dragOffset.dx;
		} else if (dragOffset.mode === "resize-end") {
			visualWidth = width + dragOffset.dx;
		}
	}

	const borderColor = borderColorOverride ?? (selected ? "#fff" : `${color}66`);
	const showGrips = selected || hovered;

	const style: CSSProperties = {
		position: "absolute",
		left: visualX,
		top,
		width: Math.max(visualWidth, 2),
		height: height - top * 2,
		background: selected ? `${color}55` : `${color}33`,
		border: `1px solid ${borderColor}`,
		borderRadius: 3,
		display: "flex",
		alignItems: "center",
		overflow: "hidden",
		cursor: dragOffset ? "grabbing" : "grab",
		userSelect: "none",
		zIndex: selected ? 5 : 1,
		boxSizing: "border-box",
		transition: dragOffset ? "none" : "background 0.1s, border-color 0.1s",
	};

	return (
		<div
			ref={blockRef}
			style={style}
			onClick={handleClick}
			onDoubleClick={handleDblClick}
			onPointerDown={handlePointerDown}
			onPointerEnter={() => setHovered(true)}
			onPointerLeave={() => setHovered(false)}
		>
			{/* Left resize handle */}
			{onResizeStart && (
				<div
					style={{
						position: "absolute",
						left: 0,
						top: 0,
						width: RESIZE_HANDLE_WIDTH,
						height: "100%",
						cursor: "ew-resize",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<div
						style={{
							width: 3,
							height: "60%",
							borderLeft: `1px solid ${color}`,
							borderRight: `1px solid ${color}`,
							opacity: showGrips ? 0.6 : 0,
							transition: "opacity 0.15s",
						}}
					/>
				</div>
			)}

			{/* Content */}
			<div style={{ flex: 1, overflow: "hidden", padding: "0 4px" }}>{children}</div>

			{/* Right resize handle */}
			{onResizeEnd && endMs != null && (
				<div
					style={{
						position: "absolute",
						right: 0,
						top: 0,
						width: RESIZE_HANDLE_WIDTH,
						height: "100%",
						cursor: "ew-resize",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<div
						style={{
							width: 3,
							height: "60%",
							borderLeft: `1px solid ${color}`,
							borderRight: `1px solid ${color}`,
							opacity: showGrips ? 0.6 : 0,
							transition: "opacity 0.15s",
						}}
					/>
				</div>
			)}
		</div>
	);
}
