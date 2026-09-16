/**
 * Service worker for the Spanish vocab PWA.
 *
 * Hand-written rather than generated, because the caching rules here are few and
 * specific: the built assets are content-hashed and immutable, the app shell must
 * survive going offline. The dictionary is bundled into the app, so caching the
 * build output is what keeps it readable on a train.
 */

const VERSION = "v3";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;

const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/fonts/instrument-serif.woff2",
  "/fonts/instrument-serif-italic.woff2",
  "/fonts/public-sans.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Build output is content-hashed and the fonts never change under their url,
  // so both are safe to serve cache-first.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/")) {
    event.respondWith(handleAsset(request));
  }
});
