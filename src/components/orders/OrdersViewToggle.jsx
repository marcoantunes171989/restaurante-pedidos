import { LayoutGrid, List } from "lucide-react";

// Segmented control Kanban/Lista — terracota na opção ativa (nunca
// dourado, conforme a paleta oficial). Sem persistência: o projeto não
// tem hoje um padrão de guardar preferência de UI entre sessões, então
// mantém o comportamento atual (abre sempre em "Kanban").
const OPCOES = [
  { key: "kanban", label: "Kanban", Icon: LayoutGrid },
  { key: "lista", label: "Lista", Icon: List },
];

export default function OrdersViewToggle({ view, onChange }) {
  return (
    <div role="tablist" aria-label="Modo de visualização" className="flex w-full gap-1 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-1 sm:w-auto">
      {OPCOES.map((o) => {
        const ativo = view === o.key;
        return (
          <button
            key={o.key} type="button" role="tab" aria-selected={ativo}
            onClick={() => onChange(o.key)}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-bold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)] sm:flex-none ${
              ativo ? "btn-laranja text-[#012E46]" : "text-[var(--pp-text-body)] hover:bg-[var(--pp-surface)]"
            }`}
          >
            <o.Icon aria-hidden="true" size={15} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
