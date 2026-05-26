/**
 * api.ts — typed HTTP client for the AI Sync Copilot Fastify backend.
 *
 * All requests carry a Bearer JWT from SecretStorage (via auth.getToken).
 * Node 20+ global `fetch` is used — no additional HTTP library needed.
 */

import * as vscode from "vscode";
import type { GroupedTasks, TaskExplanation, MeResponse } from "@aicrm/shared";
import type { UpdateTaskInput, RepoChunk } from "@aicrm/shared";
import { getToken } from "./auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiBase(): string {
  return vscode.workspace
    .getConfiguration("aicrm")
    .get<string>("apiBaseUrl", "http://localhost:3001");
}

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  if (!token) {
    throw new ApiError(401, "Not authenticated — please sign in first.");
  }

  const url = `${getApiBase()}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ApiError(
      response.status,
      `API ${response.status} on ${path}: ${body}`
    );
  }

  // 204 No Content — return an empty object cast to T
  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Cached current workspace id (resolved from /me). */
let cachedWorkspaceId: string | null = null;

/** Resolve (and cache) the current user's workspace id via /me. */
export async function getWorkspaceId(): Promise<string> {
  if (cachedWorkspaceId) return cachedWorkspaceId;
  const me = await request<MeResponse>("/me");
  const ws = me.currentWorkspace ?? me.workspaces[0] ?? null;
  if (!ws) {
    throw new ApiError(
      404,
      "No workspace found. Create one in the web app first."
    );
  }
  cachedWorkspaceId = ws.id;
  return ws.id;
}

/** Clear the cached workspace (call on sign-out). */
export function clearWorkspaceCache(): void {
  cachedWorkspaceId = null;
}

/**
 * Fetch all tasks grouped by status for the current user's workspace.
 */
export async function getTasks(): Promise<GroupedTasks> {
  const workspaceId = await getWorkspaceId();
  return request<GroupedTasks>(
    `/tasks?workspaceId=${encodeURIComponent(workspaceId)}&grouped=true`
  );
}

/**
 * Partially update a task (e.g. change status, mark complete/blocked).
 */
export async function updateTask(
  id: string,
  patch: UpdateTaskInput
): Promise<void> {
  await request<unknown>(`/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/**
 * Request an AI-powered explanation for a task.
 * Returns the structured TaskExplanation (likelyIssue, relevantFiles, suggestedApproach).
 */
export async function explainTask(id: string): Promise<TaskExplanation> {
  return request<TaskExplanation>(`/tasks/${id}/explain`, { method: "POST" });
}

/**
 * POST repo chunks to the backend /embeddings endpoint for pgvector storage.
 * Called by the repo scanner in batches.
 */
export async function postChunks(chunks: RepoChunk[]): Promise<void> {
  await request<unknown>("/embeddings", {
    method: "POST",
    body: JSON.stringify({ chunks }),
  });
}
