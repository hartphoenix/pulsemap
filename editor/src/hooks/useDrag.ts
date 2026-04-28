import { useCallback, useRef } from "react";

export type DragMode = "move" | "resize-start" | "resize-end";

interface UseDragOptions {
  pxPerMs: number;
  snapFn: (ms: number) => number;
  snapEnabled: boolean;
  onDragStart?: (mode: DragMode) => void;
  onDragMove?: (deltaMs: number, currentMs: number, mode: DragMode) => void;
  onDragEnd?: (deltaMs: number, currentMs: number, mode: DragMode) => void;
}

interface UseDragResult {
  /** Call this from onPointerDown to start tracking */
  startDrag: (
    e: React.PointerEvent,
    mode: DragMode,
    initialMs: number,
  ) => void;
  /** Whether a drag is currently in progress */
  dragging: boolean;
}

export function useDrag({
  pxPerMs,
  snapFn,
  snapEnabled,
  onDragStart,
  onDragMove,
  onDragEnd,
}: UseDragOptions): UseDragResult {
  const draggingRef = useRef(false);
  const modeRef = useRef<DragMode>("move");
  const startXRef = useRef(0);
  const initialMsRef = useRef(0);
  const altHeldRef = useRef(false);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current) return;
      altHeldRef.current = e.altKey;
      const deltaPx = e.clientX - startXRef.current;
      const deltaMs = deltaPx / pxPerMs;
      let currentMs = initialMsRef.current + deltaMs;

      // Apply snap unless Alt is held
      if (snapEnabled && !e.altKey) {
        currentMs = snapFn(currentMs);
      }

      onDragMove?.(currentMs - initialMsRef.current, currentMs, modeRef.current);
    },
    [pxPerMs, snapFn, snapEnabled, onDragMove],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;

      const deltaPx = e.clientX - startXRef.current;
      const deltaMs = deltaPx / pxPerMs;
      let currentMs = initialMsRef.current + deltaMs;

      if (snapEnabled && !e.altKey) {
        currentMs = snapFn(currentMs);
      }

      onDragEnd?.(currentMs - initialMsRef.current, currentMs, modeRef.current);

      (e.target as Element)?.releasePointerCapture?.(e.pointerId);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    },
    [pxPerMs, snapFn, snapEnabled, onDragEnd, handlePointerMove],
  );

  const startDrag = useCallback(
    (e: React.PointerEvent, mode: DragMode, initialMs: number) => {
      e.stopPropagation();
      e.preventDefault();
      draggingRef.current = true;
      modeRef.current = mode;
      startXRef.current = e.clientX;
      initialMsRef.current = initialMs;
      altHeldRef.current = e.altKey;

      (e.target as Element).setPointerCapture(e.pointerId);
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);

      onDragStart?.(mode);
    },
    [onDragStart, handlePointerMove, handlePointerUp],
  );

  return {
    startDrag,
    get dragging() {
      return draggingRef.current;
    },
  };
}
