import { useEffect, useState } from "react";
import { useScrollLock } from "../../lib/scrollLock";

// `rodape` (opcional): conteúdo fixo ABAIXO da área rolável (ex.: total +
// CTA de "Finalizar pedido") — fica sempre visível, nunca precisa rolar até
// o fim pra alcançar o botão principal. Sem essa prop, a gaveta se comporta
// exatamente como antes (usado por aba "conta"/acompanhar pedido).
export default function Gaveta({ titulo, subtitulo, onFechar, children, rodape, fecharLabel = "Fechar", className = "" }) {
  useScrollLock(); // trava a rolagem do fundo enquanto a gaveta está aberta
  // Acompanha o "visual viewport" (área visível) para a gaveta sentar ACIMA do teclado
  // do celular — assim o campo focado nunca fica escondido.
  const [vp, setVp] = useState(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const upd = () => setVp({ h: Math.round(vv.height), top: Math.round(vv.offsetTop) });
    upd();
    vv.addEventListener("resize", upd);
    vv.addEventListener("scroll", upd);
    return () => { vv.removeEventListener("resize", upd); vv.removeEventListener("scroll", upd); };
  }, []);
  const overlayStyle = vp ? { top: vp.top, height: vp.h, bottom: "auto" } : undefined;
  const sheetHeight = vp ? `${vp.h}px` : "100dvh";
  return (
    <div data-theme="light" className={`tema-claro-area fixed inset-0 z-[110] flex w-full max-w-full items-end justify-center overflow-hidden bg-white ${className}`} style={{ ...overlayStyle, fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" }} onClick={onFechar}>
      {/* flex-col + min-h-0 no corpo: o rodapé (quando existe) reserva sua
          própria altura de verdade (medida pelo navegador), e o corpo rolável
          ocupa exatamente o resto — sem precisar "chutar" um px fixo de
          desconto pra altura do cabeçalho/rodapé em cada gaveta. */}
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-3xl flex-col overflow-hidden border-x border-[var(--client-border)] bg-white sm:rounded-t-[20px] sm:border-t" style={{ height: sheetHeight, maxHeight: sheetHeight, paddingBottom: rodape ? undefined : "env(safe-area-inset-bottom)" }}>
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-[var(--client-border)] bg-white px-4 pb-3 sm:rounded-t-[20px]" style={{ paddingTop: "max(0.75rem, calc(env(safe-area-inset-top) + 0.4rem))" }}>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--client-info)]">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-[11px] text-[var(--client-text-secondary)]">{subtitulo}</p>}
          </div>
          <button onClick={onFechar} aria-label={fecharLabel} title={fecharLabel} type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--client-border)] bg-white text-[var(--client-text-secondary)] transition duration-200 hover:border-[var(--client-primary)] hover:text-[var(--client-primary-hover)] active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--client-primary)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="pp-overscroll-contain min-h-0 flex-1 overflow-y-auto bg-white px-4 py-3">{children}</div>
        {rodape && (
          <div className="shrink-0 border-t border-[var(--client-border)] bg-white px-4 py-2.5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.625rem)" }}>
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}
