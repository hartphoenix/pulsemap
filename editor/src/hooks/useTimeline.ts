import { useState, useCallback, useRef, useEffect } from "react";
import {
  DEFAULT_PX_PER_MS,
  MIN_PX_PER_MS,
  MAX_PX_PER_MS,
  FOLLOW_OFFSET_FRACTION,
  ZOOM_FACTOR,
} from "../constants";

interface UseTimelineOptions {
  durationMs: number;
  position: number;
  playing: boolean;
}

interface UseTimelineResult {
  scrollMs: number;
  pxPerMs: number;
  following: boolean;
  msToX: (ms: number) => number;
  xToMs: (x: number) => number;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoom: (pxPerMs: number) => void;
  setScrollMs: (ms: number) => void;
  enableFollow: () => void;
  disableFollow: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function useTimeline({
  durationMs,
  position,
  playing,
}: UseTimelineOptions): UseTimelineResult {
  const [pxPerMs, setPxPerMs] = useState(DEFAULT_PX_PER_MS);
  const [scrollMs, setScrollMs] = useState(0);
  const [following, setFollowing] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const userScrolledRef = useRef(false);

  const clampZoom = useCallback(
    (v: number) => Math.max(MIN_PX_PER_MS, Math.min(MAX_PX_PER_MS, v)),
    [],
  );

  const msToX = useCallback(
    (ms: number) => (ms - scrollMs) * pxPerMs,
    [scrollMs, pxPerMs],
  );

  const xToMs = useCallback(
    (x: number) => x / pxPerMs + scrollMs,
    [scrollMs, pxPerMs],
  );

  const zoomIn = useCallback(() => {
    setPxPerMs((prev) => clampZoom(prev * ZOOM_FACTOR));
  }, [clampZoom]);

  const zoomOut = useCallback(() => {
    setPxPerMs((prev) => clampZoom(prev / ZOOM_FACTOR));
  }, [clampZoom]);

  const setZoom = useCallback(
    (v: number) => setPxPerMs(clampZoom(v)),
    [clampZoom],
  );

  const enableFollow = useCallback(() => setFollowing(true), []);
  const disableFollow = useCallback(() => {
    setFollowing(false);
    userScrolledRef.current = true;
  }, []);

  // Follow mode: keep playhead at 25% of viewport
  useEffect(() => {
    if (!following || !playing) return;
    const el = containerRef.current;
    if (!el) return;
    const viewportWidthMs = el.clientWidth / pxPerMs;
    const targetScroll = position - viewportWidthMs * FOLLOW_OFFSET_FRACTION;
    setScrollMs(Math.max(0, Math.min(targetScroll, durationMs)));
  }, [following, playing, position, pxPerMs, durationMs]);

  // Sync container scroll position from scrollMs
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const scrollLeft = scrollMs * pxPerMs;
    if (Math.abs(el.scrollLeft - scrollLeft) > 1) {
      el.scrollLeft = scrollLeft;
    }
  }, [scrollMs, pxPerMs]);

  // Listen for user scroll and wheel events on the container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleScroll() {
      if (!el) return;
      const newScrollMs = el.scrollLeft / pxPerMs;
      // If user initiated the scroll (not programmatic follow), break follow
      if (userScrolledRef.current) {
        setScrollMs(newScrollMs);
      }
      userScrolledRef.current = false;
    }

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Horizontal scroll
        if (!el) return;
        const deltaMs = e.deltaY / pxPerMs;
        setScrollMs((prev) =>
          Math.max(0, Math.min(prev + deltaMs, durationMs)),
        );
        setFollowing(false);
      } else if (e.shiftKey) {
        // Zoom (shift+wheel)
        const zoomDir = e.deltaY > 0 ? -1 : 1;
        const factor = zoomDir > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
        setPxPerMs((prev) => clampZoom(prev * factor));
      } else {
        // Default: horizontal scroll
        if (!el) return;
        const deltaMs = e.deltaY / pxPerMs;
        setScrollMs((prev) =>
          Math.max(0, Math.min(prev + deltaMs, durationMs)),
        );
        setFollowing(false);
      }
    }

    function handleManualScroll() {
      userScrolledRef.current = true;
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("scroll", handleScroll);
    el.addEventListener("mousedown", handleManualScroll);

    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("scroll", handleScroll);
      el.removeEventListener("mousedown", handleManualScroll);
    };
  }, [pxPerMs, durationMs, clampZoom]);

  return {
    scrollMs,
    pxPerMs,
    following,
    msToX,
    xToMs,
    zoomIn,
    zoomOut,
    setZoom,
    setScrollMs,
    enableFollow,
    disableFollow,
    containerRef,
  };
}
