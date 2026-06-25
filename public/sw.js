// Service worker for the Coastal Edge PWA: installability, push notifications,
// and offline support (app shell + visited pages cached so the app — and the
// job drawing tool in particular — works in the field with no signal).
// SW_VERSION: bump this string on any change so browsers fetch a fresh worker. v3

const CACHE = "coastal-edge-v3";

// Same-origin static assets we serve cache-first (immutable, hashed, or rarely
// changing). Everything else falls under the runtime strategies below.
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/logo.svg" ||
    /\.(?:png|jpg|jpeg|svg|webp|woff2?|ttf)$/.test(url.pathname)
  );
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Refresh in the background; don't block the response.
    fetch(request)
      .then((res) => {
        if (res && res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
      })
      .catch(() => {});
    return cached;
  }
  const res = await fetch(request);
  if (res && res.ok) {
    const clone = res.clone();
    caches.open(CACHE).then((c) => c.put(request, clone));
  }
  return res;
}

async function networkFirst(request, fallbackToShell) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const clone = res.clone();
      caches.open(CACHE).then((c) => c.put(request, clone));
    }
    return res;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackToShell) {
      // Last resort for a navigation we've never cached: hand back any cached
      // app page so the client router/IndexedDB can take over offline.
      const anyPage =
        (await caches.match("/")) ||
        (await caches.match("/jobs")) ||
        (await caches.match("/calendar"));
      if (anyPage) return anyPage;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never cache mutations

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let Supabase/Google hit network
  if (url.pathname.startsWith("/api/")) return; // dynamic; needs the network

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Page navigations and Next's RSC fetches: fresh when online, cached offline.
  const isNavigation = request.mode === "navigate";
  const isRsc = url.searchParams.has("_rsc") || request.headers.get("RSC") === "1";
  if (isNavigation || isRsc) {
    event.respondWith(networkFirst(request, isNavigation));
    return;
  }

  // Other same-origin GETs: network-first with cache fallback.
  event.respondWith(networkFirst(request, false));
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
