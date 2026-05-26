/**
 * Workspace routes.
 *
 * POST   /workspaces              — create a workspace (owner = current user)
 * GET    /workspaces/:id          — get a workspace by id (404 if not owned)
 * PATCH  /workspaces/:id/settings — update workspace settings
 */
import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import {
  createWorkspaceSchema,
  workspaceSettingsSchema,
  DEFAULT_WORKSPACE_SETTINGS,
  type Workspace,
  type WorkspaceSettings,
  type Task,
} from "@aicrm/shared";
import { db } from "../db/client.js";
import { workspaces, tasks, users } from "../db/schema.js";
import { verifyAuth } from "../lib/auth.js";

/** Map a DB workspaces row to the shared Workspace interface. */
function toWorkspace(row: typeof workspaces.$inferSelect): Workspace {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    // Parse JSONB settings; fall back to defaults if null/missing (defensive).
    settings: (row.settings as WorkspaceSettings | null) ?? DEFAULT_WORKSPACE_SETTINGS,
  };
}

export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  // All workspace routes require auth.
  app.addHook("preHandler", verifyAuth);

  // ── POST /workspaces ────────────────────────────────────────────────────────
  app.post<{ Body: unknown }>("/workspaces", async (request, reply) => {
    const parseResult = createWorkspaceSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.flatten() });
    }

    const { name } = parseResult.data;
    const ownerId = request.user!.id;

    const [created] = await db
      .insert(workspaces)
      .values({
        ownerId,
        name,
        settings: DEFAULT_WORKSPACE_SETTINGS,
      })
      .returning();

    if (!created) {
      return reply.status(500).send({ error: "Failed to create workspace." });
    }

    return reply.status(201).send(toWorkspace(created));
  });

  // ── GET /workspaces/:id ─────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/workspaces/:id", async (request, reply) => {
    const { id } = request.params;
    const ownerId = request.user!.id;

    const [row] = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, id), eq(workspaces.ownerId, ownerId)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ error: "Workspace not found." });
    }

    return reply.send(toWorkspace(row));
  });

  // ── PATCH /workspaces/:id/settings ─────────────────────────────────────────
  app.patch<{ Params: { id: string }; Body: unknown }>(
    "/workspaces/:id/settings",
    async (request, reply) => {
      const { id } = request.params;
      const ownerId = request.user!.id;

      const parseResult = workspaceSettingsSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: parseResult.error.flatten() });
      }

      const newSettings: WorkspaceSettings = parseResult.data;

      const [updated] = await db
        .update(workspaces)
        .set({ settings: newSettings })
        .where(and(eq(workspaces.id, id), eq(workspaces.ownerId, ownerId)))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: "Workspace not found." });
      }

      return reply.send(toWorkspace(updated));
    }
  );

  // ── GET /workspaces/:id/team ────────────────────────────────────────────────
  // Returns [{user, tasks: Task[]}] grouped by assignee. Tasks with no
  // assignee land under a synthetic "Unassigned" bucket.
  app.get<{ Params: { id: string } }>(
    "/workspaces/:id/team",
    async (request, reply) => {
      const { id } = request.params;
      const ownerId = request.user!.id;

      const [ws] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, id), eq(workspaces.ownerId, ownerId)))
        .limit(1);
      if (!ws) return reply.status(404).send({ error: "Workspace not found." });

      const taskRows = await db
        .select()
        .from(tasks)
        .where(eq(tasks.workspaceId, id));

      const assigneeIds = [
        ...new Set(taskRows.map((t) => t.assignedUserId).filter(Boolean) as string[]),
      ];
      const userRows = assigneeIds.length
        ? await db.select().from(users).where(inArray(users.id, assigneeIds))
        : [];
      const userById = new Map(userRows.map((u) => [u.id, u]));

      const toTaskOut = (row: typeof taskRows[number]): Task => ({
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

      const groups = new Map<
        string,
        { user: { id: string | null; email: string; name: string | null; discordId: string | null }; tasks: Task[] }
      >();
      for (const t of taskRows) {
        const key = t.assignedUserId ?? "_unassigned";
        if (!groups.has(key)) {
          if (t.assignedUserId) {
            const u = userById.get(t.assignedUserId);
            groups.set(key, {
              user: {
                id: t.assignedUserId,
                email: u?.email ?? "(unknown)",
                name: u?.name ?? null,
                discordId: u?.discordId ?? null,
              },
              tasks: [],
            });
          } else {
            groups.set(key, {
              user: { id: null, email: "unassigned@local", name: "Unassigned", discordId: null },
              tasks: [],
            });
          }
        }
        groups.get(key)!.tasks.push(toTaskOut(t));
      }

      return reply.send([...groups.values()]);
    },
  );
}
