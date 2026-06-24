export const USER_NAMES: Record<string, string> = {
  "thetravisj1989@gmail.com": "Travis",
  "carol@coastaledgedesign.com": "Carol",
};

export function userNameForEmail(email: string | null | undefined): string {
  if (!email) return "";
  const lower = email.toLowerCase();
  return USER_NAMES[lower] ?? lower.split("@")[0];
}
