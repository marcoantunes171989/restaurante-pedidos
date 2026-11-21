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
      <p className="min-w-[180px] flex-1 text-[12px] text-[var(--pp-text-muted)]" data-testid="frase-passo"><b className="text-[var(--pp-text)]">{frase.negrito}</b> {frase.texto}</p>
      <button
        type="button"
        onClick={onFuncoes}
        data-testid="btn-mais-funcoes"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--pp-border)] bg-white px-4 text-[13px] font-black text-[var(--pp-text-body)] hover:border-[#012E46]"
      >
        <MoreHorizontal size={16} aria-hidden="true" /> Mais funções <kbd className="rounded border border-[var(--pp-border)] bg-[var(--pp-bg)] px-1.5 text-[10px]">*</kbd>
      </button>
      <button
        type="button"
        onClick={() => principal.acao && onAcao?.(principal.acao)}
        disabled={principal.desabilitado || fechando}
        data-testid="acao-principal"
        className={`inline-flex min-h-12 min-w-[240px] items-center justify-center gap-2 rounded-xl px-6 text-base font-black transition disabled:cursor-not-allowed ${TOM[principal.tom]}`}
      >
        {fechando ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Fechando…</> : principal.texto}
      </button>
    </div>
  );
}
