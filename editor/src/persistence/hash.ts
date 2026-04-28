/** SHA-256 hash of a PulseMap via crypto.subtle */
import type { PulseMap } from "pulsemap/schema";

export async function hashMap(map: PulseMap): Promise<string> {
	const data = new TextEncoder().encode(JSON.stringify(map));
	const buffer = await crypto.subtle.digest("SHA-256", data);
	const bytes = new Uint8Array(buffer);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
