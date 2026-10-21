/* ==========================================================================
   sw.js — سرویس‌ورکر «AMIR Assistant»
   • کش‌کردن فایل‌ها (آفلاین) + تشخیص آپدیت با دکمه‌ی «آپدیت کن»
   • در هر انتشار جدید فقط VERSION را تغییر بده.
   ========================================================================== */
const VERSION = 'v1.0.35';
const CACHE   = 'amir-' + VERSION;
const FONTS   = 'amir-fonts';
/* فایل‌هایی که وجود نداشته باشند بی‌صدا رد می‌شوند (allSettled) */
const PRECACHE = [
  './', './index.html',
  './manifest.json', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];

/* --- نصب: کش‌کردن فایل‌های اصلی --- */
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map(async (u) => {
      const r = await fetch(new Request(u, { cache: 'reload' }));
      if (r.ok) await c.put(u, r);
    }));
    if (!self.registration.active) {
      /* اولین نصب: بدون انتظار فعال شود */
      self.skipWaiting();
    } else {
      /* آپدیت: نسخه‌ی جدید منتظر می‌ماند و به صفحه‌ها خبر می‌دهیم */
      const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      cs.forEach((client) => client.postMessage({ type: 'UPDATE_READY', version: VERSION }));
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
/* صفحه‌ها: اول شبکه، اگر آفلاین بود از کش (query مثل ?source=pwa نادیده گرفته می‌شود) */
async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r && r.ok) c.put(req, r.clone());
    return r;
  } catch (_) {
    return (await c.match(req, { ignoreSearch: true })) ||
           (await c.match('./index.html')) || (await c.match('./')) || Response.error();
  }
}
/* فایل‌های جانبی: از کش بده و پشت‌صحنه تازه کن (با waitUntil تا ورکر وسط کار بسته نشود) */
async function staleWhileRevalidate(e, name) {
  const req = e.request;
  const c = await caches.open(name), hit = await c.match(req);
  const net = fetch(req)
    .then((r) => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; })
    .catch(() => null);
  e.waitUntil(net);
  return hit || (await net) || Response.error();
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;
    e.respondWith(req.mode === 'navigate' ? networkFirst(req) : staleWhileRevalidate(e, CACHE));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(e, FONTS));
  }
  /* بقیه‌ی درخواست‌ها (API آب‌وهوا، اخبار، ...) عمداً کش نمی‌شوند */
});
