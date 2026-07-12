// Minimal offline-first service worker (§11-M7). Caches the app shell so the
// game runs offline; all game data already lives in IndexedDB. Network-first
// for navigations (fresh deploys), cache-first for hashed static assets.
// NOTE: bump CACHE on any change here so old clients purge their stale cache
// and pull fresh code — otherwise a browser can keep serving an old bundle.
const CACHE = 'football-gm-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }
  // Network-first with a cached fallback: online, you always get the freshest
  // code (no more serving a stale bundle after an update); offline, you fall
  // back to the last-cached copy so the game still runs.
  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request)),
  );
});
