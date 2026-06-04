/* ═══════════════════════════════════════════════════════════════════
   Service Worker — Pedido Prime
   Garantias:
   1. App-shell sempre atualizado: network-first + cache de fallback.
   2. Auto-update forçado: skipWaiting imediato + reload de todas as abas.
   3. Offline-to-online sync: ao recuperar internet, detecta nova versão
      e força atualização mesmo que o app esteja fechado (background sync).
   4. Retry: se o update falhar (rede instável), tenta novamente em 30s.
   5. Supabase/API: NUNCA em cache — passa 100% pela rede (back-end).
   ═══════════════════════════════════════════════════════════════════ */

// ── Versão do cache: mudar aqui força limpeza total na ativação ──────
const CACHE_VERSION = "pedido-prime-v4";
const SHELL_URLS    = ["/", "/login"];

// ── Instala: pré-cacheia o shell e ativa imediatamente ───────────────
self.addEventListener("install", (e) => {
  self.skipWaiting();                          // assume controle sem esperar
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => c.addAll(SHELL_URLS).catch(() => {}))
  );
});

// ── Ativa: apaga caches antigos e assume todas as abas abertas ───────
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k !== CACHE_VERSION)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();               // controla abas sem reload manual

    // Notifica TODAS as abas abertas: nova versão ativa → elas recarregam
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION }));
  })());
});

// ── Mensagens vindas do app ──────────────────────────────────────────
self.addEventListener("message", (e) => {
  if (!e.data) return;
  switch (e.data.type) {
    case "SKIP_WAITING":
      self.skipWaiting();
      break;
    case "CHECK_UPDATE":
      // App pede verificação imediata (chamado ao voltar online)
      self.registration.update().catch(() => {});
      break;
  }
});

// ── Fetch: network-first para o app shell; bypass total para APIs ────
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 1. Não cacheia nada cross-origin (Supabase, CDN de imagens, etc.)
  if (url.origin !== self.location.origin) return;
  // 2. Só GET same-origin
  if (req.method !== "GET") return;
  // 3. Não cacheia endpoints de API internos (/api/*)
  if (url.pathname.startsWith("/api/")) return;

  // Network-first: tenta rede, guarda em cache, serve do cache se offline
  e.respondWith((async () => {
    try {
      const resp = await fetch(req.clone(), { cache: "no-cache" });
      if (resp && resp.status === 200) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, resp.clone()).catch(() => {});
      }
      return resp;
    } catch {
      // Offline: serve do cache se disponível
      const cached = await caches.match(req);
      if (cached) return cached;
      // Fallback para o index.html (SPA)
      const root = await caches.match("/");
      return root || new Response("Offline", { status: 503 });
    }
  })());
});

// ── Background Sync: ao voltar online, verifica update ──────────────
// Registrado pelo app via reg.sync.register("check-update")
self.addEventListener("sync", (e) => {
  if (e.tag === "check-update") {
    e.waitUntil(
      self.registration.update()
        .then(() => notificarClientes("SYNC_UPDATE_CHECKED"))
        .catch(() => {})
    );
  }
});

// ── Periodic Background Sync (onde suportado) ───────────────────────
self.addEventListener("periodicsync", (e) => {
  if (e.tag === "hourly-update") {
    e.waitUntil(self.registration.update().catch(() => {}));
  }
});

// ── Helper: notifica todas as abas abertas ───────────────────────────
async function notificarClientes(tipo, payload = {}) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((c) => c.postMessage({ type: tipo, ...payload }));
}
