import { useEffect, useState, useRef } from "react";

// ═══════════════════════════════════════════════════════════
//  InstallPrompt — Pedido Prime
//
//  Fluxos por plataforma (iOS, Android, Windows, Mac):
//
//  1. Rodando em standalone/fullscreen (app já aberto):
//     → não exibe nada.
//
//  2. Navegador detecta app instalado via getInstalledRelatedApps():
//     → exibe IMEDIATAMENTE o botão "Abrir no aplicativo".
//       Ao clicar, navega para o start_url → OS abre o app instalado.
//
//  3. App NÃO instalado (ou plataforma sem detecção, ex: iOS):
//     → aguarda 10 segundos → sugere instalar.
//
//  4. "Agora não":
//     → fecha e NÃO reaparece nesta sessão de página.
//     → ao recarregar a página, o ciclo recomeça (delay de 10s novamente).
// ═══════════════════════════════════════════════════════════

const DELAY_INSTALAR_MS = 10_000;   // 10s para sugestão de instalação
const START_URL         = "/login"; // start_url do manifesto

// ── Detecta se já está rodando como PWA instalado ───────────────────
function ehStandalone() {
  if (window.matchMedia) {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  }
  if (typeof window.navigator.standalone === "boolean") return window.navigator.standalone;
  if (document.referrer.startsWith("android-app://")) return true;
  return false;
}

// ── Detecta SO ───────────────────────────────────────────────────────
function detectaSO() {
  const ua = navigator.userAgent || "";
  const isIOS = /iP(hone|ad|od)/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh|Mac OS X/.test(ua) && navigator.maxTouchPoints === 0) return "mac";
  if (/Windows/.test(ua)) return "windows";
  return "outro";
}

const INSTRUCOES_INSTALAR = {
  ios:     "Toque em Compartilhar e depois em 'Adicionar a Tela de Inicio'.",
  android: "Menu do Chrome > 'Instalar aplicativo' ou 'Adicionar a tela inicial'.",
  windows: "Clique no icone de instalar na barra de endereco do Chrome/Edge.",
  mac:     "Chrome/Edge: icone de instalar na barra de endereco. Safari: Arquivo > Adicionar ao Dock.",
  outro:   "No menu do navegador, escolha 'Instalar aplicativo'.",
};

const NOMES_SO = {
  ios: "iPhone / iPad", android: "Android",
  windows: "Windows",  mac: "Mac", outro: "este dispositivo",
};

// ── Abre o app instalado navegando para o start_url ──────────────────
// No Android Chrome e Windows/Mac com PWA instalado, isso aciona o OS
// para interceptar a navegação e abrir o app instalado.
function abrirAppInstalado() {
  const url = new URL(START_URL, window.location.origin).href;
  // Tenta abrir o app; o OS/navegador decide se abre no app ou no browser
  try { window.location.replace(url); } catch { window.location.href = url; }
}

// ── Verifica se o PWA está instalado via getInstalledRelatedApps() ───
// Suportado: Chrome 85+ Android/Windows/Mac/ChromeOS
// Não suportado: iOS Safari, Firefox, Samsung Internet
async function verificarInstalado() {
  if (!("getInstalledRelatedApps" in navigator)) return false;
  try {
    const apps = await navigator.getInstalledRelatedApps();
    return apps.some(
      (a) =>
        a.platform === "webapp" &&
        (!a.url || a.url.includes(window.location.hostname))
    );
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  // "abrirApp" → app detectado como instalado → mostrar "Abrir no aplicativo"
  // "instalar" → app não instalado → mostrar sugestão de instalar (após 10s)
  // null → ainda verificando ou não deve exibir nada
  const [modo, setModo]             = useState(null);
  const [deferredEvt, setDeferredEvt] = useState(null);
  const [mostrarInstrucao, setMostrarInstrucao] = useState(false);
  const dispensadoRef               = useRef(false);
  const timerRef                    = useRef(null);
  const so                          = detectaSO();

  useEffect(() => {
    // Já está rodando no app instalado → não exibe nada
    if (ehStandalone()) return;

    let cancelado = false;

    (async () => {
      // ── Passo 1: tenta detectar app instalado ──────────────────────
      const instalado = await verificarInstalado();
      if (cancelado) return;

      if (instalado) {
        // App instalado mas navegando no browser → mostra botão imediatamente
        setModo("abrirApp");
        return;
      }

      // ── Passo 2: app não instalado → espera 10s e sugere instalar ──
      timerRef.current = setTimeout(() => {
        if (!cancelado && !dispensadoRef.current && !ehStandalone()) {
          setModo("instalar");
        }
      }, DELAY_INSTALAR_MS);
    })();

    // Escuta instalação em tempo real (Chrome/Edge: beforeinstallprompt / appinstalled)
    const onBIP = (e) => { e.preventDefault(); setDeferredEvt(e); };
    const onInstalled = () => { setModo(null); clearTimeout(timerRef.current); };
    // Mudança para standalone (usuário instalou enquanto a página estava aberta)
    const mql = window.matchMedia?.("(display-mode: standalone)");
    const onMode = () => { if (ehStandalone()) { setModo(null); clearTimeout(timerRef.current); } };

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    mql?.addEventListener("change", onMode);

    return () => {
      cancelado = true;
      clearTimeout(timerRef.current);
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      mql?.removeEventListener("change", onMode);
    };
  }, []);

  // ── Dispensar: fecha e não reaparece nesta sessão ────────────────
  function dispensar() {
    dispensadoRef.current = true;
    setModo(null);
    clearTimeout(timerRef.current);
  }

  // ── Instalar via prompt nativo ou instrução manual ───────────────
  async function instalar() {
    if (deferredEvt) {
      try {
        deferredEvt.prompt();
        const { outcome } = await deferredEvt.userChoice;
        if (outcome === "accepted") { setModo(null); return; }
        dispensar();
      } catch { dispensar(); }
      setDeferredEvt(null);
    } else {
      setMostrarInstrucao(true);
    }
  }

  if (!modo) return null;

  // ════════════════════════════════════════════════
  //  MODO 1 — App instalado detectado → "Abrir"
  // ════════════════════════════════════════════════
  if (modo === "abrirApp") {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[200] flex justify-center p-3 sm:p-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-400/20 bg-slate-900/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start gap-3 p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-2xl shadow-lg shadow-emerald-600/30">🍽️</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-white">Pedido Prime instalado</p>
              <p className="mt-0.5 text-xs text-slate-400">
                O aplicativo foi encontrado em {NOMES_SO[so]}. Deseja abri-lo agora?
              </p>
            </div>
          </div>
          <div className="flex gap-2 border-t border-white/10 p-3">
            <button onClick={dispensar}
              className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10 transition">
              Continuar no site
            </button>
            <button onClick={abrirAppInstalado}
              className="flex-[1.5] rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white hover:bg-emerald-400 transition active:scale-95 shadow-lg shadow-emerald-950/30">
              🚀 Abrir no aplicativo
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════
  //  MODO 2 — App não instalado → sugerir instalar
  // ════════════════════════════════════════════════
  return (
    <div className="fixed inset-x-0 bottom-0 z-[200] flex justify-center p-3 sm:p-4"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-slate-900/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start gap-3 p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl shadow-lg shadow-blue-600/30">🍽️</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white">Instalar o Pedido Prime</p>
            <p className="mt-0.5 text-xs text-slate-400">
              Acesso rapido em {NOMES_SO[so]}, tela cheia e sempre atualizado.
            </p>
            {mostrarInstrucao && (
              <p className="mt-2 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-2.5 text-xs leading-5 text-blue-200">
                📲 {INSTRUCOES_INSTALAR[so]}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 border-t border-white/10 p-3">
          <button onClick={dispensar}
            className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10 transition">
            Agora nao
          </button>
          <button onClick={instalar}
            className="flex-[1.5] rounded-2xl bg-blue-500 py-3 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30">
            {deferredEvt ? "📥 Instalar aplicativo" : "Como instalar"}
          </button>
        </div>
      </div>
    </div>
  );
}
