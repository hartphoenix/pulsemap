/** URL parameters the editor recognizes. */
export interface EditorParams {
  /** Start time in ms */
  t?: number;
  /** Active lane name */
  lane?: string;
  /** Index within the lane */
  index?: number;
  /** Playback source override */
  source?: string;
}

export function parseEditorParams(search: string): EditorParams {
  const params = new URLSearchParams(search);
  const result: EditorParams = {};

  const t = params.get("t");
  if (t !== null) result.t = Number(t);

  const lane = params.get("lane");
  if (lane !== null) result.lane = lane;

  const index = params.get("index");
  if (index !== null) result.index = Number(index);

  const source = params.get("source");
  if (source !== null) result.source = source;

  return result;
}
