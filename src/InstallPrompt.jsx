import { useEffect, useState, useRef } from "react";

// ── Detecta se o app JÁ está instalado/rodando como PWA ─────────────
// Cobre: Android Chrome, iOS Safari, Windows/Mac Chrome/Edge (standalone/fullscreen)
function ehInstalado() {
  // display-mode: standalone ou fullscreen (PWA instalado via Chrome/Edge/Safari)
  if (window.matchMedia) {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  }
  // iOS Safari: navigator.standalone só existe no iOS
  if (typeof window.navigator.standalone === "boolean") return window.navigator.standalone;
  // Android TWA (Trusted Web Activity)
  if (document.referrer.startsWith("android-app://")) return true;
  return false;
}

// ── Detecta SO para exibir instrução correta ─────────────────────────
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

const INSTRUCOES = {
  ios:     "Toque em Compartilhar e depois em 'Adicionar a Tela de Inicio'.",
  android: "Abra o menu do Chrome e toque em 'Instalar aplicativo' ou 'Adicionar a tela inicial'.",
  windows: "Clique no icone de instalar na barra de endereco do Chrome/Edge.",
  mac:     "Chrome/Edge: icone de instalar na barra de endereco. Safari: Arquivo > Adicionar ao Dock.",
  outro:   "No menu do navegador, escolha 'Instalar aplicativo' ou 'Adicionar a tela inicial'.",
};

const NOMES_SO = {
  ios:     "iPhone / iPad",
  android: "Android",
  windows: "Windows",
  mac:     "Mac",
  outro:   "este dispositivo",
};

const DELAY_MS = 10_000; // 10 segundos antes de aparecer

export default function InstallPrompt() {
  const [deferredEvt, setDeferredEvt]       = useState(null);   // beforeinstallprompt
  const [visivel, setVisivel]               = useState(false);   // controla exibição
  const [instalado, setInstalado]           = useState(false);   // app já instalado?
  const [mostrarInstrucao, setMostrarInstrucao] = useState(false);
  const dispensadoRef                       = useRef(false);     // "Agora não" nesta sessão
  const timerRef                            = useRef(null);
  const so                                  = detectaSO();

  // ── 1) Verificação inicial: está instalado? ──────────────────────
  useEffect(() => {
    if (ehInstalado()) {
      setInstalado(true);
      return;
    }

    // Escuta mudança para standalone (usuário instala enquanto a página está aberta)
    const mql = window.matchMedia?.("(display-mode: standalone)");
    const aoMudar = () => { if (ehInstalado()) { setInstalado(true); setVisivel(false); } };
    mql?.addEventListener("change", aoMudar);

    return () => mql?.removeEventListener("change", aoMudar);
  }, []);

  // ── 2) Captura o prompt nativo (Android / Chrome/Edge desktop) ───
  useEffect(() => {
    if (instalado) return;
    const onBIP = (e) => { e.preventDefault(); setDeferredEvt(e); };
    const onInstalled = () => { setInstalado(true); setVisivel(false); };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [instalado]);

  // ── 3) Timer de 10s: só aparece se NÃO instalado e NÃO dispensado ─
  useEffect(() => {
    if (instalado) return;

    timerRef.current = setTimeout(() => {
      // Dupla verificação no momento de exibir (pode ter instalado durante o delay)
      if (!ehInstalado() && !dispensadoRef.current) setVisivel(true);
    }, DELAY_MS);

    return () => clearTimeout(timerRef.current);
  }, [instalado]);

  // ── Render: se instalado ou não está na hora, não renderiza nada ──
  if (instalado || !visivel) return null;

  // ── Dispensar: some AGORA e não volta nesta sessão de página ────────
  function dispensar() {
    dispensadoRef.current = true;
    setVisivel(false);
    clearTimeout(timerRef.current);
  }

  // ── Instalar ─────────────────────────────────────────────────────
  async function instalar() {
    if (deferredEvt) {
      try {
        deferredEvt.prompt();
        const { outcome } = await deferredEvt.userChoice;
        if (outcome === "accepted") { setInstalado(true); setVisivel(false); }
        else dispensar();
      } catch { dispensar(); }
      setDeferredEvt(null);
    } else {
      // iOS / Safari: mostra instrução manual
      setMostrarInstrucao(true);
    }
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[200] flex justify-center p-3 sm:p-4"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-slate-900/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start gap-3 p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl shadow-lg shadow-blue-600/30">🍽️</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white">Instalar o Pedido Prime</p>
            <p className="mt-0.5 text-xs text-slate-400">
              Acesso rápido em {NOMES_SO[so]}, tela cheia e sempre atualizado.
            </p>
            {mostrarInstrucao && (
              <p className="mt-2 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-2.5 text-xs leading-5 text-blue-200">
                📲 {INSTRUCOES[so]}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 border-t border-white/10 p-3">
          <button
            onClick={dispensar}
            className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10 transition">
            Agora não
          </button>
          <button
            onClick={instalar}
            className="flex-[1.5] rounded-2xl bg-blue-500 py-3 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30">
            {deferredEvt ? "📥 Instalar aplicativo" : "Como instalar"}
          </button>
        </div>
      </div>
    </div>
  );
}
