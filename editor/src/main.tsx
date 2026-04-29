import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { handleOAuthCallback } from "./github/auth";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

handleOAuthCallback().finally(() => {
	createRoot(rootEl).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
});
