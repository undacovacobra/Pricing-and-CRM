// Shared helpers for the Tasks feature: mapping between the stored role values
// ("owner"/"designer") and people, and turning a due date into a calendar time.

export type TaskRole = "owner" | "designer";

export const OWNER_EMAIL = "thetravisj1989@gmail.com";
export const DESIGNER_EMAIL = "carol@coastaledgedesign.com";

export function roleFromEmail(email: string | null | undefined): TaskRole {
  return (email ?? "").toLowerCase() === DESIGNER_EMAIL ? "designer" : "owner";
}

export function emailForRole(role: TaskRole): string {
  return role === "designer" ? DESIGNER_EMAIL : OWNER_EMAIL;
}

export function taskPersonLabel(role: string | null | undefined): string {
  if (role === "designer") return "Carol";
  if (role === "owner") return "Travis";
  return role || "Unassigned";
}

export function normalizeRole(value: string | null | undefined, fallback: TaskRole): TaskRole {
  const v = (value ?? "").toLowerCase().trim();
  if (v === "designer" || v.includes("carol")) return "designer";
  if (v === "owner" || v.includes("travis")) return "owner";
  return fallback;
}

const APP_TIME_ZONE = "America/New_York";

// Converts a wall-clock date+time in the business's timezone to a UTC ISO
// instant, accounting for DST.
export function zonedToUtcIso(dateStr: string, time: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, h, mi, 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcGuess)).reduce((acc: Record<string, string>, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return new Date(utcGuess - (asUtc - utcGuess)).toISOString();
}

// Where a task's calendar entry sits. With a specific time, that exact Eastern
// time; otherwise 1pm UTC (~8–9am Eastern — same calendar day, sane morning hour).
export function taskCalendarStart(dueDate: string, dueTime?: string | null): string {
  if (dueTime && /^\d{2}:\d{2}$/.test(dueTime)) return zonedToUtcIso(dueDate, dueTime);
  return `${dueDate}T13:00:00.000Z`;
}
