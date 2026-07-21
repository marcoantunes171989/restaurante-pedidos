import { Check, Lock, CircleDot, Clock3 } from "lucide-react";
import { TABLE_STATUS, STATUS_VARIANT_CLASSES } from "./tableStatusConfig";

const ICONE_STATUS = { available: CircleDot, occupiedOrder: Clock3, occupiedDevice: Lock, current: Check };

// Card de mesa — um único componente para os 4 estados reais (disponível,
// ocupada com pedido em aberto mas selecionável, bloqueada por outro
// dispositivo, selecionada por este tablet). Nunca depende só da cor:
// sempre ícone + texto do status.
export default function TableSelectionCard({ mesa, status, onSelect }) {
  const cfg = TABLE_STATUS[status];
  const cores = STATUS_VARIANT_CLASSES[cfg.variant];
  const bloqueada = status === "occupiedDevice";
  const Icone = ICONE_STATUS[status];

  return (
    <button
      type="button"
      disabled={bloqueada}
      aria-pressed={status === "current"}
      aria-disabled={bloqueada}
      aria-label={`Mesa ${mesa.numero}${mesa.nome ? `, ${mesa.nome}` : ""}${mesa.localizacao ? `, ${mesa.localizacao}` : ""} — ${cfg.label}`}
      onClick={() => !bloqueada && onSelect(mesa)}
      className={`relative flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 py-3.5 text-center transition-transform duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--client-primary)] ${cores.surface} ${
        bloqueada ? "cursor-not-allowed opacity-90" : "active:scale-95 hover:brightness-[0.98]"
      }`}
    >
      <span className="text-2xl font-black leading-none text-[var(--client-text-primary)]">{String(mesa.numero).padStart(2, "0")}</span>
      {mesa.nome && <span className="w-full truncate px-1 text-[11px] font-semibold text-[var(--client-text-secondary)]">{mesa.nome}</span>}
      {mesa.localizacao && <span className="w-full truncate px-1 text-[10px] text-[var(--client-text-muted)]">{mesa.localizacao}</span>}
      <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${cores.text}`}>
        <Icone aria-hidden="true" size={11} /> {cfg.label}
      </span>
    </button>
  );
}
