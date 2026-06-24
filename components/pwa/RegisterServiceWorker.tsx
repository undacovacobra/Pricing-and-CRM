"use client";
import { useEffect } from "react";
import { registerServiceWorker, ensurePushSubscription } from "@/lib/push/client";

// Registers the PWA service worker app-wide, and (if the user already granted
// notification permission) makes sure this device's push subscription is saved.
export function RegisterServiceWorker() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const reg = await registerServiceWorker();
      if (reg && !cancelled) await ensurePushSubscription();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
