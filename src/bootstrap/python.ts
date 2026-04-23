import { dirname, join } from "node:path";

let resolvedPython: string | undefined;

function projectRoot(): string {
	let dir = dirname(import.meta.dir);
	while (dir !== "/") {
		if (Bun.file(join(dir, "package.json")).size > 0) return dir;
		dir = dirname(dir);
	}
	return dirname(import.meta.dir);
}

export async function resolvePython(): Promise<string> {
	if (resolvedPython) return resolvedPython;

	if (process.env.PULSEMAP_PYTHON) {
		resolvedPython = process.env.PULSEMAP_PYTHON;
		console.error(`  Using PULSEMAP_PYTHON: ${resolvedPython}`);
		return resolvedPython;
	}

	const venvPython = join(projectRoot(), ".venv", "bin", "python");
	try {
		const stat = await Bun.file(venvPython).exists();
		if (stat) {
			const proc = Bun.spawn([venvPython, "-c", "import essentia; import demucs"], {
				stdout: "ignore",
				stderr: "ignore",
			});
			await proc.exited;
			if (proc.exitCode === 0) {
				resolvedPython = venvPython;
				console.error(`  Using .venv Python: ${venvPython}`);
				return venvPython;
			}
		}
	} catch {
		// .venv not available
	}

	for (const candidate of ["python3.11", "python3.12", "python3.13", "python3", "python3.14"]) {
		try {
			const proc = Bun.spawn([candidate, "-c", "import essentia"], {
				stdout: "ignore",
				stderr: "ignore",
			});
			await proc.exited;
			if (proc.exitCode === 0) {
				resolvedPython = candidate;
				console.error(`  Auto-detected Python with essentia: ${candidate}`);
				return candidate;
			}
		} catch {
			// candidate not on PATH
		}
	}

	resolvedPython = "python3";
	console.error("  No Python with essentia found, falling back to python3");
	return "python3";
}

export function scriptsDir(): string {
	return join(dirname(import.meta.dir), "bootstrap", "scripts");
}

export interface PythonResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export async function runPythonScript(scriptName: string, args: string[]): Promise<PythonResult> {
	const python = await resolvePython();
	const scriptPath = join(scriptsDir(), scriptName);

	const proc = Bun.spawn([python, scriptPath, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	await proc.exited;

	return { stdout, stderr, exitCode: proc.exitCode ?? 1 };
}
