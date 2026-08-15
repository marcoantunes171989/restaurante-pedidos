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
        if (m && m[1] && m[1] !== "__APP_VERSION__") {
          if (m[1] === versaoAtual) {
            pendenteRef.current = false;
            setVisivel(false);
            setNovaVersao(null);
          } else setNovaVersao(m[1]);
        }
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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[130] flex justify-center p-3 sm:justify-end sm:p-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
      <div role="status" aria-live="polite" aria-label="Atualização do Pedido Prime" className="pointer-events-auto w-full max-w-[380px] rounded-2xl border border-[#012E46]/15 bg-white p-3 shadow-[0_16px_40px_rgba(1,46,70,0.18)]">
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#012E46]/10 text-[#012E46] ${atualizando ? "animate-spin" : ""}`}>
            <RefreshCw aria-hidden="true" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[#012E46]">{atualizando ? "Atualizando…" : "Atualização disponível"}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              {atualizando ? "A nova versão será aberta em instantes." : "Uma versão mais recente do Pedido Prime está pronta."}
            </p>
          </div>
          {!atualizando && <button type="button" onClick={aplicar} className="shrink-0 rounded-xl bg-[#F38525] px-3.5 py-2.5 text-xs font-semibold text-[#012E46] transition hover:bg-[#e9791f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46]">Atualizar</button>}
        </div>
        {!atualizando && <div className="mt-2 flex items-center justify-between pl-12">
          <span className="text-[10px] text-slate-400">Leva apenas alguns segundos</span>
          <button type="button" onClick={adiar} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#012E46] transition hover:bg-[#012E46]/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#012E46]">Lembrar depois</button>
        </div>}
      </div>
    </div>
  );
}
