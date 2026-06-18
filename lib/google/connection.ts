import { createClient } from "@/lib/supabase/server";
import { refreshAccessToken } from "./drive";

export interface GoogleConnectionStatus {
  connected: boolean;
  email: string | null;
}

// Reads the current user's stored Google connection.
export async function getGoogleConnectionStatus(): Promise<GoogleConnectionStatus> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("google_connections")
    .select("google_email")
    .maybeSingle();
  return { connected: !!data, email: data?.google_email ?? null };
}

// Returns a usable access token for the current user, refreshing it if expired.
// Returns null if the user has no Google connection.
export async function getValidAccessToken(): Promise<string | null> {
  const supabase = await createClient();
  const { data: conn } = await supabase
    .from("google_connections")
    .select("*")
    .maybeSingle();

  if (!conn) return null;

  const expiry = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  const stillValid = conn.access_token && expiry > Date.now() + 60_000; // 1 min buffer
  if (stillValid) return conn.access_token;

  // Refresh
  const refreshed = await refreshAccessToken(conn.refresh_token);
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase
    .from("google_connections")
    .update({
      access_token: refreshed.access_token,
      token_expiry: newExpiry,
      updated_at:   new Date().toISOString(),
    })
    .eq("user_id", conn.user_id);

  return refreshed.access_token;
}
