import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildConsentUrl, googleConfigured } from "@/lib/google/drive";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;

  if (!googleConfigured()) {
    return NextResponse.redirect(`${origin}/settings?google=not_configured`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // Where to return after the OAuth dance (defaults to settings).
  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/settings";
  const state = Buffer.from(JSON.stringify({ returnTo })).toString("base64url");

  return NextResponse.redirect(buildConsentUrl(origin, state));
}
