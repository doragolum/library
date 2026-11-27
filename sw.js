// «Моя бібліотека» як додаток на телефоні: спершу завжди мережа (оновлення сайту з'являються одразу),
// а без інтернету — остання збережена копія сторінки. Дані з таблиці (Apps Script) не кешуються.
var CACHE = 'lb-shell-v42';
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
  // дані для панелі з кнопками на сайті (16.11): вид, книга, текст — натиск відкриває Nookly з цією панеллю
  var data = { k: m.kind || '', id: m.id || 0, t: m.title || '', b: m.body || '', tag: m.tag || '', open: m.open || '', acts: m.actions || [] };
  var opt = { body: m.body || '', tag: m.tag || undefined, renotify: !!m.tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: data };
  // кнопки прямо в сповіщенні (Chrome на комп'ютері; айфон їх не показує)
  if (m.actions && m.actions.length) opt.actions = m.actions.slice(0, 2);
  e.waitUntil(self.registration.showNotification(m.title || 'Nookly', opt));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var d = e.notification.data || {};
  var o = d.k ? { k: d.k, id: d.id, t: d.t, b: d.b, tag: d.tag, acts: d.acts, do: e.action || '' } : (d.open || '');
  var hash = o ? '#open=' + encodeURIComponent(typeof o === 'string' ? o : JSON.stringify(o)) : '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].url.indexOf(self.registration.scope) === 0 && 'focus' in cs[i]) { cs[i].postMessage({ open: o }); return cs[i].focus(); }
    }
    return self.clients.openWindow(self.registration.scope + hash);
  }));
});
