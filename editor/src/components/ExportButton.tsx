import type { PulseMap } from "pulsemap/schema";
import type { CSSProperties } from "react";

interface ExportButtonProps {
	map: PulseMap;
}

export function ExportButton({ map }: ExportButtonProps) {
	const handleExport = () => {
		const json = JSON.stringify(map, null, 2);
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${map.id}.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<button type="button" style={styles.button} onClick={handleExport}>
			Export JSON
		</button>
	);
}

const styles: Record<string, CSSProperties> = {
	button: {
		padding: "4px 10px",
		background: "#1a3a2a",
		border: "1px solid #3a6a4a",
		borderRadius: 4,
		color: "#6fdc8c",
		fontSize: 12,
		cursor: "pointer",
	},
};
