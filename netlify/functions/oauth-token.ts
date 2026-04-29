/**
 * OAuth token-exchange proxy for the PulseMap Editor.
 *
 * GitHub's /login/oauth/access_token endpoint does not send CORS headers,
 * so a browser app on github.io cannot exchange an authorization code
 * directly. This function does the exchange server-side and returns the
 * token to the editor with a precise Access-Control-Allow-Origin header.
 *
 * Required env: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ALLOWED_ORIGIN
 *   (ALLOWED_ORIGIN may be a comma-separated list, e.g. for localhost dev)
 */

interface ExchangeRequest {
	code?: unknown;
	redirect_uri?: unknown;
}

interface GitHubTokenResponse {
	access_token?: string;
	scope?: string;
	token_type?: string;
	error?: string;
	error_description?: string;
}

function pickAllowedOrigin(requestOrigin: string | undefined, configured: string): string | null {
	const allowed = configured
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (allowed.length === 0) return null;
	if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin;
	return allowed[0];
}

function corsHeaders(origin: string | null): Record<string, string> {
	const headers: Record<string, string> = {
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
	};
	if (origin) headers["Access-Control-Allow-Origin"] = origin;
	return headers;
}

export default async (req: Request): Promise<Response> => {
	const clientId = process.env.GITHUB_CLIENT_ID;
	const clientSecret = process.env.GITHUB_CLIENT_SECRET;
	const allowedOriginEnv = process.env.ALLOWED_ORIGIN ?? "";

	const reqOrigin = req.headers.get("origin") ?? undefined;
	const origin = pickAllowedOrigin(reqOrigin, allowedOriginEnv);
	const cors = corsHeaders(origin);

	if (req.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: cors });
	}

	if (req.method !== "POST") {
		return new Response("Method Not Allowed", { status: 405, headers: cors });
	}

	if (!clientId || !clientSecret) {
		return new Response(
			JSON.stringify({ error: "server_misconfigured" }),
			{ status: 500, headers: { ...cors, "Content-Type": "application/json" } },
		);
	}

	let body: ExchangeRequest;
	try {
		body = (await req.json()) as ExchangeRequest;
	} catch {
		return new Response(
			JSON.stringify({ error: "invalid_json" }),
			{ status: 400, headers: { ...cors, "Content-Type": "application/json" } },
		);
	}

	const code = typeof body.code === "string" ? body.code : null;
	const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : undefined;
	if (!code) {
		return new Response(
			JSON.stringify({ error: "missing_code" }),
			{ status: 400, headers: { ...cors, "Content-Type": "application/json" } },
		);
	}

	const ghRes = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			...(redirectUri ? { redirect_uri: redirectUri } : {}),
		}),
	});

	const data = (await ghRes.json()) as GitHubTokenResponse;

	if (!ghRes.ok || data.error || !data.access_token) {
		return new Response(
			JSON.stringify({
				error: data.error ?? "exchange_failed",
				error_description: data.error_description,
			}),
			{ status: 400, headers: { ...cors, "Content-Type": "application/json" } },
		);
	}

	return new Response(
		JSON.stringify({
			access_token: data.access_token,
			scope: data.scope,
			token_type: data.token_type,
		}),
		{ status: 200, headers: { ...cors, "Content-Type": "application/json" } },
	);
};
