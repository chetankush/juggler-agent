import { z } from "zod";

export const prioritySchema = z.enum(["low", "medium", "high"]);
export const taskStatusSchema = z.enum(["active", "blocked", "completed"]);
export const reminderStatusSchema = z.enum(["pending", "sent", "cancelled"]);
export const reminderTypeSchema = z.enum([
  "inactive_task",
  "approaching_deadline",
  "stale_work",
]);

/**
 * Structured output contract for AI task extraction.
 * Input: a raw Discord mention. Output: this shape.
 */
export const taskExtractionSchema = z.object({
  title: z.string().min(1),
  priority: prioritySchema.default("medium"),
  /** Natural language allowed ("before deployment") or null if none. */
  deadline: z.string().nullable().default(null),
  summary: z.string().min(1),
});
export type TaskExtraction = z.infer<typeof taskExtractionSchema>;

/** Payload to create a task from an extracted Discord message. */
export const createTaskSchema = z.object({
  workspaceId: z.string().uuid(),
  assignedUserId: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: prioritySchema.default("medium"),
  deadline: z.string().nullable().optional(),
  status: taskStatusSchema.default("active"),
  sourceMessage: z.string().nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Payload to update a task (e.g. status change from the sidebar). */
export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: prioritySchema.optional(),
  deadline: z.string().nullable().optional(),
  status: taskStatusSchema.optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** Output contract for the "Explain Task" RAG call. */
export const taskExplanationSchema = z.object({
  likelyIssue: z.string(),
  relevantFiles: z.array(z.string()),
  suggestedApproach: z.string(),
});

/** A single repo chunk to embed and store. */
export const repoChunkSchema = z.object({
  workspaceId: z.string().uuid(),
  filePath: z.string(),
  chunkText: z.string().min(1),
});
export type RepoChunk = z.infer<typeof repoChunkSchema>;

/** Per-workspace settings payload (PATCH /workspaces/:id/settings). */
export const workspaceSettingsSchema = z.object({
  reminderCadenceHours: z.number().int().min(1).max(24),
  workingHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24h)"),
  workingHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24h)"),
  defaultModel: z.string().min(1),
});

/** Create-workspace payload (POST /workspaces). */
export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
