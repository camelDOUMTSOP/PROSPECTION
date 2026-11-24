// Service worker : l'interface s'ouvre même hors ligne.
// Pensez à changer VERSION à chaque mise à jour de l'application.
const VERSION = 'prospection-v5';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'logic.js', 'store.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'demo/demo-prospects.csv'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Fichiers de l'application : réseau d'abord (toujours la dernière version quand il y a du réseau,
// sans le cache HTTP de 10 min de GitHub Pages), copie locale si le réseau ne répond pas en 4 s ou est coupé.
// Polices : copie locale d'abord. Les appels à l'Apps Script (script.google.com) ne passent jamais par ici.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !font) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
    if (font && cached) return cached;
    const network = fetch(sameOrigin ? req.url : req, sameOrigin ? { cache: 'no-cache', credentials: 'same-origin' } : undefined).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(key, res.clone());
      return res;
    }).catch(() => null);
    if (!cached) return (await network) || new Response('Hors ligne', { status: 503, statusText: 'Hors ligne' });
    const timeout = new Promise((r) => setTimeout(() => r(null), 4000));
    const fresh = await Promise.race([network, timeout]);
    if (fresh && fresh.ok) return fresh;
    e.waitUntil(network);
    return cached;
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('./'))));
});
