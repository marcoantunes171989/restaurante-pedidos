import { useEffect, useState } from "react";
import { Menu, Calendar, Clock, Monitor, X } from "lucide-react";
import { LogoPP } from "../../BrandLogo";
import { useOnline } from "../../../lib/useOnline";

// Barra superior do PDV — marca (logo Pedido Prime + wordmark petróleo/laranja),
// estado da operação (verde quando online), data + relógio ao vivo, caixa e
// usuário logado, e o botão de fechar (volta para a lista do caixa). Só ícones
// com aria-label; a data/hora usam o locale pt-BR.
export default function CheckoutTopBar({ usuarioNome = "", nivelAcesso = "", caixaLabel = "Caixa 01", onFechar }) {
  const online = useOnline();
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000 * 30); // 30s basta p/ HH:MM
    return () => clearInterval(t);
  }, []);
  const data = agora.toLocaleDateString("pt-BR");
  const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const inicial = (usuarioNome || "Operador").trim().charAt(0).toUpperCase() || "O";

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-[var(--pp-border)] bg-[var(--pp-surface)] px-4 py-3 md:px-6">
      {/* Marca */}
      <div className="flex min-w-0 items-center gap-2.5">
        <button type="button" aria-label="Menu" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[var(--pp-text-body)] transition-colors hover:bg-[var(--pp-bg)] lg:hidden">
          <Menu aria-hidden="true" size={20} />
        </button>
        <LogoPP size={34} />
        <p className="truncate text-lg font-black tracking-tight">
          <span className="text-[var(--op-nav-accent)]">Pedido Prime</span> <span className="text-[var(--pp-primary)]">PDV</span>
        </p>
      </div>

      {/* Estado da operação + data/hora (centro, some no mobile estreito) */}
      <div className="ml-auto hidden items-center gap-3 md:flex lg:mx-auto lg:ml-0">
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${
          online ? "border-[var(--pp-success)]/25 bg-[var(--pp-success-soft)] text-[var(--pp-success-text)]" : "border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-muted)]"
        }`}>
          <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
            {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--pp-success)] opacity-75" />}
            <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${online ? "bg-[var(--pp-success)]" : "bg-[var(--pp-text-muted)]"}`} />
          </span>
          {online ? "OPERAÇÃO NORMAL" : "SEM CONEXÃO"}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--pp-text-body)]">
          <Calendar aria-hidden="true" size={15} className="text-[var(--pp-text-muted)]" /> {data}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums text-[var(--pp-text-body)]">
          <Clock aria-hidden="true" size={15} className="text-[var(--pp-text-muted)]" /> {hora}
        </span>
      </div>

      {/* Caixa + usuário + fechar */}
      <div className="ml-auto flex shrink-0 items-center gap-3 lg:ml-0">
        <span className="hidden items-center gap-1.5 text-sm font-semibold text-[var(--pp-text-body)] sm:inline-flex">
          <Monitor aria-hidden="true" size={16} className="text-[var(--pp-text-muted)]" /> {caixaLabel}
        </span>
        <span aria-hidden="true" className="hidden h-6 w-px bg-[var(--pp-border)] sm:block" />
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--op-nav-accent)] text-sm font-black text-white">{inicial}</span>
          <div className="hidden min-w-0 leading-tight sm:block">
            <p className="truncate text-sm font-bold text-[var(--pp-text)]">{usuarioNome || "Operador"}</p>
            <p className="truncate text-[11px] text-[var(--pp-text-muted)]">{nivelAcesso || "Atendente"}</p>
          </div>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar PDV e voltar à lista" title="Voltar à lista"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--pp-border)] text-[var(--pp-text-body)] transition-colors hover:border-[var(--pp-danger)]/30 hover:bg-[var(--pp-danger-soft)] hover:text-[var(--pp-danger)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)]">
          <X aria-hidden="true" size={19} />
        </button>
      </div>
    </header>
  );
}
