// sw.js - Robustere Fetch-Behandlung
const CACHE_NAME = 'lie-scorecard-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch((err) => {
      console.warn('[SW] Netzanfrage fehlgeschlagen:', event.request.url);
      // Fängt Network Errors ab, damit die Konsole sauber bleibt
      return new Response('Netzwerkfehler', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({ 'Content-Type': 'text/plain' })
      });
    })
  );
});