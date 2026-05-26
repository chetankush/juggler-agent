/**
 * Discord webhook route.
 *
 * POST /discord/webhook — receives Discord interaction payloads (slash commands,
 * buttons, etc.) if the bot is configured to use Interactions Endpoint URL
 * instead of (or alongside) the gateway.
 *
 * For MVP the primary integration is via the gateway bot (discord/bot.ts).
 * This route is a placeholder for future interactions-based commands.
 */
import type { FastifyInstance } from "fastify";

export async function discordRoutes(app: FastifyInstance): Promise<void> {
  app.post("/discord/webhook", async (request, reply) => {
    // Discord sends a PING (type 1) during endpoint verification.
    const body = request.body as { type?: number } | null;

    if (body?.type === 1) {
      // Respond with PONG to acknowledge endpoint ownership.
      return reply.send({ type: 1 });
    }

    // Other interaction types (APPLICATION_COMMAND = 2, etc.) can be handled here.
    // For now, acknowledge without action.
    return reply.status(200).send({ type: 1 });
  });
}
