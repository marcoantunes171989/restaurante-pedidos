import { Check } from "lucide-react";

const PASSOS_PDV = [
  { id: 0, rotulo: "Produtos" },
  { id: 1, rotulo: "Pagamento" },
  { id: 2, rotulo: "Fechar" },
];

/**
 * Os 3 passos da conta: Produtos → Pagamento → Fechar. O operador vê em que passo está e pode voltar.
 * `maxPasso`: até onde já pode ir (o passo Fechar só abre com o total coberto).
 */
export default function PdvPassos({ passo = 0, onPasso, maxPasso = 2, desabilitado = false }) {
  return (
    <nav aria-label="Passos da conta" className="flex gap-1.5" data-testid="passos-pdv">
      {PASSOS_PDV.map((p) => {
        const atual = p.id === passo;
        const feito = p.id < passo;
        const bloqueado = desabilitado || p.id > maxPasso;
        return (
          <button
            key={p.id}
            type="button"
            aria-current={atual ? "step" : undefined}
            disabled={bloqueado && !atual}
            onClick={() => onPasso?.(p.id)}
            data-passo={p.id}
            className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-2 text-[12px] font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${
              atual ? "bg-[#012E46] text-white" : "bg-[var(--pp-bg)] text-[var(--pp-text-body)]"
            }`}
          >
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-black ${atual ? "bg-[#F38525] text-white" : feito ? "bg-[#1F7A3D] text-white" : "bg-[var(--pp-border)] text-[var(--pp-text)]"}`}>
              {feito ? <Check size={12} aria-hidden="true" /> : p.id + 1}
            </span>
            {p.rotulo}
          </button>
        );
      })}
    </nav>
  );
}
