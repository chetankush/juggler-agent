/**
 * Integrations routes.
 *
 * GET    /integrations/discord?workspaceId= — Discord integration status
 * DELETE /integrations/discord?workspaceId= — Unlink Discord from workspace
 */
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { type DiscordIntegrationStatus } from "@aicrm/shared";
import { db } from "../db/client.js";
import { workspaces } from "../db/schema.js";
import { verifyAuth } from "../lib/auth.js";
import { env } from "../lib/env.js";

/**
 * Build the bot-invite URL from DISCORD_CLIENT_ID.
 * Permissions: View Channels (1024) + Send Messages (2048) +
 *              Read Message History (65536) + Add Reactions (64) = 68672.
 * Returns null if DISCORD_CLIENT_ID is not set.
 */
function buildInviteUrl(): string | null {
  if (!env.DISCORD_CLIENT_ID) return null;

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    scope: "bot applications.commands",
    permissions: "68672", // View Channels + Send Messages + Read Message History + Add Reactions
  });

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  // All integration routes require auth.
  app.addHook("preHandler", verifyAuth);

  // ── GET /integrations/discord ───────────────────────────────────────────────
  app.get<{ Querystring: { workspaceId?: string } }>(
    "/integrations/discord",
    async (request, reply) => {
      const { workspaceId } = request.query;
      if (!workspaceId) {
        return reply.status(400).send({ error: "workspaceId query param is required." });
      }

      const ownerId = request.user!.id;

      const [row] = await db
        .select({
          discordGuildId: workspaces.discordGuildId,
          discordGuildName: workspaces.discordGuildName,
          discordChannelName: workspaces.discordChannelName,
        })
        .from(workspaces)
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, ownerId)))
        .limit(1);

      if (!row) {
        return reply.status(404).send({ error: "Workspace not found." });
      }

      const status: DiscordIntegrationStatus = {
        connected: row.discordGuildId != null,
        guildName: row.discordGuildName ?? null,
        channelName: row.discordChannelName ?? null,
        inviteUrl: buildInviteUrl(),
      };

      return reply.send(status);
    }
  );

  // ── DELETE /integrations/discord ────────────────────────────────────────────
  app.delete<{ Querystring: { workspaceId?: string } }>(
    "/integrations/discord",
    async (request, reply) => {
      const { workspaceId } = request.query;
      if (!workspaceId) {
        return reply.status(400).send({ error: "workspaceId query param is required." });
      }

      const ownerId = request.user!.id;

      const [updated] = await db
        .update(workspaces)
        .set({
          discordGuildId: null,
          discordGuildName: null,
          discordChannelName: null,
        })
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, ownerId)))
        .returning({ id: workspaces.id });

      if (!updated) {
        return reply.status(404).send({ error: "Workspace not found." });
      }

      return reply.send({ ok: true });
    }
  );
}
