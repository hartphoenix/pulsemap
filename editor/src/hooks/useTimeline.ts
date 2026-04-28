import { useCallback, useEffect, useRef, useState } from "react";
import {
	DEFAULT_PX_PER_MS,
	FOLLOW_OFFSET_FRACTION,
	MAX_PX_PER_MS,
	MIN_PX_PER_MS,
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
	const programmaticScrollRef = useRef(false);

	const clampZoom = useCallback(
		(v: number) => Math.max(MIN_PX_PER_MS, Math.min(MAX_PX_PER_MS, v)),
		[],
	);

	const msToX = useCallback((ms: number) => ms * pxPerMs, [pxPerMs]);

	const xToMs = useCallback((x: number) => x / pxPerMs, [pxPerMs]);

	const zoomIn = useCallback(() => {
		setPxPerMs((prev) => clampZoom(prev * ZOOM_FACTOR));
	}, [clampZoom]);

	const zoomOut = useCallback(() => {
		setPxPerMs((prev) => clampZoom(prev / ZOOM_FACTOR));
	}, [clampZoom]);

	const setZoom = useCallback((v: number) => setPxPerMs(clampZoom(v)), [clampZoom]);

	const enableFollow = useCallback(() => setFollowing(true), []);
	const disableFollow = useCallback(() => setFollowing(false), []);

	// Re-enable follow when playback starts
	useEffect(() => {
		if (playing) setFollowing(true);
	}, [playing]);

	// Follow mode: keep playhead at 25% of viewport
	useEffect(() => {
		if (!following || !playing) return;
		const el = containerRef.current;
		if (!el) return;
		const viewportWidthMs = el.clientWidth / pxPerMs;
		const maxScrollMs = Math.max(0, (el.scrollWidth - el.clientWidth) / pxPerMs);
		const targetScroll = position - viewportWidthMs * FOLLOW_OFFSET_FRACTION;
		setScrollMs(Math.max(0, Math.min(targetScroll, maxScrollMs)));
	}, [following, playing, position, pxPerMs]);

	// Sync container scroll position from scrollMs
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const scrollLeft = scrollMs * pxPerMs;
		if (Math.abs(el.scrollLeft - scrollLeft) > 1) {
			programmaticScrollRef.current = true;
			el.scrollLeft = scrollLeft;
			requestAnimationFrame(() => {
				programmaticScrollRef.current = false;
			});
		}
	}, [scrollMs, pxPerMs]);

	// Listen for user scroll and wheel events on the container
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		function handleScroll() {
			if (!el || programmaticScrollRef.current) return;
			const newScrollMs = el.scrollLeft / pxPerMs;
			setScrollMs(newScrollMs);
			setFollowing(false);
		}

		function handleWheel(e: WheelEvent) {
			if (e.ctrlKey || e.metaKey) {
				// Pinch-to-zoom (trackpad) or Ctrl+wheel (mouse)
				e.preventDefault();
				if (!el) return;
				const rect = el.getBoundingClientRect();
				const cursorX = e.clientX - rect.left;
				const cursorMs = cursorX / pxPerMs + el.scrollLeft / pxPerMs;

				const zoomDir = e.deltaY > 0 ? -1 : 1;
				const factor = zoomDir > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
				const newPxPerMs = clampZoom(pxPerMs * factor);

				const newScrollMs = cursorMs - cursorX / newPxPerMs;
				const maxScrollMs = Math.max(0, durationMs - (el.clientWidth - 72) / newPxPerMs);
				setPxPerMs(newPxPerMs);
				setScrollMs(Math.max(0, Math.min(newScrollMs, maxScrollMs)));
				setFollowing(false);
				return;
			}

			if (e.shiftKey) {
				// Shift+wheel: zoom
				e.preventDefault();
				const zoomDir = e.deltaY > 0 ? -1 : 1;
				const factor = zoomDir > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
				setPxPerMs((prev) => clampZoom(prev * factor));
				return;
			}

			// Horizontal scroll component (trackpad swipe or shift+scroll)
			if (e.deltaX !== 0) {
				e.preventDefault();
				const maxScrollMs = Math.max(0, (el.scrollWidth - el.clientWidth) / pxPerMs);
				const deltaMs = e.deltaX / pxPerMs;
				setScrollMs((prev) => Math.max(0, Math.min(prev + deltaMs, maxScrollMs)));
				setFollowing(false);
			}
			// Let deltaY pass through for native vertical page scroll
		}

		el.addEventListener("wheel", handleWheel, { passive: false });
		el.addEventListener("scroll", handleScroll);

		return () => {
			el.removeEventListener("wheel", handleWheel);
			el.removeEventListener("scroll", handleScroll);
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
