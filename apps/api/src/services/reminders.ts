/**
 * Reminder scheduling logic.
 *
 * Identifies tasks that need a reminder and enqueues them in BullMQ:
 * - inactive_task:          active tasks with no update in DEFAULT_INACTIVITY_HOURS.
 * - approaching_deadline:   tasks whose deadline string indicates urgency.
 * - stale_work:             blocked tasks sitting idle for too long.
 *
 * Call `scheduleReminders(workspaceId)` from a periodic BullMQ job or a cron.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { DEFAULT_INACTIVITY_HOURS } from "@aicrm/shared";
import { db } from "../db/client.js";
import { tasks, reminders } from "../db/schema.js";
import { remindersQueue } from "../queues/reminders.queue.js";

/** Enqueue a reminder job for a given task + type if none is already pending. */
async function enqueueIfNeeded(
  taskId: string,
  type: "inactive_task" | "approaching_deadline" | "stale_work"
): Promise<void> {
  // Check for an existing pending reminder of this type to avoid duplicates.
  const existing = await db
    .select({ id: reminders.id })
    .from(reminders)
    .where(and(eq(reminders.taskId, taskId), eq(reminders.status, "pending"), eq(reminders.type, type)))
    .limit(1);

  if (existing.length > 0) return; // already queued

  const remindAt = new Date();

  // Insert a reminder record.
  const [reminder] = await db
    .insert(reminders)
    .values({ taskId, remindAt, status: "pending", type })
    .returning();

  if (!reminder) return;

  // Push to BullMQ with a small delay so the DB write is visible.
  await remindersQueue.add(
    type,
    { reminderId: reminder.id, taskId, type },
    { delay: 1_000, attempts: 3, backoff: { type: "exponential", delay: 5_000 } }
  );
}

/**
 * Scan all tasks in a workspace and schedule reminder jobs where needed.
 *
 * @param workspaceId  The workspace to scan.
 */
export async function scheduleReminders(workspaceId: string): Promise<void> {
  const cutoff = new Date(Date.now() - DEFAULT_INACTIVITY_HOURS * 60 * 60 * 1_000);

  // 1. inactive_task — active tasks not updated since the cutoff.
  const inactiveTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.status, "active"),
        lt(tasks.updatedAt, cutoff)
      )
    );

  for (const task of inactiveTasks) {
    await enqueueIfNeeded(task.id, "inactive_task");
  }

  // 2. stale_work — blocked tasks not updated since the cutoff.
  const staleTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.status, "blocked"),
        lt(tasks.updatedAt, cutoff)
      )
    );

  for (const task of staleTasks) {
    await enqueueIfNeeded(task.id, "stale_work");
  }

  // 3. approaching_deadline — tasks that have a deadline keyword suggesting urgency.
  //    For MVP we flag any active/blocked task whose deadline text contains common
  //    urgency markers. A proper date-parser can replace this later.
  const deadlineTasks = await db
    .select({ id: tasks.id, deadline: tasks.deadline })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        sql`${tasks.status} IN ('active', 'blocked')`,
        sql`${tasks.deadline} IS NOT NULL`
      )
    );

  const URGENCY_MARKERS = ["today", "asap", "urgent", "before deployment", "by eod", "immediately"];
  for (const task of deadlineTasks) {
    const dl = (task.deadline ?? "").toLowerCase();
    if (URGENCY_MARKERS.some((m) => dl.includes(m))) {
      await enqueueIfNeeded(task.id, "approaching_deadline");
    }
  }
}
