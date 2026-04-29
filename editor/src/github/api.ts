/**
 * GitHub API operations for submitting map corrections as pull requests.
 *
 * Flow: fork repo -> create branch -> commit map JSON -> open PR.
 */
import type { PulseMap } from "pulsemap/schema";
import { type DiffEntry, describeEntry, fieldCountsByLane, laneSummary } from "./diff";

const UPSTREAM_OWNER = "hartphoenix";
const UPSTREAM_REPO = "pulsemap";
const API_BASE = "https://api.github.com";

interface SubmitCorrectionParams {
	token: string;
	mapId: string;
	map: PulseMap;
	entries: DiffEntry[];
	playbackAvailable: boolean;
	source?: string;
}

interface SubmitCorrectionResult {
	prUrl: string;
	prNumber: number;
}

export type ProgressCallback = (step: SubmitStep) => void;
export type SubmitStep = "forking" | "branching" | "committing" | "opening-pr" | "done";

async function ghFetch(path: string, token: string, options: RequestInit = {}): Promise<Response> {
	const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
	const res = await fetch(url, {
		...options,
		headers: {
			Authorization: `token ${token}`,
			Accept: "application/vnd.github.v3+json",
			"Content-Type": "application/json",
			...((options.headers as Record<string, string>) || {}),
		},
	});
	return res;
}

async function ghJson<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
	const res = await ghFetch(path, token, options);
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`GitHub API error ${res.status}: ${body}`);
	}
	return res.json() as Promise<T>;
}

function buildPrBody(params: {
	map: PulseMap;
	mapId: string;
	entries: DiffEntry[];
	playbackAvailable: boolean;
	source?: string;
}): string {
	const { map, mapId, entries, playbackAvailable, source } = params;
	const meta = map.metadata;
	const title = meta?.title ?? mapId;
	const artist = meta?.artist ?? "Unknown";

	const summary = laneSummary(entries);
	const changeLines = entries.map((e) => `- ${describeEntry(e)}`).join("\n");

	const playbackNote = !playbackAvailable
		? "\n**Note:** Edited without audio playback available.\n"
		: "";

	const correctionMeta = JSON.stringify({
		fields: fieldCountsByLane(entries),
		playback_available: playbackAvailable,
	});

	return [
		`## Map correction: "${title}" — ${artist}`,
		`**Map ID:** \`${mapId}\``,
		`**Submitted via:** ${source || "PulseMap Editor"}`,
		playbackNote,
		`### Changes (${entries.length} ${entries.length === 1 ? "edit" : "edits"})`,
		summary,
		"",
		changeLines,
		"",
		"<details><summary>Structural diff</summary>",
		"",
		"```json",
		JSON.stringify(entries, null, 2),
		"```",
		"",
		"</details>",
		"",
		"<!-- pulsemap-correction",
		correctionMeta,
		"-->",
	].join("\n");
}

export async function submitCorrection(
	params: SubmitCorrectionParams,
	onProgress?: ProgressCallback,
): Promise<SubmitCorrectionResult> {
	const { token, mapId, map, entries, playbackAvailable, source } = params;

	const user = await ghJson<{ login: string }>("/user", token);
	const username = user.login;

	onProgress?.("forking");
	await ghJson<{ full_name: string }>(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/forks`, token, {
		method: "POST",
		body: JSON.stringify({}),
	});

	await new Promise((r) => setTimeout(r, 2000));

	onProgress?.("branching");
	const mainRef = await ghJson<{ object: { sha: string } }>(
		`/repos/${username}/${UPSTREAM_REPO}/git/ref/heads/main`,
		token,
	);
	const mainSha = mainRef.object.sha;

	const timestamp = Date.now();
	const branchName = `correction/${mapId}-${timestamp}`;
	await ghJson<{ ref: string }>(`/repos/${username}/${UPSTREAM_REPO}/git/refs`, token, {
		method: "POST",
		body: JSON.stringify({
			ref: `refs/heads/${branchName}`,
			sha: mainSha,
		}),
	});

	onProgress?.("committing");
	const filePath = `maps/${mapId}.json`;
	let fileSha: string | undefined;

	try {
		const existing = await ghJson<{ sha: string }>(
			`/repos/${username}/${UPSTREAM_REPO}/contents/${filePath}?ref=main`,
			token,
		);
		fileSha = existing.sha;
	} catch {
		// File doesn't exist yet — new map
	}

	const content = btoa(unescape(encodeURIComponent(JSON.stringify(map, null, 2))));
	await ghJson<{ commit: { sha: string } }>(
		`/repos/${username}/${UPSTREAM_REPO}/contents/${filePath}`,
		token,
		{
			method: "PUT",
			body: JSON.stringify({
				message: `fix(map): corrections for ${mapId}`,
				content,
				branch: branchName,
				...(fileSha ? { sha: fileSha } : {}),
			}),
		},
	);

	onProgress?.("opening-pr");
	const prBody = buildPrBody({ map, mapId, entries, playbackAvailable, source });
	const meta = map.metadata;
	const prTitle = `fix(map): ${meta?.title ?? mapId} corrections`;

	const pr = await ghJson<{ html_url: string; number: number }>(
		`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls`,
		token,
		{
			method: "POST",
			body: JSON.stringify({
				title: prTitle,
				body: prBody,
				head: `${username}:${branchName}`,
				base: "main",
			}),
		},
	);

	onProgress?.("done");

	return {
		prUrl: pr.html_url,
		prNumber: pr.number,
	};
}
