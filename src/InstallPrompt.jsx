import { useEffect, useState } from "react";

// App já instalado (rodando como PWA/standalone)?
const ehStandalone = () =>
  (window.matchMedia && (window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches)) ||
  window.navigator.standalone === true;

// Detecta o sistema operacional para a instrução correta
const detectaSO = () => {
  const ua = navigator.userAgent || "";
  const ios = /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  if (/Windows/.test(ua)) return "windows";
  return "outro";
};

const INSTRUCOES = {
  ios: "Toque em Compartilhar ⬆️ e depois em “Adicionar à Tela de Início”.",
  android: "Abra o menu ⋮ do navegador e toque em “Instalar aplicativo”.",
  windows: "Clique no ícone de instalar (⊕) na barra de endereço do navegador.",
  mac: "No Chrome/Edge: ícone de instalar na barra de endereço. No Safari: Arquivo → Adicionar ao Dock.",
  outro: "Abra o menu do navegador e escolha “Instalar aplicativo”.",
};

const NOMES_SO = { ios: "iPhone/iPad", android: "Android", windows: "Windows", mac: "Mac", outro: "este dispositivo" };

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null); // evento beforeinstallprompt (Android/desktop Chrome/Edge)
  const [visivel, setVisivel] = useState(false);
  const [instalado, setInstalado] = useState(ehStandalone());
  const [mostrarComoInstalar, setMostrarComoInstalar] = useState(false);
  const so = detectaSO();

  useEffect(() => {
    if (instalado) return;

    const onBIP = (e) => { e.preventDefault(); setDeferred(e); setVisivel(true); };
    const onInstalled = () => { setInstalado(true); setVisivel(false); };
    const onModeChange = () => { if (ehStandalone()) { setInstalado(true); setVisivel(false); } };

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    const mql = window.matchMedia("(display-mode: standalone)");
    mql.addEventListener?.("change", onModeChange);

    // Navegadores sem beforeinstallprompt (iOS Safari, alguns) → mostra mensagem manual
    const t = setTimeout(() => { if (!ehStandalone()) setVisivel(true); }, 1200);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      mql.removeEventListener?.("change", onModeChange);
      clearTimeout(t);
    };
  }, [instalado]);

  if (instalado || !visivel) return null;

  async function instalar() {
    if (deferred) {
      deferred.prompt();
      try {
        const { outcome } = await deferred.userChoice;
        if (outcome === "accepted") setVisivel(false);
      } catch { /* ignora */ }
      setDeferred(null);
    } else {
      // Sem prompt nativo (iOS etc.) → exibe o passo a passo
      setMostrarComoInstalar(true);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[200] flex justify-center p-3 sm:p-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-slate-900/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start gap-3 p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl shadow-lg shadow-blue-600/30">🍽️</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white">Instalar o aplicativo Pedido Prime</p>
            <p className="mt-0.5 text-xs text-slate-400">
              Acesso rápido em {NOMES_SO[so]}, em tela cheia e sempre atualizado.
            </p>
            {mostrarComoInstalar && (
              <p className="mt-2 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-2.5 text-xs leading-5 text-blue-200">
                📲 {INSTRUCOES[so]}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 border-t border-white/10 p-3">
          <button onClick={() => setVisivel(false)}
            className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10 transition">
            Agora não
          </button>
          <button onClick={instalar}
            className="flex-[1.5] rounded-2xl bg-blue-500 py-3 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30">
            {deferred ? "📥 Instalar aplicativo" : "Como instalar"}
          </button>
        </div>
      </div>
    </div>
  );
}
