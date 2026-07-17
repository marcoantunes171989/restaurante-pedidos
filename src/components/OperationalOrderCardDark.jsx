import OrderItemsList from "./OrderItemsList";

// Vocabulário visual de tag compartilhado por Pedidos, Cozinha e Bar
// (tema escuro) — Novos/Em preparo/Prontos são as únicas 3 fases reais
// do fluxo nas três telas.
const VARIANTE = {
  novo:    { tag: "Novo",       tagCls: "pp-pd-tag-novo",    accent: "#2563eb" },
  preparo: { tag: "Em preparo", tagCls: "pp-pd-tag-preparo", accent: "#e0930f" },
  pronto:  { tag: "Pronto",     tagCls: "pp-pd-tag-pronto",  accent: "#16a34a" },
};

/** Um bloco de itens por setor (um pedido pode ter mais de um setor ao
 * mesmo tempo: cozinha + bar, por exemplo). Em Cozinha/Bar é acionável
 * ("Marcar pronto" por setor); em Pedidos é só leitura — basta omitir
 * `onMarcarPronto` para o bloco virar somente exibição. */
function SetorBloco({ o, sk, its, metaSetor, setorPronto, onMarcarPronto }) {
  const sm = metaSetor(sk);
  const pronto = setorPronto?.(o, sk);
  const acionavel = !!onMarcarPronto;
  return (
    <div className="pp-pd-station-block">
      <div className="pp-pd-station-head">
        <span className="pp-pd-station-badge">{sm.ic} {sm.label}</span>
        {acionavel && o.status === "preparing" && (
          pronto
            ? <span className="pp-pd-station-ready">✓ pronto</span>
            : <button className="pp-pd-btn-mini" onClick={onMarcarPronto} type="button">Marcar pronto</button>
        )}
      </div>
      <OrderItemsList items={its} />
    </div>
  );
}

/**
 * Card de pedido — tema escuro (pp-pd-*), compartilhado por Pedidos,
 * Cozinha e Bar. `variante` só controla selo/cor; o corpo mostra
 * cliente, mesa/comanda, forma de pagamento (se houver) e os itens
 * agrupados por setor. `onMarcarPronto`/`setorPronto` são opcionais —
 * só Cozinha/Bar passam (ação real de produção); sem eles, os blocos de
 * setor ficam só leitura, do jeito que Pedidos precisa.
 */
export default function OperationalOrderCardDark({
  o, variante, setoresNoPedido = [], action,
  origemDe, haTxt, numeroPedido, itensDoSetor, metaSetor,
  setorPronto, onMarcarPronto,
}) {
  const meta = VARIANTE[variante];
  const org = origemDe(o);
  // o.table de pedido externo vem como "Externo · Retirada"/"Externo · Entrega" —
  // separa em base (título) + submodalidade (linha do código), sem inventar campo novo.
  const [tableBase, tableSub] = String(o.table || "").split(" · ");

  return (
    <div className="pp-pd-order">
      <div className="pp-pd-order-accent" style={{ background: meta.accent }} />
      <div className="pp-pd-order-top">
        <span className={`pp-pd-tag ${meta.tagCls}`}>{meta.tag}</span>
        <span className="pp-pd-chan">{org.ic} {org.l}{haTxt(o) ? ` · ${haTxt(o)}` : ""}</span>
      </div>

      <h4>Pedido #{numeroPedido[o.id] ?? "—"} · {tableBase || o.table}</h4>
      <div className="pp-pd-oid">{o.id}{tableSub ? ` · ${tableSub}` : ""}</div>

      <div className="pp-pd-cust">
        <div className="pp-pd-row"><span className="pp-pd-ci">👤</span><b>{o.customer || "Cliente"}</b></div>
        {o.pagamentoForma && (
          <div className="pp-pd-row">
            <span className="pp-pd-ci">💳</span>
            {o.pagamentoForma}{o.pagamentoMomento ? <> · <span style={{ color: "#f2b84a" }}>{o.pagamentoMomento}</span></> : ""}
          </div>
        )}
      </div>

      {setoresNoPedido.map((sk) => {
        const its = itensDoSetor(o, sk);
        if (its.length === 0) return null;
        return (
          <SetorBloco
            key={sk} o={o} sk={sk} its={its} metaSetor={metaSetor} setorPronto={setorPronto}
            onMarcarPronto={onMarcarPronto ? () => onMarcarPronto(sk) : undefined}
          />
        );
      })}

      {action && <div className="pp-pd-actions">{action}</div>}
    </div>
  );
}
