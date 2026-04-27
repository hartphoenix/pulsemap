import { readdir } from "node:fs/promises";
import { join } from "node:path";

interface MapIndex {
	path: string;
	title: string;
	artist: string;
	id: string;
}

async function buildMapIndex(): Promise<MapIndex[]> {
	const maps: MapIndex[] = [];
	try {
		const files = await readdir("maps");
		for (const file of files.filter((f) => f.endsWith(".json"))) {
			try {
				const data = await Bun.file(join("maps", file)).json();
				maps.push({
					path: `maps/${file}`,
					title: data.metadata?.title || file,
					artist: data.metadata?.artist || "Unknown",
					id: data.id || file,
				});
			} catch {
				/* skip invalid files */
			}
		}
	} catch {
		/* no maps directory */
	}
	return maps.sort((a, b) => a.title.localeCompare(b.title));
}

const server = Bun.serve({
	port: 3333,
	async fetch(req) {
		const url = new URL(req.url);
		let path = url.pathname;

		if (path === "/") path = "/tools/map-inspector.html";

		if (path === "/api/maps") {
			const index = await buildMapIndex();
			return new Response(JSON.stringify(index), {
				headers: { "Content-Type": "application/json" },
			});
		}

		const filePath = `.${path}`;
		const file = Bun.file(filePath);

		if (await file.exists()) {
			const ext = filePath.split(".").pop();
			const types: Record<string, string> = {
				html: "text/html",
				js: "application/javascript",
				css: "text/css",
				json: "application/json",
				mid: "audio/midi",
				svg: "image/svg+xml",
			};
			return new Response(file, {
				headers: { "Content-Type": types[ext || ""] || "application/octet-stream" },
			});
		}

		return new Response("Not found", { status: 404 });
	},
});

console.log(`Map Inspector: http://localhost:${server.port}`);
console.log("Serving from project root. Maps auto-populate in the dropdown.");
