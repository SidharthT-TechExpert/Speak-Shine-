const CACHE_NAME = "speak-shine-v6";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/rnnoise-processor.js",
];

// Install — cache only the shell
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  // Take over immediately — don't wait for old SW to die
  self.skipWaiting();
});

// Activate — delete ALL old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => {
        console.log("[SW] Deleting old cache:", k);
        return caches.delete(k);
      }))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - API calls: always network, never cache
// - JS/CSS chunks (/assets/): network-first, fall back to cache
//   (prevents stale chunks from breaking the app after deploys)
// - Navigation/index: network-first so deployments are picked up immediately
// - Everything else: cache-first with network fallback
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Always network for API
  if (url.pathname.startsWith("/api")) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: "Offline" }), {
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // Network-first for JS/CSS assets — critical to avoid stale chunk issues
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  if (e.request.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html") {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", clone));
          }
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Cache-first for everything else (icons, fonts, etc.)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        if (e.request.method === "GET" && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        if (e.request.mode === "navigate") {
          return caches.match("/index.html");
        }
      });
    })
  );
});

// Push notifications
self.addEventListener("push", (e) => {
  const data = e.data?.json() || {};
  const title = data.title || "Speak & Shine 🗣️";
  const options = {
    body: data.body || "You have a new notification",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-72.png",
    vibrate: [200, 100, 200],
    data: { url: data.url || "/" },
    actions: [
      { action: "open", title: "Open App" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Notification click
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  if (e.action === "dismiss") return;
  const url = e.notification.data?.url || "/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
