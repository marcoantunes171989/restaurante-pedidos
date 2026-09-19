import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

const FOCAVEIS = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// Drawer lateral acessível (padrão dialog do projeto: role="dialog" +
// aria-modal + clique no fundo fecha). Monte-o SOMENTE enquanto aberto:
// foca o painel ao abrir, prende o Tab, fecha no Esc e devolve o foco ao
// elemento que o abriu.
//
// PDB-I3-FE3: `variante="modal"` centraliza o painel (tela cheia no celular);
// `rodape` fixa uma área de ações abaixo do conteúdo rolável; `descritoPor` é o
// id de um elemento que resume o diálogo (aria-describedby).
export default function ReleaseDrawer({ titulo, descricao = null, onFechar, children, rodape = null, variante = "drawer", descritoPor = null }) {
  const tituloId = useId();
  const painelRef = useRef(null);
  const fecharRef = useRef(null);
  const modal = variante === "modal";

  useEffect(() => {
    const anterior = document.activeElement;
    fecharRef.current?.focus();
    return () => {
      if (anterior && typeof anterior.focus === "function") anterior.focus();
    };
  }, []);

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onFechar();
      return;
    }
    if (e.key !== "Tab") return;
    const itens = painelRef.current ? [...painelRef.current.querySelectorAll(FOCAVEIS)] : [];
    if (itens.length === 0) return;
    const primeiro = itens[0];
    const ultimo = itens[itens.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[120] flex bg-black/40 ${modal ? "items-stretch justify-center sm:items-center sm:p-4" : "justify-end"}`}
      onClick={onFechar}
      onKeyDown={onKeyDown}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descritoPor || undefined}
        className={modal
          ? "flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-[#D1D5DB]"
          : "flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-[#D1D5DB] bg-white"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id={tituloId} className="text-base font-bold text-[#012E46]">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-[13px] leading-5 text-[#6B7280]">{descricao}</p>}
          </div>
          <button
            ref={fecharRef}
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D1D5DB] bg-white text-[#012E46] transition hover:bg-[#F0F6F8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {rodape && <div className="border-t border-[#E5E7EB] px-4 py-3 sm:px-5">{rodape}</div>}
      </div>
    </div>
  );
}
