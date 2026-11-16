// «Моя бібліотека» як додаток на телефоні: спершу завжди мережа (оновлення сайту з'являються одразу),
// а без інтернету — остання збережена копія сторінки. Дані з таблиці (Apps Script) не кешуються.
var CACHE = 'lb-shell-v37';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true });
  }));
});

// Сповіщення з додатку (16.11.2026; renotify — щоб нове з тією ж позначкою знову вискакувало банером, а не тихо замінювало старе): нагадування про релізи, посилки, серію читання — замість Телеграму.
self.addEventListener('push', function (e) {
  var m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { title: 'Nookly', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'Nookly', {
    body: m.body || '', tag: m.tag || undefined, renotify: !!m.tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { open: m.open || '' }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var open = (e.notification.data && e.notification.data.open) || '';
  var url = self.registration.scope + (open ? '#open=' + open : '');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].url.indexOf(self.registration.scope) === 0 && 'focus' in cs[i]) { cs[i].postMessage({ open: open }); return cs[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
