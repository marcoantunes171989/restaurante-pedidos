import { Bell, Clock, CheckCircle2 } from "lucide-react";
import OperationalDarkPage from "../components/OperationalDarkPage";
import OperationalOrderCardDark from "../components/OperationalOrderCardDark";

// Textos de coluna vazia — deliberadamente iguais para Cozinha e Bar (é o
// que o pedido de padronização define), por isso ficam fixos aqui em vez
// de vir por prop.
const COLUNAS_META = [
  { key: "novos", label: "Novos", dot: "#2563eb", variante: "novo", vazio: { ic: "🆕", txt: "Nenhum pedido novo" } },
  { key: "preparo", label: "Em preparo", dot: "#e0930f", variante: "preparo", vazio: { ic: "🍳", txt: "Nenhum pedido em preparo" } },
  { key: "prontos", label: "Prontos", dot: "#16a34a", variante: "pronto", vazio: { ic: "📦", txt: "Nada pronto no momento" } },
];

/**
 * Tela de setor de produção (Cozinha e Bar — /operacional/cozinha e
 * /operacional/bar) — componente ÚNICO e compartilhado entre as duas,
 * tema escuro padronizado com Pedidos (src/pages/CentralDePedidos.jsx):
 * mesmo casco (OperationalDarkPage) e mesmo card (OperationalOrderCardDark)
 * das duas outras telas. Só o que é textualmente diferente (título,
 * rótulo do fluxo, textos/ícone do estado vazio da lista, item ativo da
 * nav) entra por prop. Toda a lógica real (contadores, setor por setor,
 * iniciar preparo, marcar pronto, baixa, tempo real) continua 100%
 * calculada em OperacaoMobileView (src/App.jsx) e só é passada pronta
 * para cá — o filtro que decide "isto é Cozinha ou Bar" também vem de lá
 * (setoresPresentesSetor), nunca mistura itens entre os dois setores.
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
  nivelAcesso = "",
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
        return <p className="pp-pd-wait-msg">✓ {titulo} pronto · aguardando o outro setor</p>;
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
    // Exibição só mostra os setores desta aba; a mutação (marcar setor
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
      title={titulo}
      flowTitle={fluxoLabel}
      activeNavId={activeNavId}
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
      emptyListMessage={{ ic: listaVazioIcone, txt: listaVazioTexto }}
    />
  );
}
