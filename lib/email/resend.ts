// Resend email helpers for appointment confirmations and reminders.
//
// Requires RESEND_API_KEY (server-only). Sends from RESEND_FROM_EMAIL once a
// custom domain is verified in Resend; otherwise falls back to Resend's shared
// test sender (which only delivers to the account owner's own address).

const RESEND_API_URL = "https://api.resend.com/emails";

// Company details shown in the email header/footer. Pulled from the live site.
const COMPANY = {
  name:         "Coastal Edge Cabinetry and Design",
  address:      "1900 Main Street, Suite 108, Sarasota, FL 34236",
  phone:        "(941) 280-0414",
  emails:       ["Carol@coastaledgedesign.com", "Travis@coastaledgedesign.com"],
  website:      "https://coastaledgedesign.com",
  websiteLabel: "coastaledgedesign.com",
  logoUrl:      "https://coastaledgedesign.com/wp-content/uploads/2024/12/coastal-edge-cabinetry-design-logo1-300x90.png",
};

// Replies should go to the first real inbox.
const REPLY_TO_EMAIL = COMPANY.emails[0];

function emailLinks(): string {
  return COMPANY.emails
    .map((e) => `<a href="mailto:${e}" style="color:#93c5fd;">${esc(e)}</a>`)
    .join(" &nbsp;or&nbsp; ");
}

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
    body: JSON.stringify({
      from:     fromAddress(),
      to,
      subject,
      html,
      reply_to: REPLY_TO_EMAIL,
    }),
  });
  if (!res.ok) throw new Error(`Resend send failed: ${await res.text()}`);
}

// The business is in Sarasota, FL. These emails are sent server-side (cron /
// API routes run on Vercel in UTC), so the time zone must be pinned explicitly
// or customers would see UTC times instead of the actual Eastern appointment.
const APP_TIME_ZONE = "America/New_York";

function formatWhen(startTime: string, endTime: string | null): string {
  const start = new Date(startTime);
  const datePart = start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: APP_TIME_ZONE });
  const startPart = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: APP_TIME_ZONE });
  if (!endTime) return `${datePart} at ${startPart}`;
  const endPart = new Date(endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: APP_TIME_ZONE });
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

// Shared, branded email shell: logo header, body, and a footer with the
// NO-REPLY notice plus full contact details.
function layout(bodyHtml: string, companyName: string, companyPhone: string | null): string {
  const name = companyName || COMPANY.name;
  const phone = companyPhone || COMPANY.phone;
  return `
  <div style="background:#f1f5f9; padding:24px 0; font-family: Georgia, 'Times New Roman', serif; color:#1e293b;">
    <div style="max-width:540px; margin:0 auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
      <div style="text-align:center; padding:24px 24px 8px;">
        <img src="${COMPANY.logoUrl}" alt="${esc(name)}" width="220" style="max-width:220px; height:auto;" />
      </div>
      <div style="padding:8px 28px 24px;">
        ${bodyHtml}
      </div>
      <div style="background:#0f172a; color:#cbd5e1; padding:20px 28px; font-size:12px; line-height:1.6;">
        <p style="margin:0 0 8px; color:#f8fafc; font-weight:bold; font-size:13px;">${esc(name)}</p>
        <p style="margin:0;">${esc(COMPANY.address)}</p>
        <p style="margin:0;">${esc(phone)} &nbsp;·&nbsp; ${emailLinks()}</p>
        <p style="margin:0;"><a href="${COMPANY.website}" style="color:#93c5fd;">${esc(COMPANY.websiteLabel)}</a></p>
        <p style="margin:12px 0 0; color:#64748b; font-style:italic;">
          This is an automated message from a no-reply address — please don't reply to this email.
          To reach us, call ${esc(phone)} or email ${emailLinks()}.
        </p>
      </div>
    </div>
  </div>
  `;
}

function detailsBlock(input: AppointmentEmailInput): string {
  const when = formatWhen(input.startTime, input.endTime);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:16px 0; border-collapse:collapse;">
      <tr>
        <td style="padding:6px 0; color:#64748b; width:90px; vertical-align:top;">What</td>
        <td style="padding:6px 0; font-weight:bold;">${esc(input.title)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0; color:#64748b; vertical-align:top;">When</td>
        <td style="padding:6px 0;">${esc(when)}</td>
      </tr>
      ${input.location ? `
      <tr>
        <td style="padding:6px 0; color:#64748b; vertical-align:top;">Where</td>
        <td style="padding:6px 0;"><a href="${mapsLink(input.location)}" style="color:#2563eb;">${esc(input.location)}</a></td>
      </tr>` : ""}
    </table>
  `;
}

export function appointmentConfirmationEmail(input: AppointmentEmailInput): { subject: string; html: string } {
  const when = formatWhen(input.startTime, input.endTime);
  const phone = input.companyPhone || COMPANY.phone;
  const body = `
    <p style="font-size:18px; margin:0 0 4px;">Your appointment is confirmed</p>
    <p style="color:#475569; margin:0 0 4px;">We're looking forward to seeing you. Here are the details:</p>
    ${detailsBlock(input)}
    <p style="color:#475569; font-size:14px; margin:16px 0 0;">
      Need to reschedule or have a question? No problem — just give us a call at
      <strong>${esc(phone)}</strong> and we'll be happy to help find a time that works for you.
    </p>
  `;
  return {
    subject: `Appointment confirmed — ${when}`,
    html: layout(body, input.companyName, input.companyPhone),
  };
}

export function appointmentReminderEmail(input: AppointmentEmailInput): { subject: string; html: string } {
  const when = formatWhen(input.startTime, input.endTime);
  const phone = input.companyPhone || COMPANY.phone;
  const body = `
    <p style="font-size:18px; margin:0 0 4px;">A friendly reminder</p>
    <p style="color:#475569; margin:0 0 4px;">This is a reminder about your upcoming appointment with us:</p>
    ${detailsBlock(input)}
    <p style="color:#475569; font-size:14px; margin:16px 0 0;">
      We look forward to seeing you! If you need to reschedule or anything comes up,
      please give us a call at <strong>${esc(phone)}</strong> and we'll take care of it.
    </p>
  `;
  return {
    subject: `Reminder: ${input.title} — ${when}`,
    html: layout(body, input.companyName, input.companyPhone),
  };
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
