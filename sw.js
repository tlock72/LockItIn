// LockItIn service worker: keeps the app shell available offline and loads fast.
// Bump VERSION whenever you change app files so phones pick up the update.
const VERSION = "lockitin-v26";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "config.js",
  "manifest.webmanifest", "icons/icon.svg", "icons/glyph.svg", "icons/icon-192.png", "icons/apple-touch-icon.png",
  "xmas.css", "xmas.js", "icons/icon-xmas.svg", "icons/santa.svg", "icons/santa-hat.svg", "icons/xmas-192.png", "icons/xmas-apple-touch-icon.png"
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

// Notifications from the "notify" Edge Function: someone locked in a score, or someone won the day.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil((async () => {
    // If LockItIn is open and in front of you, the app shows its own pop-up instead.
    // (Safari wants every push shown, so it always gets the notification.)
    const ua = self.navigator.userAgent || "";
    const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|Android/.test(ua);
    if (!safari) {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (wins.some((c) => c.focused && c.visibilityState === "visible")) return;
    }
    await self.registration.showNotification(d.title || "LockItIn", {
      body: d.body || "", tag: d.tag, renotify: !!d.tag, icon: "icons/icon-192.png", data: { url: d.url || "./" },
    });
  })());
});

// Tapping a notification opens LockItIn. A comment notification also opens that comment.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    const w = wins.find((c) => "focus" in c);
    if (!w) return self.clients.openWindow(url);
    w.postMessage({ type: "open", url });
    return w.focus();
  }));
});
