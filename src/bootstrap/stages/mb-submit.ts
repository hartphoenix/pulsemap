import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * MusicBrainz identity fallback for tracks AcoustID can't resolve
 * (common for SoundCloud-native indie releases).
 *
 * MusicBrainz has no write API for entity creation, but its entity
 * forms officially support seeding via GET parameters matching the
 * form inputs' name attributes (see
 * https://musicbrainz.org/doc/Development/Seeding — "Add Standalone
 * Recording" is listed as seedable). We generate a prefilled
 * /recording/create link; a human reviews and clicks submit. The
 * MBID exists the instant the form is submitted — the 7-day vote
 * only decides whether the entity stays.
 *
 * After the human reruns the pipeline with --id <mbid>, the
 * AcoustID submission step (below) associates the fingerprint with
 * the new MBID so every future lookup of this track resolves
 * automatically.
 */

export interface MbSubmissionInfo {
	title?: string;
	artist?: string;
	durationMs: number;
	sourceUrl?: string;
	/** The original bootstrap CLI source argument, for the rerun command. */
	source: string;
}

function formatLength(ms: number): string {
	const totalSec = Math.round(ms / 1000);
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	return `${min}:${String(sec).padStart(2, "0")}`;
}

const EDIT_NOTE =
	"Standalone recording added for PulseMap (https://github.com/hartphoenix/pulsemap), " +
	"an open protocol for structural maps of recordings. " +
	"AcoustID fingerprint lookup found no existing MusicBrainz recording for this track.";

/**
 * Build a seeded MusicBrainz "Add Standalone Recording" URL.
 *
 * Field names mirror the form's input name attributes. Unrecognized
 * parameters are ignored by the form, so the generated HTML also
 * shows every value as copy-paste text — worst case the human fills
 * a field manually.
 */
export function buildRecordingSeedUrl(info: MbSubmissionInfo): string {
	const params = new URLSearchParams();
	if (info.title) params.set("edit-recording.name", info.title);
	if (info.artist) params.set("edit-recording.artist_credit.names.0.name", info.artist);
	if (info.artist) params.set("edit-recording.artist_credit.names.0.artist.name", info.artist);
	params.set("edit-recording.length", formatLength(info.durationMs));
	let note = EDIT_NOTE;
	if (info.sourceUrl) {
		params.set("rels.0.target", info.sourceUrl);
		note += ` Source: ${info.sourceUrl}`;
	}
	params.set("edit-recording.edit_note", note);
	return `https://musicbrainz.org/recording/create?${params.toString()}`;
}

function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function renderSubmissionHtml(info: MbSubmissionInfo, seedUrl: string): string {
	const rows: Array<[string, string]> = [
		["Title", info.title ?? "(unknown — fill in manually)"],
		["Artist", info.artist ?? "(unknown — fill in manually)"],
		["Length", formatLength(info.durationMs)],
		["Source URL", info.sourceUrl ?? "(local file)"],
	];
	const tableRows = rows
		.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`)
		.join("\n      ");
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>MusicBrainz submission — ${esc(info.title ?? "unknown track")}</title>
<style>
  body { font-family: ui-monospace, Menlo, monospace; background: #14161a; color: #d7dae0; max-width: 720px; margin: 40px auto; padding: 0 16px; }
  a.button { display: inline-block; background: #ba478f; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none; margin: 16px 0; }
  table { border-collapse: collapse; margin: 12px 0; }
  td { padding: 4px 12px 4px 0; border-bottom: 1px solid #2b2f36; }
  td.k { color: #9aa3af; }
  ol li { margin: 8px 0; }
  code { background: #1d2026; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
<h1>Register this recording on MusicBrainz</h1>
<p>AcoustID found no existing MusicBrainz recording for this track.
Review the prefilled form, adjust anything the seed missed, and submit.
The MBID exists immediately on submission.</p>
<table>
      ${tableRows}
</table>
<a class="button" href="${esc(seedUrl)}">Open prefilled MusicBrainz form →</a>
<ol>
  <li>Submit the form (log in if prompted; check any field the seed missed).</li>
  <li>Copy the new recording MBID from the resulting page URL:<br>
      <code>musicbrainz.org/recording/&lt;MBID&gt;</code></li>
  <li>Rerun the pipeline with the MBID:<br>
      <code>bun run bootstrap "${esc(info.source)}" --id &lt;MBID&gt;</code></li>
</ol>
<p>On the rerun, the pipeline submits the Chromaprint fingerprint to
AcoustID (needs <code>ACOUSTID_USER_KEY</code>) so future lookups of
this track resolve automatically.</p>
</body>
</html>
`;
}

function slugify(s: string): string {
	return (
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "unknown"
	);
}

/** Write the submission HTML into `dir` and return its path. */
export async function writeMbSubmission(dir: string, info: MbSubmissionInfo): Promise<string> {
	await mkdir(dir, { recursive: true });
	const slug = slugify([info.artist, info.title].filter(Boolean).join("-") || "unknown");
	const path = join(dir, `mb-submit-${slug}.html`);
	await Bun.write(path, renderSubmissionHtml(info, buildRecordingSeedUrl(info)));
	return path;
}

export interface AcoustIdSubmitOptions {
	/** AcoustID application key (same one the lookup uses). */
	clientKey: string;
	/** AcoustID *user* key, from https://acoustid.org/api-key. */
	userKey: string;
	chromaprint: string;
	durationMs: number;
	mbid: string;
}

/**
 * Submit a fingerprint→MBID association to AcoustID. This is what
 * closes the loop after a manual MusicBrainz registration: once the
 * association is indexed (usually within minutes), the standard
 * lookup resolves this track for everyone.
 */
export async function submitAcoustId(opts: AcoustIdSubmitOptions): Promise<void> {
	const body = new URLSearchParams({
		client: opts.clientKey,
		user: opts.userKey,
		"duration.0": String(Math.round(opts.durationMs / 1000)),
		"fingerprint.0": opts.chromaprint,
		"mbid.0": opts.mbid,
	});
	const res = await fetch("https://api.acoustid.org/v2/submit", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});
	if (!res.ok) {
		throw new Error(`AcoustID submit failed: ${res.status} ${res.statusText}`);
	}
	const data = (await res.json()) as { status?: string; error?: { message?: string } };
	if (data.status !== "ok") {
		throw new Error(`AcoustID submit rejected: ${data.error?.message ?? "unknown error"}`);
	}
}
