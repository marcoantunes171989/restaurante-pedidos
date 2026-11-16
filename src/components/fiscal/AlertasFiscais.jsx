// E9 parte 2 — alertas fiscais (painel Fiscal e PDV). Só leitura.
import { useState } from "react";

const TOM = {
  erro: "border-[#F5C2CD] bg-[#FDECEF] text-[#C81E4A]",
  alerta: "border-[#F8D9A8] bg-[#FEF3E2] text-[#B45309]",
};

/** Lista de alertas (painel Fiscal). onIr(destino) leva à aba certa. */
export default function AlertasFiscais({ alertas = [], onIr = null }) {
  if (!alertas.length) return null;
  return (
    <div role="alert" aria-label="Alertas fiscais" className="space-y-2" data-testid="alertas-fiscais">
      {alertas.map((a) => (
        <div key={a.id} className={`flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-2.5 text-[13px] font-semibold ${TOM[a.nivel]}`}>
          <span aria-hidden="true">{a.nivel === "erro" ? "⛔" : "⚠"}</span>
          <span className="min-w-0 flex-1">{a.texto}</span>
          {onIr && (
            <button type="button" onClick={() => onIr(a.destino)} className="min-h-9 rounded-xl border border-current bg-white px-3 text-[12px] font-bold">
              {a.destino === "emissao" ? "Abrir Emissão" : "Ver notas"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Aviso curto no PDV: o mais grave + quantos outros. */
export function AvisoFiscalPdv({ alertas = [] }) {
  const [aberto, setAberto] = useState(false);
  if (!alertas.length) return null;
  const a = alertas[0];
  return (
    <div role="status" className={`mx-3 mt-2 rounded-2xl border px-3 py-2 text-[12px] font-semibold sm:mx-4 ${TOM[a.nivel]}`}>
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="flex min-h-9 w-full items-center gap-2 text-left">
        <span aria-hidden="true">{a.nivel === "erro" ? "⛔" : "⚠"}</span>
        <span className="min-w-0 flex-1">Nota fiscal: {a.texto}{alertas.length > 1 ? ` (+${alertas.length - 1})` : ""}</span>
        <span aria-hidden="true">{aberto ? "▲" : "▼"}</span>
      </button>
      {aberto && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 font-medium">
          {alertas.map((x) => <li key={x.id}>{x.texto}</li>)}
          <li>Detalhes em Configuração Fiscal › Notas emitidas.</li>
        </ul>
      )}
    </div>
  );
}
