/* ═══════════════════════════════════════════════════════════════
   Service Worker — Pedido Prime  (v6)

   Restaura skipWaiting() no install → propagação imediata para
   todos os usuários com versões antigas. Mantém compatibilidade
   retroativa enviando SW_UPDATED (código antigo) + SW_ATIVADO (novo).
   ═══════════════════════════════════════════════════════════════ */

// __BUILD_TIME__ é substituído pelo timestamp do build (vite.config.js) a cada
// deploy → o conteúdo do sw.js MUDA, fazendo o navegador detectar a atualização
// (inclusive em PWA instalado no Windows). Sem isso, o SW fica byte-idêntico e
// o update nunca é detectado.
const BUILD_TIME    = "__BUILD_TIME__";
const CACHE_VERSION = "pedido-prime-" + BUILD_TIME;
const SHELL_URLS    = ["/", "/login"];

self.addEventListener("install", (e) => {
  self.skipWaiting();   // ativa imediatamente → todos recebem a atualização
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => c.addAll(SHELL_URLS).catch(() => {}))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // Limpa caches antigos
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();

    // Notifica todas as abas:
    //   SW_ATIVADO  → código novo (PwaBanner)
    //   SW_UPDATED  → compatibilidade com código antigo (UpdateBanner)
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clients.forEach((c) => {
      c.postMessage({ type: "SW_ATIVADO",  version: CACHE_VERSION });
      c.postMessage({ type: "SW_UPDATED",  version: CACHE_VERSION }); // backward-compat
    });
  })());
});

self.addEventListener("message", (e) => {
  if (!e.data) return;
  if (e.data.type === "SKIP_WAITING")  self.skipWaiting();
  if (e.data.type === "CHECK_UPDATE")  self.registration.update().catch(() => {});
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;

  e.respondWith((async () => {
    try {
      const resp = await fetch(req.clone(), { cache: "no-cache" });
      if (resp && resp.status === 200) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, resp.clone()).catch(() => {});
      }
      return resp;
    } catch {
      const cached = await caches.match(req);
      return cached || caches.match("/") || new Response("Offline", { status: 503 });
    }
  })());
});

self.addEventListener("sync", (e) => {
  if (e.tag === "check-update")
    e.waitUntil(self.registration.update().catch(() => {}));
});

self.addEventListener("periodicsync", (e) => {
  if (e.tag === "hourly-update")
    e.waitUntil(self.registration.update().catch(() => {}));
});
