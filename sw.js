/* FIX: sw.js — نسخه‌دار؛ بدون تست روی دستگاه واقعی */
const CACHE_VERSION = 'v3'; // FIX: با هر انتشار این عدد را افزایش بده
const STATIC = 'static-' + CACHE_VERSION, FONTS = 'fonts-' + CACHE_VERSION, API = 'api-' + CACHE_VERSION;
const API_HOSTS = ['api.open-meteo.com','api.aladhan.com','geocoding-api.open-meteo.com','air-quality-api.open-meteo.com','nominatim.openstreetmap.org','wttr.in','api.rss2json.com','api.allorigins.win'];

self.addEventListener('install', e => { e.waitUntil(caches.open(STATIC).then(c => c.addAll(['./','./manifest.json']).catch(() => {}))); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![STATIC,FONTS,API].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

const put = (name, req, res) => { if (res && res.ok) caches.open(name).then(c => c.put(req, res.clone())); return res; };
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com' || /\.woff2?$/.test(url.pathname)) { // cache-first برای فونت
    e.respondWith(caches.match(req).then(h => h || fetch(req).then(r => put(FONTS, req, r)))); return;
  }
  if (API_HOSTS.includes(url.hostname)) { // network-first برای API
    e.respondWith(fetch(req).then(r => put(API, req, r)).catch(() => caches.match(req))); return;
  }
  if (url.origin === location.origin) {
    if (req.mode === 'navigate') { // network-first برای HTML تا نسخه کهنه نماند
      e.respondWith(fetch(req).then(r => put(STATIC, req, r)).catch(() => caches.match(req).then(h => h || caches.match('./')))); return;
    }
    e.respondWith(caches.match(req).then(h => { // stale-while-revalidate برای فایل‌های ثابت
      const net = fetch(req).then(r => put(STATIC, req, r)).catch(() => h);
      return h || net;
    }));
  }
});
