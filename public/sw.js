/**
 * Service worker for the Spanish vocab PWA.
 *
 * Hand-written rather than generated, because the caching rules here are few and
 * specific: the built assets are content-hashed and immutable, the app shell must
 * survive going offline, and the dictionary should stay readable on a train.
 */

const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;

const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE, DATA_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Navigations: try the network, fall back to the cached shell when offline. */
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    await cache.put("/", response.clone());
    return response;
  } catch {
    const cached = await caches.match("/", { cacheName: SHELL_CACHE });
    return (
      cached ?? new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } })
    );
  }
}

/** Hashed build output never changes under a given url, so cache first. */
async function handleAsset(request) {
  const cached = await caches.match(request, { cacheName: ASSET_CACHE });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

/** Dictionary reads: serve the network when it is there, the cache when it is not. */
async function handleDictionary(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DATA_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request, { cacheName: DATA_CACHE });
    if (cached) return cached;
    throw new Error("offline and no cached dictionary");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(handleAsset(request));
    return;
  }

  if (url.pathname === "/api/dictionary") {
    event.respondWith(handleDictionary(request));
  }
});
