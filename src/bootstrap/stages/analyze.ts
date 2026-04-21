import { dirname, join } from "node:path";
import type { BeatEvent, ChordEvent, Section } from "../../../schema/map";

export interface AnalysisResult {
	key?: string;
	scale?: string;
	tempo?: number;
	time_signature?: string;
	beats?: BeatEvent[];
	chords?: ChordEvent[];
	sections?: Section[];
}

let pythonPath: string | undefined;

async function resolvePython(): Promise<string> {
	if (pythonPath) return pythonPath;

	if (process.env.PULSEMAP_PYTHON) {
		pythonPath = process.env.PULSEMAP_PYTHON;
		console.error(`  Using PULSEMAP_PYTHON: ${pythonPath}`);
		return pythonPath;
	}

	for (const candidate of ["python3.11", "python3.12", "python3.13", "python3", "python3.14"]) {
		try {
			const proc = Bun.spawn([candidate, "-c", "import essentia"], {
				stdout: "ignore",
				stderr: "ignore",
			});
			await proc.exited;
			if (proc.exitCode === 0) {
				pythonPath = candidate;
				console.error(`  Auto-detected Python with essentia: ${candidate}`);
				return candidate;
			}
		} catch {
			// candidate not on PATH
		}
	}

	pythonPath = "python3";
	console.error("  No Python with essentia found, falling back to python3");
	return "python3";
}

export async function analyzeAudio(audioPath: string): Promise<AnalysisResult | undefined> {
	const python = await resolvePython();
	const scriptPath = join(dirname(import.meta.dir), "scripts", "analyze.py");

	const proc = Bun.spawn([python, scriptPath, audioPath], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const output = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	await proc.exited;

	if (proc.exitCode !== 0) {
		console.warn(`Audio analysis failed (exit ${proc.exitCode}): ${stderr}`);
		return undefined;
	}

	if (stderr) {
		console.warn(`Analysis warnings: ${stderr}`);
	}

	try {
		return JSON.parse(output) as AnalysisResult;
	} catch {
		console.warn(`Failed to parse analysis output: ${output.slice(0, 200)}`);
		return undefined;
	}
}
