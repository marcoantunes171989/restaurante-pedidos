import OperationalFlowPage from "../components/OperationalFlowPage";
import OperationalOrderCard from "../components/OperationalOrderCard";

// Textos de coluna vazia — deliberadamente iguais para Cozinha e Bar (é o
// que o pedido de padronização define), por isso ficam fixos aqui em vez
// de vir por prop.
const COLUNAS_META = [
  { key: "novos", label: "Novos", dot: "var(--cp-blue)", variante: "novo", vazio: { ic: "🆕", txt: "Nenhum pedido novo" } },
  { key: "preparo", label: "Em preparo", dot: "var(--cp-amber)", variante: "preparo", vazio: { ic: "🍳", txt: "Nenhum pedido em preparo" } },
  { key: "prontos", label: "Prontos", dot: "var(--cp-green)", variante: "pronto", vazio: { ic: "📦", txt: "Nada pronto no momento" } },
];

/**
 * Tela de setor de produção (Cozinha e Bar — /operacional/cozinha e
 * /operacional/bar) — componente ÚNICO e compartilhado entre as duas,
 * para não duplicar JSX/CSS/lógica: só o que é textualmente diferente
 * (título, rótulo do fluxo, textos/ícone do estado vazio da lista, item
 * ativo da nav) entra por prop. Estrutura idêntica à Central de Pedidos
 * (src/pages/CentralDePedidos.jsx), reaproveitando as MESMAS classes
 * pp-cp-* de index.css (nenhum CSS por setor). Toda a lógica real
 * (contadores, setor por setor, iniciar preparo, marcar pronto, baixa,
 * tempo real) continua 100% calculada em OperacaoMobileView
 * (src/App.jsx) e só é passada pronta para cá — o filtro que decide
 * "isto é Cozinha ou Bar" também vem de lá (setoresPresentesSetor).
 */
export default function CentralDoSetor({
  titulo, // "Cozinha" | "Bar"
  fluxoLabel, // "Fluxo da cozinha" | "Fluxo do bar"
  listaVazioTexto, // "Nenhum pedido para a cozinha." | "Nenhum pedido para o bar."
  listaVazioIcone, // "🧑‍🍳" | "🍹"
  activeNavId, // "cozinha" | "bar"
  usuarioNome = "",
  lojaInfo,
  onFechar,
  navItems = [],
  onNavigate,
  colunas = {}, // { novos:[], preparo:[], prontos:[] }
  listaTodos = [],
  origemDe, haTxt, numeroPedido, itensDoSetor, metaSetor, setorPronto,
  setoresPresentes, // todos os setores do pedido (inclusive de outro setor) — usado na mutação e no "aguardando outro setor"
  setoresPresentesSetor, // só os setores desta aba (Cozinha OU Bar) — usado para exibir os blocos do card
  bloqueadoPorPagamento,
  onIniciarPreparo, onMarcarSetorPronto, onBaixarEntregue,
}) {
  const searchMatch = (o, q) => {
    const alvo = [o.customer, o.id, o.table, `#${numeroPedido[o.id] ?? ""}`].join(" ").toLowerCase();
    return alvo.includes(q);
  };

  const actionPara = (o, variante, setoresNoPedido) => {
    if (variante === "novo") {
      return (
        <>
          <button className="pp-cp-btn pp-cp-btn-primary" onClick={() => onIniciarPreparo(o.id)} type="button">
            ✓ Aceitar para preparação
          </button>
          <button className="pp-cp-btn pp-cp-btn-ghost" aria-label="Mais opções" type="button">⋯</button>
        </>
      );
    }
    if (variante === "preparo") {
      // Todos os setores DESTA aba já prontos, mas o pedido tem setor(es)
      // fora dela (ex.: o outro, cozinha ↔ bar) ainda pendente(s) —
      // mesma checagem de sempre.
      const todos = setoresPresentes(o);
      const aguardandoOutroSetor = setoresNoPedido.length > 0 && setoresNoPedido.every((s) => setorPronto(o, s)) && todos.length > setoresNoPedido.length;
      if (aguardandoOutroSetor) {
        return <p className="pp-cp-wait-msg">✓ {titulo} pronto · aguardando o outro setor</p>;
      }
      return null; // ação real é por setor, dentro do card (SetorBloco)
    }
    // pronto
    if (bloqueadoPorPagamento(o)) {
      return <p className="pp-cp-lock-msg">🔒 Aguardando pagamento para liberar</p>;
    }
    return (
      <button className="pp-cp-btn pp-cp-btn-blue" onClick={() => onBaixarEntregue(o.id)} type="button">
        Baixa / entregue
      </button>
    );
  };

  const renderCard = (o, variante) => {
    // Exibição só mostra os setores desta aba; a mutação (marcar setor
    // pronto) precisa saber de TODOS os setores do pedido — mesmo
    // contrato de sempre em marcarSetorPronto(id, setor, setoresPresentes).
    const setoresNoPedido = setoresPresentesSetor(o);
    return (
      <OperationalOrderCard
        key={o.id} o={o} variante={variante} setoresNoPedido={setoresNoPedido} action={actionPara(o, variante, setoresNoPedido)}
        origemDe={origemDe} haTxt={haTxt} numeroPedido={numeroPedido} itensDoSetor={itensDoSetor} metaSetor={metaSetor}
        setorPronto={setorPronto} onMarcarPronto={(sk) => onMarcarSetorPronto(o.id, sk, setoresPresentes(o))}
      />
    );
  };

  const deriveListVariant = (o) =>
    o.status === "received" ? "novo" : o.status === "preparing" ? "preparo" : "pronto";

  const kpis = [
    { key: "novos", icon: "🆕", label: "Novos", value: colunas.novos?.length || 0, accent: "var(--cp-blue)", accentSoft: "var(--cp-blue-soft)" },
    { key: "preparo", icon: "🔥", label: "Em preparo", value: colunas.preparo?.length || 0, accent: "var(--cp-amber)", accentSoft: "var(--cp-amber-soft)" },
    { key: "prontos", icon: "✅", label: "Prontos", value: colunas.prontos?.length || 0, accent: "var(--cp-green)", accentSoft: "var(--cp-green-soft)" },
  ];

  return (
    <OperationalFlowPage
      title={titulo}
      flowTitle={fluxoLabel}
      activeNavId={activeNavId}
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
      emptyListMessage={{ ic: listaVazioIcone, txt: listaVazioTexto }}
    />
  );
}
