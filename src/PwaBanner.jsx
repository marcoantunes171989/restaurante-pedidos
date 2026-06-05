/**
 * PwaBanner — único banner PWA, uma mensagem por vez.
 *
 * Prioridade:
 *  1. Standalone + SW ativado   → "Nova versão" (recarregar)
 *  2. Standalone + sem update   → nada
 *  3. Browser + app instalado   → "Abrir no aplicativo"
 *  4. Browser + não instalado   → após 10 s → "Instalar"
 *
 * "Abrir no aplicativo" por plataforma:
 *  iOS       → instrução imediata (ícone na Tela de Início).
 *              Não há API para forçar a abertura do PWA no iOS.
 *  Android   → tenta abrir via intent URL + fallback instrução.
 *  Win/Mac   → navega para start_url + fallback instrução.
 */

import { useEffect, useState, useRef } from "react";

const START_URL        = "/login";
const STORAGE_KEY      = "pp_pwa_instalado";
const STORAGE_TTL_DIAS = 90;
const DELAY_INSTALAR   = 10_000;

// ── Detecta standalone ────────────────────────────────────────
function ehStandalone() {
  if (window.matchMedia?.("(display-mode: standalone)")?.matches)  return true;
  if (window.matchMedia?.("(display-mode: fullscreen)")?.matches)  return true;
  if (window.matchMedia?.("(display-mode: minimal-ui)")?.matches)  return true;
  if (typeof navigator.standalone === "boolean") return navigator.standalone;
  if (document.referrer.startsWith("android-app://")) return true;
  return false;
}

// ── SO ────────────────────────────────────────────────────────
function detectaSO() {
  const ua = navigator.userAgent || "";
  if (/iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua) && !navigator.maxTouchPoints) return "mac";
  if (/Windows/.test(ua)) return "windows";
  return "outro";
}

// ── LocalStorage flag ────────────────────────────────────────
function lerFlag()  { try { const ts = parseInt(localStorage.getItem(STORAGE_KEY)||"0",10); return ts>0 && (Date.now()-ts)<STORAGE_TTL_DIAS*86_400_000; } catch { return false; } }
function gravarFlag(){ try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {} }
function limparFlag(){ try { localStorage.removeItem(STORAGE_KEY); } catch {} }

// ── getInstalledRelatedApps (Chrome/Edge) ─────────────────────
async function verificarAPI() {
  if (!("getInstalledRelatedApps" in navigator)) return false;
  try {
    const apps = await navigator.getInstalledRelatedApps();
    // A API só retorna apps relacionados ao manifest desta página → basta haver
    // uma entrada "webapp" para confirmar que o PWA está instalado neste aparelho.
    return apps.some((a) => a.platform === "webapp");
  } catch { return false; }
}

// ── Textos por plataforma ─────────────────────────────────────
const NOMES_SO = { ios: "iPhone / iPad", android: "Android", windows: "Windows", mac: "Mac", outro: "este dispositivo" };

const INSTRUCOES_INSTALAR = {
  ios:     "Toque no ícone Compartilhar ⬆️ e selecione 'Adicionar à Tela de Início'. Depois abra o app pelo ícone 🍽️ criado.",
  android: "Menu do Chrome (⋮) → 'Instalar aplicativo' ou 'Adicionar à tela inicial'.",
  windows: "Clique no ícone ⊕ na barra de endereço do Chrome ou Edge.",
  mac:     "Chrome/Edge: ícone ⊕ na barra de endereço. Safari: Arquivo → Adicionar ao Dock.",
  outro:   "No menu do navegador, escolha 'Instalar aplicativo'.",
};

// Como ABRIR o app já instalado (instrução por plataforma)
const INSTRUCOES_ABRIR = {
  ios:     "Procure e toque no ícone 🍽️ Pedido Prime na sua Tela de Início.",
  android: "Procure e toque no ícone 🍽️ Pedido Prime na sua Tela Inicial.",
  windows: "Abra 🍽️ Pedido Prime pela área de trabalho ou barra de tarefas.",
  mac:     "Abra 🍽️ Pedido Prime pelo Dock ou Launchpad.",
  outro:   "Abra 🍽️ Pedido Prime pelo ícone na tela inicial do seu dispositivo.",
};

// ═══════════════════════════════════════════════════════════════
export default function PwaBanner({ swAtivado = false }) {
  // banner: 'atualizar' | 'abrirApp' | 'instalar' | null
  const [banner, setBanner]         = useState(null);
  const [deferredEvt, setDeferredEvt] = useState(null);
  const [instrucaoInstalar, setInstrucaoInstalar] = useState(false);
  const [instrucaoAbrir, setInstrucaoAbrir]       = useState(false);
  const [atualizando, setAtualizando]             = useState(false);
  const [novaVersao, setNovaVersao]               = useState(null); // commit da versão a aplicar
  const dispensadoRef = useRef(false);
  const deferredRef   = useRef(null); // evento beforeinstallprompt (sinal de "não instalado")
  const timerRef      = useRef(null);
  const lembreteRef   = useRef(null); // timer do lembrete de atualização (15s)
  const so            = detectaSO();
  // Versão atual em execução (injetada no build)
  const versaoAtual = (typeof __APP_VERSION__ !== "undefined") ? __APP_VERSION__ : "local";

  // ── Banner de atualização só em standalone ────────────────
  useEffect(() => {
    if (swAtivado && ehStandalone()) setBanner("atualizar");
  }, [swAtivado]);

  // Descobre a versão (commit) que será aplicada, lendo o sw.js novo (no-cache)
  useEffect(() => {
    if (banner !== "atualizar") return;
    fetch("/sw.js", { cache: "no-store" })
      .then((r) => r.text())
      .then((t) => {
        const m = t.match(/APP_VERSION\s*=\s*"([^"]+)"/);
        if (m && m[1] && m[1] !== "__APP_VERSION__") setNovaVersao(m[1]);
      })
      .catch(() => {});
  }, [banner]);

  // ── Pipeline de detecção de instalação ───────────────────
  // Decisão entre "instalar" (não instalado) x "abrirApp" (instalado):
  //  Sinais de INSTALADO  → getInstalledRelatedApps() / flag local.
  //  Sinal de NÃO INSTALADO (definitivo) → beforeinstallprompt disparou.
  // No Windows (Chrome/Edge) o getInstalledRelatedApps é autoritativo: se o
  // ícone for removido (desinstalado), a API deixa de retornar o app → mostra
  // "Instalar"; se estiver instalado, retorna o app → mostra "Abrir no app".
  useEffect(() => {
    if (ehStandalone()) return; // Dentro do app → não mostra nada (atualizar cuida)
    let cancelado = false;
    let decidido = false;

    const mostrarInstalar = () => {
      if (cancelado || decidido || dispensadoRef.current || ehStandalone()) return;
      decidido = true;
      setBanner("instalar");
    };
    const mostrarAbrir = () => {
      if (cancelado || decidido || ehStandalone()) return;
      decidido = true;
      setBanner("abrirApp");
    };

    // beforeinstallprompt = navegador confirma que o app NÃO está instalado e é
    // instalável → é o sinal definitivo. Sobrepõe qualquer decisão anterior.
    const onBIP = (e) => {
      e.preventDefault();
      deferredRef.current = e;
      setDeferredEvt(e);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (cancelado || dispensadoRef.current || ehStandalone()) return;
        decidido = true;
        setBanner("instalar");
      }, 1500);
    };
    const onInstalled = () => {
      gravarFlag();
      decidido = true;
      setBanner(null);
      clearTimeout(timerRef.current);
    };
    const onMode = () => {
      if (ehStandalone()) { decidido = true; setBanner(null); clearTimeout(timerRef.current); }
    };

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    window.matchMedia?.("(display-mode: standalone)")?.addEventListener("change", onMode);

    (async () => {
      // 1. Está instalado? (sinal forte — Chrome/Edge Windows/Android/Mac)
      if (await verificarAPI()) { if (!cancelado) mostrarAbrir(); return; }
      if (cancelado) return;
      // 2. Flag local (iOS/Firefox/Samsung, que não têm a API)
      if (lerFlag()) { mostrarAbrir(); return; }

      // 3. Não confirmou instalado. Aguarda janela p/ o beforeinstallprompt
      //    disparar (caso não instalado e instalável). Depois decide.
      const temAPI = "getInstalledRelatedApps" in navigator; // Chrome/Edge
      timerRef.current = setTimeout(async () => {
        if (cancelado || decidido) return;
        if (deferredRef.current) { mostrarInstalar(); return; } // BIP chegou → instalar
        if (temAPI) {
          // Chrome/Edge: reconfirma. API diz NÃO instalado (ícone removido) →
          // mostra INSTALAR; diz instalado → ABRIR.
          const inst = await verificarAPI();
          if (cancelado) return;
          if (inst) mostrarAbrir(); else mostrarInstalar();
        } else {
          mostrarInstalar(); // navegadores sem a API → oferece instalar
        }
      }, 3500);
    })();

    return () => {
      cancelado = true;
      clearTimeout(timerRef.current);
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      window.matchMedia?.("(display-mode: standalone)")?.removeEventListener("change", onMode);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Dispensar ─────────────────────────────────────────────
  function dispensar() {
    dispensadoRef.current = true;
    setBanner(null);
    clearTimeout(timerRef.current);
  }

  // ── Adiar atualização: esconde e reexibe a cada 15s (forca o update) ──
  function adiarAtualizacao() {
    setBanner(null);
    clearTimeout(lembreteRef.current);
    lembreteRef.current = setTimeout(() => setBanner("atualizar"), 15_000);
  }

  // ── Instalar ──────────────────────────────────────────────
  async function instalar() {
    if (deferredEvt) {
      try {
        deferredEvt.prompt();
        const { outcome } = await deferredEvt.userChoice;
        if (outcome === "accepted") { gravarFlag(); setBanner(null); return; }
        dispensar();
      } catch { dispensar(); }
      setDeferredEvt(null);
    } else {
      gravarFlag();
      setInstrucaoInstalar(true);
    }
  }

  // ── Abrir o app instalado ─────────────────────────────────
  function handleAbrirApp() {
    // iOS: IMPOSSÍVEL abrir PWA via JS desde o Safari
    // Mostra instrução imediata sem tentar navegar
    if (so === "ios") {
      setInstrucaoAbrir(true);
      return;
    }

    // Android / Windows / Mac:
    // Tenta navegar para o start_url. No Android Chrome, se o PWA estiver
    // instalado como padrão para a URL, o Android pode interceptar e abrir o app.
    const url = new URL(START_URL, window.location.origin).href;

    if (so === "android") {
      // Intent URL para forçar o Android a checar apps registrados para esta URL
      const host = window.location.host;
      const intentUrl = `intent://${host}${START_URL}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
      try { window.location.href = intentUrl; }
      catch { window.location.href = url; }
    } else {
      // Windows / Mac: navegação direta
      try { window.location.replace(url); }
      catch { window.location.href = url; }
    }

    // Fallback: se ainda estiver no browser após 2s → mostra instrução
    setTimeout(() => {
      if (!ehStandalone()) setInstrucaoAbrir(true);
    }, 2500);
  }

  // ── Flag inválida (usuário nunca instalou, reseta) ────────
  function resetarFlag() {
    limparFlag();
    setBanner(null);
    setInstrucaoAbrir(false);
    timerRef.current = setTimeout(() => {
      if (!dispensadoRef.current && !ehStandalone()) setBanner("instalar");
    }, DELAY_INSTALAR);
  }

  // ── Aplicar atualização (standalone) ─────────────────────
  async function aplicarAtualizacao() {
    clearTimeout(lembreteRef.current);
    setAtualizando(true);
    // A nova versão já está ativa (skipWaiting no install do SW)
    // Basta recarregar para usar o novo código
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    window.location.reload();
  }

  if (!banner) return null;

  // ══════════════════════════════════════════════════════════
  //  ATUALIZAR — standalone com nova versão
  // ══════════════════════════════════════════════════════════
  if (banner === "atualizar") {
    return (
      <Wrap border="border-blue-400/30">
        {/* Conteúdo: ícone + texto */}
        <div className="flex items-start gap-3 p-4">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-2xl ${atualizando ? "animate-spin" : ""}`}>🔄</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white">Nova versão disponível</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-400">
              {atualizando ? "Aplicando atualização…" : "Reinicie o app para ter as últimas novidades."}
            </p>
            {!atualizando && (
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[11px]">
                <span className="text-slate-500">Atual: {versaoAtual}</span>
                <span className="text-slate-600">→</span>
                <span className="rounded bg-blue-500/15 px-1.5 py-[1px] font-black text-blue-300">
                  {novaVersao || "carregando…"}
                </span>
              </p>
            )}
          </div>
        </div>
        {/* Botões: linha própria, espaçados e em largura total */}
        {!atualizando && (
          <div className="flex gap-2.5 border-t border-white/10 p-3">
            <Btn variante="ghost" onClick={adiarAtualizacao}>Depois</Btn>
            <Btn variante="blue"  onClick={aplicarAtualizacao}>🔄 Atualizar agora</Btn>
          </div>
        )}
      </Wrap>
    );
  }

  // ══════════════════════════════════════════════════════════
  //  ABRIR APP — instalado, acessando pelo browser
  // ══════════════════════════════════════════════════════════
  if (banner === "abrirApp") {
    return (
      <Wrap border="border-emerald-400/20">
        <div className="flex items-start gap-3 p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-2xl shadow-lg shadow-emerald-600/30">🍽️</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white">Pedido Prime instalado</p>
            {!instrucaoAbrir ? (
              <p className="mt-0.5 text-xs text-slate-400">
                Encontrado em {NOMES_SO[so]}. Deseja abrí-lo agora?
              </p>
            ) : (
              <div className="mt-1.5 space-y-2">
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-2.5">
                  <p className="text-xs leading-5 text-emerald-200">
                    👆 {INSTRUCOES_ABRIR[so]}
                  </p>
                </div>
                <button onClick={resetarFlag}
                  className="text-xs text-slate-500 underline hover:text-slate-300 transition">
                  Não instalei — instalar agora
                </button>
              </div>
            )}
          </div>
        </div>
        {!instrucaoAbrir && (
          <div className="flex gap-2 border-t border-white/10 p-3">
            <Btn variante="ghost" onClick={dispensar}>Continuar no site</Btn>
            <Btn variante="green" onClick={handleAbrirApp}>🚀 Abrir no aplicativo</Btn>
          </div>
        )}
      </Wrap>
    );
  }

  // ══════════════════════════════════════════════════════════
  //  INSTALAR — não instalado, após 10 s
  // ══════════════════════════════════════════════════════════
  return (
    <Wrap border="border-white/15">
      <div className="flex items-start gap-3 p-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl shadow-lg shadow-blue-600/30">🍽️</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white">Instalar o Pedido Prime</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Acesso rápido em {NOMES_SO[so]}, tela cheia e sempre atualizado.
          </p>
          {instrucaoInstalar && (
            <div className="mt-2 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-2.5 space-y-1">
              <p className="text-xs leading-5 text-blue-200">📲 {INSTRUCOES_INSTALAR[so]}</p>
              {so === "ios" && (
                <p className="text-[11px] text-blue-300/70">
                  Após instalar, feche o Safari e abra pelo ícone. Na próxima visita detectamos automaticamente.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 border-t border-white/10 p-3">
        <Btn variante="ghost" onClick={dispensar}>Agora não</Btn>
        <Btn variante="blue"  onClick={instalar}>
          {deferredEvt ? "📥 Instalar aplicativo" : "Como instalar"}
        </Btn>
      </div>
    </Wrap>
  );
}

// ── Utilitários ───────────────────────────────────────────────
function Wrap({ children, border }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[200] flex justify-center p-3 sm:p-4"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
      <div className={`w-full max-w-md overflow-hidden rounded-3xl border ${border} bg-slate-900/95 shadow-2xl backdrop-blur-xl`}>
        {children}
      </div>
    </div>
  );
}

const cls = {
  ghost: "flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10 transition",
  blue:  "flex-[1.5] rounded-2xl bg-blue-500 py-3 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95",
  green: "flex-[1.5] rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white hover:bg-emerald-400 transition active:scale-95",
};
function Btn({ variante, onClick, children }) {
  return <button onClick={onClick} className={cls[variante]}>{children}</button>;
}
