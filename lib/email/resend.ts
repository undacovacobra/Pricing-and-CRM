// Resend email helpers for appointment confirmations and reminders.
//
// Requires RESEND_API_KEY (server-only). Falls back to Resend's shared test
// sender (onboarding@resend.dev) until a custom domain is verified — set
// RESEND_FROM_EMAIL (e.g. "Coastal Edge Cabinetry <appointments@coastaledgedesign.com>")
// once the domain is verified in Resend for branded delivery.

const RESEND_API_URL = "https://api.resend.com/emails";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || "Coastal Edge Cabinetry <onboarding@resend.dev>";
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch(RESEND_API_URL, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: fromAddress(), to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend send failed: ${await res.text()}`);
}

function formatWhen(startTime: string, endTime: string | null): string {
  const start = new Date(startTime);
  const datePart = start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const startPart = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (!endTime) return `${datePart} at ${startPart}`;
  const endPart = new Date(endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart}, ${startPart} – ${endPart}`;
}

function mapsLink(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

interface AppointmentEmailInput {
  title: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  companyName: string;
  companyPhone: string | null;
}

export function appointmentConfirmationEmail(input: AppointmentEmailInput): { subject: string; html: string } {
  const when = formatWhen(input.startTime, input.endTime);
  return {
    subject: `Appointment confirmed — ${when}`,
    html: `
      <div style="font-family: Georgia, serif; color:#1e293b; max-width:480px;">
        <h2 style="margin-bottom:4px;">${esc(input.companyName)}</h2>
        <p style="color:#475569;">Your appointment is confirmed:</p>
        <p style="font-size:16px;"><strong>${esc(input.title)}</strong><br/>${esc(when)}</p>
        ${input.location ? `<p><a href="${mapsLink(input.location)}" style="color:#2563eb;">${esc(input.location)}</a></p>` : ""}
        <p style="color:#475569; font-size:14px; margin-top:24px;">
          Need to reschedule? Just give us a call${input.companyPhone ? ` at ${esc(input.companyPhone)}` : ""}.
        </p>
      </div>
    `,
  };
}

export function appointmentReminderEmail(input: AppointmentEmailInput): { subject: string; html: string } {
  const when = formatWhen(input.startTime, input.endTime);
  return {
    subject: `Reminder: ${input.title} — ${when}`,
    html: `
      <div style="font-family: Georgia, serif; color:#1e293b; max-width:480px;">
        <h2 style="margin-bottom:4px;">${esc(input.companyName)}</h2>
        <p style="color:#475569;">This is a reminder about your upcoming appointment:</p>
        <p style="font-size:16px;"><strong>${esc(input.title)}</strong><br/>${esc(when)}</p>
        ${input.location ? `<p><a href="${mapsLink(input.location)}" style="color:#2563eb;">${esc(input.location)}</a></p>` : ""}
        <p style="color:#475569; font-size:14px; margin-top:24px;">
          See you soon!${input.companyPhone ? ` Questions? Call us at ${esc(input.companyPhone)}.` : ""}
        </p>
      </div>
    `,
  };
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
