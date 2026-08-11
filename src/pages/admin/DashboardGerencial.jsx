import { useEffect, useMemo, useRef, useState } from "react";
import { FilterChip, FiltersPanel, FilterGroup, PageHeader } from "../../components/Prime";
import {
  Sparkline,
  ComposedBarLineChart,
  DonutChart,
  HorizontalRankBars,
  CompareLineChart,
  RadialDelta,
  PanelCard,
} from "../../components/dashboard/DashboardCharts.jsx";
import {
  PETROLEO,
  LARANJA,
  VERDE,
  filtrarPedidosPorPeriodo,
  filtrarOperacional,
  analisarVendas,
  vendasPorHora,
  faturamentoPorCanal,
  statusPedidos,
  comparativoPeriodo,
  mesasAbertasAgora,
  clientesNoPeriodo,
  sparklineValores,
  serieDiaria,
  insightsGestao,
} from "../../lib/dashboard/analiseDashboard.js";
import { formatCurrency } from "../pdv/pdvHelpers.js";

const PERIODOS = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "7", label: "7 dias" },
  { id: "15", label: "15 dias" },
  { id: "30", label: "30 dias" },
  { id: "tudo", label: "Tudo" },
];

function fmtHora(d) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function KpiSparkCard({
  titulo,
  valor,
  sub,
  variacao,
  spark,
  corSpark = PETROLEO,
}) {
  const varOk = variacao != null;
  const up = (variacao || 0) >= 0;
  return (
    <article className="flex h-full flex-col rounded-2xl border border-[#D1D5DB] bg-white px-4 py-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">{titulo}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-[#012E46]">{valor}</p>
      {varOk ? (
        <p className={`mt-0.5 text-[11px] font-bold ${up ? "text-[#5E8C31]" : "text-[#C81E4A]"}`}>
          {up ? "▲ +" : "▼ "}{Math.abs(variacao).toFixed(0)}% vs período anterior
        </p>
      ) : (
        <p className="mt-0.5 text-[11px] text-[#6B7280]">{sub}</p>
      )}
      <div className="mt-auto pt-2">
        <Sparkline valores={spark} cor={corSpark} />
      </div>
    </article>
  );
}

/**
 * Dashboard Gerencial — visão estratégica com gráficos e tempo real.
 * Consome `orders` já atualizados via realtime do App (escutarPedidos).
 */
export default function DashboardGerencial({
  orders = [],
  products = [],
  clientes = [],
  irParaProdutos = () => {},
}) {
  const [periodo, setPeriodo] = useState("30");
  const [turno, setTurno] = useState("todos");
  const [canal, setCanal] = useState("todos");
  const [statusF, setStatusF] = useState("todos");
  const [atualizadoEm, setAtualizadoEm] = useState(() => new Date());
  const [pulse, setPulse] = useState(false);
  const prevSigRef = useRef("");

  const filtrados = useMemo(() => {
    const base = filtrarPedidosPorPeriodo(orders, periodo);
    return filtrarOperacional(base, { turno, canal, statusF });
  }, [orders, periodo, turno, canal, statusF]);

  const a = useMemo(() => analisarVendas(filtrados, products), [filtrados, products]);
  const { sequencia: porHora, melhor: melhorHora } = useMemo(() => vendasPorHora(a.pagos), [a.pagos]);
  const canalDonut = useMemo(() => faturamentoPorCanal(a.pagos), [a.pagos]);
  const statusDonut = useMemo(() => statusPedidos(filtrados), [filtrados]);
  const comparativo = useMemo(
    () => comparativoPeriodo(orders, products, periodo),
    [orders, products, periodo],
  );
  const serieSpark = useMemo(
    () => sparklineValores(serieDiaria(a.pagos, periodo)),
    [a.pagos, periodo],
  );

  const mesasAbertas = useMemo(() => mesasAbertasAgora(orders), [orders]);
  const clientesPeriodo = useMemo(() => clientesNoPeriodo(filtrados), [filtrados]);
  const abertosQtd = filtrados.filter((o) => o.paymentStatus !== "paid" && o.status !== "cancelled").length;
  const semEstoque = products.filter(
    (p) => p.controlaEstoque && (Number(p.estoque) || 0) <= (Number(p.estoqueMinimo) || 5),
  ).length;
  const produtoTop = a.topProdutos[0] || null;

  const catDonut = useMemo(
    () => a.categorias.slice(0, 6).map((c, i) => ({
      label: c.categoria,
      valor: c.valor,
      cor: [PETROLEO, LARANJA, VERDE, "#3D5A6C", "#F5A54A", "#6B7280"][i % 6],
    })),
    [a.categorias],
  );

  const entregues = filtrados.filter((o) => o.status === "delivered").length;
  const naoCancel = filtrados.filter((o) => o.status !== "cancelled").length;
  const taxaEntrega = naoCancel ? Math.round((entregues / naoCancel) * 100) : 0;

  const insights = useMemo(
    () => insightsGestao({
      produtoTop,
      melhorHora,
      semEstoque,
      abertos: abertosQtd,
      ticket: a.ticket,
    }),
    [produtoTop, melhorHora, semEstoque, abertosQtd, a.ticket],
  );

  // Tempo real: reage a mudanças nos pedidos (já vindos do canal Supabase)
  useEffect(() => {
    const sig = `${orders.length}|${orders.reduce((s, o) => s + (o.updatedAtISO || o.createdAtISO || o.id || ""), "")}`;
    if (prevSigRef.current && prevSigRef.current !== sig) {
      setAtualizadoEm(new Date());
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1200);
      return () => clearTimeout(t);
    }
    prevSigRef.current = sig;
    setAtualizadoEm(new Date());
    return undefined;
  }, [orders]);

  // Relógio do rodapé ao vivo (confirma que a tela está “acordada”)
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <PageHeader
            icone={<span className="text-lg">📊</span>}
            titulo="Dashboard Gerencial"
            descricao="Visão estratégica de vendas, operação, produtos, clientes e desempenho financeiro."
          />
          <p className={`mt-1 inline-flex items-center gap-2 text-xs font-bold ${pulse ? "text-[#F38525]" : "text-[#5E8C31]"}`}>
            <span className={`h-2 w-2 rounded-full ${pulse ? "animate-ping bg-[#F38525]" : "bg-[#5E8C31]"}`} aria-hidden="true" />
            Dados em tempo real · atualizado às {fmtHora(atualizadoEm)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIODOS.map((p) => (
            <FilterChip
              key={p.id}
              size="sm"
              selected={periodo === p.id}
              label={p.label}
              onClick={() => setPeriodo(p.id)}
            />
          ))}
        </div>
      </div>

      <FiltersPanel>
        <FilterGroup
          titulo="Turno"
          descricao="Período do dia"
          valor={turno}
          onChange={setTurno}
          opcoes={[
            { id: "todos", label: "Todos" },
            { id: "almoco", label: "Almoço" },
            { id: "jantar", label: "Jantar" },
          ]}
        />
        <FilterGroup
          titulo="Canal"
          descricao="Origem do pedido"
          valor={canal}
          onChange={setCanal}
          opcoes={[
            { id: "todos", label: "Todos" },
            { id: "mesa_qr", label: "Mesa / QR" },
            { id: "balcao_delivery", label: "Balcão / Delivery" },
          ]}
        />
        <FilterGroup
          titulo="Status"
          descricao="Situação financeira"
          valor={statusF}
          onChange={setStatusF}
          opcoes={[
            { id: "todos", label: "Todos" },
            { id: "pago", label: "Pago", tone: "success" },
            { id: "aberto", label: "Em aberto", tone: "warning" },
            { id: "cancelado", label: "Cancelado", tone: "error" },
          ]}
        />
      </FiltersPanel>

      {/* KPIs com sparkline */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiSparkCard
          titulo="Faturamento"
          valor={formatCurrency(a.faturamento)}
          variacao={comparativo?.faturamento}
          spark={serieSpark}
          corSpark={PETROLEO}
        />
        <KpiSparkCard
          titulo="Ticket médio"
          valor={formatCurrency(a.ticket)}
          variacao={comparativo?.ticket}
          spark={serieSpark.map((v, i, arr) => (arr.length ? v / Math.max(a.pagos.length, 1) : 0))}
          corSpark={LARANJA}
        />
        <KpiSparkCard
          titulo="Total de pedidos"
          valor={a.totalPedidos}
          variacao={comparativo?.pedidos}
          spark={porHora.map((h) => h.qtd)}
          corSpark={PETROLEO}
        />
        <KpiSparkCard
          titulo="Mesas abertas"
          valor={mesasAbertas}
          sub={mesasAbertas ? "agora no salão" : "Nenhuma mesa aberta"}
          spark={[mesasAbertas, mesasAbertas, Math.max(0, mesasAbertas - 1), mesasAbertas]}
          corSpark={LARANJA}
        />
        <KpiSparkCard
          titulo="Clientes no período"
          valor={clientesPeriodo}
          sub={`de ${clientes.length} cadastrados`}
          spark={serieSpark}
          corSpark={PETROLEO}
        />
      </div>

      {/* Linha de gráficos principais */}
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr_1fr]">
        <PanelCard titulo="Faturamento por horário">
          <ComposedBarLineChart dados={porHora} melhorLabel={melhorHora.valor > 0 ? melhorHora.label : ""} />
        </PanelCard>
        <PanelCard titulo="Faturamento por canal">
          <DonutChart
            dados={canalDonut}
            centroTitulo="Canais"
            centroValor={canalDonut.length ? `${canalDonut.length}` : "—"}
          />
        </PanelCard>
        <PanelCard titulo="Status dos pedidos">
          <DonutChart
            dados={statusDonut}
            centroTitulo="Pedidos"
            centroValor={String(filtrados.length)}
            formato="qtd"
          />
          <p className="mt-3 text-center text-[11px] font-semibold text-[#6B7280]">
            Taxa de entrega concluída: <span className="font-black text-[#012E46]">{taxaEntrega}%</span>
          </p>
        </PanelCard>
      </div>

      {/* Produtos + categorias */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          titulo="Produtos mais vendidos"
          acao={(
            <button
              type="button"
              onClick={irParaProdutos}
              className="text-xs font-bold text-[#012E46] underline-offset-2 hover:underline"
            >
              Ver todos os produtos
            </button>
          )}
        >
          <HorizontalRankBars itens={a.topProdutos} />
        </PanelCard>
        <PanelCard titulo="Vendas por categoria">
          <DonutChart
            dados={catDonut}
            centroTitulo="Mix"
            centroValor={catDonut.length ? `${catDonut.length}` : "—"}
            tamanho={180}
          />
        </PanelCard>
      </div>

      {/* Comparativo para decisão */}
      <PanelCard titulo="Comparativo com período anterior">
        {comparativo ? (
          <div className="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-center">
            <div className="flex flex-wrap justify-center gap-4 lg:flex-col lg:justify-start">
              <RadialDelta valor={comparativo.faturamento} rotulo="Faturamento" />
              <RadialDelta valor={comparativo.pedidos} rotulo="Pedidos" />
              <RadialDelta valor={comparativo.ticket} rotulo="Ticket médio" />
            </div>
            <CompareLineChart
              atual={comparativo.serieAtual}
              anterior={comparativo.serieAnterior}
            />
          </div>
        ) : (
          <p className="py-8 text-center text-sm font-semibold text-[#6B7280]">
            Selecione um período (exceto “Tudo”) para comparar com o intervalo anterior.
          </p>
        )}
      </PanelCard>

      {/* Faixa de insights para decisão */}
      <div className="grid gap-2 rounded-2xl border border-[#012E46]/15 bg-[#F8FAFB] px-3 py-3 sm:grid-cols-2 xl:grid-cols-4">
        {insights.map((ins) => (
          <div key={ins.texto} className="flex items-start gap-2 px-2 py-1 text-xs font-semibold text-[#012E46]">
            <span
              className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
              style={{
                background:
                  ins.tipo === "destaque" || ins.tipo === "oportunidade" ? LARANJA
                    : ins.tipo === "estoque" && semEstoque === 0 ? VERDE
                      : PETROLEO,
              }}
            />
            <span>{ins.texto}</span>
          </div>
        ))}
      </div>

      <p className="text-center text-[11px] text-[#9CA3AF]">
        Atualização automática enquanto esta tela estiver aberta · {filtrados.length} pedido(s) no filtro atual
      </p>
    </div>
  );
}
