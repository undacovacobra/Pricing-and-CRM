import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { backupJob, backupContacts, backupCalendar, getOwnerAccessToken } from "@/lib/backup/engine";

export const maxDuration = 60;

// Live backup, fired (fire-and-forget) by the app after a job or customer
// changes. Backs up one job, and/or refreshes the Contacts sheet.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!adminConfigured()) return NextResponse.json({ ok: false, skipped: "not_configured" });

  let jobId: string | undefined;
  let contacts = false;
  let calendar = false;
  try {
    const body = await request.json();
    jobId = body.jobId;
    contacts = !!body.contacts;
    calendar = !!body.calendar;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const token = await getOwnerAccessToken(admin);
  if (!token) return NextResponse.json({ ok: false, skipped: "no_connection" });

  try {
    let files = 0;
    if (jobId) files = await backupJob(admin, token, jobId);
    if (contacts) await backupContacts(admin, token);
    if (calendar) await backupCalendar(admin, token);
    return NextResponse.json({ ok: true, files });
  } catch (e) {
    return NextResponse.json({ error: "backup_failed", detail: String(e) }, { status: 502 });
  }
}
