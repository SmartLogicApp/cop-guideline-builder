// CMS CoP Compliance Suite — Service Worker
const CACHE = "cop-suite-v3";

// Assets to pre-cache on install (shell + key statics)
const PRECACHE = ["/", "/index.html"];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls — always go to the network
  if (url.pathname.startsWith("/api/")) return;

  // Navigation requests: network-first so users always get fresh HTML,
  // fall back to cached index.html for offline SPA routing.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static assets: cache-first, then network with cache update.
  if (
    url.pathname.match(/\.(js|css|png|svg|ico|woff2?|ttf|json)$/) &&
    url.origin === self.location.origin
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
          return response;
        });
      })
    );
    return;
  }
});
