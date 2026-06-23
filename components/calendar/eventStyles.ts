export const TYPE_LABELS: Record<string, string> = {
  appointment: "Appointment",
  install:     "Installer Visit",
  personal:    "Personal",
};

export const TYPE_COLORS: Record<string, string> = {
  appointment: "bg-blue-100 text-blue-700",
  install:     "bg-amber-100 text-amber-700",
  personal:    "bg-slate-100 text-slate-600",
};

export const TYPE_DOT_COLORS: Record<string, string> = {
  appointment: "bg-blue-500",
  install:     "bg-amber-500",
  personal:    "bg-slate-400",
};

export function mapsLink(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function timeRange(start: string, end: string | null): string {
  return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
}
