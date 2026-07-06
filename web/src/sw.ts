/// <reference lib="webworker" />
/**
 * Service worker: Web Push receipt + notification click routing, plus a small
 * offline cache so recent items/audio re-listen works without network
 * (spec §2, §10 — past-item re-listening free/offline).
 */
export {};
declare const self: ServiceWorkerGlobalScope;

const CACHE = "kikimimi-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener("push", (event) => {
  let data: PushPayload = { title: "聞き耳 Kikimimi", body: "今日の一本が届きました" };
  try {
    if (event.data) data = { ...data, ...(event.data.json() as PushPayload) };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "聞き耳 Kikimimi", {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          void client.focus();
          if ("navigate" in client) void (client as WindowClient).navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

/**
 * Fetch strategy:
 *  - API calls: network-only (never cache authed JSON).
 *  - Audio: cache-first (re-listen offline).
 *  - App shell / assets: cache-first with network fallback.
 */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return; // let it hit the network

  if (url.pathname.startsWith("/audio/")) {
    event.respondWith(cacheFirst(event.request, true));
    return;
  }
  event.respondWith(cacheFirst(event.request, false));
});

async function cacheFirst(request: Request, storeOpaque: boolean): Promise<Response> {
  const cached = await caches.match(request, { ignoreSearch: request.url.includes("/audio/") });
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok || (storeOpaque && res.type === "opaque")) {
      const cache = await caches.open(CACHE);
      void cache.put(request, res.clone());
    }
    return res;
  } catch {
    const shell = await caches.match("/index.html");
    return shell ?? new Response("offline", { status: 503 });
  }
}
