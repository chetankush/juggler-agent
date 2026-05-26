/**
 * Typed API client for the Fastify backend.
 *
 * Auth: reads the Supabase access token from the browser session and sends it
 * as `Authorization: Bearer <token>` on every request.
 *
 * Base URL: NEXT_PUBLIC_API_BASE_URL (default http://localhost:3001).
 *
 * All types are imported from @aicrm/shared — never redefined here.
 */

import { createClient } from "@/lib/supabase/client";
import type {
  MeResponse,
  Workspace,
  GroupedTasks,
  Task,
  TaskExplanation,
  DiscordIntegrationStatus,
  WorkspaceSettings,
} from "@aicrm/shared";
import type { CreateTaskInput, UpdateTaskInput } from "@aicrm/shared";

// ── Config ─────────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

// ── Typed error ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * A small helper for callers to extract a human-readable toast message.
 * Handles ApiError, network errors, and unknown shapes.
 */
export function getErrorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

// ── Token retrieval ────────────────────────────────────────────────────────

/**
 * Gets the Supabase access token from the current browser session.
 * Returns null if the user is not authenticated.
 */
async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// ── Core fetch wrapper ─────────────────────────────────────────────────────

interface FetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  searchParams?: Record<string, string>;
}

async function apiFetch<T>(
  path: string,
  { method = "GET", body, searchParams }: FetchOptions = {},
): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new ApiError(401, "Not authenticated. Please sign in.");
  }

  const url = new URL(`${BASE_URL}${path}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // ignore parse error — use default message
    }
    throw new ApiError(response.status, message);
  }

  // 204 No Content — return undefined cast to T
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ── API methods ────────────────────────────────────────────────────────────

/**
 * GET /me
 * Bootstraps the web app after auth — upserts the user row, returns
 * user + workspaces.
 */
export async function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/me");
}

/**
 * POST /workspaces
 * Creates a new workspace owned by the current user.
 */
export async function createWorkspace(name: string): Promise<Workspace> {
  return apiFetch<Workspace>("/workspaces", {
    method: "POST",
    body: { name },
  });
}

/**
 * GET /workspaces/:id
 */
export async function getWorkspace(id: string): Promise<Workspace> {
  return apiFetch<Workspace>(`/workspaces/${id}`);
}

/**
 * PATCH /workspaces/:id/settings
 */
export async function updateWorkspaceSettings(
  id: string,
  settings: Partial<WorkspaceSettings>,
): Promise<Workspace> {
  return apiFetch<Workspace>(`/workspaces/${id}/settings`, {
    method: "PATCH",
    body: settings,
  });
}

/**
 * GET /tasks?workspaceId=<uuid>&grouped=true
 */
export async function getTasks(
  workspaceId: string,
  options: { grouped: true },
): Promise<GroupedTasks>;
export async function getTasks(
  workspaceId: string,
  options?: { grouped?: false },
): Promise<Task[]>;
export async function getTasks(
  workspaceId: string,
  options?: { grouped?: boolean },
): Promise<GroupedTasks | Task[]> {
  const params: Record<string, string> = { workspaceId };
  if (options?.grouped) params.grouped = "true";
  return apiFetch<GroupedTasks | Task[]>("/tasks", { searchParams: params });
}

/**
 * POST /tasks
 */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  return apiFetch<Task>("/tasks", {
    method: "POST",
    body: input,
  });
}

/**
 * PATCH /tasks/:id
 */
export async function updateTask(
  id: string,
  patch: UpdateTaskInput,
): Promise<Task> {
  return apiFetch<Task>(`/tasks/${id}`, {
    method: "PATCH",
    body: patch,
  });
}

/**
 * DELETE /tasks/:id
 */
export async function deleteTask(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/tasks/${id}`, { method: "DELETE" });
}

/**
 * POST /tasks/:id/explain
 * Runs repo-RAG. Returns AI explanation — always suggestion only.
 */
export async function explainTask(id: string): Promise<TaskExplanation> {
  return apiFetch<TaskExplanation>(`/tasks/${id}/explain`, {
    method: "POST",
  });
}

/**
 * GET /integrations/discord?workspaceId=<uuid>
 */
export async function getDiscordStatus(
  workspaceId: string,
): Promise<DiscordIntegrationStatus> {
  return apiFetch<DiscordIntegrationStatus>("/integrations/discord", {
    searchParams: { workspaceId },
  });
}

/**
 * DELETE /integrations/discord?workspaceId=<uuid>
 * Unlinks the Discord guild from the workspace.
 */
export async function disconnectDiscord(
  workspaceId: string,
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/integrations/discord", {
    method: "DELETE",
    searchParams: { workspaceId },
  });
}

/**
 * GET /summary?workspaceId=<uuid>[&userId=<uuid>]
 * Returns an AI-generated daily standup summary grouped into
 * completed, pending, and blocker tasks plus a plain-text copy.
 */
export interface StandupResponse {
  done: Task[];
  pending: Task[];
  blockers: Task[];
  text: string;
}

export async function getStandup(
  workspaceId: string,
  userId?: string,
): Promise<StandupResponse> {
  const params: Record<string, string> = { workspaceId };
  if (userId) params.userId = userId;
  return apiFetch<StandupResponse>("/summary", { searchParams: params });
}

// ── Team ───────────────────────────────────────────────────────────────────

export interface TeamMember {
  user: { id: string; email: string; name: string | null; discordId: string | null };
  tasks: Task[];
}

export async function getTeam(workspaceId: string): Promise<TeamMember[]> {
  return apiFetch<TeamMember[]>(`/workspaces/${workspaceId}/team`);
}

export async function linkDiscordId(discordId: string | null): Promise<void> {
  return apiFetch<void>("/me/discord", { method: "PATCH", body: { discordId } });
}

export async function postStandupToDiscord(workspaceId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/summary/post", { method: "POST", body: { workspaceId } });
}
