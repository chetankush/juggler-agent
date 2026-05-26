/**
 * Task routes.
 *
 * GET  /tasks?workspaceId=<uuid>[&grouped=true]  — list tasks (flat or grouped by status)
 * POST /tasks                                    — create a task (createTaskSchema)
 * PATCH /tasks/:id                               — update a task (updateTaskSchema)
 * DELETE /tasks/:id                              — delete a task
 * POST /tasks/:id/explain                        — explain a task via RAG
 */
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import {
  createTaskSchema,
  updateTaskSchema,
  type Task,
  type GroupedTasks,
} from "@aicrm/shared";
import { db } from "../db/client.js";
import { tasks } from "../db/schema.js";
import { verifyAuth } from "../lib/auth.js";
import { explainTask } from "../services/explain.js";

/** Map a DB row to the shared Task interface. */
function toTask(row: typeof tasks.$inferSelect): Task {
  return {
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
  };
}

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  // All task routes require auth.
  app.addHook("preHandler", verifyAuth);

  // ── GET /tasks ──────────────────────────────────────────────────────────────
  app.get<{
    Querystring: { workspaceId?: string; grouped?: string };
  }>("/tasks", async (request, reply) => {
    const { workspaceId, grouped } = request.query;

    if (!workspaceId) {
      return reply.status(400).send({ error: "workspaceId query param is required." });
    }

    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId));

    const taskList = rows.map(toTask);

    if (grouped === "true") {
      const groupedTasks: GroupedTasks = {
        active: taskList.filter((t) => t.status === "active"),
        blocked: taskList.filter((t) => t.status === "blocked"),
        completed: taskList.filter((t) => t.status === "completed"),
      };
      return reply.send(groupedTasks);
    }

    return reply.send(taskList);
  });

  // ── POST /tasks ─────────────────────────────────────────────────────────────
  app.post<{ Body: unknown }>("/tasks", async (request, reply) => {
    const parseResult = createTaskSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.flatten() });
    }

    const input = parseResult.data;
    const [created] = await db
      .insert(tasks)
      .values({
        workspaceId: input.workspaceId,
        assignedUserId: input.assignedUserId ?? null,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        deadline: input.deadline ?? null,
        status: input.status,
        sourceMessage: input.sourceMessage ?? null,
      })
      .returning();

    if (!created) {
      return reply.status(500).send({ error: "Failed to create task." });
    }

    return reply.status(201).send(toTask(created));
  });

  // ── PATCH /tasks/:id ────────────────────────────────────────────────────────
  app.patch<{ Params: { id: string }; Body: unknown }>(
    "/tasks/:id",
    async (request, reply) => {
      const { id } = request.params;

      const parseResult = updateTaskSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: parseResult.error.flatten() });
      }

      const input = parseResult.data;

      // Build update payload (only fields present in body).
      const updateValues: Partial<typeof tasks.$inferInsert> = {};
      if (input.title !== undefined) updateValues.title = input.title;
      if (input.description !== undefined) updateValues.description = input.description ?? undefined;
      if (input.priority !== undefined) updateValues.priority = input.priority;
      if (input.deadline !== undefined) updateValues.deadline = input.deadline ?? undefined;
      if (input.status !== undefined) updateValues.status = input.status;
      updateValues.updatedAt = new Date();

      const [updated] = await db
        .update(tasks)
        .set(updateValues)
        .where(eq(tasks.id, id))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: "Task not found." });
      }

      return reply.send(toTask(updated));
    }
  );

  // ── DELETE /tasks/:id ───────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>("/tasks/:id", async (request, reply) => {
    const { id } = request.params;

    const [deleted] = await db
      .delete(tasks)
      .where(eq(tasks.id, id))
      .returning({ id: tasks.id });

    if (!deleted) {
      return reply.status(404).send({ error: "Task not found." });
    }

    return reply.status(200).send({ ok: true });
  });

  // ── POST /tasks/:id/explain ─────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>("/tasks/:id/explain", async (request, reply) => {
    const { id } = request.params;

    const [row] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ error: "Task not found." });
    }

    const task = toTask(row);

    try {
      const explanation = await explainTask(task, task.workspaceId);
      return reply.send(explanation);
    } catch (err) {
      const message = (err as Error).message;
      // Surface AI/config errors as 503 so the client knows it's a service issue.
      if (message.includes("OPENROUTER_API_KEY")) {
        return reply.status(503).send({ error: message });
      }
      throw err;
    }
  });
}
