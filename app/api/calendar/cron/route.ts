import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { emailConfigured } from "@/lib/email/resend";
import { runDueReminders } from "@/lib/calendar/notify";

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
  if (!emailConfigured()) return NextResponse.json({ ok: true, sent: 0, skipped: "email_not_configured" });

  const admin = createAdminClient();
  try {
    const sent = await runDueReminders(admin);
    return NextResponse.json({ ok: true, sent });
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
