import type { EditableLane } from "../state/types";

export interface ValidationIssue {
	severity: "error" | "warning";
	lane?: EditableLane;
	index?: number;
	message: string;
}
