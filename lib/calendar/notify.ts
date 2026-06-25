import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, appointmentConfirmationEmail, appointmentReminderEmail } from "@/lib/email/resend";
import { sendPushToAll } from "@/lib/push/send";

const APP_TIME_ZONE = "America/New_York";

function pushTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: APP_TIME_ZONE });
}

function whoLabel(assignedTo: string): string {
  if (assignedTo === "owner") return "Travis";
  if (assignedTo === "designer") return "Carol";
  return assignedTo;
}

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

// Sends phone push notifications to the team for upcoming calendar events:
// one about an hour before, and one right as the event starts. Runs on the same
// recurring cron as the email reminders (every ~15 min) and is idempotent — each
// window's timestamp is stamped once so it won't re-fire.
export async function runDueStaffPush(db: SupabaseClient): Promise<number> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  // Window wide enough to catch both the "1h before" and "at start" moments
  // given a ~15-minute cron cadence.
  const fromIso = new Date(now - 30 * 60_000).toISOString();
  const toIso = new Date(now + 65 * 60_000).toISOString();

  const { data: events } = await db
    .from("calendar_events")
    .select("*")
    .eq("status", "scheduled")
    .neq("event_type", "task") // task reminders are handled separately (daily)
    .gte("start_time", fromIso)
    .lte("start_time", toIso);

  if (!events?.length) return 0;

  let sent = 0;
  for (const event of events) {
    const start = new Date(event.start_time).getTime();
    const minsUntil = (start - now) / 60_000;
    const where = event.location ? ` · ${event.location}` : "";
    const who = whoLabel(event.assigned_to);

    // ~1 hour before: fire once when we're between 60 and 30 minutes out.
    if (!event.push_1h_sent_at && minsUntil <= 60 && minsUntil > 30) {
      const n = await sendPushToAll(db, {
        title: `Coming up: ${event.title}`,
        body:  `In about an hour (${pushTime(event.start_time)}) — ${who}${where}`,
        url:   "/calendar",
        tag:   `cal-1h-${event.id}`,
      });
      await db.from("calendar_events").update({ push_1h_sent_at: nowIso }).eq("id", event.id);
      if (n > 0) sent++;
    }

    // At start time: fire once from ~7 min before until 30 min after.
    if (!event.push_start_sent_at && minsUntil <= 7 && minsUntil > -30) {
      const n = await sendPushToAll(db, {
        title: `Now: ${event.title}`,
        body:  `Starting ${pushTime(event.start_time)} — ${who}${where}`,
        url:   "/calendar",
        tag:   `cal-start-${event.id}`,
      });
      await db.from("calendar_events").update({ push_start_sent_at: nowIso }).eq("id", event.id);
      if (n > 0) sent++;
    }
  }
  return sent;
}
