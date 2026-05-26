import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client — safe to use in Client Components.
 * Uses the public anon key only; never expose the service-role key here.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
