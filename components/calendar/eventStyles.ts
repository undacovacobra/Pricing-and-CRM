export const TYPE_LABELS: Record<string, string> = {
  appointment: "Appointment",
  install:     "Installer Visit",
  delivery:    "Delivery",
  personal:    "Personal",
  task:        "Task",
};

export const TYPE_COLORS: Record<string, string> = {
  appointment: "bg-blue-100 text-blue-700",
  install:     "bg-amber-100 text-amber-700",
  delivery:    "bg-teal-100 text-teal-700",
  personal:    "bg-slate-100 text-slate-600",
  task:        "bg-rose-100 text-rose-700",
};

export const TYPE_DOT_COLORS: Record<string, string> = {
  appointment: "bg-blue-500",
  install:     "bg-amber-500",
  delivery:    "bg-teal-500",
  personal:    "bg-slate-400",
  task:        "bg-rose-500",
};

export type AssigneeKind = "owner" | "designer" | "installer";

export function assigneeKind(assignedTo: string): AssigneeKind {
  if (assignedTo === "owner" || assignedTo === "designer") return assignedTo;
  return "installer";
}

export const ASSIGNEE_COLORS: Record<AssigneeKind, string> = {
  owner:     "bg-purple-100 text-purple-700",
  designer:  "bg-pink-100 text-pink-700",
  installer: "bg-emerald-100 text-emerald-700",
};

export const ASSIGNEE_DOT_COLORS: Record<AssigneeKind, string> = {
  owner:     "bg-purple-500",
  designer:  "bg-pink-500",
  installer: "bg-emerald-500",
};

export function mapsLink(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

// The business operates out of Sarasota, FL. Calendar pages render in Server
// Components, which execute on Vercel in UTC — without pinning this zone,
// times/day-buckets would silently shift from what was actually scheduled.
export const APP_TIME_ZONE = "America/New_York";

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: APP_TIME_ZONE }).format(new Date(iso));
}

export function timeRange(start: string, end: string | null): string {
  return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
}

export function localDayKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
