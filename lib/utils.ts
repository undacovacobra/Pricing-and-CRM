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

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  // Never let a single unparseable value throw during render — a bad date
  // anywhere on a page would otherwise blank the whole page server-side.
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

// Date + time, safe against unparseable input (used for appointments).
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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
