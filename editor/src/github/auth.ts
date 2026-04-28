/**
 * GitHub OAuth flow: redirect, token exchange, and token storage.
 *
 * CLIENT_ID and TOKEN_EXCHANGE_URL are placeholders — set them via
 * environment config or replace before deploying.
 */

const CLIENT_ID = ""; // placeholder — set via environment or config
const TOKEN_EXCHANGE_URL = ""; // placeholder — serverless function URL

const TOKEN_KEY = "pulsemap-gh-token";

/** Redirect the user to GitHub's OAuth authorize page. */
export function initiateOAuth(): void {
	const redirectUri = `${window.location.origin}/callback`;
	const url = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(CLIENT_ID)}&scope=public_repo&redirect_uri=${encodeURIComponent(redirectUri)}`;
	window.location.href = url;
}

/** Exchange an OAuth code for an access token via the token exchange endpoint. */
export async function handleCallback(code: string): Promise<string> {
	const res = await fetch(TOKEN_EXCHANGE_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ code }),
	});

	if (!res.ok) {
		throw new Error(`Token exchange failed: ${res.status} ${res.statusText}`);
	}

	const data = (await res.json()) as { access_token?: string };
	if (!data.access_token) {
		throw new Error("Token exchange response missing access_token");
	}
	return data.access_token;
}

/** Read stored token from localStorage. */
export function getStoredToken(): string | null {
	return localStorage.getItem(TOKEN_KEY);
}

/** Persist a token to localStorage. */
export function storeToken(token: string): void {
	localStorage.setItem(TOKEN_KEY, token);
}

/** Remove the stored token. */
export function clearToken(): void {
	localStorage.removeItem(TOKEN_KEY);
}

/** Validate a token by calling GET /user. Returns user info or null if invalid. */
export async function validateToken(token: string): Promise<{ login: string } | null> {
	try {
		const res = await fetch("https://api.github.com/user", {
			headers: { Authorization: `token ${token}` },
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { login: string };
		return data;
	} catch {
		return null;
	}
}
