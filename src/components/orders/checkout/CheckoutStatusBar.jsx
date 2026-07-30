import { CloudUpload } from "lucide-react";
import { useOnline } from "../../../lib/useOnline";

// Rodapé do PDV — atalhos de teclado (referência visual, fiel ao mockup) e
// estado de conexão/último backup. A conexão é real (useOnline).
const ATALHOS = [
  ["F2", "Buscar mesa"],
  ["F3", "Abrir comanda"],
  ["F4", "Pré-conta"],
  ["F5", "Fechar conta"],
  ["F6", "Pagamento"],
];

export default function CheckoutStatusBar({ backupLabel }) {
  const online = useOnline();
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--pp-border)] bg-[var(--pp-surface)] px-4 py-2 text-[11px] md:px-6">
      <span className="font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Atalhos rápidos</span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {ATALHOS.map(([tecla, label]) => (
          <span key={tecla} className="inline-flex items-center gap-1.5 text-[var(--pp-text-body)]">
            <kbd className="rounded-md border border-[var(--pp-border)] bg-[var(--pp-bg)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--pp-text)]">{tecla}</kbd>
            {label}
          </span>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-4">
        <span className="inline-flex items-center gap-1.5 font-bold">
          <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-[var(--pp-success)]" : "bg-[var(--pp-text-muted)]"}`} aria-hidden="true" />
          <span className={online ? "text-[var(--pp-success-text)]" : "text-[var(--pp-text-muted)]"}>{online ? "Conexão ativa" : "Sem conexão"}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[var(--pp-text-muted)]">
          <CloudUpload aria-hidden="true" size={14} /> {backupLabel}
        </span>
      </div>
    </footer>
  );
}
