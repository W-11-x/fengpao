const CACHE_NAME = "fengpao-v3";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./src/config.js",
  "./src/game.js",
  "./manifest.webmanifest",
  "./assets/images/player.png",
  "./assets/images/icon-192.png",
  "./assets/images/icon-512.png",
  "./assets/music/bgm.mp3",
  "./assets/player/run_0.png",
  "./assets/player/run_1.png",
  "./assets/player/run_2.png",
  "./assets/player/run_3.png",
  "./assets/player/jump.png",
  "./assets/player/crouch.png",
  "./assets/player/idle.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy);
          });
        }
        return response;
      });
    })
  );
});
