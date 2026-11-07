const CACHE = 'hala-tuju-v26';
const SHELL = [
  './index.html',
  './style.css',
  './app.js',
  './places-johor.js',
  './rnr-johor.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Cache berasingan untuk data peta (tiles) — besar & berubah, dibersihkan kerap
const MAP_CACHE = 'hala-tuju-map-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE && k !== MAP_CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

// Paksa muat semula bila versi baru dipasang (buang cache lama & refresh tab)
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('controllerchange', () => {
  if (self.registration) self.registration.update();
});

// Strategi cache:
// 1) Aset statik (HTML/CSS/JS) → network-first (sentiasa versi terkini, cache bila offline)
// 2) Tiles peta (openfreemap) → cache-first + latar belakang kemaskini (offline peta)
// 3) API luaran (routing/trafik/nominatim) → network-first, cache sebagai sandaran
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Tiles peta — cache-first supaya boleh guna offline (kawasan sudah dilihat)
  if (url.hostname.includes('tiles.openfreemap.org') || url.hostname.includes('unpkg.com')) {
    e.respondWith(cacheFirst(e.request, MAP_CACHE));
    return;
  }

  // Aset aplikasi sendiri — network-first
  if (url.origin === location.origin) {
    e.respondWith(networkFirst(e.request, CACHE));
    return;
  }

  // API luaran (Valhalla routing, trafik, nominatim) — network-first dengan sandaran cache
  e.respondWith(networkFirst(e.request, MAP_CACHE));
});

function cacheFirst(request, cacheName) {
  return caches.match(request).then(cached => {
    if (cached) {
      // Kemaskini cache di latar belakang (stale-while-revalidate)
      fetch(request).then(resp => {
        if (resp.ok) caches.open(cacheName).then(c => c.put(request, resp.clone()));
      }).catch(() => {});
      return cached;
    }
    return fetch(request).then(resp => {
      if (resp.ok) {
        const copy = resp.clone();
        caches.open(cacheName).then(c => c.put(request, copy));
      }
      return resp;
    });
  });
}

function networkFirst(request, cacheName) {
  return fetch(request)
    .then(resp => {
      if (resp.ok) {
        const copy = resp.clone();
        caches.open(cacheName).then(c => c.put(request, copy));
      }
      return resp;
    })
    .catch(() => caches.match(request));
}
