import OperationalFlowPage from "../components/OperationalFlowPage";
import OperationalOrderCard from "../components/OperationalOrderCard";

// Mesma metadata de coluna de Cozinha/Bar (src/pages/CentralDoSetor.jsx) —
// Pedidos usa o padrão idêntico de 3 fases (Novos/Em preparo/Prontos); o
// acompanhamento de pagamento é tratado à parte, no Caixa.
const COLUNAS_META = [
  { key: "novos", label: "Novos", dot: "var(--cp-blue)", variante: "novo", vazio: { ic: "🆕", txt: "Nenhum pedido novo" } },
  { key: "preparo", label: "Em preparo", dot: "var(--cp-amber)", variante: "preparo", vazio: { ic: "🍳", txt: "Nenhum pedido em preparo" } },
  { key: "prontos", label: "Prontos", dot: "var(--cp-green)", variante: "pronto", vazio: { ic: "📦", txt: "Nada pronto no momento" } },
];

/**
 * Pedidos (/operacional/pedidos) — mesmo padrão visual/estrutural de
 * Cozinha e Bar (src/pages/CentralDoSetor.jsx): cabeçalho, 3 KPIs, board
 * de 3 colunas e card compartilhados via OperationalFlowPage/
 * OperationalOrderCard. Só a regra de ação por card é própria de Pedidos
 * (aceitar/entregar via `acaoPrincipal`). Todo dado e toda mutação
 * continuam vindo prontos de OperacaoMobileView (src/App.jsx) — este
 * componente só formata.
 */
export default function CentralDePedidos({
  usuarioNome = "",
  lojaInfo,
  onFechar,
  navItems = [],
  onNavigate,
  colunas = {}, // { novos:[], preparo:[], prontos:[] }
  listaTodos = [],
  origemDe, haTxt, numeroPedido, setoresPresentes, itensDoSetor, metaSetor,
  acaoPrincipal,
}) {
  const searchMatch = (o, q) => {
    const alvo = [o.customer, o.id, o.table, `#${numeroPedido[o.id] ?? ""}`].join(" ").toLowerCase();
    return alvo.includes(q);
  };

  const actionPara = (o, variante) => {
    const a = acaoPrincipal(o);
    if (!a) return null;
    const cls = variante === "novo" ? "pp-cp-btn-primary" : variante === "preparo" ? "pp-cp-btn-green" : "pp-cp-btn-blue";
    return (
      <>
        <button className={`pp-cp-btn ${cls}`} onClick={a.fn || undefined} disabled={a.disabled} type="button">
          {a.disabled ? a.l : `${variante === "novo" ? "✓ " : ""}${a.l}${variante === "novo" ? " pedido" : ""}`}
        </button>
        {variante === "novo" && <button className="pp-cp-btn pp-cp-btn-ghost" aria-label="Mais opções" type="button">⋯</button>}
      </>
    );
  };

  const renderCard = (o, variante) => (
    <OperationalOrderCard
      key={o.id} o={o} variante={variante} setoresNoPedido={setoresPresentes(o)} action={actionPara(o, variante)}
      origemDe={origemDe} haTxt={haTxt} numeroPedido={numeroPedido} itensDoSetor={itensDoSetor} metaSetor={metaSetor}
    />
  );

  const deriveListVariant = (o) =>
    o.status === "received" ? "novo" : o.status === "preparing" ? "preparo" : "pronto";

  const kpis = [
    { key: "novos", icon: "🆕", label: "Novos", value: colunas.novos?.length || 0, accent: "var(--cp-blue)", accentSoft: "var(--cp-blue-soft)" },
    { key: "preparo", icon: "🔥", label: "Em preparo", value: colunas.preparo?.length || 0, accent: "var(--cp-amber)", accentSoft: "var(--cp-amber-soft)" },
    { key: "prontos", icon: "✅", label: "Prontos", value: colunas.prontos?.length || 0, accent: "var(--cp-green)", accentSoft: "var(--cp-green-soft)" },
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
      kpis={kpis}
      kpisVariant="3"
      columns={COLUNAS_META}
      boardVariant="3"
      dataColumns={colunas}
      dataList={listaTodos}
      searchMatch={searchMatch}
      renderCard={renderCard}
      deriveListVariant={deriveListVariant}
      emptyListMessage={{ ic: "🧾", txt: "Nenhum pedido ativo." }}
    />
  );
}
