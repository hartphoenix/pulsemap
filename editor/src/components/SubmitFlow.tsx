import type { PulseMap } from "pulsemap/schema";
import { type CSSProperties, useCallback, useMemo, useState } from "react";
import type { SubmitStep } from "../github/api";
import { submitCorrection } from "../github/api";
import { generateDiffSummary } from "../github/diff";
import type { EditAction } from "../state/types";
import { DiffReview } from "./DiffReview";
import { ProgressIndicator } from "./ProgressIndicator";

type FlowStep = "review" | "submitting" | "done" | "error";

interface SubmitFlowProps {
	map: PulseMap;
	history: EditAction[];
	token: string;
	playbackAvailable: boolean;
	errorCount: number;
	onClose: () => void;
}

export function SubmitFlow({
	map,
	history,
	token,
	playbackAvailable,
	errorCount,
	onClose,
}: SubmitFlowProps) {
	const [flowStep, setFlowStep] = useState<FlowStep>("review");
	const [submitStep, setSubmitStep] = useState<SubmitStep>("forking");
	const [prUrl, setPrUrl] = useState<string | undefined>();
	const [submitError, setSubmitError] = useState<string | undefined>();

	// All changes checked by default
	const diffResult = useMemo(() => generateDiffSummary(history), [history]);
	const [checkedIndices, setCheckedIndices] = useState<Set<number>>(
		() => new Set(diffResult.changes.map((_, i) => i)),
	);

	const handleToggle = useCallback((index: number) => {
		setCheckedIndices((prev) => {
			const next = new Set(prev);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});
	}, []);

	// Filter history to only checked changes
	const selectedHistory = useMemo(
		() => history.filter((_, i) => checkedIndices.has(i)),
		[history, checkedIndices],
	);

	const canSubmit = errorCount === 0 && selectedHistory.length > 0 && flowStep === "review";

	const handleSubmit = useCallback(async () => {
		setFlowStep("submitting");
		setSubmitError(undefined);

		try {
			const result = await submitCorrection(
				{
					token,
					mapId: map.id,
					map,
					history: selectedHistory,
					playbackAvailable,
					source: "PulseMap Editor",
				},
				(step) => setSubmitStep(step),
			);
			setPrUrl(result.prUrl);
			setFlowStep("done");
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : "Submission failed");
			setFlowStep("error");
		}
	}, [token, map, selectedHistory, playbackAvailable]);

	return (
		<div style={styles.overlay} onClick={onClose}>
			<div style={styles.modal} onClick={(e) => e.stopPropagation()}>
				<div style={styles.header}>
					<h2 style={styles.title}>Submit Correction</h2>
					<button type="button" onClick={onClose} style={styles.close}>
						x
					</button>
				</div>

				<div style={styles.body}>
					{(flowStep === "review" || flowStep === "error") && (
						<>
							<DiffReview
								changes={diffResult.changes}
								checkedIndices={checkedIndices}
								onToggle={handleToggle}
								playbackAvailable={playbackAvailable}
								errorCount={errorCount}
							/>

							{submitError && <div style={styles.errorBox}>{submitError}</div>}

							<div style={styles.actions}>
								<button type="button" onClick={onClose} style={styles.cancelButton}>
									Cancel
								</button>
								<button
									type="button"
									onClick={handleSubmit}
									disabled={!canSubmit}
									style={{
										...styles.submitButton,
										...(canSubmit ? {} : styles.submitButtonDisabled),
									}}
								>
									Create Pull Request
								</button>
							</div>
						</>
					)}

					{(flowStep === "submitting" || flowStep === "done") && (
						<>
							<ProgressIndicator currentStep={submitStep} prUrl={prUrl} error={submitError} />

							{flowStep === "done" && (
								<div style={styles.actions}>
									<button type="button" onClick={onClose} style={styles.cancelButton}>
										Close
									</button>
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}

const styles: Record<string, CSSProperties> = {
	overlay: {
		position: "fixed",
		inset: 0,
		background: "rgba(0, 0, 0, 0.7)",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		zIndex: 1000,
	},
	modal: {
		background: "#0d1117",
		border: "1px solid #30363d",
		borderRadius: 8,
		width: "90%",
		maxWidth: 640,
		maxHeight: "80vh",
		display: "flex",
		flexDirection: "column",
		overflow: "hidden",
	},
	header: {
		display: "flex",
		justifyContent: "space-between",
		alignItems: "center",
		padding: "16px 20px",
		borderBottom: "1px solid #21262d",
	},
	title: {
		margin: 0,
		fontSize: 16,
		fontWeight: 600,
		color: "#c9d1d9",
	},
	close: {
		background: "transparent",
		border: "none",
		color: "#8b949e",
		fontSize: 18,
		cursor: "pointer",
		padding: "4px 8px",
		lineHeight: 1,
	},
	body: {
		padding: "16px 20px",
		overflowY: "auto",
		display: "flex",
		flexDirection: "column",
		gap: 16,
	},
	errorBox: {
		padding: "8px 12px",
		background: "#3a1a1a",
		border: "1px solid #662222",
		borderRadius: 4,
		color: "#ff6666",
		fontSize: 13,
	},
	actions: {
		display: "flex",
		justifyContent: "flex-end",
		gap: 8,
		paddingTop: 8,
	},
	cancelButton: {
		padding: "6px 14px",
		background: "#21262d",
		border: "1px solid #363b42",
		borderRadius: 6,
		color: "#c9d1d9",
		fontSize: 13,
		cursor: "pointer",
	},
	submitButton: {
		padding: "6px 14px",
		background: "#238636",
		border: "1px solid #2ea043",
		borderRadius: 6,
		color: "#fff",
		fontSize: 13,
		fontWeight: 600,
		cursor: "pointer",
	},
	submitButtonDisabled: {
		opacity: 0.5,
		cursor: "not-allowed",
	},
};
