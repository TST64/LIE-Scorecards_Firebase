// =========================================================================
// BMAssistent / LIE Scorecard - Service Worker
// sw.js
// BSD (Allman) Style
// =========================================================================

importScripts('config.js');

// Cache-Version aus der config.js
var currentVersion = (typeof CONFIG !== 'undefined' && (CONFIG.version || CONFIG.appVersion)) 
    ? (CONFIG.version || CONFIG.appVersion) 
    : '4.7.0.3';

var CACHE_NAME = 'lie-scorecard-v' + currentVersion;

var ASSETS_TO_CACHE = [
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
    './Views_LiveDashboard.js',
    './Views_Spieltage.js',
    './Views_SpieltagNeu.js',
    './Views_ScoreEingabe.js',
    './Views_Leaderboard.js',
    './Views_Admin.js',
    './Views_AdminGruppe.js',
    './Views_SpielerEdit.js',
    './Views_Kalender.js',
    './Views_Wetter.js'
];

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
                        console.log('[Service Worker] Lösche alten Cache:', cache);
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

self.addEventListener('fetch', function(event)
{
    var requestUrl = event.request.url;

    if (requestUrl.includes('firestore.googleapis.com') ||  
        requestUrl.includes('google.firestore') ||
        requestUrl.includes('firebase') ||
        requestUrl.includes('script.google.com') ||
        requestUrl.includes('cdnjs.cloudflare.com') ||
        requestUrl.includes('gstatic.com') ||
        requestUrl.includes('googleapis.com') ||
        requestUrl.includes('open-meteo.com'))
    {
        return;
    }

    if (event.request.method !== 'GET')
    {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(function(cachedResponse)
        {
            if (cachedResponse)
            {
                fetch(event.request).then(function(networkResponse)
                {
                    if (networkResponse && networkResponse.status === 200)
                    {
                        caches.open(CACHE_NAME).then(function(cache)
                        {
                            cache.put(event.request, networkResponse);
                        });
                    }
                }).catch(function() {});

                return cachedResponse;
            }

            return fetch(event.request).then(function(networkResponse)
            {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic')
                {
                    return networkResponse;
                }

                var responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(function(cache)
                {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            });
        })
    );
});