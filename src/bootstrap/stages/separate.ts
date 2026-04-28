import { runPythonScript } from "../python";

export interface StemPaths {
	vocals?: string;
	drums?: string;
	bass?: string;
	other?: string;
	lead_vocals?: string;
	backing_vocals?: string;
}

export async function separateAudio(
	audioPath: string,
	workDir: string,
): Promise<StemPaths | undefined> {
	const { stdout, stderr, exitCode } = await runPythonScript("separate.py", [audioPath, workDir]);

	if (exitCode !== 0) {
		console.warn(`Source separation failed (exit ${exitCode}): ${stderr}`);
		return undefined;
	}

	if (stderr) {
		console.error(`Separation warnings: ${stderr}`);
	}

	try {
		const stems = JSON.parse(stdout) as StemPaths;
		const count = Object.values(stems).filter(Boolean).length;
		if (count === 0) return undefined;
		return stems;
	} catch {
		console.warn(`Failed to parse separation output: ${stdout.slice(0, 200)}`);
		return undefined;
	}
}

export async function separateVocals(
	vocalStemPath: string,
	workDir: string,
): Promise<{ leadVocals: string; backingVocals: string } | undefined> {
	const { stdout, stderr, exitCode } = await runPythonScript("separate_vocals.py", [
		vocalStemPath,
		workDir,
	]);

	if (exitCode !== 0) {
		console.warn(`Vocal separation failed (exit ${exitCode}): ${stderr}`);
		return undefined;
	}

	if (stderr) {
		console.error(`Vocal separation info: ${stderr}`);
	}

	try {
		const result = JSON.parse(stdout) as {
			lead_vocals: string;
			backing_vocals: string;
		};
		if (!result.lead_vocals || !result.backing_vocals) return undefined;
		return {
			leadVocals: result.lead_vocals,
			backingVocals: result.backing_vocals,
		};
	} catch {
		console.warn(`Failed to parse vocal separation output: ${stdout.slice(0, 200)}`);
		return undefined;
	}
}
