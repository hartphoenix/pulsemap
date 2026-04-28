import { runPythonScript } from "../python";

export interface PolyphonyResult {
	polyphonic: boolean;
	gate1Ratio?: number;
	gate2Percent?: number;
	method: string;
}

export async function detectPolyphony(vocalStemPath: string): Promise<PolyphonyResult | undefined> {
	const { stdout, stderr, exitCode } = await runPythonScript("detect_polyphony.py", [
		vocalStemPath,
	]);

	if (exitCode !== 0) {
		console.warn(`Polyphony detection failed (exit ${exitCode}): ${stderr}`);
		return undefined;
	}

	if (stderr) {
		console.error(`Polyphony detection info: ${stderr}`);
	}

	try {
		const result = JSON.parse(stdout) as {
			polyphonic: boolean;
			gate1_ratio?: number;
			gate2_percent?: number;
			method: string;
		};
		return {
			polyphonic: result.polyphonic,
			gate1Ratio: result.gate1_ratio,
			gate2Percent: result.gate2_percent,
			method: result.method,
		};
	} catch {
		console.warn(`Failed to parse polyphony detection output: ${stdout.slice(0, 200)}`);
		return undefined;
	}
}
