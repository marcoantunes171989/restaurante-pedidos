import { useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "../App";
import OperationalBottomNav from "../components/OperationalBottomNav";
import OrdersHeader from "../components/orders/OrdersHeader";
import CashierSummary from "../components/orders/CashierSummary";
import CashierStatusFilters from "../components/orders/CashierStatusFilters";
import AccountCard from "../components/orders/AccountCard";
import OrdersEmptyState from "../components/orders/OrdersEmptyState";
import CashierCheckout from "../components/orders/checkout/CashierCheckout";

// Categoria só é usada para o badge/filtro visual — nunca decide o que a
// conta PODE fazer (pagar antecipado é sempre permitido, como já era).
// "aguardando" = ainda não paga e o pedido nem ficou pronto; "em_aberto" =
// não paga e já pronta (tab realmente "aberta" para fechar agora);
// "pago" = paymentStatus paid, aguardando confirmação de retirada.
function categoriaDe(o) {
  if (o.paymentStatus === "paid") return "pago";
  return o.status === "ready" ? "em_aberto" : "aguardando";
}

const VAZIO_POR_FILTRO = {
  todas: { titulo: "Nenhuma conta encontrada.", descricao: "As contas da operação aparecerão aqui." },
  aguardando: { titulo: "Nenhuma conta aguardando pagamento.", descricao: "Novas solicitações aparecerão aqui." },
  em_aberto: { titulo: "Nenhuma conta em aberto.", descricao: "As contas ainda não finalizadas aparecerão aqui." },
  pago: { titulo: "Nenhum pagamento encontrado.", descricao: "Os pagamentos confirmados aparecerão aqui." },
};

/**
 * Caixa (/operacional/caixa) — tema CLARO, última das 5 telas
 * operacionais a migrar (Central, Pedidos, Cozinha e Bar já tinham sido
 * redesenhadas). Reaproveita OrdersHeader (cabeçalho já usado em
 * Pedidos/Cozinha/Bar) e um conjunto próprio de componentes financeiros
 * (CashierSummary/CashierStatusFilters/AccountCard/AccountStatusBadge —
 * vocabulário de status diferente do fluxo de produção: aguardando/
 * em_aberto/pago, não novo/preparo/pronto). Toda a lógica (buscar/
 * receber pagamento — múltiplas formas, validação de valor exato sem
 * troco —, confirmar retirada, formas de pagamento, navegação, logout)
 * é a mesma já existente em OperacaoMobileView (src/App.jsx); este
 * componente só recebe os dados prontos e formata a UI. Nenhum cálculo
 * financeiro, validação ou guarda contra clique duplo foi alterado —
 * só reescrito com os tokens --pp-* em vez do tema escuro.
 */
export default function CentralDoCaixa({
  usuarioNome = "",
  lojaInfo,
  onFechar,
  navItems = [],
  onNavigate,
  nivelAcesso = "",
  contas = [],
  totalCom,
  formasPagamento = [],
  baixarComandas,
  confirmarRetirada = async () => {},
  haTxt,
  numeroPedido = {},
  telMascarado = () => "",
  faturadoHoje = 0,
}) {
  const [pagando, setPagando] = useState(null);
  const [retirando, setRetirando] = useState(null);
  const [filtro, setFiltro] = useState("todas");
  // Conta selecionada para o PDV de fechamento (overlay em tela cheia).
  const [contaCheckout, setContaCheckout] = useState(null);
  // Trava síncrona (ref) contra clique duplo antes do re-render aplicar o "disabled".
  const pagandoIdsRef = useRef(new Set());

  // Chegada via clique numa notificação de Caixa (?destacar=<id>, migration
  // 064 / NotificationBell) — realça e rola até a conta certa, uma vez só.
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

  async function retirar(o) {
    setRetirando(o.id);
    try { await confirmarRetirada(o.id); } catch { /* feedback já tratado no backend */ }
    setRetirando(null);
  }

  const opcoes = useMemo(() => {
    const vistos = new Set(); const out = [];
    formasPagamento.filter((f) => f.active !== false).forEach((f) => {
      const nome = (f.nome || "").trim(); const k = nome.toLowerCase();
      if (nome && !vistos.has(k)) { vistos.add(k); out.push(nome); }
    });
    return out.length ? out : ["Pix", "Cartão", "Dinheiro"];
  }, [formasPagamento]);

  async function finalizar(o, linhas, total) {
    if (pagandoIdsRef.current.has(o.id)) return; // trava contra clique duplo antes do re-render
    pagandoIdsRef.current.add(o.id);
    setPagando(o.id);
    try {
      const detalhes = linhas.map((l) => ({ forma: l.forma, valor: Number(l.valor) || 0 }));
      await baixarComandas([o.command], { forma: detalhes.map((d) => d.forma).join(" + "), total, valor: total, detalhes, mesa: o.table, lojaId: lojaInfo?.id }, { manterStatus: true, somenteId: o.id });
    } catch { /* feedback já tratado no backend */ }
    pagandoIdsRef.current.delete(o.id);
    setPagando(null);
  }

  const abertas = contas.filter((o) => o.paymentStatus !== "paid");
  const totalReceber = abertas.reduce((s, o) => s + totalCom(o), 0);
  const contasComCategoria = contas.map((o) => ({ o, categoria: categoriaDe(o) }));
  const counts = {
    todas: contas.length,
    aguardando: contasComCategoria.filter((c) => c.categoria === "aguardando").length,
    em_aberto: contasComCategoria.filter((c) => c.categoria === "em_aberto").length,
    pago: contasComCategoria.filter((c) => c.categoria === "pago").length,
  };
  const visiveis = contasComCategoria.filter((c) => filtro === "todas" || c.categoria === filtro);
  const vazio = VAZIO_POR_FILTRO[filtro] || VAZIO_POR_FILTRO.todas;

  // Indicadores do turno para o PDV — derivados dos dados já disponíveis (sem
  // plumbing novo). "Mesas ocupadas" = nº de mesas distintas com conta aberta.
  const mesasOcupadas = new Set(abertas.map((o) => String(o.table || "").split(" · ")[0]).filter(Boolean)).size;
  const indicadores = {
    mesasOcupadas,
    mesasTotal: null,
    comandasEmAberto: contas.length,
    contasAguardando: counts.aguardando,
    faturamentoTurno: formatCurrency(faturadoHoje),
  };

  async function fecharContaPdv(linhas, total) {
    if (!contaCheckout) return;
    await finalizar(contaCheckout, linhas, total);
    setContaCheckout(null);
  }

  return (
    <div className="min-h-[100dvh] w-full pb-28" style={{ background: "var(--pp-bg)", paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto max-w-[1600px] px-4 pb-6 pt-6 md:px-6 md:pt-10 lg:px-10">
        <OrdersHeader titulo="Caixa" usuarioNome={usuarioNome} lojaInfo={lojaInfo} onFechar={onFechar} nivelAcesso={nivelAcesso} />

        <div className="mt-6">
          <CashierSummary aguardando={counts.aguardando} abertas={contas.length} totalReceber={formatCurrency(totalReceber)} faturadoHoje={formatCurrency(faturadoHoje)} />
        </div>

        <section aria-label="Contas do caixa" className="mt-6 rounded-[22px] border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 shadow-[0_1px_2px_rgba(43,35,32,0.04),0_4px_16px_rgba(43,35,32,0.04)] md:p-6">
          <div className="mb-4">
            <CashierStatusFilters filtro={filtro} onFiltro={setFiltro} counts={counts} />
          </div>

          {visiveis.length === 0 ? (
            <OrdersEmptyState variante="lista" titulo={vazio.titulo} descricao={vazio.descricao} />
          ) : (
            // auto-fit + minmax(min(100%,280px),1fr): a coluna nunca fica mais
            // estreita que o conteúdo do card, então a grade se ajusta
            // sozinha ao espaço real — 1 col até ~700px, 2 col em tablet,
            // 3 col a partir de ~1200px, sem breakpoint fixo frágil.
            <div className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
              {visiveis.map(({ o, categoria }) => (
                <AccountCard
                  key={o.id}
                  cardRef={o.id === destacadoId ? destacadoRef : undefined}
                  destacado={o.id === destacadoId}
                  o={o}
                  categoria={categoria}
                  totalCom={totalCom}
                  haTxt={haTxt}
                  numeroPedido={numeroPedido}
                  telMascarado={telMascarado}
                  opcoes={opcoes}
                  pagando={pagando === o.id}
                  onFinalizar={finalizar}
                  onAbrirCheckout={setContaCheckout}
                  retirando={retirando === o.id}
                  onRetirar={retirar}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <OperationalBottomNav items={navItems} active="caixa" onNavigate={onNavigate} />

      {contaCheckout && (
        <CashierCheckout
          o={contaCheckout}
          totalCom={totalCom}
          opcoes={opcoes}
          usuarioNome={usuarioNome}
          nivelAcesso={nivelAcesso}
          lojaInfo={lojaInfo}
          indicadores={indicadores}
          haTxt={haTxt}
          onFecharConta={fecharContaPdv}
          fechando={pagando === contaCheckout.id}
          onFechar={() => setContaCheckout(null)}
        />
      )}
    </div>
  );
}
