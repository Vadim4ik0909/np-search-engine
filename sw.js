/**
 * Service Worker для "Пошук відділень Нова Пошта & Укрпошта"
 * Версія: v8.23.0
 * Забезпечує миттєве оновлення (skipWaiting + clients.claim) та офлайн-доступ.
 */

const CACHE_VERSION = 'v8.23.0';
const CACHE_NAME = `np-ukr-cache-${CACHE_VERSION}`;

// Ресурси для попереднього кешування з версіонуванням
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css?v=8.23.0',
  './favicon.svg?v=8.23.0',
  './data/branches.js?v=8.23.0',
  './data/all_settlements.js?v=8.23.0',
  './data/fuzzySearch.js?v=8.23.0',
  './app.js?v=8.23.0'
];

// Встановлення: негайно замінюємо старий воркер новим без очікування
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Помилка попереднього кешування:', err);
      });
    })
  );
});

// Активація: захоплюємо всі активні клієнти (clients.claim) та видаляємо старі кеші
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              console.log('[SW] Видалення застарілого кешу:', key);
              return caches.delete(key);
            }
          })
        );
      })
    ])
  );
});

// Примусова команда пропуску черги очікування
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Обробка запитів:
// 1. Для навігації (HTML) -> Network First (щоб користувач завжди бачив новий білд)
// 2. Для статичних ресурсів (CSS, JS, SVG) -> Stale-While-Revalidate з версійними URL
// 3. Для зовнішніх API / карт -> Network Only з fallback
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // HTML навігація — завжди Network First
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Локальні ресурси додатку (того ж origin)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return networkResponse;
          })
          .catch(() => {
            // Офлайн режим: запит не вдався, сподіваємось на кеш
          });

        return cached || fetchPromise;
      })
    );
  }
});
