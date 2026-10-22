/* ===== Amir Aura — Service Worker =====
   - پوستهٔ برنامه (index.html + آیکون‌ها + فونت) آفلاین در دسترس است
   - کتابخانه‌های CDN و فونت‌ها: اول کش (نسخه‌دار هستند)
   - APIها (آب‌وهوا، اذان، اخبار…): اول شبکه، اگر نبود آخرین پاسخ ذخیره‌شده
   - Supabase و درخواست‌های غیر GET: هرگز کش نمی‌شوند
   - به‌روزرسانی: نسخهٔ جدید «در انتظار» می‌ماند تا کاربر روی «به‌روزرسانی» بزند (SKIP_WAITING)
   برای انتشار نسخهٔ جدید فقط VERSION را عوض کن. */
const VERSION = '2026-10-22.2';
const SHELL = 'amir-shell-' + VERSION;
const STATIC = 'amir-static-' + VERSION;
const API = 'amir-api-' + VERSION;
const KEEP = [SHELL, STATIC, API];

const SHELL_FILES = [
  './', './index.html', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png',
  './apple-touch-icon.png', './IRANSansWeb_Light.woff2', './assets/IRANSansWeb_Light.woff2'
];
const CDN_FILES = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.js',
  'https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js'
];
const STATIC_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.google.com'];
const API_HOSTS = [
  'api.open-meteo.com', 'air-quality-api.open-meteo.com', 'geocoding-api.open-meteo.com',
  'api.aladhan.com', 'api.rss2json.com', 'api.allorigins.win', 'nominatim.openstreetmap.org',
  'wttr.in', 'name.workers.dev'
];
const NO_CACHE_HOSTS = ['supabase.co'];
const API_MAX_ENTRIES = 80;

/* فایل‌هایی که ممکن است موجود نباشند، کل نصب را خراب نمی‌کنند */
async function addSafe(cache, url, opts) {
  try {
    const res = await fetch(new Request(url, opts || { cache: 'reload' }));
    if (res && (res.ok || res.type === 'opaque')) await cache.put(url, res);
  } catch (_) { /* آفلاین یا ۴۰۴: نادیده گرفته می‌شود */ }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await Promise.all(SHELL_FILES.map((u) => addSafe(shell, u)));
    const stat = await caches.open(STATIC);
    await Promise.all(CDN_FILES.map((u) => addSafe(stat, u, { mode: 'cors', credentials: 'omit' })));
    /* اگر نسخهٔ قبلی فعال بود، به صفحه‌ها خبر بده که آپدیت آماده است */
    if (self.registration.active) {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach((c) => c.postMessage({ type: 'UPDATE_READY', version: VERSION }));
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('amir-') && !KEEP.includes(n)).map((n) => caches.delete(n)));
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (_) {} }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  else if (d.type === 'GET_VERSION' && event.source) event.source.postMessage({ type: 'VERSION', version: VERSION });
  else if (d.type === 'CLEAR_API_CACHE') event.waitUntil(caches.delete(API));
});

function hostMatch(host, list) { return list.some((h) => host === h || host.endsWith('.' + h) || host.endsWith(h)); }

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

const OFFLINE_HTML = '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>آفلاین</title><body style="font-family:Tahoma,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#eaf0ff;color:#14213d;text-align:center"><div><h2>اتصال اینترنت برقرار نیست</h2><p>اتصال رو چک کن و دوباره امتحان کن.</p><button onclick="location.reload()" style="font:inherit;padding:10px 22px;border:0;border-radius:12px;background:#5b7cff;color:#fff">تلاش دوباره</button></div></body></html>';

/* صفحه: اول شبکه (تا تغییرات سایت فوراً دیده شود)، اگر نشد کش */
async function handleNavigation(event) {
  const shell = await caches.open(SHELL);
  try {
    const pre = await event.preloadResponse;
    const res = pre || await Promise.race([
      fetch(event.request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
    ]);
    if (res && res.ok) { shell.put('./index.html', res.clone()); return res; }
    throw new Error('bad');
  } catch (_) {
    const cached = (await shell.match('./index.html')) || (await shell.match('./'));
    return cached || new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (_) { return Response.error(); }
}

async function networkFirstApi(req) {
  const cache = await caches.open(API);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
    ]);
    if (res && res.ok) { cache.put(req, res.clone()).then(() => trim(API, API_MAX_ENTRIES)); }
    return res;
  } catch (_) {
    const hit = await cache.match(req);
    return hit || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (req.mode === 'navigate') { event.respondWith(handleNavigation(event)); return; }
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;
    event.respondWith(staleWhileRevalidate(req, SHELL));
    return;
  }
  if (hostMatch(url.hostname, NO_CACHE_HOSTS)) return;
  if (hostMatch(url.hostname, STATIC_HOSTS)) { event.respondWith(cacheFirst(req, STATIC)); return; }
  if (hostMatch(url.hostname, API_HOSTS)) { event.respondWith(networkFirstApi(req)); return; }
});

/* اعلان‌ها: با کلیک، برنامه باز یا فوکوس شود */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) { if ('focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});
