/**
 * Service Worker — offline caching + background sync for answer submissions.
 */
const CACHE    = 'examprep-v1';
const PRECACHE = ['/', '/assets/css/style.css', '/assets/js/api.js',
  '/assets/js/router.js', '/assets/js/auth.js', '/assets/js/exam_engine.js',
  '/assets/js/omr.js', '/assets/js/pyq_browse.js', '/assets/js/premium.js',
  '/assets/js/dashboard.js', '/assets/js/leaderboard.js', '/assets/js/subscription.js',
  '/assets/js/news.js', '/assets/js/library.js', '/assets/js/admin.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache API calls
  if (url.pathname.startsWith('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp && resp.status === 200 && e.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match('/'));
    })
  );
});

// Background sync — flush offline answer queue when connectivity returns
self.addEventListener('sync', e => {
  if (e.tag === 'ep-sync-answers') {
    e.waitUntil(self.clients.matchAll().then(clients =>
      clients.forEach(c => c.postMessage({ type: 'FLUSH_OFFLINE_QUEUE' }))));
  }
});
