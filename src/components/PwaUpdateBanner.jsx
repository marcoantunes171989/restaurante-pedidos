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
export default function PwaUpdateBanner({ swAtivado }) {
  const [visivel, setVisivel] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [novaVersao, setNovaVersao] = useState(null);
  const lembreteRef = useRef(null);
  const versaoAtual = (typeof __APP_VERSION__ !== "undefined") ? __APP_VERSION__ : "local";

  useEffect(() => { if (swAtivado) queueMicrotask(() => setVisivel(true)); }, [swAtivado]);

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

  useEffect(() => () => clearTimeout(lembreteRef.current), []);

  function adiar() {
    setVisivel(false);
    clearTimeout(lembreteRef.current);
    lembreteRef.current = setTimeout(() => setVisivel(true), 15_000);
  }

  async function aplicar() {
    clearTimeout(lembreteRef.current);
    setAtualizando(true);
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
        <div className="flex items-start gap-3 p-4">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--pp-info-soft)] text-[var(--pp-info)] ${atualizando ? "animate-spin" : ""}`}>
            <RefreshCw aria-hidden="true" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--pp-text)]">Nova versão disponível</p>
            <p className="mt-0.5 text-xs leading-5 text-[var(--pp-text-muted)]">
              {atualizando ? "Aplicando atualização…" : "Reinicie o app para ter as últimas novidades."}
            </p>
            {!atualizando && (
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[11px] tabular-nums">
                <span className="text-[var(--pp-text-muted)]">Atual: {versaoAtual}</span>
                <span className="text-[var(--pp-text-muted)]">→</span>
                <span className="rounded bg-[var(--pp-info-soft)] px-1.5 py-[1px] font-black text-[var(--pp-info)]">{novaVersao || "carregando…"}</span>
              </p>
            )}
          </div>
        </div>
        {!atualizando && (
          <div className="flex gap-2.5 border-t border-[var(--pp-border)] p-3">
            <button type="button" onClick={adiar} className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] text-sm font-bold text-[var(--pp-text-body)] transition-colors duration-150 hover:bg-[var(--pp-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)]">
              Depois
            </button>
            <button type="button" onClick={aplicar} className="flex min-h-[44px] flex-[1.4] items-center justify-center gap-2 rounded-xl bg-[var(--pp-primary)] text-sm font-bold text-white transition-colors duration-150 hover:bg-[var(--pp-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)]">
              <RefreshCw aria-hidden="true" size={15} /> Atualizar agora
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
