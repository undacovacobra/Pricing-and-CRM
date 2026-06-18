// Google Drive OAuth + API helpers.
//
// Requires two environment variables (server-only) to be set before the
// integration does anything:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//
// Scope: drive.file — the app can create and manage only the files/folders it
// creates. This is the least-privilege scope for "create a folder per job and
// upload into it" and does not require Google's restricted-scope verification.

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(origin: string): string {
  return `${origin}/api/google/callback`;
}

export function buildConsentUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri:  redirectUri(origin),
    response_type: "code",
    scope:         `${GOOGLE_DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
    access_type:   "offline",
    prompt:        "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

export async function exchangeCodeForTokens(code: string, origin: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri:  redirectUri(origin),
      grant_type:    "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type:    "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return res.json();
}

export async function getGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

export interface DriveFolder {
  id: string;
  webViewLink: string;
}

export async function createDriveFolder(accessToken: string, name: string, parentId?: string): Promise<DriveFolder> {
  const res = await fetch(`${DRIVE_FILES_URL}?fields=id,webViewLink`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Drive folder creation failed: ${await res.text()}`);
  return res.json();
}
