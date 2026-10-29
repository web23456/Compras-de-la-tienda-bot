// Service Worker PWA para Compras de la Tienda — Almacén Central
// Soporte 100% Offline Garantizado, Cache Robusto de CDNs y Sincronización Automática

const CACHE_NAME = 'compras-tienda-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './logo.jpeg',
  './icon-192.png',
  './icon-512.png',
  './bot-parser.js',
  './memoryEngine.js',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

// Instalación: Pre-cacheados de recursos principales con allSettled para no abortar si hay lentitud
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) => {
          return fetch(url, { mode: url.startsWith('http') ? 'cors' : 'same-origin', cache: 'reload' })
            .then((res) => {
              if (res.ok || res.type === 'opaque') {
                return cache.put(url, res);
              }
            })
            .catch((err) => {
              console.warn('SW Compras: No se pudo pre-cachear:', url, err.message);
            });
        })
      );
    })
  );
  self.skipWaiting();
});

// Activación: Limpieza de caches antiguos y toma de control inmediata
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Interceptor Fetch:
// 1. Navegación HTML -> Network-First con fallback inmediato a Cache ('./index.html')
// 2. CDNs y scripts estáticos -> Cache-First con fallback a Network (garantiza 0 internet instantáneo)
// 3. API local backend (/api/) -> Network directo, si falla no bloquea
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignorar llamadas directas a la API del Bot local si se desea que pasen directas
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  const isHtml = event.request.mode === 'navigate' || 
                 event.request.headers.get('accept')?.includes('text/html') ||
                 url.pathname.endsWith('index.html') ||
                 url.pathname.endsWith('/');

  const isData = url.pathname.endsWith('tienda_datos.json');

  if (isHtml || isData) {
    event.respondWith(
      fetch(event.request)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            if (isHtml) return caches.match('./index.html');
            return null;
          });
        })
    );
    return;
  }

  // Recursos estáticos (CDNs, imágenes, scripts, fuentes):
  // Estrategia Cache-First con actualización en segundo plano (Stale-While-Revalidate)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            const resClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      // Si ya está en cache, devolverlo de inmediato para que funcione con 0 internet
      return cachedResponse || fetchPromise;
    })
  );
});
