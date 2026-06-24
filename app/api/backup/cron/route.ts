import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { backupEverything, getOwnerAccessToken, recordRun } from "@/lib/backup/engine";

export const maxDuration = 300;

// Nightly full backup. Runs with no user session, so it is protected by a shared
// secret instead of auth. Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured", detail: "CRON_SECRET is not set." }, { status: 503 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminConfigured()) {
    return NextResponse.json({ error: "not_configured", detail: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  }

  const admin = createAdminClient();
  const token = await getOwnerAccessToken(admin);
  if (!token) {
    await recordRun(admin, "nightly", "error", "Owner Google Drive not connected.");
    return NextResponse.json({ error: "no_connection" }, { status: 400 });
  }

  try {
    const result = await backupEverything(admin, token);
    await recordRun(admin, "nightly", "success", `Backed up ${result.jobs} jobs, ${result.files} new files, ${result.contacts} contacts, ${result.calendarEvents} calendar events, ${result.commissions} commissions.`, result.jobs, result.files);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await recordRun(admin, "nightly", "error", String(e));
    return NextResponse.json({ error: "backup_failed", detail: String(e) }, { status: 502 });
  }
}

// Vercel Cron issues GET requests.
export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
