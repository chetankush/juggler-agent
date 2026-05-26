/**
 * Standup Summary service.
 *
 * Pulls the current task state for a user + workspace and produces a
 * human-readable standup summary (done / pending / blockers).
 */
import { and, eq } from "drizzle-orm";
import type { Task } from "@aicrm/shared";
import { db } from "../db/client.js";
import { tasks } from "../db/schema.js";

export interface StandupSummary {
  done: Task[];
  pending: Task[];
  blockers: Task[];
  text: string;
}

/**
 * Generate a standup summary for a user in a workspace.
 *
 * @param userId       The user whose tasks to summarise.
 * @param workspaceId  Scope to this workspace.
 * @returns            Grouped tasks + a plain-text summary string.
 */
export async function generateStandup(
  workspaceId: string,
  userId?: string
): Promise<StandupSummary> {
  const rows = await db
    .select()
    .from(tasks)
    .where(
      userId
        ? and(eq(tasks.workspaceId, workspaceId), eq(tasks.assignedUserId, userId))
        : eq(tasks.workspaceId, workspaceId)
    );

  // Map DB rows to the shared Task interface (camelCase).
  const toTask = (row: typeof rows[number]): Task => ({
    id: row.id,
    workspaceId: row.workspaceId,
    assignedUserId: row.assignedUserId ?? null,
    title: row.title,
    description: row.description ?? null,
    priority: row.priority as Task["priority"],
    deadline: row.deadline ?? null,
    status: row.status as Task["status"],
    sourceMessage: row.sourceMessage ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

  const done = rows.filter((r) => r.status === "completed").map(toTask);
  const blockers = rows.filter((r) => r.status === "blocked").map(toTask);
  const pending = rows.filter((r) => r.status === "active").map(toTask);

  // Build plain-text summary.
  const lines: string[] = ["=== Daily Standup ==="];

  if (done.length > 0) {
    lines.push("\nCompleted:");
    done.forEach((t) => lines.push(`  ✓ ${t.title}`));
  } else {
    lines.push("\nCompleted: (none)");
  }

  if (pending.length > 0) {
    lines.push("\nIn Progress:");
    pending.forEach((t) => {
      const deadline = t.deadline ? ` [deadline: ${t.deadline}]` : "";
      lines.push(`  • [${t.priority}] ${t.title}${deadline}`);
    });
  } else {
    lines.push("\nIn Progress: (none)");
  }

  if (blockers.length > 0) {
    lines.push("\nBlockers:");
    blockers.forEach((t) => lines.push(`  ⚠ ${t.title}`));
  } else {
    lines.push("\nBlockers: (none)");
  }

  return { done, pending, blockers, text: lines.join("\n") };
}
