const CACHE = "financas-pwa-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Não cachear chamadas de API (sempre rede)
  if (url.pathname.includes("/api") || url.hostname.includes("workers.dev")) {
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ✅ NÃO intercepta chamadas da sua API (Worker)
  if (url.origin === "https://noisy-flower-1665.luca02699.workers.dev") {
    return; // deixa o navegador ir direto na rede
  }

  // (resto do seu fetch handler continua aqui)
});


