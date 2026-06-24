import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { VAPID_PUBLIC_KEY } from "@/lib/push/config";

export const runtime = "nodejs";

// Sends a Web Push notification to every OTHER user's devices (everyone except
// the sender). Fired fire-and-forget by the chat after a message is sent.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey) return NextResponse.json({ ok: false, skipped: "not_configured" });

  let body: { title?: string; body?: string; url?: string; tag?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:appointments@coastaledgedesign.com",
    VAPID_PUBLIC_KEY,
    privateKey,
  );

  const senderEmail = user.email.toLowerCase();
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .neq("user_email", senderEmail);

  if (!subs?.length) return NextResponse.json({ ok: true, sent: 0 });

  const payload = JSON.stringify({
    title: body.title || "Coastal Edge",
    body:  body.body || "",
    url:   body.url || "/chat",
    tag:   body.tag || "chat",
  });

  let sent = 0;
  const expired: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) expired.push(s.id);
      }
    }),
  );

  // Clean up subscriptions the push service says are gone.
  if (expired.length) await supabase.from("push_subscriptions").delete().in("id", expired);

  return NextResponse.json({ ok: true, sent });
}
