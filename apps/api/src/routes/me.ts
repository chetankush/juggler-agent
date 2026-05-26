/**
 * Me route.
 *
 * GET /me — bootstraps the web app after auth.
 *   - Verifies the Supabase JWT via verifyAuth.
 *   - Upserts the `users` row from JWT claims (id, email, name).
 *   - Returns MeResponse: { user, workspaces, currentWorkspace }.
 *   - currentWorkspace = first workspace owned by the user, or null.
 */
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  type MeResponse,
  type User,
  type Workspace,
  type WorkspaceSettings,
} from "@aicrm/shared";
import { db } from "../db/client.js";
import { users, workspaces } from "../db/schema.js";
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

    const user: User = {
      id: upsertedUser.id,
      email: upsertedUser.email,
      name: upsertedUser.name ?? null,
      discordId: upsertedUser.discordId ?? null,
    };

    // Fetch all workspaces owned by this user (uses workspaces_owner_id_idx).
    const workspaceRows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, authUser.id));

    const userWorkspaces = workspaceRows.map(toWorkspace);

    const response: MeResponse = {
      user,
      workspaces: userWorkspaces,
      currentWorkspace: userWorkspaces[0] ?? null,
    };

    return reply.send(response);
  });

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
