import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { emailConfigured } from "@/lib/email/resend";
import { runDueReminders, runDueStaffPush } from "@/lib/calendar/notify";

export const runtime = "nodejs";

// Checks for appointment reminders that are due and emails them. Runs with no
// user session, so it's protected by the same shared CRON_SECRET as the
// backup cron. Call this on a recurring schedule (every 10-15 minutes is a
// good interval) — see Settings for setup notes.
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured", detail: "CRON_SECRET is not set." }, { status: 503 });
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!adminConfigured()) return NextResponse.json({ error: "not_configured", detail: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });

  const admin = createAdminClient();
  try {
    // Phone push reminders for the team (1h before + at start) — independent of email config.
    const pushed = await runDueStaffPush(admin);
    // Customer email reminders only run when Resend is configured.
    const sent = emailConfigured() ? await runDueReminders(admin) : 0;
    return NextResponse.json({ ok: true, sent, pushed, emailSkipped: !emailConfigured() });
  } catch (e) {
    return NextResponse.json({ error: "reminder_run_failed", detail: String(e) }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
