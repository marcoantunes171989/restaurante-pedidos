import { Check } from "lucide-react";
import { formatCurrency, MESA_STATUS_META, rotuloMesa, tempoAbertoISO } from "./pdvHelpers";

function rotuloStatusCard(status) {
  if (status === "livre") return "Disponível";
  if (status === "finalizada") return "Finalizada";
  // ocupada + pendente: texto pedido no salão
  return "Mesa ocupada";
}

/**
 * Grade central das mesas do salão — status derivados dos pedidos reais.
 */
export default function PdvMesasGrid({
  mesasPainel = [],
  selecionadaKey,
  onSelecionar,
  agora,
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
        <h2 className="text-sm font-black text-[var(--pp-text)]">Mesas do salão</h2>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-[var(--pp-text-muted)]">
          {Object.entries(MESA_STATUS_META).map(([id, meta]) => (
            <span key={id} className="inline-flex items-center gap-1.5">
              {id === "finalizada" ? (
                <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[var(--pp-success-soft)] text-[var(--pp-success)]">
                  <Check size={9} strokeWidth={3} />
                </span>
              ) : (
                <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
              )}
              {meta.label}
            </span>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {mesasPainel.length === 0 ? (
          <div className="grid h-full min-h-[160px] place-items-center rounded-xl border border-dashed border-[var(--pp-border)] bg-[var(--pp-surface)] px-4 py-8 text-center">
            <div>
              <p className="text-sm font-black text-[var(--pp-text)]">Nenhuma mesa cadastrada</p>
              <p className="mt-1 text-xs text-[var(--pp-text-muted)]">Cadastre as mesas da loja em Administrativo → Mesas para montar o salão.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {mesasPainel.map((m) => {
              const meta = MESA_STATUS_META[m.status] || MESA_STATUS_META.livre;
              const selected = selecionadaKey === m.key;
              const ocupada = m.status === "ocupada" || m.status === "pendente";
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => onSelecionar?.(m)}
                  className={`relative flex min-h-[108px] flex-col items-start justify-between rounded-xl border bg-[var(--pp-surface)] p-3 text-left transition active:scale-[0.98] sm:min-h-[100px] sm:p-2.5 ${
                    selected
                      ? "border-[var(--pp-primary)] shadow-[0_0_0_2px_rgba(230,126,34,0.25)]"
                      : `${meta.border} hover:border-[var(--pp-primary)]/50`
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-1">
                    <span className="text-base font-black text-[var(--pp-text)] sm:text-sm">{rotuloMesa(m.numero)}</span>
                    {m.status === "finalizada" ? (
                      <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--pp-success)] text-white">
                        <Check size={10} strokeWidth={3} />
                      </span>
                    ) : (
                      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                    )}
                  </div>

                  <p className={`mt-1 text-[10px] font-black uppercase tracking-wide ${
                    ocupada
                      ? "text-[var(--pp-primary-text)]"
                      : m.status === "finalizada"
                        ? "text-[var(--pp-success-text)]"
                        : "text-[var(--pp-text-muted)]"
                  }`}>
                    {rotuloStatusCard(m.status)}
                  </p>

                  {m.conta ? (
                    <div className="mt-auto w-full space-y-0.5 pt-1">
                      <p className="truncate text-[10px] font-semibold text-[var(--pp-text-muted)]">
                        {tempoAbertoISO(m.conta.aberturaISO, agora) || "—"}
                      </p>
                      <p className="text-xs font-black tabular-nums text-[var(--pp-text)]">
                        {formatCurrency(m.conta.total || 0)}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-auto pt-1 text-[11px] font-semibold text-[var(--pp-text-muted)]">Livre</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
