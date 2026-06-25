// Service worker for the Coastal Edge PWA: installability, push notifications,
// and offline support.
//
// Offline strategy: the normal app pages are server-rendered and can't be
// reliably re-rendered without a connection (doing so throws a client-side
// exception), so we DON'T serve stale copies of them offline. Instead, any
// navigation that fails offline falls back to /offline — a fully self-contained
// workspace that runs entirely from on-device data (IndexedDB) and lets the
// user open cached jobs, draw, and save. Static assets are cached so that page
// (and its scripts) load with no signal.
// SW_VERSION: bump this string on any change so browsers fetch a fresh worker. v5

const CACHE = "coastal-edge-v5";

// The offline workspace shell, pre-fetched on install so it's available the
// first time the device goes offline — no warm-up browsing required.
const PRECACHE_URLS = ["/offline"];

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

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Best-effort: fetch each individually (not cache.addAll) so one failed
      // route — e.g. a redirect to /login when logged out — doesn't abort the
      // rest. credentials: "include" so the auth cookie rides along.
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          const res = await fetch(url, { credentials: "include" });
          if (res && res.ok) await cache.put(url, res);
        }),
      );
    })(),
  );
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

// Always hit the network for app pages; if that fails (offline), hand back the
// self-contained /offline workspace rather than a stale server page that would
// crash on render.
async function navigationHandler(request) {
  try {
    return await fetch(request);
  } catch (err) {
    const offline = await caches.match("/offline");
    if (offline) return offline;
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

  // Full page loads: when offline, fall back to the offline workspace.
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Next's RSC client-transition fetches: try network, and if offline just let
  // it fail (the offline workspace doesn't rely on them). Don't serve stale
  // RSC — that's what produced the client-side exceptions.
  const isRsc = url.searchParams.has("_rsc") || request.headers.get("RSC") === "1";
  if (isRsc) return;
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
