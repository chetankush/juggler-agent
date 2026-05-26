/**
 * BullMQ Reminders queue + worker.
 *
 * The worker picks up reminder jobs, marks the reminder as "sent" in the DB,
 * and (when a Discord client is available) sends a DM or channel message.
 * Queue name comes from the shared QUEUES constant.
 */
import { Queue, Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { QUEUES } from "@aicrm/shared";
import { redis } from "../lib/redis.js";
import { db } from "../db/client.js";
import { reminders, tasks } from "../db/schema.js";

export interface ReminderJobData {
  reminderId: string;
  taskId: string;
  type: "inactive_task" | "approaching_deadline" | "stale_work";
}

// ── Queue ─────────────────────────────────────────────────────────────────────
export const remindersQueue = new Queue<ReminderJobData>(QUEUES.reminders, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100, // keep the last 100 completed jobs for observability
    removeOnFail: 200,
  },
});

// ── Worker ────────────────────────────────────────────────────────────────────
async function processReminder(job: Job<ReminderJobData>): Promise<void> {
  const { reminderId, taskId, type } = job.data;

  // Fetch task for message content.
  const [task] = await db
    .select({ title: tasks.title, assignedUserId: tasks.assignedUserId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) {
    console.warn(`Reminder ${reminderId}: task ${taskId} not found — skipping.`);
    return;
  }

  // Build a human-readable reminder message.
  const messages: Record<ReminderJobData["type"], string> = {
    inactive_task: `⏰ Reminder: Task "${task.title}" has been inactive. Please update its status.`,
    approaching_deadline: `🔥 Urgent: Task "${task.title}" has an approaching deadline!`,
    stale_work: `🚧 Task "${task.title}" is blocked and hasn't been updated in a while. Any progress?`,
  };

  const message = messages[type];
  console.log(`[reminders] Sending reminder (${type}) for task "${task.title}": ${message}`);

  // TODO: send via Discord DM using the bot client. The Discord module is
  // imported lazily to avoid circular deps; wire it once the bot is running.
  // Example: await discordBot.users.fetch(userId).then(u => u.send(message));

  // Mark reminder as sent.
  await db
    .update(reminders)
    .set({ status: "sent" })
    .where(eq(reminders.id, reminderId));
}

let remindersWorker: Worker<ReminderJobData> | null = null;

/** Start the reminders BullMQ worker. Call once at server startup. */
export function startRemindersWorker(): void {
  if (remindersWorker) return; // idempotent

  remindersWorker = new Worker<ReminderJobData>(QUEUES.reminders, processReminder, {
    connection: redis,
    concurrency: 5,
  });

  remindersWorker.on("completed", (job) => {
    console.log(`[reminders] Job ${job.id} completed.`);
  });

  remindersWorker.on("failed", (job, err) => {
    console.error(`[reminders] Job ${job?.id} failed:`, err.message);
  });

  console.log("Reminders worker started.");
}
