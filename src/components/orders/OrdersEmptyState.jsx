import { Inbox, ChefHat, PackageCheck, ClipboardList } from "lucide-react";

const ICONE = { novo: Inbox, preparo: ChefHat, pronto: PackageCheck, lista: ClipboardList };

export default function OrdersEmptyState({ variante = "lista", titulo, descricao }) {
  const Icone = ICONE[variante] || ClipboardList;
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl px-4 py-10 text-center">
      <Icone aria-hidden="true" size={26} className="mb-1 text-[var(--pp-text-muted)]" strokeWidth={1.6} />
      <p className="text-sm font-bold text-[var(--pp-text-body)]">{titulo}</p>
      {descricao && <p className="text-xs text-[var(--pp-text-muted)]">{descricao}</p>}
    </div>
  );
}
