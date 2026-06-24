"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, BellRing } from "lucide-react";
import { pushSupported, enablePushNotifications } from "@/lib/push/client";

// Lets a user turn on phone push alerts. Hides itself once notifications are on
// (or if the browser doesn't support them).
export function EnableNotificationsButton() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPerm(pushSupported() ? Notification.permission : "unsupported");
  }, []);

  if (perm === null || perm === "unsupported" || perm === "granted") return null;

  async function handleEnable() {
    setBusy(true);
    const result = await enablePushNotifications();
    setPerm(result);
    setBusy(false);
  }

  if (perm === "denied") {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Bell className="h-3.5 w-3.5" />
        Notifications are blocked — enable them for this site in your browser settings.
      </p>
    );
  }

  return (
    <Button onClick={handleEnable} disabled={busy} variant="outline" size="sm">
      <BellRing className="h-4 w-4" />
      {busy ? "Enabling…" : "Enable phone alerts"}
    </Button>
  );
}
