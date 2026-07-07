// Roles and the username-login convention.
//
// Supabase Auth is email-based, so username-only accounts (e.g. the installer)
// are backed by a synthetic email at a domain we never send mail to. The user
// types just their username; we map it to that email to sign in.

export type AppRole = "owner" | "designer" | "installer";

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
  if (meta === "owner" || meta === "designer" || meta === "installer") return meta;
  // Fallback for the original two accounts, which predate role metadata.
  return (user?.email ?? "").toLowerCase() === DESIGNER_EMAIL ? "designer" : "owner";
}

// Which top-level areas each role may open. Installers are limited to the day
// view, calendar, and tasks; everyone else has full access.
const INSTALLER_ALLOWED = ["/today", "/calendar", "/tasks"];

export function pathAllowedForRole(pathname: string, role: AppRole): boolean {
  if (role !== "installer") return true;
  return INSTALLER_ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const INSTALLER_HOME = "/today";
