import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { backupEverything, getOwnerAccessToken, recordRun } from "@/lib/backup/engine";

export const maxDuration = 300;

// Manual "Back up everything now" — triggered from Settings by a logged-in user.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!adminConfigured()) {
    return NextResponse.json(
      { error: "not_configured", detail: "Add SUPABASE_SERVICE_ROLE_KEY to enable backups." },
      { status: 503 },
    );
  }

  const admin = createAdminClient();
  const token = await getOwnerAccessToken(admin);
  if (!token) {
    return NextResponse.json(
      { error: "no_connection", detail: "The backup owner's Google Drive is not connected (Settings → Connect Google Drive)." },
      { status: 400 },
    );
  }

  try {
    const result = await backupEverything(admin, token);
    await recordRun(admin, "manual", "success", `Backed up ${result.jobs} jobs, ${result.files} new files, ${result.contacts} contacts.`, result.jobs, result.files);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await recordRun(admin, "manual", "error", String(e));
    return NextResponse.json({ error: "backup_failed", detail: String(e) }, { status: 502 });
  }
}
