// =========================================================================
// BMAssistent / LIE Scorecard - Service Worker
// sw.js
// BSD (Allman) Style
// =========================================================================

const CACHE_NAME = 'lie-scorecard-v1.2.10.52';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './config.js',
    './manifest.json',
    './App_Core.js',
    './App_Start.js',
    './App_Router.js',
    './App_Logic_Bridge.js',
    './App_Logic_Scores.js',
    './App_Logic_Spieltage.js',
    './App_Logic_Spieler.js',
    './App_Logic_UI.js',
    './App_View_Help.js',
    './Views_Login.js',
    './Views_Dashboard.js',
    './Views_Spieltage.js',
    './Views_SpieltagNeu.js',
    './Views_ScoreEingabe.js',
    './Views_Leaderboard.js',
    './Views_Admin.js',
    './Views_AdminGruppe.js',
    './Views_SpielerEdit.js'
];

// 1. Installation: Statische Ressourcen cachen
self.addEventListener('install', function(event)
{
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache)
        {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(function()
        {
            return self.skipWaiting();
        })
    );
});

// 2. Aktivierung: Alte Caches aufräumen
self.addEventListener('activate', function(event)
{
    event.waitUntil(
        caches.keys().then(function(cacheNames)
        {
            return Promise.all(
                cacheNames.map(function(cache)
                {
                    if (cache !== CACHE_NAME)
                    {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(function()
        {
            return self.clients.claim();
        })
    );
});

// 3. Network Fetching & CORS/CDN Bypassing
self.addEventListener('fetch', function(event)
{
    const requestUrl = event.request.url;

    // Firebase, Google APIs und externe CDNs (FontAwesome etc.) NIEMALS vom Service Worker abfangen!
    if (requestUrl.includes('firestore.googleapis.com') ||  
        requestUrl.includes('google.firestore') ||
        requestUrl.includes('firebase') ||
        requestUrl.includes('script.google.com') ||
        requestUrl.includes('cdnjs.cloudflare.com') ||
        requestUrl.includes('gstatic.com') ||
        requestUrl.includes('googleapis.com'))
    {
        return;
    }

    // Nur GET-Requests cachen
    if (event.request.method !== 'GET')
    {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(function(cachedResponse)
        {
            if (cachedResponse)
            {
                // Zuerst Cache ausliefern, im Hintergrund frisches Asset laden (Stale-While-Revalidate)
                fetch(event.request).then(function(networkResponse)
                {
                    if (networkResponse && networkResponse.status === 200)
                    {
                        caches.open(CACHE_NAME).then(function(cache)
                        {
                            cache.put(event.request, networkResponse);
                        });
                    }
                }).catch(function()
                {
                    // Network silent fail (Offline-Betrieb)
                });

                return cachedResponse;
            }

            return fetch(event.request).then(function(networkResponse)
            {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic')
                {
                    return networkResponse;
                }

                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(function(cache)
                {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            });
        })
    );
});