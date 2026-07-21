import { useState } from "react";
import { Lock, Check, PackageCheck, Send, Loader2 } from "lucide-react";

// Botão de ação principal do pedido — terracota em todas as fases (o
// terracota é a cor de AÇÃO do sistema; azul/laranja/verde ficam
// reservados aos selos/colunas de STATUS, só leitura). Compartilhado
// pelo OrderCard (Kanban/lista mobile) e pela tabela de Lista desktop —
// mesma guarda local (`enviando`) contra clique duplicado nos dois
// lugares: desabilita assim que clicado, libera quando a promise de
// updateOrderStatus/marcarEntregue (App.jsx) resolve. `a` é o objeto cru
// de acaoPrincipal(o) — { l, fn, disabled } —, não alterado.
const ICONE_ACAO = { novo: Check, preparo: PackageCheck, pronto: Send };

export default function OrderActionButton({ a, variante, compact = false }) {
  const [enviando, setEnviando] = useState(false);
  if (!a) return null;
  const Icone = a.disabled ? Lock : (ICONE_ACAO[variante] || Check);

  async function clicar() {
    if (enviando || a.disabled || !a.fn) return;
    setEnviando(true);
    try { await a.fn(); } finally { setEnviando(false); }
  }

  return (
    <button
      type="button"
      onClick={clicar}
      disabled={a.disabled || enviando}
      className={`flex items-center justify-center gap-2 rounded-xl bg-[var(--pp-primary)] font-bold text-white transition-colors duration-150 hover:bg-[var(--pp-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[var(--pp-bg)] disabled:text-[var(--pp-text-muted)] disabled:active:scale-100 ${
        compact ? "min-h-[36px] px-3 text-xs" : "min-h-[44px] flex-1 px-4 text-sm"
      }`}
    >
      {enviando ? <Loader2 aria-hidden="true" size={compact ? 14 : 16} className="animate-spin" /> : <Icone aria-hidden="true" size={compact ? 14 : 16} />}
      {a.l}
    </button>
  );
}
