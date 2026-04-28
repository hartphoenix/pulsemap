import type { BeatEvent } from "pulsemap/schema";
import { useCallback, useMemo } from "react";

export type SnapSubdivision = "beat" | "half" | "quarter";

interface UseBeatSnapOptions {
	beats: BeatEvent[] | undefined;
	enabled: boolean;
	subdivision: SnapSubdivision;
}

interface UseBeatSnapResult {
	/** Snap a ms value to the nearest beat grid point */
	snapToNearestBeat: (ms: number) => number;
	/** Get all snap points near a given ms (for visual indicators) */
	getNearbySnapPoints: (ms: number, rangeMs: number) => number[];
}

/**
 * Build a sorted array of snap points from beats at the given subdivision.
 * beat = beat positions only
 * half = beats + midpoints between consecutive beats
 * quarter = beats + 1/4 points between consecutive beats
 */
function buildSnapGrid(beats: BeatEvent[], subdivision: SnapSubdivision): number[] {
	if (beats.length === 0) return [];

	const points: number[] = [];
	for (let i = 0; i < beats.length; i++) {
		points.push(beats[i].t);
		if (i + 1 < beats.length) {
			const gap = beats[i + 1].t - beats[i].t;
			if (subdivision === "half" || subdivision === "quarter") {
				points.push(beats[i].t + gap / 2);
			}
			if (subdivision === "quarter") {
				points.push(beats[i].t + gap / 4);
				points.push(beats[i].t + (3 * gap) / 4);
			}
		}
	}
	points.sort((a, b) => a - b);
	return points;
}

/** Binary search for the nearest value in a sorted array */
function findNearest(sorted: number[], target: number): number {
	if (sorted.length === 0) return target;
	if (sorted.length === 1) return sorted[0];

	let lo = 0;
	let hi = sorted.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (sorted[mid] < target) {
			lo = mid + 1;
		} else {
			hi = mid;
		}
	}

	// lo is the first element >= target. Compare lo and lo-1.
	if (lo === 0) return sorted[0];
	const distLo = Math.abs(sorted[lo] - target);
	const distPrev = Math.abs(sorted[lo - 1] - target);
	return distPrev <= distLo ? sorted[lo - 1] : sorted[lo];
}

export function useBeatSnap({
	beats,
	enabled,
	subdivision,
}: UseBeatSnapOptions): UseBeatSnapResult {
	const snapGrid = useMemo(() => {
		if (!enabled || !beats || beats.length === 0) return [];
		return buildSnapGrid(beats, subdivision);
	}, [beats, enabled, subdivision]);

	const snapToNearestBeat = useCallback(
		(ms: number): number => {
			if (!enabled || snapGrid.length === 0) return ms;
			return findNearest(snapGrid, ms);
		},
		[enabled, snapGrid],
	);

	const getNearbySnapPoints = useCallback(
		(ms: number, rangeMs: number): number[] => {
			if (!enabled || snapGrid.length === 0) return [];
			// Binary search for range start
			let lo = 0;
			let hi = snapGrid.length;
			const startMs = ms - rangeMs;
			const endMs = ms + rangeMs;
			while (lo < hi) {
				const mid = (lo + hi) >>> 1;
				if (snapGrid[mid] < startMs) lo = mid + 1;
				else hi = mid;
			}
			const result: number[] = [];
			for (let i = lo; i < snapGrid.length && snapGrid[i] <= endMs; i++) {
				result.push(snapGrid[i]);
			}
			return result;
		},
		[enabled, snapGrid],
	);

	return { snapToNearestBeat, getNearbySnapPoints };
}
