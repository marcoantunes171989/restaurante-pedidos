// ════════════════════════════════════════════════════════════
//  Lista de itens de um pedido (quantidade + nome + modificadores)
//  compartilhada entre as telas do módulo operacional (Pedidos, Cozinha,
//  Bar) — mesma classe pp-cp-* usada em todas, para nenhuma duplicar a
//  formatação de "1x Nome — − ingrediente, + ingrediente, observação".
// ════════════════════════════════════════════════════════════
export default function OrderItemsList({ items = [] }) {
  return (
    <div className="pp-cp-items">
      {items.map((it, i) => {
        const mods = [
          ...(it.removedIngredients || []).map((x) => "− " + x),
          ...(it.extraIngredients || []).map((x) => "+ " + x),
          it.observation,
        ].filter(Boolean).join(" · ");
        return (
          <div key={i} className="pp-cp-item-wrap">
            <div className="pp-cp-item">
              <span className="pp-cp-qty">{it.quantity}×</span>
              <span className="pp-cp-nm">{it.name}</span>
            </div>
            {mods && <p className="pp-cp-item-mods">{mods}</p>}
          </div>
        );
      })}
    </div>
  );
}
