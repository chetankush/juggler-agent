"use client";

/**
 * AppContext — caches the /me bootstrap so it isn't refetched on every
 * client-side navigation. A single fetch per page-load (or manual refresh).
 *
 * Provider is mounted inside (app)/layout.tsx.
 * Children consume via useAppContext().
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { MeResponse, Workspace } from "@aicrm/shared";
import { getMe, getErrorMessage } from "@/lib/api";

// ── State shape ─────────────────────────────────────────────────────────────

type LoadingState = "idle" | "loading" | "ready" | "error";

interface AppContextValue {
  meResponse: MeResponse | null;
  currentWorkspace: Workspace | null;
  loadingState: LoadingState;
  error: string | null;
  /** Switch the active workspace (client-side only; persisted in sessionStorage) */
  setCurrentWorkspace: (workspace: Workspace) => void;
  /** Force a re-fetch of /me (e.g. after workspace creation) */
  refresh: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

const SESSION_KEY = "aicrm:currentWorkspaceId";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [meResponse, setMeResponse] = useState<MeResponse | null>(null);
  const [currentWorkspace, setCurrentWorkspaceState] =
    useState<Workspace | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [error, setError] = useState<string | null>(null);

  // Guard against running the fetch more than once on strict-mode double-mount
  const fetchedRef = useRef(false);

  const fetchMe = useCallback(async () => {
    setLoadingState("loading");
    setError(null);
    try {
      const data = await getMe();
      setMeResponse(data);

      // Resolve the current workspace:
      // 1. Try to restore from sessionStorage (workspace the user had active)
      // 2. Fall back to the API's currentWorkspace
      // 3. Fall back to the first workspace
      const storedId =
        typeof window !== "undefined"
          ? sessionStorage.getItem(SESSION_KEY)
          : null;

      const resolved =
        (storedId
          ? data.workspaces.find((w) => w.id === storedId)
          : null) ??
        data.currentWorkspace ??
        data.workspaces[0] ??
        null;

      setCurrentWorkspaceState(resolved);
      setLoadingState("ready");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load your account."));
      setLoadingState("error");
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchMe();
  }, [fetchMe]);

  const setCurrentWorkspace = useCallback((workspace: Workspace) => {
    setCurrentWorkspaceState(workspace);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(SESSION_KEY, workspace.id);
    }
  }, []);

  const refresh = useCallback(async () => {
    fetchedRef.current = false;
    await fetchMe();
    fetchedRef.current = true;
  }, [fetchMe]);

  return (
    <AppContext.Provider
      value={{
        meResponse,
        currentWorkspace,
        loadingState,
        error,
        setCurrentWorkspace,
        refresh,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used inside <AppProvider>");
  }
  return ctx;
}
