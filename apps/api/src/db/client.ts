/**
 * postgres-js connection + Drizzle instance.
 * Import `db` wherever you need to query the database.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env.js";
import * as schema from "./schema.js";

// postgres-js connection. `prepare: false` keeps this compatible with the
// Supabase connection poolers (transaction mode doesn't support prepared
// statements); it's harmless for the local/session-pooler connections too.
const queryClient = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle(queryClient, { schema });
