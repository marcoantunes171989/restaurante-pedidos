import { Sun, Moon, Receipt, UserRound, ClipboardList } from "lucide-react";
import { LogoPP } from "../../components/BrandLogo";
import NotificationBell from "../../components/NotificationBell";

/**
 * Cabeçalho do PDV — marca + abas Mesa/Delivery + atalhos + busca + perfil.
 * Espelha o mockup: busca unificada por mesa, cliente, pedido ou telefone.
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
    <header className="shrink-0 border-b border-[var(--pp-border)] bg-[var(--pp-surface)] px-3 py-2.5 sm:px-4 lg:px-5">
      <div className="flex flex-wrap items-center gap-2.5 lg:gap-3">
        <div className="flex items-center gap-2.5">
          <LogoPP size={36} />
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
                  className={`min-h-9 rounded-lg px-3.5 text-sm font-black transition ${
                    on ? "btn-laranja text-white shadow-sm" : "text-[var(--op-nav-accent)] hover:bg-[var(--pp-surface)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="hidden items-center gap-1 sm:flex">
          {[
            [ClipboardList, "Comanda"],
            [UserRound, "Cliente"],
            [Receipt, "Pedido"],
          ].map(([Icon, label]) => (
            <button
              key={label}
              type="button"
              title={label}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2.5 text-xs font-bold text-[var(--pp-text-body)] transition hover:border-[var(--op-nav-accent)]/40 hover:text-[var(--op-nav-accent)]"
            >
              <Icon size={14} aria-hidden="true" />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>

        <form
          className="order-last flex min-w-[220px] flex-1 basis-full items-center gap-2 lg:order-none lg:basis-auto"
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
            placeholder="Buscar por número da mesa, cliente, pedido ou telefone... Ex: 07, Marco, 1199999-9999"
            className="min-h-11 w-full rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-4 text-sm font-semibold text-[var(--pp-text)] outline-none transition placeholder:font-normal placeholder:text-[var(--pp-text-muted)] focus:border-[var(--pp-primary)] focus:ring-2 focus:ring-[var(--pp-primary-soft)]"
          />
        </form>

        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <button
            type="button"
            onClick={onToggleTema}
            aria-label={temaClaro ? "Alternar para tema escuro" : "Alternar para tema claro"}
            className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-body)] transition hover:border-[var(--op-nav-accent)]/40"
          >
            {temaClaro ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2.5 py-1.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--op-nav-accent)] text-xs font-black text-white">
              {(currentUser?.name || "C").slice(0, 1).toUpperCase()}
            </span>
            <div className="hidden leading-tight sm:block">
              <p className="text-xs font-black text-[var(--pp-text)]">{currentUser?.name || "Caixa Operador"}</p>
              <p className="text-[10px] font-semibold text-[var(--pp-text-muted)]">Operador</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
