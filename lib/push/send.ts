import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VAPID_PUBLIC_KEY } from "@/lib/push/config";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

let vapidReady = false;
function ensureVapid(): boolean {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:appointments@coastaledgedesign.com",
      VAPID_PUBLIC_KEY,
      privateKey,
    );
    vapidReady = true;
  }
  return true;
}

// Sends a push to every stored subscription (or just the given emails). Safe to
// call from a cron/admin context — no user session required. Prunes dead
// subscriptions the push service reports as gone. Returns how many were sent.
export async function sendPushToAll(
  admin: SupabaseClient,
  payload: PushPayload,
  emails?: string[],
): Promise<number> {
  if (!ensureVapid()) return 0;

  let query = admin.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (emails?.length) query = query.in("user_email", emails.map((e) => e.toLowerCase()));
  const { data: subs } = await query;
  if (!subs?.length) return 0;

  const body = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    url:   payload.url || "/calendar",
    tag:   payload.tag || "calendar",
  });

  let sent = 0;
  const expired: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
        sent++;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) expired.push(s.id);
      }
    }),
  );
  if (expired.length) await admin.from("push_subscriptions").delete().in("id", expired);
  return sent;
}
