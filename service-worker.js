const CACHE_NAME = "boot-scootin-v43";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=43",
  "/script.js?v=43",
  "/brand-logo.png",
  "/app-icon-192.png",
  "/app-icon-512.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isCode = url.pathname.endsWith(".css") || url.pathname.endsWith(".js");
  const acceptsHTML = event.request.headers.get("accept")?.includes("text/html");

  if (acceptsHTML || isCode) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(match => match || caches.match("/index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
