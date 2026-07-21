import { useEffect, useMemo, useRef, useState } from "react";
import OperationalBottomNav from "../components/OperationalBottomNav";
import OrdersHeader from "../components/orders/OrdersHeader";
import OrdersSummary from "../components/orders/OrdersSummary";
import OrdersViewToggle from "../components/orders/OrdersViewToggle";
import OrdersKanban from "../components/orders/OrdersKanban";
import OrdersList from "../components/orders/OrdersList";
import OrderCard from "../components/orders/OrderCard";

// Textos de coluna vazia — os mesmos já usados hoje (CentralDoSetor.jsx,
// COLUNAS_META — deliberadamente iguais para Cozinha e Bar), preservados
// ao pé da letra.
const COLUNAS_CONFIG = [
  { key: "novo", dataKey: "novos", titulo: "Novos", vazio: "Nenhum pedido novo" },
  { key: "preparo", dataKey: "preparo", titulo: "Em preparo", vazio: "Nenhum pedido em preparo" },
  { key: "pronto", dataKey: "prontos", titulo: "Prontos", vazio: "Nada pronto no momento" },
];

/**
 * Bar (/operacional/bar) — tema CLARO, dedicado a esta tela. Mesmo
 * padrão de CentralDaCozinha.jsx (que era o mesmo componente
 * compartilhado — CentralDoSetor.jsx — antes de a Cozinha ser
 * desacoplada); agora o Bar também ganha sua tela própria e
 * CentralDoSetor.jsx fica sem nenhum consumidor (ver remoção do código
 * morto no commit desta tarefa). Toda a lógica (contadores, setor por
 * setor, iniciar preparo, marcar pronto, baixa, tempo real) continua
 * vindo pronta de OperacaoMobileView (src/App.jsx) — este componente só
 * formata, filtra pela busca local e monta a apresentação. Ação
 * por-setor replicada fielmente da lógica original em
 * CentralDoSetor.jsx/actionPara.
 */
export default function CentralDoBar({
  usuarioNome = "",
  lojaInfo,
  onFechar,
  navItems = [],
  onNavigate,
  nivelAcesso = "",
  colunas = {}, // { novos:[], preparo:[], prontos:[] }
  listaTodos = [],
  origemDe, haTxt, numeroPedido, itensDoSetor, metaSetor, setorPronto,
  setoresPresentes, // todos os setores do pedido (inclusive de outro setor) — usado na mutação
  setoresPresentesSetor, // só os setores do bar — usado para exibir os blocos do card
  bloqueadoPorPagamento,
  onIniciarPreparo, onMarcarSetorPronto, onBaixarEntregue,
}) {
  const [busca, setBusca] = useState("");
  const [view, setView] = useState("kanban");

  const [destacadoId, setDestacadoId] = useState(() => new URLSearchParams(window.location.search).get("destacar"));
  const destacadoRef = useRef(null);

  useEffect(() => {
    if (!destacadoId) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("destacar")) return;
    params.delete("destacar");
    const resto = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (resto ? `?${resto}` : ""));
  }, [destacadoId]);

  useEffect(() => {
    if (!destacadoId || !destacadoRef.current) return;
    destacadoRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setDestacadoId(null), 4000);
    return () => clearTimeout(t);
  }, [destacadoId]);

  const buscaNorm = busca.trim().toLowerCase();
  const bate = (o) => {
    if (!buscaNorm) return true;
    const alvo = [o.customer, o.id, o.table, `#${numeroPedido[o.id] ?? ""}`].join(" ").toLowerCase();
    return alvo.includes(buscaNorm);
  };

  const colunasFiltradas = useMemo(() => ({
    novos: (colunas.novos || []).filter(bate),
    preparo: (colunas.preparo || []).filter(bate),
    prontos: (colunas.prontos || []).filter(bate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [colunas, buscaNorm]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const listaFiltrada = useMemo(() => listaTodos.filter(bate), [listaTodos, buscaNorm]);

  const deriveVariant = (o) => (o.status === "received" ? "novo" : o.status === "preparing" ? "preparo" : "pronto");

  // Mesma composição de ação de CentralDoSetor.jsx/actionPara — só
  // reescrita pra devolver dado cru (acao/mensagemRodape), não JSX
  // pré-montado, já que quem estiliza agora é OrderCard.jsx.
  const acaoPara = (o, variante, setoresNoPedido) => {
    if (variante === "novo") {
      return { acao: { l: "Aceitar para preparação", fn: () => onIniciarPreparo(o.id) } };
    }
    if (variante === "preparo") {
      const todos = setoresPresentes(o);
      const aguardandoOutroSetor = setoresNoPedido.length > 0 && setoresNoPedido.every((s) => setorPronto(o, s)) && todos.length > setoresNoPedido.length;
      if (aguardandoOutroSetor) return { mensagemRodape: "Bar pronto · aguardando o outro setor" };
      return {}; // ação real é por setor, dentro do card
    }
    // pronto
    if (bloqueadoPorPagamento(o)) return { acao: { l: "Aguardando pagamento", fn: null, disabled: true } };
    return { acao: { l: "Baixa / entregue", fn: () => onBaixarEntregue(o.id) } };
  };

  const renderCard = (o, variante) => {
    const setoresNoPedido = setoresPresentesSetor(o);
    const { acao, mensagemRodape } = acaoPara(o, variante, setoresNoPedido);
    return (
      <OrderCard
        key={o.id}
        cardRef={o.id === destacadoId ? destacadoRef : undefined}
        destacado={o.id === destacadoId}
        o={o} variante={variante}
        setoresNoPedido={setoresNoPedido}
        acao={acao} mensagemRodape={mensagemRodape}
        origemDe={origemDe} haTxt={haTxt} numeroPedido={numeroPedido} itensDoSetor={itensDoSetor} metaSetor={metaSetor}
        setorPronto={setorPronto} onMarcarPronto={(sk) => onMarcarSetorPronto(o.id, sk, setoresPresentes(o))}
      />
    );
  };

  return (
    <div className="min-h-[100dvh] w-full pb-28" style={{ background: "var(--pp-bg)", paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto max-w-[1600px] px-4 pb-6 pt-6 md:px-6 md:pt-10 lg:px-10">
        <OrdersHeader titulo="Bar" usuarioNome={usuarioNome} lojaInfo={lojaInfo} onFechar={onFechar} nivelAcesso={nivelAcesso} busca={busca} onBuscaChange={setBusca} />

        <div className="mt-6">
          <OrdersSummary novos={colunas.novos?.length || 0} preparo={colunas.preparo?.length || 0} prontos={colunas.prontos?.length || 0} />
        </div>

        <section aria-label="Fluxo do bar" className="mt-6 rounded-[22px] border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 shadow-[0_1px_2px_rgba(43,35,32,0.04),0_4px_16px_rgba(43,35,32,0.04)] md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[var(--pp-text)] md:text-xl">Fluxo do bar</h2>
              <p className="text-xs text-[var(--pp-text-muted)]">{listaTodos.length} {listaTodos.length === 1 ? "pedido ativo" : "pedidos ativos"}</p>
            </div>
            <OrdersViewToggle view={view} onChange={setView} />
          </div>

          {view === "kanban" ? (
            <OrdersKanban dataColunas={colunasFiltradas} renderCard={renderCard} colunasConfig={COLUNAS_CONFIG} />
          ) : (
            <OrdersList
              pedidos={listaFiltrada} deriveVariant={deriveVariant} renderCard={renderCard}
              acaoPrincipal={(o) => acaoPara(o, deriveVariant(o), setoresPresentesSetor(o)).acao}
              origemDe={origemDe} haTxt={haTxt} numeroPedido={numeroPedido} setoresPresentes={setoresPresentesSetor}
              vazioTitulo="Nenhum pedido para o bar." vazioDescricao={busca ? "Tente ajustar a busca." : undefined}
            />
          )}
        </section>
      </div>

      <OperationalBottomNav items={navItems} active="bar" onNavigate={onNavigate} />
    </div>
  );
}
