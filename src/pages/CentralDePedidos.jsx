import { useEffect, useMemo, useRef, useState } from "react";
import OperationalBottomNav from "../components/OperationalBottomNav";
import OrdersHeader from "../components/orders/OrdersHeader";
import OrdersSummary from "../components/orders/OrdersSummary";
import OrdersViewToggle from "../components/orders/OrdersViewToggle";
import OrdersKanban from "../components/orders/OrdersKanban";
import OrdersList from "../components/orders/OrdersList";
import OrderCard from "../components/orders/OrderCard";

/**
 * Pedidos (/operacional/pedidos) — tema CLARO, dedicado a esta tela.
 * Cozinha (CentralDaCozinha.jsx) e Bar (CentralDoBar.jsx) seguiram o
 * mesmo caminho depois; só o Caixa (src/pages/CentralDoCaixa.jsx) ainda
 * usa o cabeçalho escuro original (OperationalDarkHeader), sem nenhuma
 * alteração. Todo dado e toda mutação (aceitar, entregar, status)
 * continuam vindo prontos de OperacaoMobileView (src/App.jsx) — este
 * componente só formata, filtra pela busca local e monta a apresentação.
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
  const [busca, setBusca] = useState("");
  const [view, setView] = useState("kanban"); // sem persistência: o projeto não tem hoje um padrão pra isso

  // Chegada via clique numa notificação (?destacar=<id>, migration 064 /
  // NotificationBell) — realça e rola até o card certo, uma vez só. Mesmo
  // mecanismo já usado antes desta tela (lido no initializer, não num
  // efeito, pra não disparar setState síncrono dentro de useEffect).
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

  const renderCard = (o, variante) => (
    <OrderCard
      key={o.id}
      cardRef={o.id === destacadoId ? destacadoRef : undefined}
      destacado={o.id === destacadoId}
      o={o} variante={variante}
      setoresNoPedido={setoresPresentes(o)}
      acao={acaoPrincipal(o)}
      origemDe={origemDe} haTxt={haTxt} numeroPedido={numeroPedido} itensDoSetor={itensDoSetor} metaSetor={metaSetor}
    />
  );

  return (
    <div className="min-h-[100dvh] w-full pb-28" style={{ background: "var(--pp-bg)", paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto max-w-[1600px] px-4 pb-6 pt-6 md:px-6 md:pt-10 lg:px-10">
        <OrdersHeader usuarioNome={usuarioNome} lojaInfo={lojaInfo} onFechar={onFechar} nivelAcesso={nivelAcesso} busca={busca} onBuscaChange={setBusca} />

        <div className="mt-6">
          <OrdersSummary novos={colunas.novos?.length || 0} preparo={colunas.preparo?.length || 0} prontos={colunas.prontos?.length || 0} />
        </div>

        <section aria-label="Fluxo de pedidos" className="mt-6 rounded-[22px] border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 shadow-[0_1px_2px_rgba(43,35,32,0.04),0_4px_16px_rgba(43,35,32,0.04)] md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[var(--pp-text)] md:text-xl">Fluxo de pedidos</h2>
              <p className="text-xs text-[var(--pp-text-muted)]">{listaTodos.length} {listaTodos.length === 1 ? "pedido ativo" : "pedidos ativos"}</p>
            </div>
            <OrdersViewToggle view={view} onChange={setView} />
          </div>

          {view === "kanban" ? (
            <OrdersKanban dataColunas={colunasFiltradas} renderCard={renderCard} />
          ) : (
            <OrdersList
              pedidos={listaFiltrada} deriveVariant={deriveVariant} renderCard={renderCard}
              acaoPrincipal={acaoPrincipal} origemDe={origemDe} haTxt={haTxt} numeroPedido={numeroPedido} setoresPresentes={setoresPresentes}
              vazioTitulo="Nenhum pedido ativo." vazioDescricao={busca ? "Tente ajustar a busca." : undefined}
            />
          )}
        </section>
      </div>

      <OperationalBottomNav items={navItems} active="pedidos" onNavigate={onNavigate} />
    </div>
  );
}
