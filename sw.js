/* ==========================================================================
   sw.js — سرویس‌ورکر «دستیار AMIR»
   • کش‌کردن فایل‌ها (آفلاین) + تشخیص آپدیت با دکمه‌ی «آپدیت کن»
   • هر بار که سایت را منتشر می‌کنی، فقط VERSION را عوض کن (مرورگر فقط تغییر همین فایل را می‌بیند)
   ========================================================================== */
const VERSION = 'v1.0.8';
const CACHE   = 'amir-' + VERSION;
const FONTS   = 'amir-fonts';
const PRECACHE = ['./', './index.html', './manifest.webmanifest'];   /* هر فایلی که نبود، بی‌صدا نادیده گرفته می‌شود */

/* --- نصب: کش‌کردن فایل‌های اصلی --- */
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map(async (u) => {
      const r = await fetch(new Request(u, { cache: 'reload' }));
      if (r.ok) await c.put(u, r);
    }));
    if (!self.registration.active) {
      self.skipWaiting();            /* اولین نصب: کاربری هنوز کنترل نمی‌شود، پس همین حالا فعال شو */
    } else {
      /* آپدیت: منتظر می‌مانیم تا کاربر «آپدیت کن» را بزند (پیام SKIP_WAITING) و به صفحه خبر می‌دهیم */
      const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      cs.forEach((c) => c.postMessage({ type: 'UPDATE_READY' }));
    }
  })());
});

/* --- فعال‌سازی: پاک‌کردن کش نسخه‌های قبل + کنترل صفحه‌های باز --- */
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('amir-') && k !== CACHE && k !== FONTS).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* --- پیام از صفحه: «آپدیت کن» → نسخه‌ی جدید همین حالا فعال شود --- */
self.addEventListener('message', (e) => {
  const t = e.data && e.data.type;
  if (t === 'SKIP_WAITING') self.skipWaiting();
  else if (t === 'GET_VERSION' && e.source) e.source.postMessage({ type: 'VERSION', version: VERSION });
});

/* --- کش --- */
async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r && r.ok) c.put(req, r.clone());
    return r;
  } catch (_) {
    return (await c.match(req)) || (await c.match('./index.html')) || (await c.match('./')) || Response.error();
  }
}
async function staleWhileRevalidate(req, name) {
  const c = await caches.open(name), hit = await c.match(req);
  const net = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || Response.error();
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;
    e.respondWith(req.mode === 'navigate' ? networkFirst(req) : staleWhileRevalidate(req, CACHE));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(req, FONTS));
  }
  /* بقیه‌ی درخواست‌ها (API آب‌وهوا، اخبار، ...) عمداً کش نمی‌شوند */
});
