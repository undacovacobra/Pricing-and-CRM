import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, getGoogleEmail, googleConfigured } from "@/lib/google/drive";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const code = request.nextUrl.searchParams.get("code");
  const stateRaw = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  let returnTo = "/settings";
  try {
    if (stateRaw) {
      const parsed = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
      if (parsed?.returnTo) returnTo = parsed.returnTo;
    }
  } catch {
    // ignore malformed state
  }

  if (error || !code) {
    return NextResponse.redirect(`${origin}${returnTo}?google=denied`);
  }
  if (!googleConfigured()) {
    return NextResponse.redirect(`${origin}${returnTo}?google=not_configured`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code, origin);
    const email = await getGoogleEmail(tokens.access_token);
    const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Google only returns a refresh_token on first consent. If absent (re-consent
    // without prompt), keep the existing one.
    const { data: existing } = await supabase
      .from("google_connections")
      .select("refresh_token")
      .maybeSingle();

    const refreshToken = tokens.refresh_token || existing?.refresh_token;
    if (!refreshToken) {
      return NextResponse.redirect(`${origin}${returnTo}?google=no_refresh_token`);
    }

    await supabase.from("google_connections").upsert({
      user_id:       user.id,
      google_email:  email,
      refresh_token: refreshToken,
      access_token:  tokens.access_token,
      token_expiry:  tokenExpiry,
      scope:         tokens.scope ?? null,
      updated_at:    new Date().toISOString(),
    });

    return NextResponse.redirect(`${origin}${returnTo}?google=connected`);
  } catch {
    return NextResponse.redirect(`${origin}${returnTo}?google=error`);
  }
}
