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

// A task's calendar entry sits at 1pm UTC on the due date — that's 8–9am in the
// business's Eastern timezone, i.e. the same calendar day, at a sane morning hour.
export function taskCalendarStart(dueDate: string): string {
  return `${dueDate}T13:00:00.000Z`;
}
