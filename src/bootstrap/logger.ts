interface StageRecord {
	name: string;
	startMs: number;
	endMs?: number;
	durationMs?: number;
	status: "running" | "ok" | "failed" | "skipped";
	detail?: string;
}

export class PipelineLogger {
	private t0 = performance.now();
	private stages = new Map<string, StageRecord>();

	private ts(): string {
		const s = (performance.now() - this.t0) / 1000;
		return `[${s.toFixed(1).padStart(5)}s]`;
	}

	info(msg: string): void {
		console.error(`${this.ts()} ${msg}`);
	}

	detail(msg: string): void {
		console.error(`${this.ts()}   ${msg}`);
	}

	stage(name: string): void {
		this.stages.set(name, { name, startMs: performance.now(), status: "running" });
	}

	stageOk(name: string, detail: string): void {
		const record = this.stages.get(name);
		if (record) {
			record.endMs = performance.now();
			record.durationMs = record.endMs - record.startMs;
			record.status = "ok";
			record.detail = detail;
		}
		const dur = record?.durationMs != null ? ` (${fmtDuration(record.durationMs)})` : "";
		this.detail(`${name}: ${detail}${dur}`);
	}

	stageFail(name: string, reason: string): void {
		const record = this.stages.get(name);
		if (record) {
			record.endMs = performance.now();
			record.durationMs = record.endMs - record.startMs;
			record.status = "failed";
			record.detail = reason;
		}
		const dur = record?.durationMs != null ? ` (${fmtDuration(record.durationMs)})` : "";
		this.detail(`${name}: FAILED — ${reason}${dur}`);
	}

	stageSkip(name: string, reason: string): void {
		this.stages.set(name, {
			name,
			startMs: performance.now(),
			endMs: performance.now(),
			durationMs: 0,
			status: "skipped",
			detail: reason,
		});
		this.detail(`${name}: skipped (${reason})`);
	}

	summary(mapFields: string[]): void {
		const totalMs = performance.now() - this.t0;
		const records = [...this.stages.values()];

		const timings = records
			.filter((s) => s.status === "ok" && s.durationMs != null)
			.sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
			.map((s) => `${s.name}=${fmtDuration(s.durationMs ?? 0)}`)
			.join("  ");

		const failed = records.filter((s) => s.status === "failed");
		const skipped = records.filter((s) => s.status === "skipped");

		console.error("");
		console.error(`Pipeline complete (${fmtDuration(totalMs)})`);
		if (timings) console.error(`  Timings: ${timings}`);
		console.error(`  Map fields: ${mapFields.length ? mapFields.join(", ") : "(none)"}`);
		if (failed.length)
			console.error(`  Failed: ${failed.map((s) => `${s.name} (${s.detail})`).join(", ")}`);
		if (skipped.length)
			console.error(`  Skipped: ${skipped.map((s) => `${s.name} (${s.detail})`).join(", ")}`);
		if (!failed.length && !skipped.length) console.error("  Failed/skipped: (none)");
		console.error("");
	}
}

function fmtDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const min = Math.floor(ms / 60_000);
	const sec = ((ms % 60_000) / 1000).toFixed(0);
	return `${min}m${sec}s`;
}
