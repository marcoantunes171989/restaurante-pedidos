import { Clock, HandCoins, Users } from "lucide-react";
import { formatCurrency, MESA_STATUS_META, rotuloMesa, tempoAbertoISO } from "./pdvHelpers";

/**
 * Grade central das mesas do salão — cor é informação: verde livre,
 * laranja em consumo, amarelo aguardando pagamento. Mesa paga volta
 * imediatamente para Disponível (liberada para o próximo cliente).
 */
export default function PdvMesasGrid({
  mesasPainel = [],
  selecionadaKey,
  onSelecionar,
  agora,
  totalMesas = 0,
  busca = "",
}) {
  const filtrando = !!busca.trim();

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-0.5 pb-2">
        <h2 className="text-[13px] font-black text-[var(--pp-text)]">
          Mesas
          <span className="ml-1.5 font-bold text-[var(--pp-text-muted)]">
            {filtrando ? `${mesasPainel.length} de ${totalMesas}` : totalMesas}
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-bold text-[var(--pp-text-muted)]">
          {Object.entries(MESA_STATUS_META).map(([id, meta]) => (
            <span key={id} className="inline-flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
        {mesasPainel.length === 0 ? (
          <div className="grid h-full min-h-[140px] place-items-center rounded-xl border border-dashed border-[var(--pp-border)] bg-[var(--pp-surface)] px-4 py-6 text-center">
            <div>
              <p className="text-[13px] font-black text-[var(--pp-text)]">
                {filtrando ? "Nenhuma mesa encontrada" : "Nenhuma mesa cadastrada"}
              </p>
              <p className="mt-1 text-[11px] text-[var(--pp-text-muted)]">
                {filtrando
                  ? "Ajuste a busca — ela procura por mesa, cliente, produto, valor ou telefone."
                  : "Cadastre as mesas da loja em Administrativo → Mesas."}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-1.5 sm:gap-2">
            {mesasPainel.map((m) => (
              <CardMesa
                key={m.key}
                mesa={m}
                selecionada={selecionadaKey === m.key}
                agora={agora}
                onSelecionar={onSelecionar}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CardMesa({ mesa, selecionada, agora, onSelecionar }) {
  const meta = MESA_STATUS_META[mesa.status] || MESA_STATUS_META.livre;
  const ocupada = mesa.status === "ocupada" || mesa.status === "pendente";
  const conta = mesa.conta;
  const tempo = ocupada ? tempoAbertoISO(conta?.aberturaISO, agora) : null;
  const statusPedido = conta?.statusPedido;

  return (
    <button
      type="button"
      onClick={() => onSelecionar?.(mesa)}
      title={`${rotuloMesa(mesa.numero)} · ${meta.label}`}
      className={`flex min-h-[92px] flex-col gap-1 rounded-xl border p-2 text-left transition active:scale-[0.98] ${meta.card} ${
        selecionada
          ? "border-[var(--pp-primary)] shadow-[0_0_0_2px_var(--pp-primary-soft)]"
          : `${meta.border} hover:border-[var(--pp-primary)]`
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[13px] font-black text-[var(--pp-text)]">{rotuloMesa(mesa.numero)}</span>
        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
      </div>

      <span className={`inline-flex w-fit max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase leading-tight ${meta.chip}`}>
        {mesa.status === "pendente" && <HandCoins size={10} className="shrink-0" aria-hidden="true" />}
        <span className="truncate">{meta.curto || meta.label}</span>
      </span>

      {ocupada && conta ? (
        <div className="mt-auto w-full space-y-0.5">
          {conta.cliente && (
            <p className="truncate text-[10px] font-semibold text-[var(--pp-text-body)]">{conta.cliente}</p>
          )}
          <div className="flex items-center gap-1 text-[9px] font-bold text-[var(--pp-text-muted)]">
            <Clock size={9} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{tempo || "—"}</span>
          </div>
          {statusPedido && (
            <span className={`inline-flex max-w-full truncate rounded px-1 py-px text-[9px] font-black ${statusPedido.chip}`}>
              {statusPedido.label}
            </span>
          )}
          <p className="text-[12px] font-black tabular-nums text-[var(--pp-text)]">
            {formatCurrency(conta.total || 0)}
          </p>
        </div>
      ) : (
        <div className="mt-auto flex items-center gap-1 text-[10px] font-semibold text-[var(--pp-text-muted)]">
          <Users size={10} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{mesa.capacidade ? `${mesa.capacidade} lugares` : "Livre"}</span>
        </div>
      )}
    </button>
  );
}
