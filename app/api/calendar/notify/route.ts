import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emailConfigured } from "@/lib/email/resend";
import { sendConfirmationIfNeeded } from "@/lib/calendar/notify";

// Fired right after an appointment is created/rescheduled to send the
// customer their confirmation email.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!emailConfigured()) return NextResponse.json({ ok: false, skipped: "not_configured" });

  let eventId: string | undefined;
  try {
    ({ eventId } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!eventId) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  try {
    const sent = await sendConfirmationIfNeeded(supabase, eventId);
    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    return NextResponse.json({ error: "send_failed", detail: String(e) }, { status: 502 });
  }
}
