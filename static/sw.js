const CACHE_NAME = 'govee-sensors-v1';
const urlsToCache = [
  '/',
  '/static/styles.css',
  '/static/app.js',
  '/static/favicon.svg',
  '/static/favicon.ico',
  '/static/icon-192.svg',
  '/static/icon-512.svg',
  '/static/manifest.json',
  '/config.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all pages immediately
  return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // For metrics endpoint, always fetch from network (real-time data)
  if (url.pathname === '/metrics' || url.pathname === '/health') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          // If network fails, return a custom offline response
          return new Response('Offline - unable to fetch live data', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        })
    );
    return;
  }

  // For static assets, try cache first, then network
  event.respondWith(
    caches.match(request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = request.clone();

        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseToCache);
            });

          return response;
        }).catch(() => {
          // Network failed and not in cache
          if (request.destination === 'document') {
            return caches.match('/');
          }
        });
      })
  );
});

