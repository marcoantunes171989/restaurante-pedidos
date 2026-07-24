import { motion, useReducedMotion } from "framer-motion";
import { LogOut, Search, X } from "lucide-react";
import { OperationalBrandLogo } from "../BrandLogo";
import NotificationBell from "../NotificationBell";
import NotificationSettings from "../NotificationSettings";
import { useOnline } from "../../lib/useOnline";

/**
 * Cabeçalho + busca (tema claro) — usado por Pedidos, Cozinha, Bar e
 * Caixa (prop `titulo` muda o texto). Único componente porque a busca
 * fica "imediatamente abaixo" do cabeçalho, mesma unidade visual.
 * Logo/Notificações/Configurações reaproveitados sem duplicar lógica
 * (NotificationBell/NotificationSettings continuam autocontidos — JWT/
 * RLS —, só o visual do botão-gatilho é definido lá).
 */
export default function OrdersHeader({ titulo = "Pedidos", usuarioNome = "", lojaInfo, onFechar, nivelAcesso = "", busca, onBuscaChange, searchPlaceholder = "Buscar pedido, cliente ou código…" }) {
  const online = useOnline();
  const reduzMovimento = useReducedMotion();

  return (
    <motion.header
      initial={reduzMovimento ? false : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className="relative overflow-hidden rounded-[20px] border border-[var(--pp-border)] bg-[var(--pp-surface)] p-5 shadow-[0_1px_2px_rgba(43,35,32,0.04),0_4px_16px_rgba(43,35,32,0.05)] md:p-6"
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[var(--op-nav-accent)]" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <OperationalBrandLogo />
          <div className="min-w-0">
            <div role="status" className={`mb-1.5 inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
              online ? "border-[var(--pp-success)]/25 bg-[var(--pp-success-soft)] text-[var(--pp-success-text)]" : "border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-muted)]"
            }`}>
              {online && (
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  {!reduzMovimento && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--pp-success)] opacity-75" />}
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--pp-success)]" />
                </span>
              )}
              {online ? "Online" : "Sem conexão"}
            </div>
            <h1 className="text-2xl font-black leading-tight tracking-tight text-[var(--pp-text)] md:text-[28px]">{titulo}</h1>
            <p className="mt-0.5 truncate text-sm text-[var(--pp-text-body)]">
              {lojaInfo?.nome || "Operação da loja"} · {usuarioNome || "Operador"}{nivelAcesso ? <> · <span className="font-semibold text-[var(--op-nav-accent)]">{nivelAcesso}</span></> : ""}
            </p>
          </div>
        </div>
        <button
          type="button" onClick={onFechar}
          className="flex shrink-0 items-center gap-2 self-start rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] px-4 py-2.5 text-sm font-bold text-[var(--pp-text-body)] transition-colors duration-150 hover:border-[var(--pp-danger)]/30 hover:bg-[var(--pp-danger-soft)] hover:text-[var(--pp-danger)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)] sm:self-auto"
        >
          <LogOut aria-hidden="true" size={16} />
          <span>Sair</span>
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2.5">
        <div className="relative flex-1">
          <Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--pp-text-muted)]" />
          <input
            type="text"
            value={busca}
            onChange={(e) => onBuscaChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="min-h-[44px] w-full rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] py-2.5 pl-10 pr-10 text-sm text-[var(--pp-text)] outline-none transition-colors duration-150 placeholder:text-[var(--pp-text-muted)] focus:border-[var(--pp-primary)] focus:bg-[var(--pp-surface)] focus:ring-[3px] focus:ring-[var(--pp-primary-soft)]"
          />
          {busca && (
            <button
              type="button" onClick={() => onBuscaChange("")} aria-label="Limpar busca"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--pp-text-muted)] transition-colors duration-150 hover:bg-[var(--pp-border)] hover:text-[var(--pp-text)]"
            >
              <X aria-hidden="true" size={16} />
            </button>
          )}
        </div>
        <NotificationBell />
        <NotificationSettings />
      </div>
    </motion.header>
  );
}
