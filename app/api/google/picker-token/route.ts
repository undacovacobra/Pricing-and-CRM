import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { googleConfigured } from "@/lib/google/drive";
import { getValidAccessToken } from "@/lib/google/connection";

// Hands the browser a short-lived OAuth token (plus the Google Cloud app id) so
// it can open the Google Picker. The Picker shows the user's own Drive; the app
// only ever receives the files they explicitly choose.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!googleConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 400 });

  const token = await getValidAccessToken();
  if (!token) return NextResponse.json({ error: "not_connected" }, { status: 400 });

  // The Picker "app id" is the Google Cloud project number — the leading digits
  // of the OAuth client id (e.g. 1234567890-abc.apps.googleusercontent.com).
  const appId = (process.env.GOOGLE_CLIENT_ID ?? "").split("-")[0];

  return NextResponse.json({ token, appId });
}
