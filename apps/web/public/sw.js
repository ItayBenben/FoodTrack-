/* FoodTrack service worker (06 §4). App shell precached; static assets cache-first;
   API GETs network-first with a user-data cache that logout clears; API writes are never
   cached — they go through the IndexedDB outbox, not the service worker. */
const SHELL = 'ft-shell-v1';
const DATA = 'ft-data-v1';
const PAGES = ['/today', '/timeline', '/insights', '/more'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll([...PAGES, '/manifest.webmanifest', '/icon.svg', '/icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'precache' && Array.isArray(e.data.urls)) {
    e.waitUntil(caches.open(SHELL).then((c) => Promise.all(e.data.urls.map((u) => c.match(u).then((hit) => hit || c.add(u).catch(() => undefined))))));
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.method !== 'GET') return;                                  // writes: never cached
  if (url.pathname.startsWith('/api/v1/events')) return;            // SSE: pass through
  if (url.pathname.startsWith('/api/v1/auth')) return;
  if (url.pathname.startsWith('/_next/static/') || url.pathname.match(/\.(png|svg|woff2?)$/)) {
    e.respondWith(caches.open(SHELL).then(async (c) => (await c.match(req)) ?? fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(DATA).then((c) => c.put(req, r.clone())); return r; }).catch(async () => (await caches.match(req)) ?? new Response(JSON.stringify({ title: 'offline', status: 0 }), { status: 503, headers: { 'content-type': 'application/problem+json' } })));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(SHELL).then((c) => c.put(req, r.clone())); return r; })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) ?? (await caches.match('/today')) ?? Response.error()));
  }
});

self.addEventListener('push', (e) => {
  const data = (() => { try { return e.data.json(); } catch { return {}; } })();
  e.waitUntil(self.registration.showNotification(data.title || 'FoodTrack', { body: data.body || '', icon: '/icon-192.png', tag: data.tag || 'ft', data: { url: data.url || '/today' } }));
});
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(self.clients.openWindow(e.notification.data?.url || '/today')); });
