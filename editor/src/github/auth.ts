/**
 * GitHub OAuth web flow.
 *
 * GitHub's /login/oauth/access_token endpoint doesn't send CORS headers,
 * so the code-for-token exchange goes through a small Netlify Function
 * proxy. The browser only handles the redirect to GitHub and the return.
 *
 * Flow:
 * 1. beginOAuth() — generates a CSRF state, stashes it + the current URL
 *    in sessionStorage, redirects to github.com/login/oauth/authorize.
 * 2. GitHub redirects back to redirect_uri with ?code=&state=.
 * 3. handleOAuthCallback() — runs at app boot, verifies state, calls the
 *    proxy to exchange code for token, stores token, restores the
 *    pre-auth URL, and strips the OAuth params.
 */

const CLIENT_ID = "Ov23liuBjPclnX0rAr1s";
const TOKEN_KEY = "pulsemap-gh-token";
const STATE_KEY = "pulsemap-oauth-state";
const RETURN_URL_KEY = "pulsemap-oauth-return-url";
const ERROR_KEY = "pulsemap-oauth-error";
const REDIRECT_URI = "https://hartphoenix.github.io/pulsemap/editor/";

const PROXY_URL =
	(import.meta.env?.VITE_OAUTH_PROXY_URL as string | undefined) ??
	"https://pulsemap-editor.netlify.app";

function randomState(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Redirect to GitHub to begin the OAuth web flow. */
export function beginOAuth(): void {
	const state = randomState();
	sessionStorage.setItem(STATE_KEY, state);
	sessionStorage.setItem(
		RETURN_URL_KEY,
		window.location.pathname + window.location.search + window.location.hash,
	);

	const authUrl = new URL("https://github.com/login/oauth/authorize");
	authUrl.searchParams.set("client_id", CLIENT_ID);
	authUrl.searchParams.set("scope", "public_repo");
	authUrl.searchParams.set("state", state);
	authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
	window.location.assign(authUrl.toString());
}

/**
 * If the current URL is an OAuth callback (has ?code=&state=), verify
 * the state, exchange the code for a token, persist it, and restore the
 * pre-auth URL. Returns true if a callback was handled (whether or not
 * it succeeded). Safe to call when there's no callback in the URL.
 *
 * Should run before React mounts so the URL is clean when the editor
 * reads its deep-link params.
 */
export async function handleOAuthCallback(): Promise<boolean> {
	const params = new URLSearchParams(window.location.search);
	const code = params.get("code");
	const state = params.get("state");
	if (!code || !state) return false;

	const expected = sessionStorage.getItem(STATE_KEY);
	const returnUrl = sessionStorage.getItem(RETURN_URL_KEY);
	sessionStorage.removeItem(STATE_KEY);
	sessionStorage.removeItem(RETURN_URL_KEY);

	const restore = () => {
		const target = returnUrl ?? window.location.pathname + window.location.hash;
		window.history.replaceState(null, "", target);
	};

	const surfaceError = (message: string) => {
		sessionStorage.setItem(ERROR_KEY, message);
	};

	if (!expected || expected !== state) {
		surfaceError("Sign-in state didn't match — please try again.");
		restore();
		return true;
	}

	try {
		const res = await fetch(`${PROXY_URL}/oauth/token`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
		});
		if (res.ok) {
			const data = (await res.json()) as { access_token?: string };
			if (data.access_token) {
				localStorage.setItem(TOKEN_KEY, data.access_token);
			} else {
				surfaceError("Sign-in failed: no token returned. Please try again.");
			}
		} else {
			let detail = `${res.status}`;
			try {
				const body = (await res.json()) as { error?: string; error_description?: string };
				if (body.error_description) detail = body.error_description;
				else if (body.error) detail = body.error;
			} catch {
				// non-JSON body — keep the status code as the detail
			}
			surfaceError(`Sign-in failed: ${detail}`);
		}
	} catch (err) {
		const detail = err instanceof Error ? err.message : "network error";
		surfaceError(`Sign-in failed: ${detail}`);
	}

	restore();
	return true;
}

/** Read and clear any pending OAuth error stashed by handleOAuthCallback. */
export function consumeOAuthError(): string | null {
	const msg = sessionStorage.getItem(ERROR_KEY);
	if (msg) sessionStorage.removeItem(ERROR_KEY);
	return msg;
}

/** Read stored token from localStorage. */
export function getStoredToken(): string | null {
	return localStorage.getItem(TOKEN_KEY);
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
