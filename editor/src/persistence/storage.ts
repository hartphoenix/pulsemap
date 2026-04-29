/**
 * localStorage persistence for editor state.
 *
 * Key format: `pulsemap-edit:${mapId}`
 * Payload: working map plus a hash of the original (upstream) map so
 * we can detect upstream changes on reload.
 */
import type { PulseMap } from "pulsemap/schema";

export interface SavedEditorState {
	working: PulseMap;
	savedAt: number;
	originalHash: string;
}

function storageKey(mapId: string): string {
	return `pulsemap-edit:${mapId}`;
}

/** Read saved editor state from localStorage. Returns null on miss or corruption. */
export function loadEditorState(mapId: string): SavedEditorState | null {
	try {
		const raw = localStorage.getItem(storageKey(mapId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<SavedEditorState>;
		if (!parsed.working || !parsed.originalHash) return null;
		return {
			working: parsed.working,
			savedAt: parsed.savedAt ?? 0,
			originalHash: parsed.originalHash,
		};
	} catch {
		return null;
	}
}

/** Remove saved editor state for a map. */
export function clearEditorState(mapId: string): void {
	try {
		localStorage.removeItem(storageKey(mapId));
	} catch {
		// localStorage may be unavailable
	}
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced (500ms) write of editor state to localStorage. */
export function saveEditorState(mapId: string, working: PulseMap, originalHash: string): void {
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		try {
			const payload: SavedEditorState = {
				working,
				savedAt: Date.now(),
				originalHash,
			};
			localStorage.setItem(storageKey(mapId), JSON.stringify(payload));
		} catch {
			// localStorage may be full or unavailable
		}
	}, 500);
}
