import { Bell, Clock, CheckCircle2 } from "lucide-react";
import OperationalDarkPage from "../components/OperationalDarkPage";
import OperationalOrderCardDark from "../components/OperationalOrderCardDark";

const COLUNAS_META = [
  { key: "novos", label: "Novos", dot: "#2563eb", variante: "novo", vazio: { ic: "🆕", txt: "Nenhum pedido novo" } },
  { key: "preparo", label: "Em preparo", dot: "#e0930f", variante: "preparo", vazio: { ic: "🍳", txt: "Nenhum pedido em preparo" } },
  { key: "prontos", label: "Prontos", dot: "#16a34a", variante: "pronto", vazio: { ic: "📦", txt: "Nada pronto no momento" } },
];

/**
 * Pedidos (/operacional/pedidos) — tema escuro padronizado com a Central
 * Operacional, via o casco compartilhado OperationalDarkPage (também
 * usado por Cozinha e Bar, src/pages/CentralDoSetor.jsx) e o card
 * compartilhado OperationalOrderCardDark. Todo dado e toda mutação
 * (aceitar, entregar) continuam vindo prontos de OperacaoMobileView
 * (src/App.jsx) — este componente só formata e define suas próprias
 * ações.
 */
export default function CentralDePedidos({
  usuarioNome = "",
  lojaInfo,
  onFechar,
  navItems = [],
  onNavigate,
  nivelAcesso = "",
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
    const cls = variante === "novo" ? "pp-pd-btn-primary" : variante === "preparo" ? "pp-pd-btn-green" : "pp-pd-btn-blue";
    return (
      <>
        <button className={`pp-pd-btn ${cls}`} onClick={a.fn || undefined} disabled={a.disabled} type="button">
          {a.disabled ? a.l : `${variante === "novo" ? "✓ " : ""}${a.l}${variante === "novo" ? " pedido" : ""}`}
        </button>
        {variante === "novo" && <button className="pp-pd-btn pp-pd-btn-ghost" aria-label="Mais opções" type="button">⋯</button>}
      </>
    );
  };

  const renderCard = (o, variante) => (
    <OperationalOrderCardDark
      key={o.id} o={o} variante={variante} setoresNoPedido={setoresPresentes(o)} action={actionPara(o, variante)}
      origemDe={origemDe} haTxt={haTxt} numeroPedido={numeroPedido} itensDoSetor={itensDoSetor} metaSetor={metaSetor}
    />
  );

  const deriveListVariant = (o) =>
    o.status === "received" ? "novo" : o.status === "preparing" ? "preparo" : "pronto";

  // Mesmos ícones já usados para estes 3 indicadores na Central Operacional
  // (Novos/Em preparo/Prontos) — mesmo significado visual nas três telas.
  const kpis = [
    { key: "novos", Icon: Bell, label: "Novos", value: colunas.novos?.length || 0 },
    { key: "preparo", Icon: Clock, label: "Em preparo", value: colunas.preparo?.length || 0 },
    { key: "prontos", Icon: CheckCircle2, label: "Prontos", value: colunas.prontos?.length || 0 },
  ];

  return (
    <OperationalDarkPage
      title="Pedidos"
      flowTitle="Fluxo de pedidos"
      activeNavId="pedidos"
      navItems={navItems}
      onNavigate={onNavigate}
      usuarioNome={usuarioNome}
      lojaInfo={lojaInfo}
      onFechar={onFechar}
      nivelAcesso={nivelAcesso}
      kpis={kpis}
      columns={COLUNAS_META}
      dataColumns={colunas}
      dataList={listaTodos}
      searchMatch={searchMatch}
      renderCard={renderCard}
      deriveListVariant={deriveListVariant}
      emptyListMessage={{ ic: "🧾", txt: "Nenhum pedido ativo." }}
    />
  );
}
