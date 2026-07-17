// Service worker for the MEPF Grammar Toolkit — enables offline use and
// the "Add to Home Screen" install prompt once this is hosted online.
const CACHE_NAME = "mepf-grammar-toolkit-v4";
const FILES_TO_CACHE = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./js/correction-log.js",
  "./js/online-lookup.js",
  "./js/fuzzy-search.js",
  "./js/vocab-cache.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-first strategy: always tries to get the latest version when
// online (so your updates show up automatically), and only falls back
// to the cached copy when there's no internet connection.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, response.clone());
          return response;
        });
      })
      .catch(() => caches.match(event.request))
  );
});
