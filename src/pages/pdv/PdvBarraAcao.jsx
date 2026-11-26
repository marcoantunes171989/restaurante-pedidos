import { Loader2, MoreHorizontal } from "lucide-react";
import { acaoPrincipal, frasePasso } from "./pdvAcaoPrincipal";

/**
 * Barra inferior do PDV: a frase diz o que fazer agora e há UMA ação principal por vez.
 *   sem conta → "Escolha uma conta"; passo 1 → "Receber R$ …"; passo 2 → "Falta R$ …" / "Continuar para fechar"; passo 3 → "Fechar conta e imprimir NFC-e".
 * "Mais funções" abre a paleta (tecla *).
 */
const TOM = {
  laranja: "btn-laranja text-[#012E46]",
  verde: "btn-verde text-white",
  neutro: "bg-[var(--pp-border)] text-[var(--pp-text-muted)]",
};

export default function PdvBarraAcao({ estado, fechando = false, onFuncoes, onAcao }) {
  const principal = acaoPrincipal(estado);
  const frase = frasePasso(estado);
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--pp-border)] bg-[var(--pp-surface)] px-3 py-2"
      style={{ paddingLeft: "max(0.75rem, env(safe-area-inset-left))", paddingRight: "max(0.75rem, env(safe-area-inset-right))" }}
      data-testid="barra-acao"
    >
      <p className="min-w-[180px] flex-1 basis-full text-[12px] sm:basis-0 text-[var(--pp-text-muted)]" data-testid="frase-passo"><b className="text-[var(--pp-text)]">{frase.negrito}</b> {frase.texto}</p>
      <button
        type="button"
        onClick={onFuncoes}
        data-testid="btn-mais-funcoes"
        className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--pp-border)] bg-white px-2.5 text-[12px] font-black text-[var(--pp-text-body)] hover:border-[#012E46] sm:min-h-11 sm:gap-2 sm:px-4 sm:text-[13px]"
      >
        <MoreHorizontal size={16} aria-hidden="true" /> Mais funções <kbd className="hidden rounded border border-[var(--pp-border)] bg-[var(--pp-bg)] px-1.5 text-[10px] sm:inline">*</kbd>
      </button>
      <button
        type="button"
        onClick={() => principal.acao && onAcao?.(principal.acao)}
        disabled={principal.desabilitado || fechando}
        data-testid="acao-principal"
        className={`inline-flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-center text-[15px] font-black leading-tight transition disabled:cursor-not-allowed sm:min-w-[240px] sm:flex-none sm:px-6 sm:text-base ${TOM[principal.tom]}`}
      >
        {fechando ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Fechando…</> : principal.texto}
      </button>
    </div>
  );
}
