import { IconImpressora, IconSpinner } from "../PrimeIcons";

// E8: situação da nota fiscal da venda depois do pagamento (PDV e caixa Operacional).
const TOM_NOTA = {
  emitindo: "border-[var(--pp-border)] bg-white text-[var(--pp-text-body)]",
  autorizada: "border-[#1F7A3D]/30 bg-[#EAF6EE] text-[#1F7A3D]",
  contingencia: "border-[#B26A00]/30 bg-[#FFF5E5] text-[#8A5200]",
  pendente: "border-[#B26A00]/30 bg-[#FFF5E5] text-[#8A5200]",
  desligada: "border-[#B26A00]/30 bg-[#FFF5E5] text-[#8A5200]", // nota não emitida por configuração (simulação, não habilitada…)
  balcao: "border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-body)]", // Venda Balcão: sem nota por escolha do caixa
  erro: "border-[#B42318]/30 bg-[#FDECEA] text-[#B42318]",
};

export default function AvisoNotaFiscal({ nota, onImprimir, className = "mt-3" }) {
  const podeImprimir = onImprimir && nota.documentoId && ["autorizada", "contingencia"].includes(nota.estado);
  return (
    <div role="status" aria-live="polite" className={`${className} rounded-2xl border px-3 py-2 text-left text-xs ${TOM_NOTA[nota.estado] || TOM_NOTA.erro}`}>
      <p className="flex items-center gap-2 font-black">{nota.estado === "emitindo" && <IconSpinner />}{nota.titulo}</p>
      {nota.detalhe && <p className="mt-0.5 font-semibold">{nota.detalhe}</p>}
      {podeImprimir && (
        <button type="button" onClick={() => onImprimir(nota)} className="btn-laranja mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black text-[#012E46]">
          <IconImpressora width={16} height={16} /> Imprimir nota fiscal{nota.estado === "contingencia" ? " (2 vias)" : ""}
        </button>
      )}
    </div>
  );
}
