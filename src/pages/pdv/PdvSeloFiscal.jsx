import { useState } from "react";
import { FileCheck2, FileWarning, ChevronDown } from "lucide-react";

/**
 * Selo "Nota fiscal" da conta (Etapa 1c — só prévia). Recebe o resultado de
 * seloFiscalDaConta (src/lib/fiscal/seloFiscal.js); null → não renderiza.
 * Não bloqueia nem altera o fechamento da conta.
 */
export default function PdvSeloFiscal({ selo = null }) {
  const [aberto, setAberto] = useState(false);
  if (!selo) return null;
  const pronta = selo.estado === "pronta";
  const Icone = pronta ? FileCheck2 : FileWarning;
  const visiveis = selo.pendencias.slice(0, 4);
  const resto = selo.pendencias.length - visiveis.length;
  return (
    <div className={`shrink-0 border-b border-[var(--pp-border)] ${pronta ? "bg-[#F2FBF5]" : "bg-[var(--pp-bg)]"}`} data-testid="pdv-selo-fiscal">
      <button
        type="button"
        onClick={() => !pronta && setAberto((v) => !v)}
        aria-expanded={pronta ? undefined : aberto}
        disabled={pronta}
        title={pronta ? "Prévia: esta venda já tem os dados para a nota fiscal." : selo.pendencias.join("\n")}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left disabled:cursor-default"
      >
        <Icone size={13} className={`shrink-0 ${pronta ? "text-[#1F7A3D]" : "text-[#012E46]"}`} aria-hidden="true" />
        <span className={`min-w-0 flex-1 truncate text-[10px] font-black ${pronta ? "text-[#1F7A3D]" : "text-[#012E46]"}`}>
          {selo.titulo}
        </span>
        {!pronta && <ChevronDown size={12} className={`shrink-0 text-[var(--pp-text-muted)] transition ${aberto ? "rotate-180" : ""}`} aria-hidden="true" />}
      </button>
      {!pronta && aberto && (
        <ul className="space-y-0.5 px-2.5 pb-1.5 text-[9px] font-semibold leading-snug text-[var(--pp-text-body)]">
          {visiveis.map((p) => <li key={p} className="break-words">• {p}</li>)}
          {resto > 0 && <li className="text-[var(--pp-text-muted)]">+ {resto} outra(s)</li>}
          <li className="pt-0.5 text-[var(--pp-text-muted)]">Prévia: não impede fechar a conta.</li>
        </ul>
      )}
    </div>
  );
}
