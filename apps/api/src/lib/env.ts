/**
 * Zod-validated environment loader.
 *
 * Required vars will throw on missing. Optional integration vars (Discord,
 * OpenRouter) log a warning but allow the server to start in degraded mode.
 */
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// Load env from the monorepo root `.env` first (the single source of truth),
// then a local `apps/api/.env` override if present. Commands run with cwd =
// apps/api in both dev (tsx) and prod (node dist), so ../../.env is the root.
for (const p of [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]) {
  if (existsSync(p)) dotenv.config({ path: p, override: false });
}

// ── Required vars ─────────────────────────────────────────────────────────────
const requiredSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3001),
});

// ── Optional integration vars ─────────────────────────────────────────────────
const optionalSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_CHAT_MODEL: z.string().optional().default("google/gemini-2.5-flash"),
  OPENROUTER_EMBEDDING_MODEL: z.string().optional().default("openai/text-embedding-3-small"),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
});

const requiredResult = requiredSchema.safeParse(process.env);
if (!requiredResult.success) {
  console.error("❌  Missing required environment variables:");
  console.error(requiredResult.error.flatten().fieldErrors);
  process.exit(1);
}

const optionalResult = optionalSchema.safeParse(process.env);
if (!optionalResult.success) {
  // Shouldn't happen since all optional fields are optional, but guard anyway.
  console.warn("⚠️  Optional env parse warning:", optionalResult.error.flatten().fieldErrors);
}

const optionalData = optionalResult.success ? optionalResult.data : optionalSchema.parse({});

// Warn about optional integrations that are unconfigured.
if (!optionalData.OPENROUTER_API_KEY) {
  console.warn("⚠️  OPENROUTER_API_KEY not set — AI features (extraction, explain, embeddings) will error when called.");
}
if (!optionalData.DISCORD_BOT_TOKEN) {
  console.warn("⚠️  DISCORD_BOT_TOKEN not set — Discord bot will not start.");
}

export const env = {
  ...requiredResult.data,
  ...optionalData,
} as const;

export type Env = typeof env;
