import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

// Server-only Supabase client that uses the service-role key and bypasses Row
// Level Security. Required for the backup engine, which must read every job /
// customer / file and the designated owner's Google connection regardless of
// who (if anyone) is logged in — e.g. the nightly cron runs with no session.
//
// The service-role key is a SECRET. It is read from the server-only env var
// SUPABASE_SERVICE_ROLE_KEY and must never be exposed to the browser.
export function adminConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createAdminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it (from Supabase → Project Settings → API) to enable backups.",
    );
  }
  return createSupabaseClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
