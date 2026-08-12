// DTCDecoder service worker — installability + app-shell resilience ONLY.
//
// This file is intentionally hand-written vanilla JS (no Workbox/next-pwa):
// the caching rules below are a security/product requirement, not a
// convenience, so they need to be readable and auditable at a glance.
//
// NEVER cached, ever, under any strategy:
//   - anything under /api/ (auth, Diagnostic Engine, Supabase-backed reads/
//     writes, Creem checkout/webhooks, VIN decode, history, admin, etc.)
//   - any cross-origin request (Supabase, Creem, Anthropic, analytics)
// See isNetworkOnlyPath() below — this is the one rule the rest of the file
// depends on for safety.
//
// What IS cached:
//   - the static app shell (/offline + brand icons) at install time
//   - Next.js's own content-hashed build assets (_next/static/*) and the
//     icon set, cache-first (safe — these are immutable per hash)
//   - nothing else. Every navigation (including every authenticated page:
//     /account, /admin, /diagnostics, etc.) is network-first with NO cache
//     read on success — the cached /offline page is served only when the
//     network request itself fails outright.
//
// Bump this on any policy change; activate() deletes every cache whose name
// doesn't match the current version.
const CACHE_VERSION = "v1";
const STATIC_CACHE_NAME = `dtcdecoder-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

function isNetworkOnlyPath(pathname) {
  return pathname.startsWith("/api/");
}

function isStaticAsset(pathname) {
  // Path-prefix only, deliberately no generic file-extension fallback (e.g.
  // a bare /\.js$/ test) — that would also match /sw.js itself if it's ever
  // fetched directly (as this file's own test suite does), cache-first
  // caching the service worker's own script. Every real static asset this
  // app serves already lives under one of these two prefixes.
  return pathname.startsWith("/_next/static/") || pathname.startsWith("/icons/");
}

async function networkFirstNavigate(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(STATIC_CACHE_NAME);
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("DTCDecoder requires an internet connection.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Only cache genuinely successful, basic (same-origin, non-opaque)
  // responses — never cache an error page under a static asset's URL.
  if (response.ok && response.type === "basic") {
    cache.put(request, response.clone());
  }
  return response;
}

// Event-listener registration is guarded so this exact file can also be
// loaded with plain Node `require()` in test/sw-policy.test.ts (where
// `self` doesn't exist) to unit-test the pure functions above without any
// duplicated/drifting copy of the policy logic. Always true in a real
// ServiceWorkerGlobalScope.
if (typeof self !== "undefined") {
  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches
        .open(STATIC_CACHE_NAME)
        .then((cache) => cache.addAll(PRECACHE_URLS))
        .then(() => self.skipWaiting()),
    );
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key !== STATIC_CACHE_NAME)
              .map((key) => caches.delete(key)),
          ),
        )
        .then(() => self.clients.claim()),
    );
  });

  self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (isNetworkOnlyPath(url.pathname)) return;

    if (request.mode === "navigate") {
      event.respondWith(networkFirstNavigate(request));
      return;
    }

    if (isStaticAsset(url.pathname)) {
      event.respondWith(cacheFirstStatic(request));
    }
  });
}

// Exposed only for the Node-based unit test in test/sw-policy.test.ts —
// harmless no-op in a real ServiceWorkerGlobalScope (`module` is undefined
// there, so this block never runs in the browser).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { isNetworkOnlyPath, isStaticAsset, CACHE_VERSION, STATIC_CACHE_NAME, PRECACHE_URLS };
}
