const CACHE_NAME = 'expense-manager-v2';
const shell = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(shell).catch(() => {});
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter((name) => name.startsWith('expense-manager-') && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const { request } = event; const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    // Account data never goes into a shared service-worker cache. Each signed-in
    // account has its own explicit local draft/outbox in the application.
    event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({ error: { message: 'Offline — changes are queued on this device.', offline: true } }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) { const cache = await caches.open(CACHE_NAME); await cache.put('/index.html', response.clone()); }
        return response;
      } catch { return await caches.match('/index.html') || new Response('Offline. Reconnect to load the app.', { status: 503 }); }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request); if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && !response.headers.get('Content-Type')?.includes('text/html')) { const cache = await caches.open(CACHE_NAME); await cache.put(request, response.clone()); }
    return response;
  })());
});
