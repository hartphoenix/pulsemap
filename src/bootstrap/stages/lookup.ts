export interface RecordingLookup {
	id: string;
	title?: string;
	artist?: string;
	album?: string;
	score: number;
}

export async function lookupRecording(
	chromaprint: string,
	durationMs: number,
	apiKey?: string,
): Promise<RecordingLookup> {
	const key = apiKey || process.env.ACOUSTID_API_KEY;
	if (!key) {
		throw new Error(
			"AcoustID API key required. Set ACOUSTID_API_KEY env var " +
				"or register at https://acoustid.org/new-application",
		);
	}

	const durationSec = Math.round(durationMs / 1000);
	const url = new URL("https://api.acoustid.org/v2/lookup");
	url.searchParams.set("client", key);
	url.searchParams.set("fingerprint", chromaprint);
	url.searchParams.set("duration", String(durationSec));
	url.searchParams.set("meta", "recordings releasegroups");

	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`AcoustID API error: ${res.status} ${res.statusText}`);
	}

	const data = (await res.json()) as AcoustIdResponse;

	if (data.status !== "ok" || !data.results?.length) {
		throw new Error("No AcoustID match found for this recording.");
	}

	for (const result of data.results) {
		if (!result.recordings?.length) continue;

		const recording = result.recordings[0];
		const releaseGroup = recording.releasegroups?.[0];

		return {
			id: recording.id,
			title: recording.title,
			artist: recording.artists?.map((a: { name: string }) => a.name).join(", "),
			album: releaseGroup?.title,
			score: result.score,
		};
	}

	throw new Error("AcoustID matched but no MusicBrainz recording found.");
}

interface AcoustIdResponse {
	status: string;
	results?: Array<{
		score: number;
		recordings?: Array<{
			id: string;
			title?: string;
			artists?: Array<{ name: string }>;
			releasegroups?: Array<{ title?: string }>;
		}>;
	}>;
}
