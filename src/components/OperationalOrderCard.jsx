import OrderItemsList from "./OrderItemsList";

// Vocabulário visual de tag compartilhado pelas 3 telas em kanban (Pedidos,
// Cozinha, Bar) — Novos/Em preparo/Prontos são as únicas 3 fases reais do
// fluxo; nenhuma tela tem um 4º status aqui (pagamento é tratado à parte,
// no Caixa).
const VARIANTE = {
  novo:    { tag: "Novo",       tagCls: "pp-cp-tag-novo",    accent: "var(--cp-blue)" },
  preparo: { tag: "Em preparo", tagCls: "pp-cp-tag-preparo", accent: "var(--cp-amber)" },
  pronto:  { tag: "Pronto",     tagCls: "pp-cp-tag-pronto",  accent: "var(--cp-green)" },
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
    <div className="pp-cp-station-block">
      <div className="pp-cp-station-head">
        <span className="pp-cp-station-badge">{sm.ic} {sm.label}</span>
        {acionavel && o.status === "preparing" && (
          pronto
            ? <span className="pp-cp-station-ready">✓ pronto</span>
            : <button className="pp-cp-btn-mini" onClick={onMarcarPronto} type="button">Marcar pronto</button>
        )}
      </div>
      <OrderItemsList items={its} />
    </div>
  );
}

/**
 * Card de pedido — componente ÚNICO compartilhado por Pedidos, Cozinha e
 * Bar (kanban e lista). `variante` só controla selo/cor; o corpo mostra
 * cliente, mesa/comanda, forma de pagamento (se houver) e os itens
 * agrupados por setor. `onMarcarPronto`/`setorPronto` são opcionais — só
 * Cozinha/Bar passam (ação real de produção); sem eles, os blocos de
 * setor ficam só leitura, do jeito que Pedidos precisa.
 */
export default function OperationalOrderCard({
  o, variante, setoresNoPedido = [], action,
  origemDe, haTxt, numeroPedido, itensDoSetor, metaSetor,
  setorPronto, onMarcarPronto,
}) {
  const meta = VARIANTE[variante];
  const org = origemDe(o);
  const [tableBase, tableSub] = String(o.table || "").split(" · ");

  return (
    <div className="pp-cp-order">
      <div className="pp-cp-order-accent" style={{ background: meta.accent }} />
      <div className="pp-cp-order-top">
        <span className={`pp-cp-tag ${meta.tagCls}`}>{meta.tag}</span>
        <span className="pp-cp-chan">{org.ic} {org.l}{haTxt(o) ? ` · ${haTxt(o)}` : ""}</span>
      </div>

      <h4>Pedido #{numeroPedido[o.id] ?? "—"} · {tableBase || o.table}</h4>
      <div className="pp-cp-oid">{o.id}{tableSub ? ` · ${tableSub}` : ""}</div>

      <div className="pp-cp-cust">
        <div className="pp-cp-row"><span className="pp-cp-ci">👤</span><b>{o.customer || "Cliente"}</b></div>
        {o.pagamentoForma && (
          <div className="pp-cp-row">
            <span className="pp-cp-ci">💳</span>
            {o.pagamentoForma}{o.pagamentoMomento ? <> · <span style={{ color: "var(--cp-amber)" }}>{o.pagamentoMomento}</span></> : ""}
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

      {action && <div className="pp-cp-actions">{action}</div>}
    </div>
  );
}
