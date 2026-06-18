import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await supabase.from("google_connections").delete().eq("user_id", user.id);
  return NextResponse.redirect(`${origin}/settings?google=disconnected`, { status: 303 });
}
