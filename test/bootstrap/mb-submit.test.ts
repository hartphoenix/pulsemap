import { describe, expect, it } from "bun:test";
import {
	buildRecordingSeedUrl,
	type MbSubmissionInfo,
	renderSubmissionHtml,
} from "../../src/bootstrap/stages/mb-submit";

const info: MbSubmissionInfo = {
	title: "Neon Tide",
	artist: "Låpsley & Friends",
	durationMs: 243_500,
	sourceUrl: "https://soundcloud.com/artist/neon-tide",
	source: "https://soundcloud.com/artist/neon-tide",
};

describe("buildRecordingSeedUrl", () => {
	it("targets the standalone recording form", () => {
		const url = new URL(buildRecordingSeedUrl(info));
		expect(url.origin + url.pathname).toBe("https://musicbrainz.org/recording/create");
	});

	it("seeds name, artist credit, and mm:ss length", () => {
		const url = new URL(buildRecordingSeedUrl(info));
		expect(url.searchParams.get("edit-recording.name")).toBe("Neon Tide");
		expect(url.searchParams.get("edit-recording.artist_credit.names.0.name")).toBe(
			"Låpsley & Friends",
		);
		expect(url.searchParams.get("edit-recording.length")).toBe("4:04"); // 243.5s rounds to 244
	});

	it("attaches the source URL as a relationship target and cites it in the edit note", () => {
		const url = new URL(buildRecordingSeedUrl(info));
		expect(url.searchParams.get("rels.0.target")).toBe(info.sourceUrl);
		expect(url.searchParams.get("edit-recording.edit_note")).toContain(info.sourceUrl as string);
		expect(url.searchParams.get("edit-recording.edit_note")).toContain("PulseMap");
	});

	it("omits absent fields rather than seeding empty strings", () => {
		const url = new URL(buildRecordingSeedUrl({ durationMs: 60_000, source: "/tmp/local.wav" }));
		expect(url.searchParams.has("edit-recording.name")).toBe(false);
		expect(url.searchParams.has("rels.0.target")).toBe(false);
		expect(url.searchParams.get("edit-recording.length")).toBe("1:00");
	});
});

describe("renderSubmissionHtml", () => {
	it("shows every value as text and links the seeded form", () => {
		const seedUrl = buildRecordingSeedUrl(info);
		const html = renderSubmissionHtml(info, seedUrl);
		expect(html).toContain("Neon Tide");
		expect(html).toContain("Låpsley &amp; Friends"); // escaped
		expect(html).toContain("4:04");
		expect(html).toContain(`href="${seedUrl.replace(/&/g, "&amp;")}"`);
		expect(html).toContain("--id");
	});

	it("escapes HTML in metadata", () => {
		const html = renderSubmissionHtml(
			{ ...info, title: '<script>alert("x")</script>' },
			"https://musicbrainz.org/recording/create",
		);
		expect(html).not.toContain("<script>alert");
		expect(html).toContain("&lt;script&gt;");
	});
});
