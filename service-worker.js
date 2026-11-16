// Service Worker for the Workout Tracker PWA shell.
//
// Purpose: make the app itself (not just its data) open with zero connectivity -
// airplane mode, no signal at the gym, etc. This is deliberately scoped to ONLY the
// app's own same-origin static files. It never intercepts Google's scripts, the
// Sheets/Drive API, or the /api/config endpoint - those must always hit the real
// network (or fail, which the app's own offline-mode logic already handles), never
// be served from a cache that could silently go stale.
//
// IMPORTANT, read before editing a shell file: CACHE_NAME must be bumped by hand on
// any deploy that changes app.js / index.html / styles.css / cache-manager.js /
// auth-manager.js / manifest.json / the icon files. There's no build step in this
// project to do this automatically - a forgotten bump means users keep getting an
// old cached version of the app indefinitely, which is the single most common way a
// service worker goes wrong. When in doubt, bump it.
const CACHE_NAME = 'workout-tracker-shell-v2';

const SHELL_FILES = [
    '/',
    '/index.html',
    '/app.js',
    '/styles.css',
    '/cache-manager.js',
    '/auth-manager.js',
    '/manifest.json',
    '/app-icon-120.png',
    '/app-icon-192.png',
    '/app-icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(SHELL_FILES))
            .then(() => self.skipWaiting()) // Take over immediately, don't wait for every tab to close
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only ever handle same-origin GET requests for the app shell itself (or page
    // navigations, so opening the app with zero signal lands on the cached shell).
    // Everything else - Google's scripts, Sheets/Drive API calls, /api/config, any
    // other cross-origin request - passes straight through untouched.
    const isShellFile = url.origin === self.location.origin &&
        SHELL_FILES.includes(url.pathname);
    const isNavigation = request.mode === 'navigate';

    if (request.method !== 'GET' || (!isShellFile && !isNavigation)) {
        return; // Not our concern - let the browser handle it normally
    }

    event.respondWith(
        caches.match(isNavigation ? '/index.html' : request).then((cached) => {
            const networkFetch = fetch(request)
                .then((response) => {
                    // Keep the cache fresh for next time, but only for our own shell
                    // files - never cache an opaque/cross-origin or error response
                    if (response && response.ok && isShellFile) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    }
                    return response;
                })
                .catch(() => cached); // No network at all - fall back to whatever's cached

            // Cache-first: serve instantly from cache when available (and still
            // reachable offline), update it in the background from the network
            return cached || networkFetch;
        })
    );
});
