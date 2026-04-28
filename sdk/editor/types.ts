export interface EditorTarget {
	mapId: string;
	t?: number;
	lane?: "chords" | "words" | "lyrics" | "sections" | "metadata" | "playback";
	index?: number;
	source?: string;
}
