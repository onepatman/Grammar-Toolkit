// Service worker for the Ultimate Engineering Dictionary — enables
// offline use and the "Add to Home Screen" install prompt once this is
// hosted online.
//
// Bump CACHE_NAME any time this file itself changes, so the browser
// treats it as a new script (triggers install -> activate, which
// purges every OTHER cache bucket below) instead of silently reusing
// whatever's already registered.
const CACHE_NAME = "mepf-grammar-toolkit-v68";
const FILES_TO_CACHE = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-192-maskable.png",
  "./icon-512-maskable.png",
  "./js/correction-log.js",
  "./js/online-lookup.js",
  "./js/grammar-check.js",
  "./js/tagalog-lookup.js",
  "./js/lookup-service.js",
  "./js/duplicate-checker.js",
  "./js/fuzzy-search.js",
  "./js/vocab-cache.js",
  "./js/owner-mode.js",
  "./js/sync-auth.js",
  "./js/update-check.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // {cache:"reload"} bypasses the browser's own HTTP disk cache for
      // this precache step — without it, a file GitHub Pages served
      // with a Cache-Control lifetime could get precached stale on
      // day one and never actually refresh until that lifetime expires.
      Promise.all(FILES_TO_CACHE.map((url) => cache.add(new Request(url, { cache: "reload" }))))
    )
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
//
// {cache:"no-store"} on the fetch itself matters just as much as the
// network-first shape — without it, "network-first" can silently
// degrade into "browser-HTTP-cache-first": fetch() with the default
// cache mode is allowed to satisfy a request from the browser's own
// disk cache (governed by whatever Cache-Control header the host sent)
// without a real round-trip at all, which is exactly the kind of
// invisible staleness this strategy exists to prevent.
self.addEventListener("fetch", (event) => {
  // Only this app's OWN same-origin assets (FILES_TO_CACHE, plus
  // anything else GitHub Pages serves under this origin) ever go
  // through the network-first-then-cache strategy below. A cross-origin
  // request — the Free Dictionary API, Wiktionary, MyMemory (Tagalog),
  // Firebase, the GitHub release check — is left completely untouched,
  // never intercepted at all. This matters for a real, easy-to-hit
  // reason: caches.put() can throw for a third-party response shape
  // this worker doesn't control (an unusual Vary header, an opaque
  // response, etc.), and without this guard that throw turns a
  // perfectly successful cross-origin fetch into a failed one from the
  // page's own point of view — exactly the kind of silent breakage that
  // would make online dictionary lookups mysteriously never succeed.
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, response.clone());
          return response;
        });
      })
      .catch(() => caches.match(event.request))
  );
});
