/**
 * Me route.
 *
 * GET  /me              — bootstraps the web app after auth.
 * PATCH /me/timezone    — update the authenticated user's IANA timezone.
 * PATCH /me/discord     — link or unlink the user's Discord identity.
 *
 * GET /me behaviour:
 *   - Upserts the `users` row.
 *   - Auto-accepts pending workspace_invites for user.email.
 *   - Returns MeResponse: { user, workspaces, currentWorkspace }.
 *   - workspaces = ALL workspaces the user is a member of (owned + invited).
 */
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  type MeResponse,
  type User,
  type Workspace,
  type WorkspaceSettings,
} from "@aicrm/shared";
import { db } from "../db/client.js";
import { users, workspaces, workspaceMembers, workspaceInvites } from "../db/schema.js";
import { verifyAuth } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";

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

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me", { preHandler: verifyAuth }, async (request, reply) => {
    const authUser = request.user!;

    // Resolve full user details (name) from Supabase Auth metadata.
    const { data: authData } = await supabase.auth.admin.getUserById(authUser.id);
    const rawName: string | null =
      (authData?.user?.user_metadata?.["full_name"] as string | undefined) ??
      (authData?.user?.user_metadata?.["name"] as string | undefined) ??
      null;

    // Upsert the users row: insert on conflict, update email/name to latest.
    const [upsertedUser] = await db
      .insert(users)
      .values({
        id: authUser.id,
        email: authUser.email ?? "",
        name: rawName,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: authUser.email ?? "",
          name: rawName,
        },
      })
      .returning();

    if (!upsertedUser) {
      return reply.status(500).send({ error: "Failed to upsert user." });
    }

    // Auto-accept any pending invites for this user's email.
    const pendingInvites = await db
      .select()
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.email, upsertedUser.email),
          eq(workspaceInvites.status, "pending"),
        ),
      );

    for (const invite of pendingInvites) {
      // Insert member row (ignore if already exists).
      await db
        .insert(workspaceMembers)
        .values({
          workspaceId: invite.workspaceId,
          userId: upsertedUser.id,
          role: "member",
        })
        .onConflictDoNothing();

      // Mark invite accepted.
      await db
        .update(workspaceInvites)
        .set({ status: "accepted" })
        .where(eq(workspaceInvites.id, invite.id));
    }

    const user: User = {
      id: upsertedUser.id,
      email: upsertedUser.email,
      name: upsertedUser.name ?? null,
      discordId: upsertedUser.discordId ?? null,
      timezone: upsertedUser.timezone,
    };

    // Fetch ALL workspaces the user is a member of (owned + invited).
    const memberRows = await db
      .select({ workspace: workspaces })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, authUser.id));

    const userWorkspaces = memberRows.map((r) => toWorkspace(r.workspace));

    const response: MeResponse = {
      user,
      workspaces: userWorkspaces,
      currentWorkspace: userWorkspaces[0] ?? null,
    };

    return reply.send(response);
  });

  // ── PATCH /me/timezone — update the user's IANA timezone ────────────────────
  app.patch<{ Body: { timezone?: unknown } }>(
    "/me/timezone",
    { preHandler: verifyAuth },
    async (request, reply) => {
      const userId = request.user!.id;
      const tz = request.body?.timezone;

      if (typeof tz !== "string" || !tz.trim()) {
        return reply.status(400).send({ error: "timezone must be a non-empty string." });
      }

      // Validate the timezone string using the Intl API — it throws on invalid tz.
      try {
        new Intl.DateTimeFormat(undefined, { timeZone: tz }).format();
      } catch {
        return reply.status(400).send({ error: `Invalid IANA timezone: "${tz}".` });
      }

      await db.update(users).set({ timezone: tz.trim() }).where(eq(users.id, userId));

      return reply.send({ ok: true, timezone: tz.trim() });
    },
  );

  // ── PATCH /me/discord — link or unlink the user's Discord identity ─────────
  app.patch<{ Body: { discordId?: string | null } }>(
    "/me/discord",
    { preHandler: verifyAuth },
    async (request, reply) => {
      const userId = request.user!.id;
      const raw = request.body?.discordId;
      const discordId = typeof raw === "string" && raw.trim() ? raw.trim() : null;

      try {
        await db
          .update(users)
          .set({ discordId })
          .where(eq(users.id, userId));
      } catch (err) {
        // Unique constraint — another user already linked this Discord id.
        if ((err as { code?: string }).code === "23505") {
          return reply
            .status(409)
            .send({ error: "That Discord ID is already linked to another account." });
        }
        throw err;
      }

      return reply.send({ ok: true, discordId });
    },
  );
}
