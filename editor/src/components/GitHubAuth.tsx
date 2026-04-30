import { type CSSProperties, useCallback, useEffect, useState } from "react";
import {
	beginOAuth,
	clearToken,
	consumeOAuthError,
	getStoredToken,
	validateToken,
} from "../github/auth";

interface GitHubAuthProps {
	onAuthChange: (token: string | null, login: string | null) => void;
}

export function GitHubAuth({ onAuthChange }: GitHubAuthProps) {
	const [login, setLogin] = useState<string | null>(null);
	const [checking, setChecking] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const oauthError = consumeOAuthError();
		if (oauthError) setError(oauthError);

		const token = getStoredToken();
		if (!token) {
			setChecking(false);
			onAuthChange(null, null);
			return;
		}

		validateToken(token).then((user) => {
			if (user) {
				setLogin(user.login);
				onAuthChange(token, user.login);
			} else {
				clearToken();
				onAuthChange(null, null);
			}
			setChecking(false);
		});
	}, [onAuthChange]);

	const handleSignIn = useCallback(() => {
		setError(null);
		beginOAuth();
	}, []);

	const handleSignOut = useCallback(() => {
		clearToken();
		setLogin(null);
		onAuthChange(null, null);
	}, [onAuthChange]);

	if (checking) {
		return <span style={styles.checking}>...</span>;
	}

	if (login) {
		return (
			<span style={styles.wrapper}>
				<span style={styles.username}>@{login}</span>
				<button type="button" onClick={handleSignOut} style={styles.signOut}>
					Sign out
				</button>
			</span>
		);
	}

	return (
		<span style={styles.wrapper}>
			<button type="button" onClick={handleSignIn} style={styles.signIn}>
				Sign in with GitHub
			</button>
			{error && <span style={styles.error}>{error}</span>}
		</span>
	);
}

const styles: Record<string, CSSProperties> = {
	wrapper: {
		display: "inline-flex",
		alignItems: "center",
		gap: 6,
	},
	checking: {
		fontSize: 12,
		color: "#666",
	},
	username: {
		fontSize: 12,
		color: "#8b949e",
	},
	signIn: {
		padding: "4px 10px",
		background: "#21262d",
		border: "1px solid #363b42",
		borderRadius: 4,
		color: "#c9d1d9",
		fontSize: 12,
		cursor: "pointer",
	},
	signOut: {
		padding: "2px 6px",
		background: "transparent",
		border: "1px solid #363b42",
		borderRadius: 3,
		color: "#8b949e",
		fontSize: 11,
		cursor: "pointer",
	},
	error: {
		fontSize: 11,
		color: "#f85149",
		maxWidth: 240,
	},
};
