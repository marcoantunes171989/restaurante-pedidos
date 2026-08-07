import { useEffect, useState, useRef } from "react";
import { RefreshCw } from "lucide-react";

// ════════════════════════════════════════════════════════════
//  PwaUpdateBanner — aviso de nova versão disponível (app instalado,
//  standalone). Lógica portada 1:1 do antigo src/PwaBanner.jsx (fluxo
//  "atualizar"): mesma fonte de verdade sobre a versão nova (lê /sw.js
//  sem cache pra achar o APP_VERSION injetado no build), mesmo botão
//  "Depois" (adia 15s), mesmo "Atualizar agora" (limpa caches e
//  recarrega — o novo SW já assumiu via skipWaiting). Não duplica o
//  registro do Service Worker nem a lógica de detecção de atualização
//  (isso continua 100% em src/main.jsx/iniciarSW) — este componente só
//  reage a `swAtivado` vindo de lá.
//
//  Propositalmente um componente separado do PwaExperienceDialog: são
//  dois convites com propósitos diferentes (instalar/abrir vs.
//  atualizar) e nunca aparecem ao mesmo tempo — o Provider já garante
//  isso (ver PwaExperienceProvider.jsx).
// ════════════════════════════════════════════════════════════
// Intervalo do "Depois": re-oferece a atualização a cada 30 minutos enquanto o
// usuário não confirmar (nunca atualiza sozinho).
const LEMBRETE_MS = 30 * 60 * 1000; // 30 min

export default function PwaUpdateBanner({ swAtivado }) {
  const [visivel, setVisivel] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [novaVersao, setNovaVersao] = useState(null);
  const lembreteRef = useRef(null);
  const pendenteRef = useRef(false); // há uma versão nova aguardando confirmação
  const atualizandoRef = useRef(false);
  const versaoAtual = (typeof __APP_VERSION__ !== "undefined") ? __APP_VERSION__ : "local";

  // Nova versão detectada (pelo SW) → marca como pendente e mostra o banner.
  useEffect(() => { if (swAtivado) { pendenteRef.current = true; queueMicrotask(() => setVisivel(true)); } }, [swAtivado]);

  useEffect(() => {
    if (!visivel) return;
    let cancelado = false;
    fetch("/sw.js", { cache: "no-store" })
      .then((r) => r.text())
      .then((t) => {
        if (cancelado) return;
        const m = t.match(/APP_VERSION\s*=\s*"([^"]+)"/);
        if (m && m[1] && m[1] !== "__APP_VERSION__") setNovaVersao(m[1]);
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [visivel]);

  // Re-exibe o banner ao VOLTAR ao app (aba/janela ficou oculta e voltou a ficar
  // visível, ou restauração via bfcache) — cobre "saiu da página e entrou de novo
  // / logou de novo". Enquanto houver atualização pendente e não estiver aplicando.
  useEffect(() => {
    const reexibir = () => {
      if (pendenteRef.current && !atualizandoRef.current && document.visibilityState === "visible") {
        clearTimeout(lembreteRef.current);
        setVisivel(true);
      }
    };
    const onVis = () => { if (document.visibilityState === "visible") reexibir(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", reexibir);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pageshow", reexibir); };
  }, []);

  useEffect(() => () => clearTimeout(lembreteRef.current), []);

  // "Depois": esconde e re-oferece a cada 30 min (enquanto a versão continuar pendente).
  function adiar() {
    setVisivel(false);
    clearTimeout(lembreteRef.current);
    lembreteRef.current = setTimeout(() => { if (pendenteRef.current) setVisivel(true); }, LEMBRETE_MS);
  }

  // "Atualizar agora": ÚNICO ponto onde a atualização acontece. Ativa o novo SW
  // (SKIP_WAITING) e recarrega já com a versão nova (o controllerchange do
  // main.jsx recarrega ao assumir; fallback garante o reload).
  async function aplicar() {
    clearTimeout(lembreteRef.current);
    atualizandoRef.current = true;
    setAtualizando(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        setTimeout(() => window.location.reload(), 1500); // fallback se o controllerchange demorar
        return;
      }
    } catch { /* segue para o reload direto */ }
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* segue com o reload mesmo se a limpeza falhar */ }
    window.location.reload();
  }

  if (!visivel) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[140] flex justify-center p-3 sm:p-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
      <div role="status" aria-live="polite" className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] shadow-[0_20px_50px_rgba(43,35,32,0.18)]">
        <div className="flex items-start gap-2.5 p-3.5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--pp-info-soft)] text-[var(--pp-info)] ${atualizando ? "animate-spin" : ""}`}>
            <RefreshCw aria-hidden="true" size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[var(--pp-text)]">Nova versão disponível</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[var(--pp-text-muted)]">
              {atualizando ? "Aplicando atualização…" : "Reinicie o app para ter as últimas novidades."}
            </p>
            {!atualizando && (
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 font-mono text-[10.5px] tabular-nums text-[var(--pp-text-muted)]">
                <span>Atual: {versaoAtual}</span>
                <span aria-hidden="true">→</span>
                <span className="font-semibold text-[var(--pp-text-body)]">{novaVersao || "carregando…"}</span>
              </p>
            )}
          </div>
        </div>
        {!atualizando && (
          <div className="flex gap-2.5 border-t border-[var(--pp-border)] p-2.5">
            <button type="button" onClick={adiar} className="flex min-h-[42px] flex-1 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] text-[13px] font-semibold text-[var(--pp-text-body)] transition-colors duration-150 hover:bg-[var(--pp-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)]">
              Depois
            </button>
            <button type="button" onClick={aplicar} className="flex min-h-[42px] flex-[1.4] items-center justify-center gap-2 rounded-xl btn-laranja bg-[var(--pp-primary)] text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-[var(--pp-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)]">
              <RefreshCw aria-hidden="true" size={14} /> Atualizar agora
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
