const CACHE_NAME = "sprontz-v__BUILD_HASH__";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./css/style.css",
  "./js/app.js",
  "./js/model.js",
  "./js/state.js",
  "./js/serial.js",
  "./js/logger.js",
  "./js/logos.js",
  "./js/config-io.js",
  "./js/ui/dial.js",
  "./js/ui/race-view.js",
  "./js/ui/settings-view.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("sprontz-") && k !== CACHE_NAME)
            .map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

function stripQuery(url) {
  const u = new URL(url);
  u.search = "";
  return u.href;
}

self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("./index.html")));
    return;
  }

  e.respondWith(
    // Try cache with query params first, then without, then network + cache
    caches.match(e.request).then(
      (cached) =>
        cached ||
        caches.match(stripQuery(e.request.url)).then(
          (stripped) =>
            stripped ||
            fetch(e.request).then((resp) => {
              const clone = resp.clone();
              caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
              return resp;
            }),
        ),
    ),
  );
});
