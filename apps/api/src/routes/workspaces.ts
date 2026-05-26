/**
 * Workspace routes.
 *
 * POST   /workspaces                    — create a workspace (owner = current user)
 * GET    /workspaces/:id                — get a workspace by id (404 if not member)
 * PATCH  /workspaces/:id/settings       — update workspace settings (owner only)
 * GET    /workspaces/:id/team           — all members + their tasks
 * GET    /workspaces/:id/analytics      — WorkspaceAnalytics (any member)
 */
import type { FastifyInstance } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  createWorkspaceSchema,
  workspaceSettingsSchema,
  DEFAULT_WORKSPACE_SETTINGS,
  type Workspace,
  type WorkspaceSettings,
  type Task,
  type WorkspaceAnalytics,
} from "@aicrm/shared";
import { db } from "../db/client.js";
import { workspaces, tasks, users, workspaceMembers } from "../db/schema.js";
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
  // Returns [{user, tasks: Task[]}] grouped by workspace member. ALL members
  // are included (tasks array may be empty). Unassigned tasks land at the end
  // under a synthetic "Unassigned" bucket.
  app.get<{ Params: { id: string } }>(
    "/workspaces/:id/team",
    async (request, reply) => {
      const { id } = request.params;
      const callerId = request.user!.id;

      // Access: any member of the workspace.
      const [membership] = await db
        .select({ id: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, callerId)),
        )
        .limit(1);
      if (!membership) return reply.status(404).send({ error: "Workspace not found." });

      // Load all workspace members with their user rows.
      const memberRows = await db
        .select({
          userId: workspaceMembers.userId,
          id: users.id,
          email: users.email,
          name: users.name,
          discordId: users.discordId,
          timezone: users.timezone,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, id));

      const taskRows = await db
        .select()
        .from(tasks)
        .where(eq(tasks.workspaceId, id));

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

      type GroupEntry = {
        user: { id: string | null; email: string; name: string | null; discordId: string | null; timezone?: string };
        tasks: Task[];
      };

      // Seed groups from actual members (guarantees all members appear).
      const groups = new Map<string, GroupEntry>();
      for (const m of memberRows) {
        groups.set(m.userId, {
          user: { id: m.id, email: m.email, name: m.name ?? null, discordId: m.discordId ?? null, timezone: m.timezone },
          tasks: [],
        });
      }

      const unassignedTasks: Task[] = [];
      for (const t of taskRows) {
        const out = toTaskOut(t);
        if (t.assignedUserId && groups.has(t.assignedUserId)) {
          groups.get(t.assignedUserId)!.tasks.push(out);
        } else if (t.assignedUserId) {
          // Assigned to a user no longer in the workspace — treat as unassigned.
          unassignedTasks.push(out);
        } else {
          unassignedTasks.push(out);
        }
      }

      const result: GroupEntry[] = [...groups.values()];
      if (unassignedTasks.length > 0) {
        result.push({
          user: { id: null, email: "unassigned@local", name: "Unassigned", discordId: null },
          tasks: unassignedTasks,
        });
      }

      return reply.send(result);
    },
  );

  // ── GET /workspaces/:id/analytics ──────────────────────────────────────────
  // Returns WorkspaceAnalytics. Access: any member.
  app.get<{ Params: { id: string } }>(
    "/workspaces/:id/analytics",
    async (request, reply) => {
      const { id } = request.params;
      const callerId = request.user!.id;

      // Access: any member.
      const [membership] = await db
        .select({ id: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, callerId)),
        )
        .limit(1);
      if (!membership) return reply.status(404).send({ error: "Workspace not found." });

      // ── tasksByStatus ──
      const statusRows = await db
        .select({
          status: tasks.status,
          count: sql<string>`count(*)`,
        })
        .from(tasks)
        .where(eq(tasks.workspaceId, id))
        .groupBy(tasks.status);

      const tasksByStatus = { active: 0, blocked: 0, completed: 0 };
      for (const r of statusRows) {
        const key = r.status as keyof typeof tasksByStatus;
        if (key in tasksByStatus) tasksByStatus[key] = Number(r.count);
      }

      // ── tasksByPriority ──
      const priorityRows = await db
        .select({
          priority: tasks.priority,
          count: sql<string>`count(*)`,
        })
        .from(tasks)
        .where(eq(tasks.workspaceId, id))
        .groupBy(tasks.priority);

      const tasksByPriority = { high: 0, medium: 0, low: 0 };
      for (const r of priorityRows) {
        const key = r.priority as keyof typeof tasksByPriority;
        if (key in tasksByPriority) tasksByPriority[key] = Number(r.count);
      }

      // ── throughput14d ──
      // Count completed tasks per day for the last 14 days.
      const throughputRows = await db
        .select({
          day: sql<string>`date_trunc('day', ${tasks.updatedAt})::date::text`,
          count: sql<string>`count(*)`,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, id),
            eq(tasks.status, "completed"),
            sql`${tasks.updatedAt} >= now() - interval '14 days'`,
          ),
        )
        .groupBy(sql`date_trunc('day', ${tasks.updatedAt})::date`);

      const throughputByDay = new Map<string, number>();
      for (const r of throughputRows) {
        throughputByDay.set(r.day, Number(r.count));
      }

      // Build 14-entry array: oldest first, today last.
      const throughput14d: Array<{ date: string; completed: number }> = [];
      const today = new Date();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        throughput14d.push({ date: dateStr, completed: throughputByDay.get(dateStr) ?? 0 });
      }

      // ── perMember ──
      const memberRows = await db
        .select({
          userId: workspaceMembers.userId,
          email: users.email,
          name: users.name,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, id));

      const memberIds = memberRows.map((m) => m.userId);

      // Per-member task counts.
      const memberTaskRows = memberIds.length
        ? await db
            .select({
              assignedUserId: tasks.assignedUserId,
              status: tasks.status,
              count: sql<string>`count(*)`,
            })
            .from(tasks)
            .where(
              and(
                eq(tasks.workspaceId, id),
                inArray(tasks.assignedUserId, memberIds),
              ),
            )
            .groupBy(tasks.assignedUserId, tasks.status)
        : [];

      type MemberStats = { total: number; active: number; completed: number };
      const statsByUser = new Map<string, MemberStats>();
      for (const r of memberTaskRows) {
        const uid = r.assignedUserId!;
        if (!statsByUser.has(uid)) statsByUser.set(uid, { total: 0, active: 0, completed: 0 });
        const s = statsByUser.get(uid)!;
        const n = Number(r.count);
        s.total += n;
        if (r.status === "active") s.active += n;
        if (r.status === "completed") s.completed += n;
      }

      const perMember = memberRows
        .map((m) => {
          const s = statsByUser.get(m.userId) ?? { total: 0, active: 0, completed: 0 };
          return {
            user: { id: m.userId, email: m.email, name: m.name ?? null },
            ...s,
          };
        })
        .sort((a, b) => b.total - a.total);

      const analytics: WorkspaceAnalytics = {
        tasksByStatus,
        tasksByPriority,
        throughput14d,
        perMember,
      };

      return reply.send(analytics);
    },
  );
}
