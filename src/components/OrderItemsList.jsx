// ════════════════════════════════════════════════════════════
//  Lista de itens de um pedido (quantidade + nome + modificadores)
//  compartilhada entre as três telas do módulo operacional (Pedidos,
//  Cozinha, Bar) — mesma formatação de "1x Nome — − ingrediente,
//  + ingrediente, observação" e mesmas classes pp-pd-* (index.css,
//  tema escuro) em todas.
// ════════════════════════════════════════════════════════════
export default function OrderItemsList({ items = [] }) {
  return (
    <div className="pp-pd-items">
      {items.map((it, i) => {
        const mods = [
          ...(it.removedIngredients || []).map((x) => "− " + x),
          ...(it.extraIngredients || []).map((x) => "+ " + x),
          it.observation,
        ].filter(Boolean).join(" · ");
        return (
          <div key={i} className="pp-pd-item-wrap">
            <div className="pp-pd-item">
              <span className="pp-pd-qty">{it.quantity}×</span>
              <span className="pp-pd-nm">{it.name}</span>
            </div>
            {mods && <p className="pp-pd-item-mods">{mods}</p>}
          </div>
        );
      })}
    </div>
  );
}
