/**
 * GitHub OAuth device flow: no server-side token exchange needed.
 *
 * Flow:
 * 1. POST /login/device/code → get device_code, user_code, verification_uri
 * 2. Show user the code and link
 * 3. Poll /login/oauth/access_token until user authorizes
 */

const CLIENT_ID = "Ov23li12vkglROrSw2N1";

const TOKEN_KEY = "pulsemap-gh-token";

export interface DeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	expires_in: number;
	interval: number;
}

/** Request a device code from GitHub. */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
	const res = await fetch("https://github.com/login/device/code", {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			client_id: CLIENT_ID,
			scope: "public_repo",
		}),
	});

	if (!res.ok) {
		throw new Error(`Device code request failed: ${res.status}`);
	}

	return (await res.json()) as DeviceCodeResponse;
}

/**
 * Poll for the access token after user enters the device code.
 * Resolves with the token when authorized, rejects on expiry or denial.
 */
export async function pollForToken(deviceCode: string, interval: number): Promise<string> {
	const pollInterval = Math.max(interval, 5) * 1000;

	while (true) {
		await new Promise((r) => setTimeout(r, pollInterval));

		const res = await fetch("https://github.com/login/oauth/access_token", {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				client_id: CLIENT_ID,
				device_code: deviceCode,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			}),
		});

		if (!res.ok) continue;

		const data = (await res.json()) as {
			access_token?: string;
			error?: string;
		};

		if (data.access_token) {
			return data.access_token;
		}

		if (data.error === "authorization_pending") continue;
		if (data.error === "slow_down") {
			await new Promise((r) => setTimeout(r, 5000));
			continue;
		}
		if (data.error === "expired_token") {
			throw new Error("Device code expired. Please try again.");
		}
		if (data.error === "access_denied") {
			throw new Error("Authorization denied by user.");
		}

		throw new Error(`Unexpected error: ${data.error}`);
	}
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
