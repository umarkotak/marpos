const cacheName = "marpos-app-v3";
const shell = ["/", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(shell)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("marpos-") && name !== cacheName).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_SHELL") return;
  const urls = event.data.urls.filter((value) => {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin && (url.pathname === "/" || url.pathname.startsWith("/_next/static/"));
  });
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName);
      await Promise.all(urls.map(async (url) => {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error("App file was not available.");
        await cache.put(url, response);
      }));
      event.ports[0]?.postMessage({ ready: true });
    } catch {
      event.ports[0]?.postMessage({ ready: false });
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/backend/") || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(request, { signal: controller.signal });
        if (response.status >= 500) throw new Error("Web server is unavailable.");
        if (response.ok && url.pathname === "/") {
          await (await caches.open(cacheName)).put("/", response.clone());
        }
        return response;
      } catch {
        return await caches.match("/") || await caches.match("/offline.html");
      } finally {
        clearTimeout(timeout);
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await (await caches.open(cacheName)).put(request, response.clone());
      return response;
    })());
  }
});
