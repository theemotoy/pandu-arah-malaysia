const CACHE = 'hala-tuju-v8';
const SHELL = [
  './index.html',
  './style.css',
  './app.js',
  './places-johor.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

// Paksa muat semula bila versi baru dipasang (buang cache lama & refresh tab)
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('controllerchange', () => {
  // bila service worker baru ambil alih, muat semula supaya pengguna nampak versi terkini
  if (self.registration) self.registration.update();
});

// Network-first: sentiasa cuba dapatkan versi terkini, guna cache hanya bila offline.
// Ini memastikan pengguna sentiasa dapat kemas kini terkini, bukan versi lama.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // API luaran (peta/routing) terus ke rangkaian

  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
