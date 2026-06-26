import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { importEverythingFromDrive, getOwnerAccessToken, recordRun } from "@/lib/backup/engine";

export const maxDuration = 300;

// Manual "Sync from Drive now" — pulls files added by hand into the Drive job
// folders back into the matching jobs' CRM attachments. Triggered from Settings.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!adminConfigured()) {
    return NextResponse.json(
      { error: "not_configured", detail: "Add SUPABASE_SERVICE_ROLE_KEY to enable syncing." },
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
    const imported = await importEverythingFromDrive(admin, token);
    await recordRun(admin, "import", "success", `Imported ${imported} files from Google Drive into job attachments.`, undefined, imported);
    return NextResponse.json({ ok: true, imported });
  } catch (e) {
    await recordRun(admin, "import", "error", String(e));
    return NextResponse.json({ error: "import_failed", detail: String(e) }, { status: 502 });
  }
}
