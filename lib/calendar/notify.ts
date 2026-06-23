import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, appointmentConfirmationEmail, appointmentReminderEmail } from "@/lib/email/resend";

async function companyInfo(db: SupabaseClient) {
  const { data } = await db.from("app_settings").select("company_name, company_phone").maybeSingle();
  return {
    companyName: data?.company_name || "Coastal Edge Cabinetry and Design",
    companyPhone: data?.company_phone ?? null,
  };
}

async function customerEmail(db: SupabaseClient, customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await db.from("customers").select("email").eq("id", customerId).maybeSingle();
  return data?.email ?? null;
}

// Sends the "your appointment is confirmed" email right after a customer
// appointment is created/rescheduled. No-ops if the event has no linked
// customer or the customer has no email on file.
export async function sendConfirmationIfNeeded(db: SupabaseClient, eventId: string): Promise<boolean> {
  const { data: event } = await db.from("calendar_events").select("*").eq("id", eventId).maybeSingle();
  if (!event || event.event_type !== "appointment" || event.status !== "scheduled") return false;

  const email = await customerEmail(db, event.customer_id);
  if (!email) return false;

  const { companyName, companyPhone } = await companyInfo(db);
  const { subject, html } = appointmentConfirmationEmail({
    title: event.title,
    startTime: event.start_time,
    endTime: event.end_time,
    location: event.location,
    companyName,
    companyPhone,
  });
  await sendEmail(email, subject, html);
  await db.from("calendar_events").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", eventId);
  return true;
}

// Finds every scheduled appointment whose reminder window has arrived and
// hasn't been sent yet, and emails the customer. Run on a recurring schedule
// (see /api/calendar/cron) — safe to call repeatedly, already-sent reminders
// are skipped.
export async function runDueReminders(db: SupabaseClient): Promise<number> {
  const now = new Date();
  const { data: events } = await db
    .from("calendar_events")
    .select("*")
    .eq("event_type", "appointment")
    .eq("status", "scheduled")
    .is("reminder_sent_at", null)
    .not("reminder_minutes_before", "is", null)
    .gt("start_time", now.toISOString());

  if (!events?.length) return 0;

  const { companyName, companyPhone } = await companyInfo(db);
  let sent = 0;
  for (const event of events) {
    const dueAt = new Date(event.start_time).getTime() - event.reminder_minutes_before * 60_000;
    if (dueAt > now.getTime()) continue;

    const email = await customerEmail(db, event.customer_id);
    if (!email) {
      // No email to send to — mark as handled so we don't keep re-checking it.
      await db.from("calendar_events").update({ reminder_sent_at: now.toISOString() }).eq("id", event.id);
      continue;
    }

    try {
      const { subject, html } = appointmentReminderEmail({
        title: event.title,
        startTime: event.start_time,
        endTime: event.end_time,
        location: event.location,
        companyName,
        companyPhone,
      });
      await sendEmail(email, subject, html);
      await db.from("calendar_events").update({ reminder_sent_at: now.toISOString() }).eq("id", event.id);
      sent++;
    } catch {
      // leave reminder_sent_at null so the next cron run retries
    }
  }
  return sent;
}
