import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { clearToken, getStoredToken, initiateOAuth, validateToken } from "../github/auth";

interface GitHubAuthProps {
	onAuthChange: (token: string | null, login: string | null) => void;
}

export function GitHubAuth({ onAuthChange }: GitHubAuthProps) {
	const [login, setLogin] = useState<string | null>(null);
	const [checking, setChecking] = useState(true);

	// Validate stored token on mount
	useEffect(() => {
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
				// Token expired or revoked
				clearToken();
				onAuthChange(null, null);
			}
			setChecking(false);
		});
	}, [onAuthChange]);

	const handleSignIn = useCallback(() => {
		initiateOAuth();
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
		<button type="button" onClick={handleSignIn} style={styles.signIn}>
			Sign in with GitHub
		</button>
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
};
