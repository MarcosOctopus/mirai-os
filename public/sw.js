const CACHE = "mirai-v5";
const OFFLINE = "/offline";

// Guarda a página OFFLINE já na instalação: é a única que precisa sobreviver
// sem rede. O resto do app é dinâmico — cachear JS/CSS daria código velho.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([OFFLINE]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Navegação: REDE primeiro (o app é dinâmico). Sem rede, a página /offline.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE).then(
        (r) =>
          r ||
          new Response("Sem conexão. Tente de novo quando o sinal voltar.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
      )
    )
  );
});
