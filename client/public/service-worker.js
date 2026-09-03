const CACHE_NAME = 'expense-manager-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

/**
 * Service worker: cache first for assets, network first for API.
 * Enables offline use and instant load on repeat visits.
 */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      cache.addAll(urlsToCache).catch(() => {
        // Some URLs might 404 — that's ok, we're just being optimistic.
      });
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME) return caches.delete(name);
          return undefined;
        }),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network first, fall back to offline error
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const cache = caches.open(CACHE_NAME);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          return new Response(
            JSON.stringify({
              error: { message: 'Offline — API calls are not available. Your changes are saved locally.' },
            }),
            { status: 0, headers: { 'Content-Type': 'application/json' } },
          );
        }),
    );
    return;
  }

  // Assets: cache first, fall back to network
  event.respondWith(
    caches
      .match(request)
      .then((cached) => cached || fetch(request))
      .catch(() => {
        // Offline with no cache — 404
        return new Response(null, { status: 404 });
      }),
  );
});
