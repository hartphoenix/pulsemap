import type { PulseMap } from "pulsemap/schema";
import { createContext, type ReactNode, useContext, useEffect, useReducer } from "react";
import { createInitialState, editorReducer } from "./reducer";
import type { EditorDispatchAction, EditorState } from "./types";

interface EditorContextValue {
	state: EditorState;
	dispatch: (action: EditorDispatchAction) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

interface EditorProviderProps {
	map: PulseMap;
	children: ReactNode;
}

export function EditorProvider({ map, children }: EditorProviderProps) {
	const [state, dispatch] = useReducer(editorReducer, map, createInitialState);

	// Re-initialize when the source map changes (different map loaded)
	useEffect(() => {
		dispatch({ type: "load", map });
	}, [map]);

	return <EditorContext.Provider value={{ state, dispatch }}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorContextValue {
	const ctx = useContext(EditorContext);
	if (!ctx) {
		throw new Error("useEditor must be used within an EditorProvider");
	}
	return ctx;
}
