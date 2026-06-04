/* ═══════════════════════════════════════════════════════════════
   Service Worker — Pedido Prime  (v5)

   Mudança principal: NÃO chama skipWaiting() no install.
   O novo SW aguarda sinal da página ("SKIP_WAITING") antes de assumir.
   Isso garante:
   - No browser: update silencioso na próxima abertura (sem popup inútil).
   - No app (standalone): banner "Atualizar" → usuário decide quando.
   ═══════════════════════════════════════════════════════════════ */

const CACHE_VERSION = "pedido-prime-v5";
const SHELL_URLS    = ["/", "/login"];

// ── Install: pré-cacheia o shell, NÃO assume imediatamente ───────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => c.addAll(SHELL_URLS).catch(() => {}))
  );
  // Sem skipWaiting aqui → permite que a página mostre banner
  // e aplique somente quando o usuário confirmar (standalone)
  // OU na próxima abertura (browser).
});

// ── Activate: limpa caches antigos, assume clientes ──────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Notifica páginas abertas que a nova versão está ativa
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: "SW_ATIVADO", version: CACHE_VERSION }));
  })());
});

// ── Mensagens da página ──────────────────────────────────────────────
self.addEventListener("message", (e) => {
  if (!e.data) return;
  if (e.data.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data.type === "CHECK_UPDATE") self.registration.update().catch(() => {});
});

// ── Fetch: network-first same-origin, bypass total para cross-origin ─
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase / CDN → rede direta
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
      if (cached) return cached;
      return caches.match("/") || new Response("Offline", { status: 503 });
    }
  })());
});

// ── Background Sync (voltar online) ─────────────────────────────────
self.addEventListener("sync", (e) => {
  if (e.tag === "check-update")
    e.waitUntil(self.registration.update().catch(() => {}));
});

self.addEventListener("periodicsync", (e) => {
  if (e.tag === "hourly-update")
    e.waitUntil(self.registration.update().catch(() => {}));
});
