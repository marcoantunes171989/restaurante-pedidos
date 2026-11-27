import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import { useScrollLock } from "../lib/scrollLock";

// ════════════════════════════════════════════════════════════
//  Janela central do sistema — usada por todo detalhe que antes
//  abria na lateral direita.
//  • Centralizada e ampla no computador/tablet; tela cheia no celular.
//  • Uma janela aberta por cima de outra nasce DENTRO dela (com
//    "Voltar"), em vez de disputar o mesmo espaço.
//  • Só a janela do topo responde a Esc, Tab e clique no fundo.
//  • Cabeçalho e rodapé fixos; apenas o conteúdo rola.
//  titulo/subtitulo/badges/acoes/rodape aceitam qualquer ReactNode.
//  rodape: undefined = botão "Fechar"; null = sem rodapé.
// ════════════════════════════════════════════════════════════
const pilha = []; // janelas abertas, da mais antiga para a mais nova

const TAMANHOS = { md: "sm:max-w-[640px]", lg: "sm:max-w-[960px]", xl: "sm:max-w-[1180px]" };
const FOCAVEIS = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export default function ModalCentral({ aberto = true, ...resto }) {
  if (!aberto) return null;
  return <Posicionada {...resto} />;
}

// Escolhe onde a janela nasce DEPOIS que as que estão fechando já saíram: assim ela nunca é colocada dentro de uma
// janela que está sendo fechada no mesmo clique (ex.: "Enviar" no cupom fecha o cupom e abre o envio).
function Posicionada(props) {
  const [pai, setPai] = useState(undefined);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- o lugar só é conhecido depois que as janelas fechadas saíram
  useLayoutEffect(() => { setPai(pilha[pilha.length - 1]?.el || null); }, []);
  return pai === undefined ? null : <Janela {...props} pai={pai} />;
}

function Janela({ pai, ariaLabel, icone, titulo, badges, subtitulo, statsLinha, acoes, rodape, tamanho = "lg", colunas = 1, onFechar, children }) {
  const painelRef = useRef(null);
  const itemRef = useRef(null);
  // Quem abre costuma passar uma função nova a cada atualização: guardada aqui, não reinicia o foco (o que travava a rolagem no celular).
  const fecharRef = useRef(onFechar);
  useEffect(() => { fecharRef.current = onFechar; });
  useScrollLock(true);

  useLayoutEffect(() => {
    const item = { el: painelRef.current, fechar: () => fecharRef.current?.() };
    itemRef.current = item;
    pilha.push(item);
    return () => {
      const i = pilha.indexOf(item);
      // Fechar uma janela fecha também as que estavam dentro dela.
      if (i >= 0) pilha.splice(i).slice(1).forEach((acima) => acima.fechar());
    };
  }, []);

  useEffect(() => {
    const focoAnterior = document.activeElement;
    const painel = painelRef.current;
    (painel?.querySelector("[data-fechar]") || painel)?.focus({ preventScroll: true });
    function aoTeclado(e) {
      if (pilha[pilha.length - 1] !== itemRef.current) return;
      if (e.key === "Escape") { e.preventDefault(); fecharRef.current?.(); return; }
      if (e.key !== "Tab" || !painel) return;
      const lista = painel.querySelectorAll(FOCAVEIS);
      if (lista.length === 0) return;
      const primeiro = lista[0], ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    }
    document.addEventListener("keydown", aoTeclado);
    return () => {
      document.removeEventListener("keydown", aoTeclado);
      focoAnterior?.focus?.({ preventScroll: true });
    };
  }, []);

  const aoClicarFundo = (e) => {
    e.stopPropagation();
    if (e.target === e.currentTarget && pilha[pilha.length - 1] === itemRef.current) fecharRef.current?.();
  };

  const janela = (
    <div role="presentation" onClick={aoClicarFundo}
      className={`pp-modal-fundo flex items-center justify-center ${pai
        ? "absolute inset-0 z-20 rounded-[inherit] bg-[#012E46]/35 sm:p-4 sm:pt-12"
        : "fixed inset-0 z-[110] bg-[#012E46]/60 backdrop-blur-sm sm:p-4 lg:p-6"}`}>
      <div ref={painelRef} role="dialog" aria-modal="true" aria-label={ariaLabel} tabIndex={-1}
        className={`pp-modal-painel relative flex h-full w-full flex-col overflow-hidden bg-white text-left shadow-2xl outline-none sm:rounded-2xl sm:border sm:border-[#E5E7EB] ${pai
          ? "sm:max-h-full"
          : `sm:h-auto sm:max-h-[92dvh] ${tamanho === "md" ? "" : "sm:min-h-[min(40rem,86dvh)]"}`} ${TAMANHOS[tamanho] || TAMANHOS.lg}`}>
        <div className="shrink-0 border-b border-[#E5E7EB] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            {pai && (
              <button type="button" onClick={() => fecharRef.current?.()} aria-label="Voltar" title="Voltar"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] text-[#012E46] transition hover:bg-[#F2F4F7]">
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
            {icone}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight text-[#012E46]">{titulo}</h2>
                {badges}
              </div>
              {subtitulo && <p className="mt-0.5 truncate text-[13px] text-[#667085]">{subtitulo}</p>}
            </div>
            <button type="button" data-fechar onClick={() => fecharRef.current?.()} title="Fechar" aria-label="Fechar"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] text-[#667085] transition hover:bg-[#F2F4F7] hover:text-[#012E46]">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          {statsLinha && <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">{statsLinha}</div>}
          {acoes && <div className="mt-3 flex flex-wrap items-center gap-2">{acoes}</div>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          <div className={colunas === 2 ? "pp-modal-colunas" : "space-y-5"}>{children}</div>
        </div>
        {rodape !== null && (
          <div className="shrink-0 border-t border-[#E5E7EB] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
            <div className={rodape ? "" : "flex justify-end"}>
              {rodape || (
                <button type="button" onClick={() => fecharRef.current?.()}
                  className="h-11 w-full rounded-xl border border-[#D0D5DD] px-6 text-sm font-semibold text-[#344054] transition hover:bg-[#F2F4F7] sm:w-auto sm:min-w-[10rem]">
                  Fechar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return pai ? createPortal(janela, pai) : janela;
}
