import OperationalFlowPage from "../components/OperationalFlowPage";
import OrderItemsList from "../components/OrderItemsList";

// Mesmo vocabulário visual de tag da Central de Pedidos (.pp-cp-tag-*,
// já em index.css) — Cozinha e Bar não têm estado "pgto", só as 3 fases
// reais do preparo.
const VARIANTE = {
  novo: { tag: "Novo", tagCls: "pp-cp-tag-novo", accent: "var(--cp-blue)" },
  preparo: { tag: "Em preparo", tagCls: "pp-cp-tag-preparo", accent: "var(--cp-amber)" },
  pronto: { tag: "Pronto", tagCls: "pp-cp-tag-pronto", accent: "var(--cp-green)" },
};

// Textos de coluna vazia — deliberadamente iguais para Cozinha e Bar (é o
// que o pedido de padronização define), por isso ficam fixos aqui em vez
// de vir por prop.
const COLUNAS_META = [
  { key: "novos", label: "Novos", dot: "var(--cp-blue)", variante: "novo", vazio: { ic: "🆕", txt: "Nenhum pedido novo" } },
  { key: "preparo", label: "Em preparo", dot: "var(--cp-amber)", variante: "preparo", vazio: { ic: "🍳", txt: "Nenhum pedido em preparo" } },
  { key: "prontos", label: "Prontos", dot: "var(--cp-green)", variante: "pronto", vazio: { ic: "📦", txt: "Nada pronto no momento" } },
];

/** Um bloco de itens por setor (um pedido pode ter mais de um setor ao
 * mesmo tempo: cozinha + bar, por exemplo) — cada setor tem seu próprio
 * "pronto", igual à lógica original. */
function SetorBloco({ o, sk, its, metaSetor, setorPronto, onMarcarPronto }) {
  const sm = metaSetor(sk);
  const pronto = setorPronto(o, sk);
  return (
    <div className="pp-cp-station-block">
      <div className="pp-cp-station-head">
        <span className="pp-cp-station-badge">{sm.ic} {sm.label}</span>
        {o.status === "preparing" && (
          pronto
            ? <span className="pp-cp-station-ready">✓ pronto</span>
            : <button className="pp-cp-btn-mini" onClick={onMarcarPronto} type="button">Marcar pronto</button>
        )}
      </div>
      <OrderItemsList items={its} />
    </div>
  );
}

/** Card de pedido — mesmo componente para as 3 colunas do kanban e para a
 * lista, em Cozinha e Bar; layout idêntico ao OrderCard da Central de
 * Pedidos (mesmas classes pp-cp-*), com o corpo trocado para os setores/
 * itens/ações reais de produção (nunca um único total de pagamento). */
function OrderCard({
  o, variante, setoresNoPedido, action,
  origemDe, haTxt, numeroPedido, itensDoSetor, metaSetor, setorPronto, onMarcarPronto,
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
          <SetorBloco key={sk} o={o} sk={sk} its={its} metaSetor={metaSetor} setorPronto={setorPronto} onMarcarPronto={() => onMarcarPronto(sk)} />
        );
      })}

      {action && <div className="pp-cp-actions">{action}</div>}
    </div>
  );
}

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
      <OrderCard
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
