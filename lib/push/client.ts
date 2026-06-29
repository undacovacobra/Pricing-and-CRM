import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "./config";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    // If a new service worker takes control mid-session, reload once so the app
    // runs the fresh build instead of a stale cached one. Only reload when there
    // was already a controller (i.e. this is an update, not first install).
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    const reg = await navigator.serviceWorker.register("/sw.js");
    // Force an update check on every app open so new deploys are picked up
    // promptly rather than whenever the browser happens to re-check sw.js.
    reg.update().catch(() => {});
    return reg;
  } catch {
    return null;
  }
}

// Creates (or reuses) this browser's push subscription and saves it server-side.
// Safe to call repeatedly. No-ops if permission hasn't been granted.
export async function ensurePushSubscription(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Requests permission (if needed) then subscribes. Returns the final state.
export async function enablePushNotifications(): Promise<NotificationPermission> {
  if (!pushSupported()) return "denied";
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission === "granted") await ensurePushSubscription();
  return permission;
}
