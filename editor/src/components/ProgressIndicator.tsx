import type { CSSProperties } from "react";
import type { SubmitStep } from "../github/api";

interface ProgressIndicatorProps {
	currentStep: SubmitStep;
	prUrl?: string;
	error?: string;
}

const STEPS: { key: SubmitStep; label: string }[] = [
	{ key: "forking", label: "Forking repository..." },
	{ key: "branching", label: "Creating branch..." },
	{ key: "committing", label: "Committing changes..." },
	{ key: "opening-pr", label: "Opening pull request..." },
	{ key: "done", label: "Done!" },
];

function stepIndex(step: SubmitStep): number {
	return STEPS.findIndex((s) => s.key === step);
}

export function ProgressIndicator({ currentStep, prUrl, error }: ProgressIndicatorProps) {
	const current = stepIndex(currentStep);

	return (
		<div style={styles.container}>
			{STEPS.map((step, i) => {
				let status: "pending" | "active" | "done";
				if (i < current) status = "done";
				else if (i === current) status = "active";
				else status = "pending";

				return (
					<div key={step.key} style={styles.step}>
						<span
							style={{
								...styles.dot,
								...(status === "done"
									? styles.dotDone
									: status === "active"
										? styles.dotActive
										: styles.dotPending),
							}}
						/>
						<span
							style={{
								...styles.label,
								...(status === "pending" ? styles.labelPending : {}),
							}}
						>
							{step.key === "done" && prUrl ? (
								<a href={prUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
									Done — view pull request
								</a>
							) : (
								step.label
							)}
						</span>
					</div>
				);
			})}

			{error && <div style={styles.error}>{error}</div>}
		</div>
	);
}

const styles: Record<string, CSSProperties> = {
	container: {
		display: "flex",
		flexDirection: "column",
		gap: 10,
		padding: "16px 0",
	},
	step: {
		display: "flex",
		alignItems: "center",
		gap: 10,
	},
	dot: {
		display: "inline-block",
		width: 10,
		height: 10,
		borderRadius: "50%",
		flexShrink: 0,
	},
	dotDone: {
		background: "#3fb950",
	},
	dotActive: {
		background: "#58a6ff",
		boxShadow: "0 0 6px #58a6ff",
	},
	dotPending: {
		background: "#30363d",
	},
	label: {
		fontSize: 14,
		color: "#c9d1d9",
	},
	labelPending: {
		color: "#484f58",
	},
	link: {
		color: "#58a6ff",
		textDecoration: "none",
	},
	error: {
		marginTop: 8,
		padding: "8px 12px",
		background: "#3a1a1a",
		border: "1px solid #662222",
		borderRadius: 4,
		color: "#ff6666",
		fontSize: 13,
	},
};
