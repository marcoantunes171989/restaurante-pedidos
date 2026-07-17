/* ═══════════════════════════════════════════════════════════════
   Service Worker — Pedido Prime  (v7)

   Restaura skipWaiting() no install → propagação imediata para
   todos os usuários com versões antigas. Mantém compatibilidade
   retroativa enviando SW_UPDATED (código antigo) + SW_ATIVADO (novo).

   v7: adiciona push + notificationclick (Web Push real — migration 064
   / Edge Function notificacoes-push). Não cria um segundo SW nem mexe
   na estratégia de cache/offline acima — só soma dois listeners novos.
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

// ── Web Push (migration 064 / Edge Function notificacoes-push) ──────────
// Payload enviado pelo servidor: { title, body, tag, eventId, data: { tipo,
// pedidoId, rota }, actions: [{action,title}] }. Nunca silent — respeita o
// som padrão do sistema.
self.addEventListener("push", (e) => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch { return; }

  const titulo = payload.title || "Pedido Prime";
  const eventId = payload.data?.eventId || payload.tag || undefined;
  const opcoes = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || eventId, // agrupa/evita duplicidade visual do mesmo evento
    data: { ...(payload.data || {}), eventId },
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    requireInteraction: false,
    silent: false, // nunca silent: true — som padrão do sistema/navegador
  };

  e.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const rota = e.notification.data?.rota || "/operacional/pedidos";

  e.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

    // Foca uma janela já aberta e navega ela para a rota certa, em vez de
    // abrir uma nova aba toda vez que uma notificação é clicada.
    for (const client of clientList) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) {
          try { await client.navigate(rota); } catch { client.postMessage({ type: "NOTIFICACAO_CLICADA", rota }); }
        } else {
          client.postMessage({ type: "NOTIFICACAO_CLICADA", rota });
        }
        return;
      }
    }

    if (self.clients.openWindow) await self.clients.openWindow(rota);
  })());
});
