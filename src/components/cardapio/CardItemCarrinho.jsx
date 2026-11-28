import { formatCurrency } from "../../App";
import { CkIconLixeira } from "./CkIcons.jsx";

// Card de item do carrinho — hierarquia clara (nome/qtd → personalização →
// preço), "Remover" como ação secundária discreta (só ícone + aria-label,
// nunca compete visualmente com o preço).
export default function CardItemCarrinho({ item, onRemover }) {
  const personalizado = item.removedIngredients?.length > 0 || item.extraIngredients?.length > 0 || item.observation;
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--client-border)] bg-white py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-[var(--client-text-primary)]">
          <span className="text-[var(--client-text-secondary)]">{item.quantity}×</span> {item.name}
        </p>
        {item.comboId && <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--client-offer-hover)]">Combo: {item.comboNome}</p>}
        {personalizado && (
          <p className="mt-1 text-[11px] leading-4 text-[var(--client-text-secondary)]">
            {item.removedIngredients?.length > 0 && <>Sem: {item.removedIngredients.join(", ")}<br /></>}
            {item.extraIngredients?.length > 0 && <>Com: {item.extraIngredients.join(", ")}<br /></>}
            {item.observation}
          </p>
        )}
        <p className="mt-1.5 text-sm font-semibold text-[var(--client-text-primary)]">{formatCurrency(item.price * item.quantity)}</p>
      </div>
      <button onClick={() => onRemover(item)} type="button" aria-label={`Remover ${item.name} do pedido`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--client-text-muted)] transition hover:bg-[var(--client-error-soft)] hover:text-[var(--client-error)] active:scale-90">
        <CkIconLixeira />
      </button>
    </div>
  );
}
