import { Settings } from "lucide-react";

/**
 * Rodapé com atalhos de teclado e status de conexão/backup.
 */
export default function PdvStatusBar({ conexaoOk = true, agora }) {
  const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <footer className="hidden shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--pp-border)] bg-[var(--pp-surface)] px-4 py-2 lg:flex lg:px-5">
      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--pp-text-muted)]">Atalhos Rápidos</span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {[
          ["F2", "Buscar"],
          ["F3", "Abrir pedido"],
          ["F4", "Pré-conta"],
          ["F5", "Fechar conta"],
          ["F6", "Pagamento"],
        ].map(([tecla, rotulo]) => (
          <span key={tecla} className="flex items-center gap-1.5 text-[13px] text-[var(--pp-text-body)]">
            <kbd className="rounded-md border border-[var(--pp-border)] bg-[var(--pp-bg)] px-1.5 py-0.5 text-[11px] font-black">{tecla}</kbd>
            {rotulo}
          </span>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-4 text-[13px]">
        <span className={`flex items-center gap-1.5 font-semibold ${conexaoOk ? "text-[var(--pp-success-text)]" : "text-[var(--pp-warning-text)]"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${conexaoOk ? "bg-[var(--pp-success)]" : "bg-[var(--pp-warning)]"}`} />
          {conexaoOk ? "Conexão ativa" : "Reconectando…"}
        </span>
        <span className="text-[var(--pp-text-muted)]">Backup em dia {hora}</span>
        <button type="button" aria-label="Configurações" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--pp-text-muted)] transition hover:bg-[var(--pp-bg)] hover:text-[var(--pp-text)]">
          <Settings size={15} />
        </button>
      </div>
    </footer>
  );
}
