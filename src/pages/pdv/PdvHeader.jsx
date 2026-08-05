import { Sun, Moon, Receipt, UserRound, ClipboardList } from "lucide-react";
import { LogoPP } from "../../components/BrandLogo";
import NotificationBell from "../../components/NotificationBell";

/**
 * Cabeçalho do PDV — marca + abas Mesa/Delivery + busca + perfil.
 * Mobile: compacto, busca em linha própria, inputs ≥16px (iOS).
 */
export default function PdvHeader({
  canal = "mesa",
  onCanalChange,
  busca = "",
  onBuscaChange,
  onBuscar,
  currentUser,
  temaClaro = true,
  onToggleTema,
}) {
  return (
    <header
      className="shrink-0 border-b border-[var(--pp-border)] bg-[var(--pp-surface)] px-3 py-2 sm:px-4 lg:px-5"
      style={{ paddingLeft: "max(0.75rem, env(safe-area-inset-left))", paddingRight: "max(0.75rem, env(safe-area-inset-right))" }}
    >
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 lg:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none sm:gap-2.5">
          <LogoPP size={32} className="shrink-0 sm:hidden" />
          <span className="hidden sm:inline-flex"><LogoPP size={36} /></span>
          <div role="tablist" aria-label="Canal do PDV" className="flex items-center gap-1 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-1">
            {[
              ["mesa", "Mesa"],
              ["delivery", "Delivery"],
            ].map(([id, label]) => {
              const on = canal === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => onCanalChange?.(id)}
                  className={`min-h-11 min-w-[4.5rem] rounded-lg px-3 text-sm font-black transition sm:min-h-10 ${
                    on ? "btn-laranja text-white shadow-sm" : "text-[var(--op-nav-accent)] active:bg-[var(--pp-surface)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="hidden items-center gap-1 md:flex">
          {[
            [ClipboardList, "Comanda"],
            [UserRound, "Cliente"],
            [Receipt, "Pedido"],
          ].map(([Icon, label]) => (
            <button
              key={label}
              type="button"
              title={label}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2.5 text-xs font-bold text-[var(--pp-text-body)] transition hover:border-[var(--op-nav-accent)]/40 hover:text-[var(--op-nav-accent)]"
            >
              <Icon size={14} aria-hidden="true" />
              <span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 sm:ml-auto">
          <NotificationBell />
          <button
            type="button"
            onClick={onToggleTema}
            aria-label={temaClaro ? "Alternar para tema escuro" : "Alternar para tema claro"}
            className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-body)] transition active:scale-[0.97] sm:h-10 sm:w-10"
          >
            {temaClaro ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2 py-1 sm:min-h-10 sm:px-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--op-nav-accent)] text-xs font-black text-white">
              {(currentUser?.name || "C").slice(0, 1).toUpperCase()}
            </span>
            <div className="hidden max-w-[9rem] leading-tight md:block">
              <p className="truncate text-xs font-black text-[var(--pp-text)]">{currentUser?.name || "Caixa Operador"}</p>
              <p className="text-[10px] font-semibold text-[var(--pp-text-muted)]">Operador</p>
            </div>
          </div>
        </div>

        <form
          className="order-last flex w-full basis-full items-center gap-2 lg:order-none lg:min-w-[220px] lg:flex-1 lg:basis-auto"
          onSubmit={(e) => {
            e.preventDefault();
            onBuscar?.();
          }}
        >
          <label htmlFor="pdv-busca-global" className="sr-only">Buscar conta</label>
          <input
            id="pdv-busca-global"
            value={busca}
            onChange={(e) => onBuscaChange?.(e.target.value)}
            placeholder="Mesa, cliente, pedido ou telefone…"
            className="min-h-12 w-full rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3.5 text-base font-semibold text-[var(--pp-text)] outline-none transition placeholder:font-normal placeholder:text-[var(--pp-text-muted)] focus:border-[var(--pp-primary)] focus:ring-2 focus:ring-[var(--pp-primary-soft)] sm:min-h-11 sm:px-4 sm:text-sm"
          />
        </form>
      </div>
    </header>
  );
}
