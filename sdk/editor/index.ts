import type { EditorTarget } from "./types";

const EDITOR_BASE_URL = "https://hartphoenix.github.io/pulsemap/editor";

export function openEditor(target: EditorTarget): void {
	window.open(editorUrl(target), "_blank");
}

export function editorUrl(target: EditorTarget): string {
	const url = new URL(`${EDITOR_BASE_URL}/${target.mapId}`);
	if (target.t !== undefined) url.searchParams.set("t", String(target.t));
	if (target.lane) url.searchParams.set("lane", target.lane);
	if (target.index !== undefined) url.searchParams.set("index", String(target.index));
	if (target.source) url.searchParams.set("source", target.source);
	return url.toString();
}

export type { EditorTarget };
