// ════════════════════════════════════════════════════════════
//  Lista de itens de um pedido (quantidade + nome + modificadores)
//  compartilhada entre as telas do módulo operacional (Pedidos, Cozinha,
//  Bar) — mesma formatação de "1x Nome — − ingrediente, + ingrediente,
//  observação" em todas. `variant="dark"` (só Pedidos, tema escuro
//  padronizado com a Central Operacional) troca para as classes pp-pd-*
//  (index.css); Cozinha/Bar não passam essa prop e continuam 100% iguais,
//  nas classes pp-cp-* de sempre.
// ════════════════════════════════════════════════════════════
export default function OrderItemsList({ items = [], variant = "light" }) {
  const p = variant === "dark" ? "pp-pd" : "pp-cp";
  return (
    <div className={`${p}-items`}>
      {items.map((it, i) => {
        const mods = [
          ...(it.removedIngredients || []).map((x) => "− " + x),
          ...(it.extraIngredients || []).map((x) => "+ " + x),
          it.observation,
        ].filter(Boolean).join(" · ");
        return (
          <div key={i} className={`${p}-item-wrap`}>
            <div className={`${p}-item`}>
              <span className={`${p}-qty`}>{it.quantity}×</span>
              <span className={`${p}-nm`}>{it.name}</span>
            </div>
            {mods && <p className={`${p}-item-mods`}>{mods}</p>}
          </div>
        );
      })}
    </div>
  );
}
