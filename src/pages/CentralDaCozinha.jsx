import { Bell, Clock, CheckCircle2 } from "lucide-react";
import OperationalDarkPage from "../components/OperationalDarkPage";
import OperationalOrderCardDark from "../components/OperationalOrderCardDark";

const COLUNAS_META = [
  { key: "novos", label: "Novos", dot: "#2563eb", variante: "novo", vazio: { ic: "🆕", txt: "Nenhum pedido novo" } },
  { key: "preparo", label: "Em preparo", dot: "#e0930f", variante: "preparo", vazio: { ic: "🍳", txt: "Nenhum pedido em preparo" } },
  { key: "prontos", label: "Prontos", dot: "#16a34a", variante: "pronto", vazio: { ic: "📦", txt: "Nada pronto no momento" } },
];

/**
 * Cozinha (/operacional/cozinha) — tema escuro padronizado com Pedidos
 * (src/pages/CentralDePedidos.jsx), via o mesmo casco compartilhado
 * OperationalDarkPage e o mesmo card compartilhado
 * OperationalOrderCardDark. Só a regra de ação por card é própria da
 * Cozinha (aceitar para preparação, marcar setor pronto, baixa/entregue,
 * bloqueio por pagamento) — mesma lógica de sempre, só reestilizada.
 * Todo dado e toda mutação continuam vindo prontos de OperacaoMobileView
 * (src/App.jsx), com o filtro de setor calculado lá (setoresPresentesSetor
 * já vem só com os itens da cozinha — nunca mistura com o Bar). Bar
 * continua na tela separada e no tema claro (src/pages/CentralDoSetor.jsx).
 */
export default function CentralDaCozinha({
  usuarioNome = "",
  lojaInfo,
  onFechar,
  navItems = [],
  onNavigate,
  nivelAcesso = "",
  colunas = {}, // { novos:[], preparo:[], prontos:[] }
  listaTodos = [],
  origemDe, haTxt, numeroPedido, itensDoSetor, metaSetor, setorPronto,
  setoresPresentes, // todos os setores do pedido (inclusive de outro setor) — usado na mutação e no "aguardando outro setor"
  setoresPresentesSetor, // só os setores da cozinha — usado para exibir os blocos do card (nunca itens do Bar)
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
          <button className="pp-pd-btn pp-pd-btn-primary" onClick={() => onIniciarPreparo(o.id)} type="button">
            ✓ Aceitar para preparação
          </button>
          <button className="pp-pd-btn pp-pd-btn-ghost" aria-label="Mais opções" type="button">⋯</button>
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
        return <p className="pp-pd-wait-msg">✓ Cozinha pronto · aguardando o outro setor</p>;
      }
      return null; // ação real é por setor, dentro do card (SetorBloco)
    }
    // pronto
    if (bloqueadoPorPagamento(o)) {
      return <p className="pp-pd-lock-msg">🔒 Aguardando pagamento para liberar</p>;
    }
    return (
      <button className="pp-pd-btn pp-pd-btn-blue" onClick={() => onBaixarEntregue(o.id)} type="button">
        Baixa / entregue
      </button>
    );
  };

  const renderCard = (o, variante) => {
    // Exibição só mostra os setores da cozinha; a mutação (marcar setor
    // pronto) precisa saber de TODOS os setores do pedido — mesmo
    // contrato de sempre em marcarSetorPronto(id, setor, setoresPresentes).
    const setoresNoPedido = setoresPresentesSetor(o);
    return (
      <OperationalOrderCardDark
        key={o.id} o={o} variante={variante} setoresNoPedido={setoresNoPedido} action={actionPara(o, variante, setoresNoPedido)}
        origemDe={origemDe} haTxt={haTxt} numeroPedido={numeroPedido} itensDoSetor={itensDoSetor} metaSetor={metaSetor}
        setorPronto={setorPronto} onMarcarPronto={(sk) => onMarcarSetorPronto(o.id, sk, setoresPresentes(o))}
      />
    );
  };

  const deriveListVariant = (o) =>
    o.status === "received" ? "novo" : o.status === "preparing" ? "preparo" : "pronto";

  // Mesmos ícones já usados para estes 3 indicadores em Pedidos/Central
  // Operacional — mesmo significado visual nas três telas.
  const kpis = [
    { key: "novos", Icon: Bell, label: "Novos", value: colunas.novos?.length || 0 },
    { key: "preparo", Icon: Clock, label: "Em preparo", value: colunas.preparo?.length || 0 },
    { key: "prontos", Icon: CheckCircle2, label: "Prontos", value: colunas.prontos?.length || 0 },
  ];

  return (
    <OperationalDarkPage
      title="Cozinha"
      flowTitle="Fluxo da cozinha"
      activeNavId="cozinha"
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
      emptyListMessage={{ ic: "🧑‍🍳", txt: "Nenhum pedido para a cozinha." }}
    />
  );
}
