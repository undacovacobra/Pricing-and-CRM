// Roles and the username-login convention.
//
// Supabase Auth is email-based, so username-only accounts (e.g. the installer)
// are backed by a synthetic email at a domain we never send mail to. The user
// types just their username; we map it to that email to sign in.

// "bookkeeper" is a commissions-only login: it can see the Commissions page and
// nothing else (no jobs, customers, pricing, estimates, or settings).
export type AppRole = "owner" | "designer" | "installer" | "bookkeeper";

export const USERNAME_EMAIL_DOMAIN = "users.coastaledge.app";

const DESIGNER_EMAIL = "carol@coastaledgedesign.com";

// A user whose "email" is really a synthetic username@domain login.
export function isUsernameLogin(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`);
}

export function emailForUsername(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

// The value shown/typed as the "login": the bare username for synthetic accounts,
// or the real email otherwise.
export function loginNameFromEmail(email: string | null | undefined): string {
  if (!email) return "";
  return isUsernameLogin(email) ? email.split("@")[0] : email;
}

// Turn a login field value into the email to authenticate with.
export function loginInputToEmail(input: string): string {
  const v = input.trim();
  return v.includes("@") ? v : emailForUsername(v);
}

type RoleUser = { email?: string | null; app_metadata?: unknown } | null | undefined;

export function roleFromUser(user: RoleUser): AppRole {
  const meta =
    user && typeof user.app_metadata === "object" && user.app_metadata !== null
      ? (user.app_metadata as { role?: unknown }).role
      : undefined;
  if (meta === "owner" || meta === "designer" || meta === "installer" || meta === "bookkeeper") return meta;
  // Fallback for the original two accounts, which predate role metadata.
  return (user?.email ?? "").toLowerCase() === DESIGNER_EMAIL ? "designer" : "owner";
}

// Which top-level areas each role may open. Installers get the day view, calendar,
// tasks, and a read-only view of jobs/customers (for addresses, notes, drawings).
// Bookkeepers get commissions only. Everyone else has full access.
const INSTALLER_ALLOWED = ["/today", "/calendar", "/tasks", "/jobs", "/customers"];
const BOOKKEEPER_ALLOWED = ["/commissions"];

export function pathAllowedForRole(pathname: string, role: AppRole): boolean {
  if (role === "bookkeeper") {
    return BOOKKEEPER_ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  if (role !== "installer") return true;
  const inScope = INSTALLER_ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!inScope) return false;
  // Jobs/customers are view-only for installers: no creating, editing, or the
  // document tools (which expose pricing).
  if (pathname.startsWith("/jobs") || pathname.startsWith("/customers")) {
    if (pathname.endsWith("/new") || pathname.endsWith("/edit")) return false;
    if (pathname.includes("/documents")) return false;
  }
  return true;
}

export const INSTALLER_HOME = "/today";
export const BOOKKEEPER_HOME = "/commissions";

// Where a role lands when it signs in or hits a page it isn't allowed to open.
export function homeForRole(role: AppRole): string {
  if (role === "installer") return INSTALLER_HOME;
  if (role === "bookkeeper") return BOOKKEEPER_HOME;
  return "/";
}

// Roles that only see a slice of the app (used to trim navigation and hide the
// assistant, which can reach data these roles shouldn't see).
export function isLimitedRole(role: AppRole): boolean {
  return role === "installer" || role === "bookkeeper";
}
