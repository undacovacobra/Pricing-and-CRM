import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { importEverythingFromDrive, getOwnerAccessToken, recordRun } from "@/lib/backup/engine";

export const maxDuration = 300;

// Minimum gap between background syncs, so opening/navigating the app doesn't
// trigger a stampede of imports.
const THROTTLE_MINUTES = 60;

// Background "pull new Drive files into every job" — fired automatically by the
// app while it's open (fire-and-forget), so files show up without anyone pressing
// a button. Throttled, and a no-op if nothing has changed.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!adminConfigured()) return NextResponse.json({ ok: true, skipped: "not_configured" });

  const admin = createAdminClient();

  // Skip if any import already ran recently (nightly, manual, or auto).
  const { data: last } = await admin
    .from("backup_runs")
    .select("created_at")
    .in("kind", ["auto", "import", "nightly"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last?.created_at) {
    const ageMin = (Date.now() - new Date(last.created_at).getTime()) / 60000;
    if (ageMin < THROTTLE_MINUTES) {
      return NextResponse.json({ ok: true, skipped: "recent", ageMinutes: Math.round(ageMin) });
    }
  }

  const token = await getOwnerAccessToken(admin);
  if (!token) return NextResponse.json({ ok: true, skipped: "no_connection" });

  try {
    const imported = await importEverythingFromDrive(admin, token);
    await recordRun(admin, "auto", "success", `Auto-sync imported ${imported} file(s) from Google Drive.`, undefined, imported);
    return NextResponse.json({ ok: true, imported });
  } catch (e) {
    await recordRun(admin, "auto", "error", String(e));
    return NextResponse.json({ error: "sync_failed", detail: String(e) }, { status: 502 });
  }
}
