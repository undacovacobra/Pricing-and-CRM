import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { roleFromUser } from "@/lib/auth/roles";
import { getOwnerAccessToken, importJobsByLastNameMatch, recordRun } from "@/lib/backup/engine";

export const maxDuration = 300;

// Scans Google Drive for folders matching each job's customer last name and
// imports their files. For jobs whose folders were set up by hand in Drive and
// never linked to the app. Owner-only (it touches every job).
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (roleFromUser(user) !== "owner") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!adminConfigured()) {
    return NextResponse.json({ error: "not_configured", detail: "Backup service isn't configured (SUPABASE_SERVICE_ROLE_KEY)." }, { status: 503 });
  }

  const admin = createAdminClient();
  const token = await getOwnerAccessToken(admin);
  if (!token) {
    return NextResponse.json({ error: "no_connection", detail: "Google Drive isn't connected (Settings → Connect Google Drive)." }, { status: 400 });
  }

  try {
    const results = await importJobsByLastNameMatch(admin, token);
    const total = results.reduce((sum, r) => sum + r.imported, 0);
    await recordRun(admin, "match", "success", `Matched folders by last name: imported ${total} file(s) across ${results.length} job(s).`, results.length, total);
    return NextResponse.json({ ok: true, imported: total, jobs: results });
  } catch (e) {
    await recordRun(admin, "match", "error", String(e));
    return NextResponse.json({ error: "match_failed", detail: String(e) }, { status: 502 });
  }
}
