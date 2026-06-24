// Service worker for the Coastal Edge PWA: enables install + push notifications.
// Kept intentionally minimal — no offline caching of app data (the app needs a
// live Supabase connection), just what's required for installability and push.
// SW_VERSION: bump this string on any change so browsers fetch a fresh worker. v2

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Incoming web push → show a notification, even when the app is fully closed.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Coastal Edge", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Coastal Edge";
  const options = {
    body: payload.body || "",
    icon: "/icon-192-v2.png",
    badge: "/icon-192-v2.png",
    tag: payload.tag || undefined,
    data: { url: payload.url || "/chat" },
    renotify: Boolean(payload.tag),
  };
  event.waitUntil(
    (async () => {
      // Don't buzz the phone if the app is already open and on screen.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = windows.some((c) => c.visibilityState === "visible");
      if (visible) return;
      await self.registration.showNotification(title, options);
    })(),
  );
});

// Tapping a notification focuses an existing tab or opens the target URL.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/chat";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
