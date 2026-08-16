const CACHE_NAME = "boot-scootin-v96-4-71-private-quote-submit-fix";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => { if (e.request.method === "GET") e.respondWith(fetch(e.request,{cache:"no-store"})); });
