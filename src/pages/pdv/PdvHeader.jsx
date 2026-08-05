import { Sun, Moon, Search, X } from "lucide-react";
import { LogoPP } from "../../components/BrandLogo";
import NotificationBell from "../../components/NotificationBell";
import { CANAIS_PDV } from "./pdvHelpers";

/**
 * Cabeçalho do PDV — marca + canais (Mesa/Delivery/Comanda/Cliente/Pedido) + busca.
 * Todos os canais no mesmo padrão de botão segmentado.
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
      className="shrink-0 border-b border-[var(--pp-border)] bg-[var(--pp-surface)] px-3 py-1.5 sm:px-4 lg:px-4"
      style={{ paddingLeft: "max(0.75rem, env(safe-area-inset-left))", paddingRight: "max(0.75rem, env(safe-area-inset-right))" }}
    >
      <div className="flex flex-wrap items-center gap-2 lg:gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <LogoPP size={28} className="shrink-0" />

          <div
            role="tablist"
            aria-label="Canal do PDV"
            className="flex min-w-0 max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] p-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {CANAIS_PDV.map(({ id, label, dica }) => {
              const on = canal === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  title={dica}
                  onClick={() => onCanalChange?.(id)}
                  className={`h-8 shrink-0 rounded-md px-2.5 text-[11px] font-black transition ${
                    on ? "btn-laranja text-white shadow-sm" : "text-[var(--op-nav-accent)] hover:bg-[var(--pp-surface)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <form
          className="order-last flex w-full basis-full items-center lg:order-none lg:w-[268px] lg:basis-auto xl:w-[320px]"
          onSubmit={(e) => {
            e.preventDefault();
            onBuscar?.();
          }}
        >
          <label htmlFor="pdv-busca-global" className="sr-only">Buscar conta</label>
          <div className="relative w-full">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--pp-text-muted)]" aria-hidden="true" />
            <input
              id="pdv-busca-global"
              value={busca}
              onChange={(e) => onBuscaChange?.(e.target.value)}
              placeholder="Buscar mesa, cliente, produto, valor…"
              className="h-9 w-full rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] pl-8 pr-8 text-[12px] font-semibold text-[var(--pp-text)] outline-none transition placeholder:font-normal placeholder:text-[var(--pp-text-muted)] focus:border-[var(--pp-primary)] focus:bg-[var(--pp-surface)]"
            />
            {busca && (
              <button
                type="button"
                onClick={() => onBuscaChange?.("")}
                aria-label="Limpar busca"
                className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-[var(--pp-text-muted)] hover:bg-[var(--pp-bg)]"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </form>

        <div className="flex shrink-0 items-center gap-1.5">
          <NotificationBell />
          <button
            type="button"
            onClick={onToggleTema}
            aria-label={temaClaro ? "Alternar para tema escuro" : "Alternar para tema claro"}
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-body)] transition hover:border-[var(--pp-primary)] active:scale-[0.97]"
          >
            {temaClaro ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <div className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-1.5">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--pp-primary-soft)] text-[10px] font-black text-[var(--pp-primary-text)]">
              {(currentUser?.name || "C").slice(0, 1).toUpperCase()}
            </span>
            <div className="hidden max-w-[8rem] leading-tight lg:block">
              <p className="truncate text-[11px] font-black text-[var(--pp-text)]">{currentUser?.name || "Caixa Operador"}</p>
              <p className="text-[9px] font-semibold text-[var(--pp-text-muted)]">Operador</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
