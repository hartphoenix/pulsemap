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
		if (await Bun.file(venvPython).exists()) {
			resolvedPython = venvPython;
			console.error(`  Using .venv Python: ${venvPython}`);
			return venvPython;
		}
	} catch {
		// .venv not available
	}

	for (const candidate of ["python3.11", "python3.12", "python3.13", "python3", "python3.14"]) {
		try {
			const proc = Bun.spawn([candidate, "--version"], {
				stdout: "ignore",
				stderr: "ignore",
			});
			await proc.exited;
			if (proc.exitCode === 0) {
				resolvedPython = candidate;
				console.error(`  Using system Python: ${candidate}`);
				return candidate;
			}
		} catch {
			// candidate not on PATH
		}
	}

	resolvedPython = "python3";
	console.error("  No Python found, falling back to python3");
	return "python3";
}

export function scriptsDir(): string {
	return join(dirname(import.meta.dir), "bootstrap", "scripts");
}

const NOISE_PATTERNS = [
	/scikit-learn version .* is not supported/,
	/Torch version .* has not been tested with coremltools/,
	/WARNING:root:tflite-runtime is not installed/,
	/WARNING:root:onnxruntime is not installed/,
	/WARNING:root:Tensorflow is not installed/,
	/The 'encoding' parameter is not fully supported by TorchCodec/,
	/The 'bits_per_sample' parameter is not directly supported by TorchCodec/,
	/Error submitting a packet to the muxer: Broken pipe/,
	/Error muxing a packet/,
	/Task finished with error code: -32/,
	/Terminating thread with return code -32/,
	/Error writing trailer: Broken pipe/,
	/Error closing file: Broken pipe/,
	/Last message repeated \d+ times/,
	/\[aost#\d+:\d+\/pcm_s16le @/,
	/\[out#\d+\/s16le @/,
	/\[in#\d+\/wav @/,
	/Error during demuxing/,
	/OMP: Warning #179/,
];

function filterKnownWarnings(stderr: string): string {
	return stderr
		.split("\n")
		.filter((line) => {
			const trimmed = line.trim();
			if (!trimmed) return false;
			return !NOISE_PATTERNS.some((p) => p.test(trimmed));
		})
		.join("\n");
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

	const filteredStderr = filterKnownWarnings(stderr);
	return { stdout, stderr: filteredStderr, exitCode: proc.exitCode ?? 1 };
}
