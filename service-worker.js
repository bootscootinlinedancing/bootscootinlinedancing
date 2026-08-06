const CACHE_NAME = "boot-scootin-v93-4-0-customer-crm";
self.addEventListener("install", event => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request,{cache:"no-store"})
      .catch(()=>caches.match(event.request))
  );
});
