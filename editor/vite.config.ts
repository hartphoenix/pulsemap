import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	base: "/pulsemap/editor/",
	plugins: [react()],
	resolve: {
		alias: [
			{
				find: "pulsemap/sdk/adapters/youtube",
				replacement: path.resolve(__dirname, "../sdk/adapters/youtube-embed.ts"),
			},
			{
				find: "pulsemap/sdk/adapters/types",
				replacement: path.resolve(__dirname, "../sdk/adapters/types.ts"),
			},
			{
				find: "pulsemap/sdk",
				replacement: path.resolve(__dirname, "../sdk/index.ts"),
			},
			{
				find: "pulsemap/schema",
				replacement: path.resolve(__dirname, "../schema/map.ts"),
			},
		],
	},
	server: {
		port: 5173,
	},
});
