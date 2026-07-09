/* ¡pues! service worker — verze CACHE drž synchronně s APP_VERSION (index.html) a version.json */
const CACHE = 'pues-v3.00';

const SHELL = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icon.svg',
  'icon-180.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      // cache: 'reload' — obchází HTTP cache prohlížeče (GitHub Pages posílá Cache-Control),
      // jinak addAll() klidně naplní novou Cache Storage bucketu starým obsahem ze staré HTTP cache
      await Promise.all(SHELL.map(async url => {
        const r = await fetch(url, { cache: 'reload' });
        await c.put(url, r);
      }));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // ikony → cache-first (statické, není důvod je pořád stahovat)
  if (/\.(png|svg)$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
    return;
  }

  // HTML/JS/CSS/JSON — network-first (čerstvost), fallback cache (offline).
  // Dřív byl shell (index.html/app.js/style.css) cache-first, což umožnilo nekonzistentní
  // stav — nové index.html vedle starého app.js ze stejné SW instalace.
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
