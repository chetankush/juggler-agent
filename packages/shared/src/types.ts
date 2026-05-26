/** Task priority levels. */
export type Priority = "low" | "medium" | "high";

/** Lifecycle status of a task. */
export type TaskStatus = "active" | "blocked" | "completed";

/** Lifecycle status of a reminder. */
export type ReminderStatus = "pending" | "sent" | "cancelled";

/** Reasons a reminder may fire. */
export type ReminderType = "inactive_task" | "approaching_deadline" | "stale_work";

/** A user (mirrors the `users` table). */
export interface User {
  id: string;
  email: string;
  name: string | null;
  /** Discord user id — set when the user links their Discord identity. */
  discordId: string | null;
}

/** Per-workspace configurable settings (stored as JSONB on `workspaces`). */
export interface WorkspaceSettings {
  /** Hours of inactivity before a reminder nudge (1–24). */
  reminderCadenceHours: number;
  /** Working hours start, "HH:MM" 24h. Reminders are throttled outside these. */
  workingHoursStart: string;
  /** Working hours end, "HH:MM" 24h. */
  workingHoursEnd: string;
  /** OpenRouter chat model id, e.g. "google/gemini-flash-1.5". */
  defaultModel: string;
}

/** A workspace (mirrors the `workspaces` table). */
export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  settings: WorkspaceSettings;
}

/** A task (mirrors the `tasks` table, app-facing camelCase). */
export interface Task {
  id: string;
  workspaceId: string;
  assignedUserId: string | null;
  title: string;
  description: string | null;
  priority: Priority;
  /** Natural-language allowed, e.g. "before deployment". */
  deadline: string | null;
  status: TaskStatus;
  sourceMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A reminder (mirrors the `reminders` table). */
export interface Reminder {
  id: string;
  taskId: string;
  remindAt: string;
  status: ReminderStatus;
  type: ReminderType;
}

/** Tasks grouped by status — the shape the extension sidebar renders. */
export interface GroupedTasks {
  active: Task[];
  blocked: Task[];
  completed: Task[];
}

/** Result of the "Explain Task" RAG call. AI only suggests. */
export interface TaskExplanation {
  likelyIssue: string;
  relevantFiles: string[];
  suggestedApproach: string;
}

/** Response of `GET /me` — bootstraps the web app after auth. */
export interface MeResponse {
  user: User;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
}

/** Discord connection state for a workspace (`GET /integrations/discord`). */
export interface DiscordIntegrationStatus {
  connected: boolean;
  guildName: string | null;
  channelName: string | null;
  /** Bot-invite URL (built from DISCORD_CLIENT_ID); null if not configured. */
  inviteUrl: string | null;
}
