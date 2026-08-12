/**
 * Service worker — offline support.
 *
 * §17 records that the free hosting tier carries no uptime guarantee. That risk
 * applies to the demo too, so the app caches its own shell and keeps working
 * with no network at all. Because the roster is derived rather than fetched,
 * caching the code caches the entire dataset.
 *
 * Strategy: cache-first for the app shell (it is versioned by CACHE), and a
 * network-first fallback for anything else.
 */

const CACHE = 'erp-shell-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/core/spec.js',
  './assets/js/core/rng.js',
  './assets/js/core/names.js',
  './assets/js/core/domain.js',
  './assets/js/core/store.js',
  './assets/js/core/data.js',
  './assets/js/core/facilities.js',
  './assets/js/core/auth.js',
  './assets/js/core/clock.js',
  './assets/js/core/ui.js',
  './assets/js/core/router.js',
  './assets/js/core/analytics.js',
  './assets/js/modules/dashboard.js',
  './assets/js/modules/students.js',
  './assets/js/modules/admissions.js',
  './assets/js/modules/attendance.js',
  './assets/js/modules/exams.js',
  './assets/js/modules/routine.js',
  './assets/js/modules/fees.js',
  './assets/js/modules/notices.js',
  './assets/js/modules/portal.js',
  './assets/js/modules/library.js',
  './assets/js/modules/transport.js',
  './assets/js/modules/hr.js',
  './assets/js/modules/hostel.js',
  './assets/js/modules/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // A single missing file must not fail the whole install, so each request
      // is added individually and failures are tolerated.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache cross-origin requests (the Bangla webfont) — let the network
  // handle them and degrade gracefully when it is unavailable.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
