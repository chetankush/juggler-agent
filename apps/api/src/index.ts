/**
 * Fastify application entry point.
 *
 * - Builds and configures the Fastify app.
 * - Registers plugins (@fastify/cors, @fastify/websocket).
 * - Registers all route plugins.
 * - Starts BullMQ workers.
 * - Starts the Discord bot (if configured).
 * - Listens on PORT (default 3001).
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";

import { env } from "./lib/env.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { integrationRoutes } from "./routes/integrations.js";
import { taskRoutes } from "./routes/tasks.js";
import { discordRoutes } from "./routes/discord.js";
import { embeddingsRoutes } from "./routes/embeddings.js";
import { summaryRoutes } from "./routes/summary.js";
import { startRemindersWorker } from "./queues/reminders.queue.js";
import { startEmbeddingsWorker } from "./queues/embeddings.queue.js";
import { startDiscordBot, postStandupToWorkspace } from "./discord/bot.js";
import { db } from "./db/client.js";
import { workspaces } from "./db/schema.js";
import { scheduleReminders } from "./services/reminders.js";
import { eq } from "drizzle-orm";

async function build() {
  const app = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
      // Pretty print in development; structured JSON in production.
      transport:
        process.env["NODE_ENV"] !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  // Tolerate empty JSON bodies: POSTs with no body (e.g. /tasks/:id/explain)
  // otherwise fail with FST_ERR_CTP_EMPTY_JSON_BODY when a client still sends
  // `Content-Type: application/json`. Treat an empty body as `{}`.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      const raw = typeof body === "string" ? body.trim() : "";
      if (raw === "") {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(raw));
      } catch (err) {
        (err as Error & { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );

  // ── Plugins ──────────────────────────────────────────────────────────────────
  await app.register(cors, {
    // Allow all origins for dev; tighten in production via env var.
    origin: process.env["CORS_ORIGIN"] ?? true,
  });

  await app.register(websocket);

  // ── Routes ───────────────────────────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(meRoutes);
  await app.register(workspaceRoutes);
  await app.register(integrationRoutes);
  await app.register(taskRoutes);
  await app.register(discordRoutes);
  await app.register(embeddingsRoutes);
  await app.register(summaryRoutes);

  return app;
}

async function main() {
  const app = await build();

  // ── BullMQ workers ───────────────────────────────────────────────────────────
  // Workers consume jobs from Redis. They are started regardless of whether
  // optional integrations (Discord, OpenRouter) are configured — they will just
  // log errors when the required keys are missing on a job-by-job basis.
  startRemindersWorker();
  startEmbeddingsWorker();

  // ── Periodic reminder scan ───────────────────────────────────────────────────
  // Every N minutes, walk each workspace and enqueue reminder jobs for inactive /
  // approaching-deadline / stale tasks. The actual delivery happens in the
  // reminders worker. A repeat job in BullMQ would survive process restarts —
  // setInterval is fine for the single-process MVP.
  const REMINDER_SCAN_MIN = Number(process.env["REMINDER_SCAN_MIN"] ?? "15");
  const scanAllWorkspaces = async () => {
    try {
      const wsRows = await db.select({ id: workspaces.id }).from(workspaces);
      for (const w of wsRows) await scheduleReminders(w.id);
      if (wsRows.length > 0) {
        app.log.info(`Reminder scan: ${wsRows.length} workspace(s) processed.`);
      }
    } catch (err) {
      app.log.warn({ err }, "Reminder scan failed");
    }
  };
  setInterval(scanAllWorkspaces, REMINDER_SCAN_MIN * 60_000);
  scanAllWorkspaces().catch(() => {
    /* logged inside */
  });

  // ── End-of-day standup auto-post ─────────────────────────────────────────────
  // Every N minutes: for each workspace linked to Discord whose `workingHoursEnd`
  // (UTC) has passed today and which hasn't been posted today yet, post the
  // standup and stamp `lastStandupAt` for dedup across restarts.
  const EOD_SCAN_MIN = Number(process.env["EOD_SCAN_MIN"] ?? "5");
  const eodCheck = async () => {
    try {
      const allWs = await db.select().from(workspaces);
      const now = new Date();
      const todayUTC = now.toISOString().slice(0, 10);
      const hhmm = now.toISOString().slice(11, 16); // "HH:MM" UTC
      for (const ws of allWs) {
        if (!ws.discordGuildId) continue;
        const eod = ws.settings?.workingHoursEnd ?? "18:00";
        if (hhmm < eod) continue;
        const lastDay = ws.lastStandupAt
          ? ws.lastStandupAt.toISOString().slice(0, 10)
          : null;
        if (lastDay === todayUTC) continue;
        try {
          await postStandupToWorkspace(ws.id);
          await db
            .update(workspaces)
            .set({ lastStandupAt: now })
            .where(eq(workspaces.id, ws.id));
          app.log.info(`Auto-EOD standup posted for workspace ${ws.id}`);
        } catch (err) {
          app.log.warn({ err: (err as Error).message }, `Auto-EOD failed for ${ws.id}`);
        }
      }
    } catch (err) {
      app.log.warn({ err: (err as Error).message }, "EOD scan failed");
    }
  };
  setInterval(eodCheck, EOD_SCAN_MIN * 60_000);
  eodCheck().catch(() => {
    /* logged inside */
  });

  // ── Discord bot ──────────────────────────────────────────────────────────────
  // Connects only if DISCORD_BOT_TOKEN is present. Started in the background so a
  // Discord outage / misconfig can never block or crash the API server.
  startDiscordBot().catch((err) => {
    console.warn("Discord bot failed to start:", (err as Error).message);
  });

  // ── Start server ─────────────────────────────────────────────────────────────
  try {
    const address = await app.listen({
      port: env.PORT,
      host: "0.0.0.0", // listen on all interfaces (required for containers)
    });
    app.log.info(`Server listening at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
