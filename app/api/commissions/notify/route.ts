import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { emailConfigured, sendEmail, commissionSubmittedEmail } from "@/lib/email/resend";

// Who gets notified when a new commission is submitted.
const NOTIFY_EMAIL = "travis@coastaledgedesign.com";

export async function POST(request: NextRequest) {
  // Must be a signed-in user (designers submit these).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!emailConfigured()) {
    // Email isn't set up — don't fail the submission over it.
    return NextResponse.json({ ok: true, skipped: "email_not_configured" });
  }

  let body: { description?: string; jobLabel?: string | null; amount?: number | null; invoicePath?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const invoiceUrl = body.invoicePath
    ? `${SUPABASE_URL}/storage/v1/object/public/commission-invoices/${body.invoicePath}`
    : null;

  const { subject, html } = commissionSubmittedEmail({
    description: (body.description ?? "").trim(),
    jobLabel: body.jobLabel?.trim() || null,
    amount: typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : null,
    invoiceUrl,
    submittedByLabel: (user.user_metadata?.display_name as string | undefined) || user.email || null,
  });

  try {
    await sendEmail(NOTIFY_EMAIL, subject, html);
  } catch (err) {
    return NextResponse.json({ error: "send_failed", detail: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
