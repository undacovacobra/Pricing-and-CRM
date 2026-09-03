import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "$0.00";
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

// The business runs on Eastern time. Pages render both on the server (UTC on
// Vercel) and in the browser, so every date/time must be pinned to this zone or
// the same value renders differently in the two places.
export const APP_TIME_ZONE = "America/New_York";

// "2026-09-03" — a plain calendar date with no time and no zone.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  // A date-only value (due dates, start dates) means that calendar day and
  // nothing else. JS parses it as UTC midnight, which renders as the PREVIOUS
  // day anywhere behind UTC — so format its parts directly instead.
  if (typeof date === "string" && DATE_ONLY.test(date)) {
    const [y, m, d] = date.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  }
  // Never let a single unparseable value throw during render — a bad date
  // anywhere on a page would otherwise blank the whole page server-side.
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
  }).format(d);
}

// Today's date as a YYYY-MM-DD value for <input type="date">, in Eastern time
// (not UTC — which would jump to tomorrow after 8pm locally).
export function todayInputValue(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Date + time, safe against unparseable input (used for appointments).
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  // A date-only value has no time to show — render it as a plain date.
  if (typeof date === "string" && DATE_ONLY.test(date)) return formatDate(date);
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(d);
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) return `(${match[1]}) ${match[2]}-${match[3]}`;
  return phone;
}

export function generateInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

// Display name for a customer. Umbrella customers (builders, etc.) store their
// business name in first_name with an empty last_name, so this collapses to the
// business name; individuals show "First Last".
export function customerName(c: { first_name: string; last_name?: string | null }): string {
  return `${c.first_name}${c.last_name ? ` ${c.last_name}` : ""}`.trim();
}

const TEAM_NAMES: Record<string, string> = { owner: "Travis", designer: "Carol" };

export function teamMemberName(value: string | null | undefined): string {
  if (!value) return "";
  return TEAM_NAMES[value] ?? value;
}
