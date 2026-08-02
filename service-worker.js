const CACHE_NAME = "boot-scootin-v36";
const APP_SHELL = [
  "/",
  "/index.html",
  "/about.html",
  "/calendar.html",
  "/dance-diary.html",
  "/dance-library.html",
  "/community.html",
  "/private-events.html",
  "/requests.html",
  "/journey.html",
  "/ask-nora.html",
  "/passport.html",
  "/moonshine.html",
  "/country-map.html",
  "/styles.css",
  "/script.js",
  "/manifest.webmanifest",
  "/brand-logo.png",
  "/app-icon-192.png",
  "/app-icon-512.png",
  "/nora.webp",
  "/landing-poster.webp"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
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

  const requestURL = new URL(event.request.url);
  if (requestURL.origin !== self.location.origin) return;

  const acceptsHTML = event.request.headers.get("accept")?.includes("text/html");

  if (acceptsHTML) {
    event.respondWith(
      fetch(event.request)
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
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
