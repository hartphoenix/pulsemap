import { runPythonScript } from "../python";

export interface StemPaths {
	vocals?: string;
	drums?: string;
	bass?: string;
	other?: string;
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
