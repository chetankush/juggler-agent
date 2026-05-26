/**
 * Standup summary route.
 *
 * GET /summary?workspaceId=<uuid>&userId=<uuid?>
 *   userId optional — if omitted, summarises the whole workspace.
 */
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { ChannelType, type TextChannel } from "discord.js";
import { verifyAuth } from "../lib/auth.js";
import { generateStandup } from "../services/summary.js";
import { db } from "../db/client.js";
import { workspaces } from "../db/schema.js";
import { discordClient } from "../discord/bot.js";

export async function summaryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", verifyAuth);

  app.get<{ Querystring: { workspaceId?: string; userId?: string } }>(
    "/summary",
    async (request, reply) => {
      const { workspaceId, userId } = request.query;
      if (!workspaceId) {
        return reply.status(400).send({ error: "workspaceId is required" });
      }
      const summary = await generateStandup(workspaceId, userId);
      return reply.send(summary);
    },
  );

  // POST /summary/post — best-effort: post the standup to the workspace's
  // Discord guild. Returns 503 when the bot isn't online; the web's "Copy to
  // clipboard" remains the reliable fallback.
  app.post<{ Body: { workspaceId?: string; userId?: string } }>(
    "/summary/post",
    async (request, reply) => {
      const { workspaceId, userId } = request.body || {};
      if (!workspaceId) return reply.status(400).send({ error: "workspaceId is required" });

      const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      if (!ws) return reply.status(404).send({ error: "Workspace not found." });
      if (!ws.discordGuildId) {
        return reply.status(400).send({
          error: "This workspace isn't connected to a Discord server yet.",
        });
      }
      if (!discordClient?.isReady?.()) {
        return reply.status(503).send({
          error: "Discord bot is not running. Enable MESSAGE CONTENT INTENT in the Developer Portal and restart.",
        });
      }

      try {
        const guild = await discordClient.guilds.fetch(ws.discordGuildId);
        let channel: TextChannel | null = (guild.systemChannel as TextChannel | null) ?? null;
        if (!channel) {
          const all = await guild.channels.fetch();
          channel = [...all.values()].find(
            (c): c is TextChannel => !!c && c.type === ChannelType.GuildText,
          ) ?? null;
        }
        if (!channel) {
          return reply.status(404).send({ error: "No text channel found in the guild." });
        }

        const summary = await generateStandup(workspaceId, userId);
        await channel.send("```\n" + summary.text + "\n```");
        return reply.send({ ok: true });
      } catch (err) {
        return reply.status(500).send({ error: (err as Error).message });
      }
    },
  );
}
