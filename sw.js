// LockItIn service worker: keeps the app shell available offline and loads fast.
// Bump VERSION whenever you change app files so phones pick up the update.
const VERSION = "lockitin-v8";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "config.js",
  "manifest.webmanifest", "icons/icon.svg", "icons/glyph.svg", "icons/icon-192.png", "icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Supabase and fonts go straight to the network
  // Network first so updates show up right away; fall back to the cached copy when offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
