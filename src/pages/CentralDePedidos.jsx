import { formatCurrency } from "../App";
import OperationalFlowPage from "../components/OperationalFlowPage";
import OrderItemsList from "../components/OrderItemsList";

// Metadados visuais por status/variante de card — só estilo (label, cor,
// tag), nunca decide o que é aceito/entregue/pago (isso continua 100% em
// OperacaoMobileView via `acaoPrincipal`/`onNavigate`/updateOrderStatus).
const VARIANTE = {
  novo:    { tag: "Novo",     tagCls: "pp-cp-tag-novo",    accent: "var(--cp-blue)" },
  preparo: { tag: "Em preparo", tagCls: "pp-cp-tag-preparo", accent: "var(--cp-amber)" },
  pronto:  { tag: "Pronto",   tagCls: "pp-cp-tag-pronto",  accent: "var(--cp-green)" },
  pgto:    { tag: "Pgto",     tagCls: "pp-cp-tag-pgto",    accent: "var(--cp-violet)" },
};

const COLUNAS_META = [
  { key: "novos", label: "Novos", dot: "var(--cp-blue)", variante: "novo", vazio: { ic: "🆕", txt: "Nenhum pedido novo" } },
  { key: "preparo", label: "Em preparo", dot: "var(--cp-amber)", variante: "preparo", vazio: { ic: "🍳", txt: "Nenhum pedido em preparo" } },
  { key: "prontos", label: "Prontos", dot: "var(--cp-green)", variante: "pronto", vazio: { ic: "📦", txt: "Nada pronto no momento" } },
  { key: "pgto", label: "Aguardando pgto", dot: "var(--cp-violet)", variante: "pgto", vazio: { ic: "💰", txt: "Nenhuma conta em aberto" } },
];

/** Card de pedido — mesmo componente para as 4 colunas do kanban e para a
 * visão em lista; `variante` só controla selo/cor/quais seções aparecem. */
function OrderCard({
  o, variante, action,
  origemDe, haTxt, telMascarado, numeroPedido, setoresPresentes, itensDoSetor, metaSetor, totalCom,
}) {
  const meta = VARIANTE[variante];
  const org = origemDe(o);
  // o.table de pedido externo vem como "Externo · Retirada"/"Externo · Entrega" —
  // separa em base (título) + submodalidade (linha do código), sem inventar campo novo.
  const [tableBase, tableSub] = String(o.table || "").split(" · ");
  const isPgto = variante === "pgto";

  return (
    <div className="pp-cp-order">
      <div className="pp-cp-order-accent" style={{ background: meta.accent }} />
      <div className="pp-cp-order-top">
        <span className={`pp-cp-tag ${meta.tagCls}`}>{meta.tag}</span>
        <span className="pp-cp-chan">
          {isPgto ? <>💳 {o.pagamentoMomento || o.pagamentoForma || "Aguardando pagamento"}</>
                  : <>{org.ic} {org.l}{haTxt(o) ? ` · ${haTxt(o)}` : ""}</>}
        </span>
      </div>

      <h4>Pedido #{numeroPedido[o.id] ?? "—"} · {tableBase || o.table}</h4>
      <div className="pp-cp-oid">{o.id}{tableSub ? ` · ${tableSub}` : ""}</div>

      <div className="pp-cp-cust">
        <div className="pp-cp-row"><span className="pp-cp-ci">👤</span><b>{o.customer || "Cliente"}</b></div>
        {!isPgto && telMascarado(o.clienteTelefone) && (
          <div className="pp-cp-row"><span className="pp-cp-ci">📞</span>{telMascarado(o.clienteTelefone)}</div>
        )}
        {o.pagamentoForma && (
          <div className="pp-cp-row">
            <span className="pp-cp-ci">💳</span>
            {o.pagamentoForma}{o.pagamentoMomento ? <> · <span style={{ color: "var(--cp-amber)" }}>{o.pagamentoMomento}</span></> : ""}
          </div>
        )}
      </div>

      {!isPgto && setoresPresentes(o).map((sk) => {
        const its = itensDoSetor(o, sk);
        if (its.length === 0) return null;
        const sm = metaSetor(sk);
        return (
          <div key={sk}>
            <span className="pp-cp-station-badge">{sm.ic} {sm.label}</span>
            <OrderItemsList items={its} />
          </div>
        );
      })}

      <div className="pp-cp-pay">
        <span className="pp-cp-method">{isPgto ? "Total a receber" : `💳 ${o.pagamentoForma || "—"}`}</span>
        <span className={`pp-cp-total${isPgto ? " pp-cp-total-violet" : ""}`}>{formatCurrency(totalCom(o))}</span>
      </div>

      {action && <div className="pp-cp-actions">{action}</div>}
    </div>
  );
}

/**
 * Central de Pedidos (/operacional/pedidos) — camada de UI apenas: todo
 * dado e toda mutação (aceitar, marcar pronto, entregar, filtrar por
 * estação, ir para o caixa) vêm prontos de `OperacaoMobileView`
 * (src/App.jsx), que preserva 100% a lógica/API já existente. Este
 * componente só formata/organiza o que recebe.
 */
export default function CentralDePedidos({
  usuarioNome = "",
  lojaInfo,
  onFechar,
  navItems = [],
  onNavigate,
  setoresChip = [],
  filtroCentral = "todos",
  onFiltroChange,
  qtdSetorAtivos,
  colunas = {}, // { novos:[], preparo:[], prontos:[], pgto:[] }
  listaTodos = [],
  trendNovos = "",
  trendPreparo = "",
  valorAguardando = 0,
  origemDe, haTxt, telMascarado, numeroPedido, setoresPresentes, itensDoSetor, metaSetor, totalCom,
  acaoPrincipal,
}) {
  const searchMatch = (o, q) => {
    const alvo = [o.customer, o.id, o.table, `#${numeroPedido[o.id] ?? ""}`].join(" ").toLowerCase();
    return alvo.includes(q);
  };

  const actionPara = (o, variante) => {
    if (variante === "pgto") {
      return (
        <button className="pp-cp-btn pp-cp-btn-violet" onClick={() => onNavigate?.("caixa")}>
          💰 Confirmar pgto
        </button>
      );
    }
    const a = acaoPrincipal(o);
    if (!a) return null;
    const cls = variante === "novo" ? "pp-cp-btn-primary" : variante === "preparo" ? "pp-cp-btn-green" : "pp-cp-btn-blue";
    return (
      <>
        <button className={`pp-cp-btn ${cls}`} onClick={a.fn || undefined} disabled={a.disabled}>
          {a.disabled ? a.l : `${variante === "novo" ? "✓ " : ""}${a.l}${variante === "novo" ? " pedido" : ""}`}
        </button>
        {variante === "novo" && <button className="pp-cp-btn pp-cp-btn-ghost" aria-label="Mais opções">⋯</button>}
      </>
    );
  };

  const renderCard = (o, variante) => (
    <OrderCard
      key={o.id} o={o} variante={variante} action={actionPara(o, variante)}
      origemDe={origemDe} haTxt={haTxt} telMascarado={telMascarado} numeroPedido={numeroPedido}
      setoresPresentes={setoresPresentes} itensDoSetor={itensDoSetor} metaSetor={metaSetor} totalCom={totalCom}
    />
  );

  const deriveListVariant = (o) =>
    o.status === "received" ? "novo" : o.status === "preparing" ? "preparo" : o.status === "ready" ? "pronto" : "novo";

  const renderChips = () => (
    <div className="pp-cp-stations">
      <button className={`pp-cp-chip${filtroCentral === "todos" ? " is-active" : ""}`} onClick={() => onFiltroChange?.("todos")} type="button">🍽️ Todos</button>
      {setoresChip.map((nome) => {
        const cnt = qtdSetorAtivos(nome);
        return (
          <button key={nome} className={`pp-cp-chip${filtroCentral === nome ? " is-active" : ""}`} onClick={() => onFiltroChange?.(nome)} type="button">
            {/bar|bebida/i.test(nome) ? "🍹" : /sobremesa|doce/i.test(nome) ? "🍰" : "👨‍🍳"} {nome}
            {cnt > 0 && <span className="pp-cp-cnt">{cnt}</span>}
          </button>
        );
      })}
      <button className="pp-cp-chip" onClick={() => onNavigate?.("caixa")} type="button">💳 Caixa</button>
    </div>
  );

  const kpis = [
    { key: "novos", icon: "🆕", label: "Novos pedidos", value: colunas.novos?.length || 0, trend: trendNovos, accent: "var(--cp-blue)", accentSoft: "var(--cp-blue-soft)" },
    { key: "preparo", icon: "🔥", label: "Em preparo", value: colunas.preparo?.length || 0, trend: trendPreparo, accent: "var(--cp-amber)", accentSoft: "var(--cp-amber-soft)" },
    { key: "prontos", icon: "✅", label: "Prontos", value: colunas.prontos?.length || 0, trend: "aguardando entrega", accent: "var(--cp-green)", accentSoft: "var(--cp-green-soft)" },
    { key: "pgto", icon: "💰", label: "Aguardando pgto", value: colunas.pgto?.length || 0, trend: formatCurrency(valorAguardando), accent: "var(--cp-violet)", accentSoft: "var(--cp-violet-soft)" },
  ];

  return (
    <OperationalFlowPage
      title="Pedidos"
      flowTitle="Fluxo de pedidos"
      activeNavId="pedidos"
      navItems={navItems}
      onNavigate={onNavigate}
      usuarioNome={usuarioNome}
      lojaInfo={lojaInfo}
      onFechar={onFechar}
      renderChips={renderChips}
      kpis={kpis}
      columns={COLUNAS_META}
      dataColumns={colunas}
      dataList={listaTodos}
      searchMatch={searchMatch}
      renderCard={renderCard}
      deriveListVariant={deriveListVariant}
      emptyListMessage={{ ic: "🧾", txt: `Nenhum pedido ativo${filtroCentral !== "todos" ? ` para ${filtroCentral}` : ""}.` }}
    />
  );
}
