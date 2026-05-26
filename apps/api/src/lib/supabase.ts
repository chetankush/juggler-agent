/**
 * Supabase server client (service role).
 * Only use server-side — never ship the service role key to the client.
 */
import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    // Service role key bypasses RLS; do not use for user-scoped operations.
    autoRefreshToken: false,
    persistSession: false,
  },
});
