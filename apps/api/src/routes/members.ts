/**
 * Members & invites routes for a workspace.
 *
 * GET    /workspaces/:id/members          — all members (any member)
 * POST   /workspaces/:id/invites          — send an email invite (owner only)
 * GET    /workspaces/:id/invites          — list pending invites (owner only)
 * DELETE /workspaces/:id/invites/:inviteId — cancel an invite (owner only)
 */
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import type { WorkspaceInvite, WorkspaceMember } from "@aicrm/shared";
import { db } from "../db/client.js";
import { workspaces, workspaceMembers, workspaceInvites, users } from "../db/schema.js";
import { verifyAuth } from "../lib/auth.js";

/** Resolve a workspace and check the caller is a member. Returns the ws row or null. */
async function getMemberWorkspace(workspaceId: string, userId: string) {
  const [row] = await db
    .select({ id: workspaces.id, ownerId: workspaces.ownerId })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function memberRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", verifyAuth);

  // ── GET /workspaces/:id/members ─────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/workspaces/:id/members",
    async (request, reply) => {
      const { id } = request.params;
      const callerId = request.user!.id;

      const ws = await getMemberWorkspace(id, callerId);
      if (!ws) return reply.status(404).send({ error: "Workspace not found." });

      const rows = await db
        .select({
          workspaceId: workspaceMembers.workspaceId,
          userId: workspaceMembers.userId,
          role: workspaceMembers.role,
          joinedAt: workspaceMembers.joinedAt,
          userId2: users.id,
          email: users.email,
          name: users.name,
          discordId: users.discordId,
          timezone: users.timezone,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, id));

      const members: WorkspaceMember[] = rows.map((r) => ({
        workspaceId: r.workspaceId,
        userId: r.userId,
        role: r.role as WorkspaceMember["role"],
        joinedAt: r.joinedAt.toISOString(),
        user: {
          id: r.userId2,
          email: r.email,
          name: r.name ?? null,
          discordId: r.discordId ?? null,
          timezone: r.timezone,
        },
      }));

      return reply.send(members);
    },
  );

  // ── POST /workspaces/:id/invites ────────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { email?: unknown } }>(
    "/workspaces/:id/invites",
    async (request, reply) => {
      const { id } = request.params;
      const callerId = request.user!.id;

      // Owner-only check.
      const [ws] = await db
        .select({ id: workspaces.id, ownerId: workspaces.ownerId })
        .from(workspaces)
        .where(and(eq(workspaces.id, id), eq(workspaces.ownerId, callerId)))
        .limit(1);
      if (!ws) return reply.status(404).send({ error: "Workspace not found." });

      const email = request.body?.email;
      if (typeof email !== "string" || !email.trim()) {
        return reply.status(400).send({ error: "email is required." });
      }
      const normalizedEmail = email.trim().toLowerCase();

      // Check: is this email already a member?
      const [existingMember] = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(
          and(
            eq(workspaceMembers.workspaceId, id),
            eq(users.email, normalizedEmail),
          ),
        )
        .limit(1);
      if (existingMember) {
        return reply.status(409).send({ error: "That user is already a member." });
      }

      // Idempotent: return existing pending invite if one exists.
      const [existing] = await db
        .select()
        .from(workspaceInvites)
        .where(
          and(
            eq(workspaceInvites.workspaceId, id),
            eq(workspaceInvites.email, normalizedEmail),
            eq(workspaceInvites.status, "pending"),
          ),
        )
        .limit(1);
      if (existing) {
        const out: WorkspaceInvite = {
          id: existing.id,
          workspaceId: existing.workspaceId,
          email: existing.email,
          status: existing.status as WorkspaceInvite["status"],
          createdAt: existing.createdAt.toISOString(),
        };
        return reply.status(200).send(out);
      }

      const [created] = await db
        .insert(workspaceInvites)
        .values({ workspaceId: id, email: normalizedEmail })
        .returning();

      if (!created) {
        return reply.status(500).send({ error: "Failed to create invite." });
      }

      const out: WorkspaceInvite = {
        id: created.id,
        workspaceId: created.workspaceId,
        email: created.email,
        status: created.status as WorkspaceInvite["status"],
        createdAt: created.createdAt.toISOString(),
      };
      return reply.status(201).send(out);
    },
  );

  // ── GET /workspaces/:id/invites ─────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/workspaces/:id/invites",
    async (request, reply) => {
      const { id } = request.params;
      const callerId = request.user!.id;

      // Owner-only.
      const [ws] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, id), eq(workspaces.ownerId, callerId)))
        .limit(1);
      if (!ws) return reply.status(404).send({ error: "Workspace not found." });

      const rows = await db
        .select()
        .from(workspaceInvites)
        .where(
          and(
            eq(workspaceInvites.workspaceId, id),
            eq(workspaceInvites.status, "pending"),
          ),
        );

      const invites: WorkspaceInvite[] = rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspaceId,
        email: r.email,
        status: r.status as WorkspaceInvite["status"],
        createdAt: r.createdAt.toISOString(),
      }));

      return reply.send(invites);
    },
  );

  // ── DELETE /workspaces/:id/invites/:inviteId ────────────────────────────────
  app.delete<{ Params: { id: string; inviteId: string } }>(
    "/workspaces/:id/invites/:inviteId",
    async (request, reply) => {
      const { id, inviteId } = request.params;
      const callerId = request.user!.id;

      // Owner-only.
      const [ws] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, id), eq(workspaces.ownerId, callerId)))
        .limit(1);
      if (!ws) return reply.status(404).send({ error: "Workspace not found." });

      const [updated] = await db
        .update(workspaceInvites)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(workspaceInvites.id, inviteId),
            eq(workspaceInvites.workspaceId, id),
          ),
        )
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: "Invite not found." });
      }

      return reply.send({ ok: true });
    },
  );
}
