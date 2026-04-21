import type { Fingerprint } from "../../../schema/map";

export async function fingerprint(audioPath: string): Promise<Fingerprint> {
	const proc = Bun.spawn(["fpcalc", "-json", audioPath], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const output = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	await proc.exited;

	if (proc.exitCode !== 0) {
		throw new Error(`fpcalc failed (exit ${proc.exitCode}): ${stderr}`);
	}

	const result = JSON.parse(output);

	return {
		chromaprint: result.fingerprint,
		algorithm: 2,
		duration: Math.round(result.duration * 1000),
	};
}
