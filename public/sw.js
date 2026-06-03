/* Service Worker — Pedido Prime
   Objetivos:
   - Tornar o app instalável (PWA) em iOS, Android, Windows e Mac.
   - Sempre sincronizar a versão mais nova (auto-update: skipWaiting + clientsClaim + network-first).
   - NÃO cachear dados de API (Supabase) nem requisições cross-origin: tudo é
     consistido diretamente no back-end (Supabase/Vercel), sem servir dado velho.
*/
const CACHE = "pedido-prime-v1";
const APP_SHELL = ["/"];

self.addEventListener("install", (e) => {
  self.skipWaiting(); // ativa a nova versão imediatamente
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim(); // assume o controle das abas abertas
  })());
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Só trata GET same-origin (app shell/estáticos do Vercel).
  // Supabase e qualquer cross-origin/POST passam direto pela rede →
  // garante que toda informação seja gravada/consultada no back-end.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Network-first: sempre tenta a versão mais recente; usa cache só se offline.
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch {
      const cached = await caches.match(req);
      return cached || caches.match("/");
    }
  })());
});
