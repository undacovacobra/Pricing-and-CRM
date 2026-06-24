import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken, shareWithAnyone } from "@/lib/google/drive";

export const maxDuration = 120;

// One-time (re-runnable) fix for folders/files created before sharing was
// automatic: sets "anyone with the link" access on every folder/file the app
// knows about, so nobody ever hits a Drive "you need to request access" wall.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!adminConfigured()) {
    return NextResponse.json({ error: "not_configured", detail: "Add SUPABASE_SERVICE_ROLE_KEY first." }, { status: 503 });
  }

  const admin = createAdminClient();

  const { data: connections } = await admin.from("google_connections").select("refresh_token");
  const tokens: string[] = [];
  for (const c of connections ?? []) {
    if (!c.refresh_token) continue;
    try {
      tokens.push((await refreshAccessToken(c.refresh_token)).access_token);
    } catch {
      // skip connections that can't refresh
    }
  }
  if (!tokens.length) {
    return NextResponse.json({ error: "no_connection", detail: "No connected Google account found." }, { status: 400 });
  }

  const ids = new Set<string>();
  const [{ data: customers }, { data: jobs }, { data: mapped }] = await Promise.all([
    admin.from("customers").select("google_drive_folder_id"),
    admin.from("jobs").select("google_drive_folder_id"),
    admin.from("backup_map").select("drive_id"),
  ]);
  (customers ?? []).forEach((c) => c.google_drive_folder_id && ids.add(c.google_drive_folder_id));
  (jobs ?? []).forEach((j) => j.google_drive_folder_id && ids.add(j.google_drive_folder_id));
  (mapped ?? []).forEach((m) => m.drive_id && ids.add(m.drive_id));

  let shared = 0;
  let failed = 0;
  for (const id of Array.from(ids)) {
    let ok = false;
    for (const token of tokens) {
      try {
        await shareWithAnyone(token, id);
        ok = true;
        break;
      } catch {
        // try the next account's token
      }
    }
    if (ok) shared++; else failed++;
  }

  return NextResponse.json({ ok: true, total: ids.size, shared, failed });
}
