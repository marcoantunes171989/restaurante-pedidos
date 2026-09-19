import { Layers } from "lucide-react";
import { StatusBadge } from "../ambientes/StatusBadge.jsx";

// Migrations da execução. Estado por migration (pendente/em andamento/aplicada/
// falhou/incerta/não executada). "Resultado incerto" é visualmente crítico e
// distinto de "Falhou" (borda dupla + ícone de alerta + texto próprio). Nenhuma
// migration é apresentada como aplicada sem o dado dizer isso.
export default function MaintenanceMigrations({ migrations }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white" aria-label="Migrations da execução">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-[#012E46]">Migrations da execução</h2>
          <p className="mt-0.5 text-[13px] leading-5 text-[#6B7280]">
            Alterações de estrutura do banco previstas para esta atualização. Nada aqui é aplicado por esta tela.
          </p>
        </div>
        <p className="text-[15px] font-bold text-[#111111]" data-testid="maintenance-migration-headline">{migrations.headline}</p>
      </div>

      {migrations.isEmpty ? (
        <div className="mx-4 mb-4 flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-[#D1D5DB] px-4 py-10 text-center sm:mx-5 sm:mb-5" data-testid="maintenance-migration-empty">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D1D5DB] bg-white text-[#012E46]" aria-hidden="true">
            <Layers className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-[#111111]">Nenhuma migration nesta execução.</p>
        </div>
      ) : (
        <ul className="border-t border-[#E5E7EB]" aria-label="Lista de migrations da execução">
          {migrations.items.map((m) => (
            <li
              key={m.key}
              className="border-t border-[#E5E7EB] px-3 py-3.5 first:border-t-0 sm:px-5"
              data-migration={m.id}
              data-state={m.state.key}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#D1D5DB] bg-white text-[12px] font-bold text-[#012E46]" aria-hidden="true">
                    {m.order}
                  </span>
                  <p className="min-w-0 break-all font-mono text-[13px] font-semibold leading-5 text-[#111111]">
                    <span className="sr-only">Migration {m.id}: </span>
                    {m.filename}
                  </p>
                </div>
                <StatusBadge status={m.state} />
              </div>
              {m.note && (
                <p
                  className={`mt-2 rounded-xl border px-3 py-2 text-[13px] leading-5 ${m.isCritical ? "border-2 border-[#9F1239] bg-[#FFE4E9] font-semibold text-[#7F1D1D]" : "border-[#E5E7EB] bg-[#F9FAFB] text-[#4B5563]"}`}
                  data-testid={`migration-note-${m.id}`}
                >
                  {m.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
