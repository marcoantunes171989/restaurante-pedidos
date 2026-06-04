import { useEffect, useState, useRef } from "react";

// ═══════════════════════════════════════════════════════════
//  InstallPrompt — Pedido Prime
//
//  Detecção de instalação por plataforma:
//
//  Chrome/Edge (Android, Windows, Mac)
//    → getInstalledRelatedApps() — detecção nativa da API
//
//  iOS Safari (16.4+) / Firefox / Samsung Internet
//    → localStorage flag: ao clicar "Como instalar" ou após o prompt
//      nativo ser aceito, grava "pp_pwa_instalado".  Na próxima visita,
//      flag encontrada → exibe "Abrir no aplicativo" imediatamente.
//      Ao clicar, navega para start_url → iOS 16.4+ / Android abrem o
//      PWA instalado automaticamente.
//
//  Fluxo unificado:
//  1. Já em standalone          → nada.
//  2. API detecta instalado     → banner "Abrir" imediato (verde).
//  3. localStorage indica inst  → banner "Abrir" imediato (verde).
//  4. Nenhuma das anteriores    → aguarda 10 s → sugere instalar (azul).
//  5. "Agora não"               → fecha, não reaparece nesta sessão.
// ═══════════════════════════════════════════════════════════

const START_URL         = "/login";
const STORAGE_KEY       = "pp_pwa_instalado";   // flag de instalação
const STORAGE_TTL_DAYS  = 90;                   // validade da flag
const DELAY_INSTALAR_MS = 10_000;               // 10 s para sugestão

// ── Detecta se está rodando como PWA ────────────────────────
function ehStandalone() {
  if (window.matchMedia) {
    if (window.matchMedia("(display-mode: standalone)").matches)  return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches)  return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches)  return true;
  }
  if (typeof window.navigator.standalone === "boolean") return window.navigator.standalone;
  if (document.referrer.startsWith("android-app://"))  return true;
  return false;
}

// ── Detecta SO ───────────────────────────────────────────────
function detectaSO() {
  const ua = navigator.userAgent || "";
  const isIOS = /iP(hone|ad|od)/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/.test(ua))                                          return "android";
  if (/Macintosh|Mac OS X/.test(ua) && !navigator.maxTouchPoints) return "mac";
  if (/Windows/.test(ua))                                          return "windows";
  return "outro";
}

// ── Versão iOS (para dica específica 16.4+) ─────────────────
function versaoIOS() {
  const m = navigator.userAgent.match(/OS (\d+)_/);
  return m ? parseInt(m[1]) : 0;
}

// ── LocalStorage: flag de instalação ────────────────────────
function marcarInstalado() {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
}
function flagInstalado() {
  try {
    const ts = parseInt(localStorage.getItem(STORAGE_KEY) || "0");
    if (!ts) return false;
    return (Date.now() - ts) < STORAGE_TTL_DAYS * 86_400_000;
  } catch { return false; }
}
function limparFlag() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ── API: getInstalledRelatedApps ─────────────────────────────
async function verificarAPI() {
  if (!("getInstalledRelatedApps" in navigator)) return false;
  try {
    const apps = await navigator.getInstalledRelatedApps();
    return apps.some(
      (a) => a.platform === "webapp" &&
        (!a.url || a.url.includes(window.location.hostname))
    );
  } catch { return false; }
}

// ── Abre o app instalado ─────────────────────────────────────
// Android/Windows/Mac: OS intercepta e abre o PWA.
// iOS 16.4+: Safari oferece "Abrir em [App]".
function abrirApp() {
  const url = new URL(START_URL, window.location.origin).href;
  try { window.location.replace(url); } catch { window.location.href = url; }
}

// ── Textos por SO ────────────────────────────────────────────
const INSTRUCOES = {
  ios:     "Toque no botao Compartilhar e selecione 'Adicionar a Tela de Inicio'. Depois, abra o app pelo icone na tela inicial.",
  android: "Menu do Chrome (tres pontos) > 'Instalar aplicativo' ou 'Adicionar a tela inicial'.",
  windows: "Clique no icone de instalar (seta para baixo) na barra de endereco do Chrome ou Edge.",
  mac:     "Chrome/Edge: icone de instalar na barra de endereco. Safari: Arquivo > Adicionar ao Dock.",
  outro:   "No menu do navegador, escolha 'Instalar aplicativo' ou 'Adicionar a tela inicial'.",
};
const NOMES_SO = {
  ios: "iPhone / iPad", android: "Android",
  windows: "Windows",  mac: "Mac", outro: "este dispositivo",
};

// ════════════════════════════════════════════════════════════
export default function InstallPrompt() {
  // "abrirApp" | "instalar" | null
  const [modo, setModo]               = useState(null);
  const [deferredEvt, setDeferredEvt] = useState(null);
  const [mostrarInstrucao, setMostrarInstrucao] = useState(false);
  const [iOSAbrirDica, setiOSAbrirDica] = useState(false); // dica pós-clique "Abrir"
  const dispensadoRef = useRef(false);
  const timerRef      = useRef(null);
  const so            = detectaSO();

  useEffect(() => {
    if (ehStandalone()) return;  // já no app → silêncio total

    let cancelado = false;

    // ── beforeinstallprompt (Chrome/Edge/Android) ────────────
    const onBIP       = (e) => { e.preventDefault(); setDeferredEvt(e); };
    const onInstalled = () => { marcarInstalado(); setModo(null); clearTimeout(timerRef.current); };
    const mql         = window.matchMedia?.("(display-mode: standalone)");
    const onMode      = () => { if (ehStandalone()) { setModo(null); clearTimeout(timerRef.current); } };

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled",        onInstalled);
    mql?.addEventListener("change", onMode);

    // ── Pipeline de detecção ─────────────────────────────────
    (async () => {
      // 1. API nativa (Chrome/Edge)
      const apiDetectou = await verificarAPI();
      if (cancelado) return;

      if (apiDetectou) { setModo("abrirApp"); return; }

      // 2. Flag de localStorage (iOS, Firefox, Samsung…)
      if (flagInstalado()) { setModo("abrirApp"); return; }

      // 3. Nenhum sinal → aguarda 10 s → sugere instalar
      timerRef.current = setTimeout(() => {
        if (!cancelado && !dispensadoRef.current && !ehStandalone())
          setModo("instalar");
      }, DELAY_INSTALAR_MS);
    })();

    return () => {
      cancelado = true;
      clearTimeout(timerRef.current);
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled",        onInstalled);
      mql?.removeEventListener("change", onMode);
    };
  }, []);

  // ── Dispensar (não reaparece nesta sessão) ───────────────
  function dispensar() {
    dispensadoRef.current = true;
    setModo(null);
    clearTimeout(timerRef.current);
  }

  // ── Clicar "Como instalar" / confirmar prompt nativo ─────
  async function instalar() {
    if (deferredEvt) {
      try {
        deferredEvt.prompt();
        const { outcome } = await deferredEvt.userChoice;
        if (outcome === "accepted") { marcarInstalado(); setModo(null); return; }
        dispensar();
      } catch { dispensar(); }
      setDeferredEvt(null);
    } else {
      // iOS, Firefox, Samsung → mostra instrução manual + grava flag
      // (na próxima visita o banner "Abrir" já aparece)
      marcarInstalado();
      setMostrarInstrucao(true);
    }
  }

  // ── Clicar "Abrir no aplicativo" ─────────────────────────
  function handleAbrirApp() {
    if (so === "ios" && versaoIOS() < 16) {
      // iOS < 16: navegação não abre o PWA automaticamente
      // Mostra dica para abrir manualmente pela tela inicial
      setiOSAbrirDica(true);
      return;
    }
    abrirApp();
    // Se o app não abrir em 2s (ficou no browser), mostra dica
    setTimeout(() => {
      if (!ehStandalone()) setiOSAbrirDica(true);
    }, 2000);
  }

  // ── Flag inconsistente: "Abrir" não funcionou → resetar ──
  function resetarFlag() {
    limparFlag();
    setModo(null);
    setiOSAbrirDica(false);
    // Agenda a sugestão de (re)instalar
    timerRef.current = setTimeout(() => {
      if (!dispensadoRef.current && !ehStandalone()) setModo("instalar");
    }, DELAY_INSTALAR_MS);
  }

  if (!modo) return null;

  // ════════════════════════════════════════════════════════
  //  MODO 1 — App instalado (API ou flag) → "Abrir"
  // ════════════════════════════════════════════════════════
  if (modo === "abrirApp") {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[200] flex justify-center p-3 sm:p-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-400/20 bg-slate-900/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start gap-3 p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-2xl shadow-lg shadow-emerald-600/30">🍽️</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-white">Pedido Prime instalado</p>
              {!iOSAbrirDica ? (
                <p className="mt-0.5 text-xs text-slate-400">
                  O aplicativo foi encontrado em {NOMES_SO[so]}. Deseja abri-lo agora?
                </p>
              ) : (
                <div className="mt-1 space-y-2">
                  <p className="text-xs text-emerald-300">
                    {so === "ios"
                      ? "Procure o icone do Pedido Prime na sua tela inicial e toque para abrir."
                      : "Abra o aplicativo pelo icone na tela inicial ou na lista de apps."}
                  </p>
                  <button onClick={resetarFlag}
                    className="text-xs text-slate-500 underline hover:text-slate-300">
                    Nao instalei — instalar agora
                  </button>
                </div>
              )}
            </div>
          </div>
          {!iOSAbrirDica && (
            <div className="flex gap-2 border-t border-white/10 p-3">
              <button onClick={dispensar}
                className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10 transition">
                Continuar no site
              </button>
              <button onClick={handleAbrirApp}
                className="flex-[1.5] rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white hover:bg-emerald-400 transition active:scale-95 shadow-lg shadow-emerald-950/30">
                🚀 Abrir no aplicativo
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  //  MODO 2 — Nao instalado → sugerir instalar (apos 10 s)
  // ════════════════════════════════════════════════════════
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
              <div className="mt-2 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-2.5 space-y-1">
                <p className="text-xs leading-5 text-blue-200">
                  📲 {INSTRUCOES[so]}
                </p>
                {so === "ios" && (
                  <p className="text-[11px] text-blue-300/70">
                    Apos instalar, feche o Safari e abra o app pelo icone na tela inicial.
                    Na proxima visita pelo Safari, detectaremos automaticamente.
                  </p>
                )}
              </div>
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
