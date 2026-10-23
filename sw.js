/* =====================================================================
   sw.js — Amir Aura PWA, integrated offline caching
   On each release update VERSION. Existing UPDATE_READY / SKIP_WAITING
   protocol is preserved for the site's update UI.
   ===================================================================== */
const VERSION = 'v1.0.49';
const CACHE = 'amir-' + VERSION;
const FONTS = 'amir-fonts'; // Keep this stable so cached fonts survive app updates.
const STATIC_ASSETS = 'amir-static-' + VERSION;
// This HTML currently links manifest.json. Also try the older webmanifest name
// for deployments that still have it; missing optional assets do not block install.
const PRECACHE = [
  './', './index.html', './manifest.json', './manifest.webmanifest',
  './IRANSansWeb_Light.woff2', './apple-touch-icon.png', './icon-192.png', './icon-512.png'
];
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const STATIC_CDN_HOSTS = new Set(['cdn.jsdelivr.net']);
const LENIS_URL = 'https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map(async (url) => {
      try {
        const response = await fetch(new Request(url, { cache: 'reload' }));
        if (response && response.ok) await cache.put(url, response);
      } catch (_) { /* Optional asset unavailable: keep install resilient. */ }
    }));
    // Precache Lenis as an optional enhancement so it can work offline after install.
    await Promise.allSettled([ (async () => {
      try {
        const assets = await caches.open(STATIC_ASSETS);
        const response = await fetch(new Request(LENIS_URL, { mode: 'cors', cache: 'reload' }));
        if (response && response.ok) await assets.put(LENIS_URL, response);
      } catch (_) { /* Offline or CDN unavailable: native scrolling remains the fallback. */ }
    })() ]);
    if (!self.registration.active) {
      await self.skipWaiting();
    } else {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((client) => client.postMessage({ type: 'UPDATE_READY', version: VERSION }));
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('amir-') &&
      key !== CACHE && key !== FONTS && key !== STATIC_ASSETS).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  else if (type === 'GET_VERSION' && event.source) {
    event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (await cache.match(request)) || (await cache.match('./index.html')) ||
      (await cache.match('./')) || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const update = fetch(request).then(async (response) => {
    if (response && (response.ok || response.type === 'opaque')) {
      try { await cache.put(request, response.clone()); } catch (_) {}
    }
    return response;
  }).catch(() => null);
  return cached || (await update) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;
    // Navigations refresh from network when possible, with cached shell as offline fallback.
    if (request.mode === 'navigate') {
      event.respondWith(networkFirst(request));
      return;
    }
    // Same-origin JS/CSS/images/fonts/manifests are cached and revalidated in background.
    event.respondWith(staleWhileRevalidate(request, CACHE));
    return;
  }

  // Cache only known static providers. Dynamic APIs (weather/news/etc.) stay network-only.
  if (FONT_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, FONTS));
  } else if (STATIC_CDN_HOSTS.has(url.hostname) && /\/npm\/lenis@/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_ASSETS));
  }
});
