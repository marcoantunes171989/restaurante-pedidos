/**
 * PwaBanner — componente ÚNICO de notificação PWA
 *
 * Exibe NO MÁXIMO UM banner por vez, seguindo esta prioridade:
 *
 * ┌──────────────────────────┬──────────────────────────────────────────┐
 * │ Estado detectado         │ Banner exibido                           │
 * ├──────────────────────────┼──────────────────────────────────────────┤
 * │ Standalone + update      │ 🔄 "Atualizar" (verde escuro)            │
 * │ Standalone + sem update  │ (nada)                                   │
 * │ Instalado + qualquer     │ 🚀 "Abrir no aplicativo" (verde)         │
 * │ Não instalado            │ Após 10s: 📥 "Instalar" (azul)           │
 * └──────────────────────────┴──────────────────────────────────────────┘
 *
 * Detecção de instalação (todas as plataformas):
 *   1. display-mode standalone/fullscreen/minimal-ui  → definitivo
 *   2. navigator.standalone (iOS)                     → definitivo
 *   3. getInstalledRelatedApps() (Chrome/Edge)        → API nativa
 *   4. localStorage flag pp_pwa_instalado             → iOS/Firefox/Samsung
 *   5. beforeinstallprompt não disparou em browser
 *      compatível após 3s                             → heurístico Chrome/Edge
 */

import { useEffect, useState, useRef } from "react";

// ── Constantes ────────────────────────────────────────────────
const DELAY_INSTALAR_MS   = 10_000;
const STORAGE_KEY         = "pp_pwa_instalado";
const STORAGE_TTL_DIAS    = 90;
const START_URL           = "/login";

// ── Helpers de detecção ───────────────────────────────────────

function ehStandalone() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)")?.matches)  return true;
  if (window.matchMedia?.("(display-mode: fullscreen)")?.matches)  return true;
  if (window.matchMedia?.("(display-mode: minimal-ui)")?.matches)  return true;
  if (typeof navigator.standalone === "boolean") return navigator.standalone;
  if (document.referrer.startsWith("android-app://"))              return true;
  return false;
}

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

function lerFlag() {
  try {
    const ts = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
    return ts > 0 && (Date.now() - ts) < STORAGE_TTL_DIAS * 86_400_000;
  } catch { return false; }
}
function gravarFlag()  { try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {} }
function limparFlag()  { try { localStorage.removeItem(STORAGE_KEY); } catch {} }

// ── Detecção de SO ────────────────────────────────────────────
function detectaSO() {
  const ua = navigator.userAgent || "";
  if (/iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua) && !navigator.maxTouchPoints) return "mac";
  if (/Windows/.test(ua))  return "windows";
  return "outro";
}

// ── Versão iOS ────────────────────────────────────────────────
function versaoIOS() {
  const m = navigator.userAgent.match(/OS (\d+)_/);
  return m ? parseInt(m[1], 10) : 0;
}

const INSTRUCOES = {
  ios:     "Toque no icone de Compartilhar (quadrado com seta) e escolha 'Adicionar a Tela de Inicio'. Depois abra o app pelo icone criado.",
  android: "Menu do Chrome (3 pontos) > 'Instalar aplicativo' ou 'Adicionar a tela inicial'.",
  windows: "Clique no icone de instalar (seta/mais) na barra de endereco do Chrome ou Edge.",
  mac:     "Chrome/Edge: icone de instalar na barra de endereco. Safari: Arquivo > Adicionar ao Dock.",
  outro:   "No menu do navegador, escolha 'Instalar aplicativo' ou 'Adicionar a tela inicial'.",
};

const NOMES_SO = {
  ios: "iPhone / iPad", android: "Android",
  windows: "Windows",  mac: "Mac", outro: "este dispositivo",
};

// ── Abrir o app instalado ─────────────────────────────────────
function navegarParaApp() {
  const url = new URL(START_URL, window.location.origin).href;
  try { window.location.replace(url); } catch { window.location.href = url; }
}

// ════════════════════════════════════════════════════════════════
//  Estados possíveis do banner
//   'atualizar'  → standalone + update pendente
//   'abrirApp'   → instalado mas no browser
//   'instalar'   → não instalado, após 10s
//   null         → nada a exibir
// ════════════════════════════════════════════════════════════════

export default function PwaBanner({ hasUpdate = false, onAtualizar }) {
  const [banner, setBanner]           = useState(null);
  const [deferredEvt, setDeferredEvt] = useState(null);
  const [mostrarInstrucao, setMostrarInstrucao] = useState(false);
  const [iosAbrir, setIosAbrir]       = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const dispensadoRef                 = useRef(false);
  const timerRef                      = useRef(null);
  const so                            = detectaSO();

  // ── Pipeline principal ──────────────────────────────────────
  useEffect(() => {
    let cancelado = false;

    const decidir = async () => {
      // 1. Standalone (app aberto como PWA instalado)
      if (ehStandalone()) {
        // Só mostra banner se houver update real aguardando
        if (hasUpdate) setBanner("atualizar");
        // Sem update: silêncio total
        return;
      }

      // 2. Verifica se o app está instalado (browser, não standalone)
      //    Método A: API nativa (Chrome/Edge Android/Windows/Mac)
      const viaAPI = await verificarAPI();
      if (cancelado) return;

      //    Método B: flag de localStorage (iOS, Firefox, Samsung)
      const viaFlag = lerFlag();

      if (viaAPI || viaFlag) {
        setBanner("abrirApp");
        return;
      }

      //    Método C (heurístico Chrome/Edge): se o browser suporta
      //    beforeinstallprompt mas ele não disparou em 3s, provavelmente
      //    o app está instalado. Aguardamos 3s antes de decidir.
      const suportaBIP = /Chrome|Edg/.test(navigator.userAgent) &&
        !(/iPhone|iPad|CriOS/.test(navigator.userAgent));

      if (suportaBIP) {
        // Se BIP ainda não disparou, aguarda 3s
        await new Promise((res) => setTimeout(res, 3000));
        if (cancelado) return;
        if (!deferredEvt && !cancelado) {
          // BIP não disparou → app provavelmente instalado
          setBanner("abrirApp");
          return;
        }
      }

      // 3. Não instalado → aguarda 10s → sugere instalar
      timerRef.current = setTimeout(() => {
        if (!cancelado && !dispensadoRef.current && !ehStandalone())
          setBanner("instalar");
      }, DELAY_INSTALAR_MS);
    };

    decidir();

    return () => {
      cancelado = true;
      clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atualiza banner "atualizar" quando hasUpdate muda (ex: SW waiting detectado)
  useEffect(() => {
    if (hasUpdate && ehStandalone()) setBanner("atualizar");
  }, [hasUpdate]);

  // ── Eventos do navegador ────────────────────────────────────
  useEffect(() => {
    const onBIP = (e) => {
      e.preventDefault();
      setDeferredEvt(e);
      // BIP disparou → app definitivamente NÃO instalado
      // Cancela o heurístico e aguarda o timer de 10s normalmente
    };
    const onInstalled = () => {
      gravarFlag();
      setBanner(null);
      clearTimeout(timerRef.current);
    };
    const onMode = () => {
      if (ehStandalone()) { setBanner(null); clearTimeout(timerRef.current); }
    };

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    window.matchMedia?.("(display-mode: standalone)")?.addEventListener("change", onMode);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      window.matchMedia?.("(display-mode: standalone)")?.removeEventListener("change", onMode);
    };
  }, []);

  // ── Ações ───────────────────────────────────────────────────
  function dispensar() {
    dispensadoRef.current = true;
    setBanner(null);
    clearTimeout(timerRef.current);
  }

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
      gravarFlag(); // flag gravada → próxima visita detecta como instalado
      setMostrarInstrucao(true);
    }
  }

  async function aplicarUpdate() {
    setAtualizando(true);
    try { await onAtualizar?.(); }
    catch { /* reload vai acontecer mesmo */ }
    setTimeout(() => setAtualizando(false), 4000);
  }

  function handleAbrirApp() {
    // iOS < 16: não intercepta automaticamente, mostra dica manual
    if (so === "ios" && versaoIOS() < 16) { setIosAbrir(true); return; }
    navegarParaApp();
    // Fallback: se depois de 2s ainda estiver no browser, app pode não estar
    // instalado → reset de flag + mostra dica
    setTimeout(() => {
      if (!ehStandalone()) setIosAbrir(true);
    }, 2000);
  }

  function resetarFlag() {
    limparFlag();
    setBanner(null);
    setIosAbrir(false);
    timerRef.current = setTimeout(() => {
      if (!dispensadoRef.current && !ehStandalone()) setBanner("instalar");
    }, DELAY_INSTALAR_MS);
  }

  if (!banner) return null;

  // ════════════════════════════════════════════════════════════
  //  BANNER: ATUALIZAR (standalone + update pendente)
  // ════════════════════════════════════════════════════════════
  if (banner === "atualizar") {
    return (
      <BannerWrap borderColor="border-blue-400/30">
        <div className="flex items-start gap-3 p-4">
          <span className={`text-2xl ${atualizando ? "animate-spin" : ""}`}>🔄</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white">Nova versão disponível</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {atualizando ? "Aplicando atualização…" : "Atualize para ter as últimas novidades."}
            </p>
          </div>
          {!atualizando && (
            <div className="flex shrink-0 gap-2">
              <Btn onClick={dispensar} variante="ghost">Depois</Btn>
              <Btn onClick={aplicarUpdate} variante="blue">Atualizar</Btn>
            </div>
          )}
        </div>
      </BannerWrap>
    );
  }

  // ════════════════════════════════════════════════════════════
  //  BANNER: ABRIR APP (instalado, visitando no browser)
  // ════════════════════════════════════════════════════════════
  if (banner === "abrirApp") {
    return (
      <BannerWrap borderColor="border-emerald-400/20">
        <div className="flex items-start gap-3 p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-2xl shadow-lg shadow-emerald-600/30">🍽️</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white">Pedido Prime instalado</p>
            {!iosAbrir ? (
              <p className="mt-0.5 text-xs text-slate-400">
                Encontrado em {NOMES_SO[so]}. Deseja abrir o aplicativo?
              </p>
            ) : (
              <div className="mt-1 space-y-1.5">
                <p className="text-xs text-emerald-300">
                  {so === "ios"
                    ? "Abra o Pedido Prime pelo ícone na sua tela inicial."
                    : "Abra o aplicativo pelo ícone na tela inicial ou lista de apps."}
                </p>
                <button onClick={resetarFlag} className="text-xs text-slate-500 underline hover:text-slate-300">
                  Não instalei — instalar agora
                </button>
              </div>
            )}
          </div>
        </div>
        {!iosAbrir && (
          <div className="flex gap-2 border-t border-white/10 p-3">
            <Btn onClick={dispensar} variante="ghost">Continuar no site</Btn>
            <Btn onClick={handleAbrirApp} variante="green">🚀 Abrir no aplicativo</Btn>
          </div>
        )}
      </BannerWrap>
    );
  }

  // ════════════════════════════════════════════════════════════
  //  BANNER: INSTALAR (não instalado, após 10 s)
  // ════════════════════════════════════════════════════════════
  return (
    <BannerWrap borderColor="border-white/15">
      <div className="flex items-start gap-3 p-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl shadow-lg shadow-blue-600/30">🍽️</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white">Instalar o Pedido Prime</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Acesso rápido em {NOMES_SO[so]}, tela cheia e sempre atualizado.
          </p>
          {mostrarInstrucao && (
            <div className="mt-2 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-2.5 space-y-1">
              <p className="text-xs leading-5 text-blue-200">📲 {INSTRUCOES[so]}</p>
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
        <Btn onClick={dispensar} variante="ghost">Agora não</Btn>
        <Btn onClick={instalar}  variante="blue">
          {deferredEvt ? "📥 Instalar aplicativo" : "Como instalar"}
        </Btn>
      </div>
    </BannerWrap>
  );
}

// ── Sub-componentes utilitários ───────────────────────────────
function BannerWrap({ children, borderColor }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[200] flex justify-center p-3 sm:p-4"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
      <div className={`w-full max-w-md overflow-hidden rounded-3xl border ${borderColor} bg-slate-900/95 shadow-2xl backdrop-blur-xl`}>
        {children}
      </div>
    </div>
  );
}

const varianteCls = {
  ghost: "flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10 transition",
  blue:  "flex-[1.5] rounded-2xl bg-blue-500 py-3 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30",
  green: "flex-[1.5] rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white hover:bg-emerald-400 transition active:scale-95 shadow-lg shadow-emerald-950/30",
};

function Btn({ onClick, variante, children }) {
  return <button onClick={onClick} className={varianteCls[variante]}>{children}</button>;
}
