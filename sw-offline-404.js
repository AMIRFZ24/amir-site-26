/* ===== Offline / 404 fallback — add as the FIRST line of sw.js:
   importScripts('/sw-offline-404.js');
   (offline-404.html must be served from the site root) ===== */
(function () {
  'use strict';
  var CACHE = 'offline-page';
  var PAGE = '/offline-404.html';

  /* the offline-page cache is never removed by the app's own cache cleanup */
  try {
    var del = caches.delete.bind(caches);
    caches.delete = function (k) { return k === CACHE ? Promise.resolve(false) : del(k); };
  } catch (e) {}

  function fallback() {
    return caches.open(CACHE)
      .then(function (c) { return c.match(PAGE); })
      .then(function (r) { return r || Response.error(); });
  }

  /* install: store the 404 page in its own cache (never blocks SW install) */
  self.addEventListener('install', function (e) {
    e.waitUntil(
      caches.open(CACHE)
        .then(function (c) { return c.add(new Request(PAGE, { cache: 'reload' })); })
        .catch(function () {})
    );
  });

  /* fetch: for page navigations, failed network + no cache hit (or a real 404) -> custom page.
     Works by wrapping the app's own fetch handlers so their logic stays untouched. */
  var add = self.addEventListener.bind(self);
  self.addEventListener = function (type, fn, opts) {
    if (type !== 'fetch' || typeof fn !== 'function') return add(type, fn, opts);
    return add(type, function (event) {
      if (event.request && event.request.mode === 'navigate') {
        var orig = event.respondWith.bind(event);
        event.respondWith = function (p) {
          orig(
            Promise.resolve(p).then(function (res) {
              return res && res.status === 404 ? fallback() : res;
            }).catch(fallback)
          );
        };
      }
      return fn.call(this, event);
    }, opts);
  };
})();
