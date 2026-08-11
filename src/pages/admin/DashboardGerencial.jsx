import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { FilterChip } from "../../components/Prime";
import {
  Sparkline,
  AreaWaveChart,
  ComposedBarLineChart,
  DonutChart,
  HorizontalRankBars,
  CompareLineChart,
  RadialDelta,
  RefreshCountdown,
  HealthScore,
} from "../../components/dashboard/DashboardCharts.jsx";
import {
  PETROLEO,
  LARANJA,
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
  scoreSaudeOperacao,
  prioridadesDecisao,
  metricasFila,
  melhorMesVendas,
} from "../../lib/dashboard/analiseDashboard.js";
import { formatCurrency } from "../pdv/pdvHelpers.js";

const PERIODOS = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "7", label: "7d" },
  { id: "15", label: "15d" },
  { id: "30", label: "30d" },
  { id: "tudo", label: "Tudo" },
];

const PULSE_MS = 15_000;
const META_TICKET = 45;

function fmtHora(d) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function DashCard({ children, className = "", as: Tag = "section" }) {
  return (
    <Tag
      className={`rounded-2xl border border-[#E5E7EB] bg-white p-3.5 shadow-[0_1px_0_rgba(1,46,70,0.04)] sm:p-4 ${className}`}
    >
      {children}
    </Tag>
  );
}

function ChartHeader({ titulo, descricao, acao = null }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-black tracking-tight text-[#012E46]">{titulo}</h2>
        {descricao ? (
          <p className="mt-0.5 text-[11px] font-semibold leading-snug text-[#6B7280]">{descricao}</p>
        ) : null}
      </div>
      {acao}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
      {children}
    </p>
  );
}

function LiveKpi({ titulo, valor, sub, variacao, spark, cor = PETROLEO, pulseKey, destaque = false }) {
  const reduce = useReducedMotion();
  const up = (variacao || 0) >= 0;
  return (
    <motion.article
      layout
      key={`${titulo}-${pulseKey}`}
      initial={reduce ? false : { opacity: 0.55, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className={`relative min-w-0 overflow-hidden rounded-2xl border bg-white px-3 py-3 shadow-[0_1px_0_rgba(1,46,70,0.04)] sm:px-3.5 ${
        destaque ? "border-[#F38525]/45" : "border-[#E5E7EB]"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-90"
        style={{
          background: destaque
            ? `linear-gradient(90deg, ${LARANJA}, transparent)`
            : `linear-gradient(90deg, ${PETROLEO}, ${LARANJA}, transparent)`,
        }}
      />
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B7280]">{titulo}</p>
      <p className="mt-0.5 text-xl font-black tabular-nums tracking-tight text-[#012E46] sm:text-2xl">{valor}</p>
      {variacao != null ? (
        <p className={`text-[11px] font-bold ${up ? "text-[#5E8C31]" : "text-[#C81E4A]"}`}>
          {up ? "▲ +" : "▼ "}{Math.abs(variacao).toFixed(0)}% vs ant.
        </p>
      ) : (
        <p className="text-[11px] font-semibold text-[#6B7280]">{sub}</p>
      )}
      {spark ? (
        <div className="mt-1">
          <Sparkline valores={spark} cor={cor} pulseKey={pulseKey} height={26} />
        </div>
      ) : null}
    </motion.article>
  );
}

function MiniStat({ rotulo, valor, destaque = false }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] px-2.5 py-2.5 text-center">
      <p className={`text-lg font-black tabular-nums ${destaque ? "text-[#F38525]" : "text-[#012E46]"}`}>
        {valor}
      </p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">{rotulo}</p>
    </div>
  );
}

/**
 * Dashboard Gerencial — Central de Decisão.
 * KPIs críticos no topo · dados reais da loja · responsivo.
 */
export default function DashboardGerencial({
  orders = [],
  products = [],
  clientes = [],
  irParaProdutos = () => {},
}) {
  const [periodo, setPeriodo] = useState("hoje");
  const [pulseKey, setPulseKey] = useState(0);
  const [restante, setRestante] = useState(15);
  const [atualizadoEm, setAtualizadoEm] = useState(() => new Date());
  const [flash, setFlash] = useState(false);
  const prevSig = useRef("");

  const filtrados = useMemo(
    () => filtrarOperacional(filtrarPedidosPorPeriodo(orders, periodo), {}),
    [orders, periodo],
  );
  const a = useMemo(() => analisarVendas(filtrados, products), [filtrados, products]);
  const fila = useMemo(() => metricasFila(filtrados), [filtrados]);
  const mesTopo = useMemo(() => melhorMesVendas(a.pagos), [a.pagos]);
  const { sequencia: porHora, melhor: melhorHora } = useMemo(() => vendasPorHora(a.pagos), [a.pagos]);
  const canalDonut = useMemo(() => faturamentoPorCanal(a.pagos), [a.pagos]);
  const statusDonut = useMemo(() => statusPedidos(filtrados), [filtrados]);
  const comparativo = useMemo(
    () => comparativoPeriodo(orders, products, periodo),
    [orders, products, periodo],
  );
  const serie = useMemo(() => serieDiaria(a.pagos, periodo), [a.pagos, periodo]);
  const spark = useMemo(() => sparklineValores(serie), [serie]);

  const mesasAbertas = useMemo(() => mesasAbertasAgora(orders), [orders]);
  const clientesPeriodo = useMemo(() => clientesNoPeriodo(filtrados), [filtrados]);
  const semEstoque = products.filter(
    (p) => p.controlaEstoque && (Number(p.estoque) || 0) <= (Number(p.estoqueMinimo) || 5),
  ).length;
  const produtoTop = a.topProdutos[0] || null;
  const entregues = filtrados.filter((o) => o.status === "delivered").length;
  const naoCancel = filtrados.filter((o) => o.status !== "cancelled").length;
  const taxaEntrega = naoCancel ? Math.round((entregues / naoCancel) * 100) : 100;

  const catDonut = useMemo(
    () => a.categorias.slice(0, 5).map((c, i) => ({
      label: c.categoria,
      valor: c.valor,
      cor: [PETROLEO, LARANJA, "#3D5A6C", "#F5A54A", "#6B7280"][i % 5],
    })),
    [a.categorias],
  );

  const saude = useMemo(
    () => scoreSaudeOperacao({
      ticket: a.ticket,
      abertos: fila.emAberto + fila.aguardandoPagamento,
      cancelados: fila.cancelados,
      totalPedidos: a.totalPedidos + fila.cancelados,
      semEstoque,
      mesasAbertas,
      variacaoFat: comparativo?.faturamento,
    }),
    [a.ticket, fila, semEstoque, mesasAbertas, comparativo, a.totalPedidos],
  );

  const prioridades = useMemo(
    () => prioridadesDecisao({
      abertos: fila.emAberto + fila.aguardandoPagamento,
      emAbertoValor: fila.emAbertoValor + fila.aguardandoValor,
      semEstoque,
      melhorHora,
      produtoTop,
      ticket: a.ticket,
      taxaEntrega,
    }),
    [fila, semEstoque, melhorHora, produtoTop, a.ticket, taxaEntrega],
  );

  useEffect(() => {
    const tick = setInterval(() => {
      setRestante((s) => {
        if (s <= 1) {
          setPulseKey((k) => k + 1);
          setAtualizadoEm(new Date());
          setFlash(true);
          window.setTimeout(() => setFlash(false), 900);
          return 15;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [periodo]);

  useEffect(() => {
    const sig = `${orders.length}|${orders.map((o) => `${o.id}:${o.paymentStatus || ""}:${o.status || ""}`).join("|")}`;
    if (!prevSig.current) {
      prevSig.current = sig;
      return undefined;
    }
    if (prevSig.current === sig) return undefined;
    prevSig.current = sig;
    const tPulse = window.setTimeout(() => {
      setPulseKey((k) => k + 1);
      setAtualizadoEm(new Date());
      setRestante(15);
      setFlash(true);
    }, 0);
    const tFlash = window.setTimeout(() => setFlash(false), 900);
    return () => {
      clearTimeout(tPulse);
      clearTimeout(tFlash);
    };
  }, [orders]);

  const prioCor = { alta: "#C81E4A", media: LARANJA, baixa: PETROLEO };

  return (
    <div className="-mx-1 min-h-[calc(100dvh-5.5rem)] space-y-4 lg:-mx-2">
      <header className="flex flex-col gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-3 py-3 shadow-[0_1px_0_rgba(1,46,70,0.04)] sm:px-5 sm:py-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-black tracking-tight text-[#012E46] sm:text-xl">
              Central de Decisão
            </h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${flash ? "bg-[#F38525] text-[#012E46]" : "bg-[#012E46] text-white"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${flash ? "animate-ping bg-[#012E46]" : "bg-[#5E8C31]"}`} />
              Ao vivo
            </span>
          </div>
          <p className="mt-0.5 text-xs font-semibold text-[#6B7280]">
            Dados reais da loja · sync {fmtHora(atualizadoEm)} · pulso {PULSE_MS / 1000}s
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex max-w-full flex-wrap gap-1">
            {PERIODOS.map((p) => (
              <FilterChip
                key={p.id}
                size="sm"
                selected={periodo === p.id}
                label={p.label}
                onClick={() => {
                  setPeriodo(p.id);
                  setRestante(15);
                }}
              />
            ))}
          </div>
          <RefreshCountdown segundos={15} restante={restante} />
        </div>
      </header>

      {/* 1) Fila crítica — mais importante no topo */}
      <div>
        <SectionLabel>Fila e atenção imediata</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <LiveKpi
            titulo="Em aberto"
            valor={fila.emAberto}
            sub={fila.emAberto ? formatCurrency(fila.emAbertoValor) : "nenhuma comanda"}
            cor={LARANJA}
            pulseKey={pulseKey}
            destaque={fila.emAberto > 0}
          />
          <LiveKpi
            titulo="Aguardando pagamento"
            valor={fila.aguardandoPagamento}
            sub={fila.aguardandoPagamento ? formatCurrency(fila.aguardandoValor) : "nenhuma conta"}
            cor={LARANJA}
            pulseKey={pulseKey}
            destaque={fila.aguardandoPagamento > 0}
          />
          <LiveKpi
            titulo="Cancelados"
            valor={fila.cancelados}
            sub={filtrados.length ? `${Math.round((fila.cancelados / Math.max(filtrados.length, 1)) * 100)}% do período` : "no período"}
            cor={PETROLEO}
            pulseKey={pulseKey}
            destaque={fila.cancelados > 0}
          />
          <LiveKpi
            titulo="Pedidos externos"
            valor={fila.externos}
            sub={
              fila.externosPagos
                ? `${fila.externosPagos} pagos · ${formatCurrency(fila.externosValor)}`
                : "retirada / entrega / local"
            }
            cor={LARANJA}
            pulseKey={pulseKey}
            destaque={fila.externos > 0}
          />
        </div>
      </div>

      {/* 2) Resultado */}
      <div>
        <SectionLabel>Resultado do período</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <LiveKpi
            titulo="Faturamento"
            valor={formatCurrency(a.faturamento)}
            variacao={comparativo?.faturamento}
            spark={spark}
            cor={PETROLEO}
            pulseKey={pulseKey}
          />
          <LiveKpi
            titulo="Ticket médio"
            valor={formatCurrency(a.ticket)}
            variacao={comparativo?.ticket}
            spark={spark}
            cor={LARANJA}
            pulseKey={pulseKey}
          />
          <LiveKpi
            titulo="Pedidos"
            valor={a.totalPedidos}
            variacao={comparativo?.pedidos}
            spark={porHora.map((h) => h.qtd)}
            cor={PETROLEO}
            pulseKey={pulseKey}
          />
          <LiveKpi
            titulo="Mês que mais vendeu"
            valor={mesTopo.label}
            sub={
              mesTopo.valor > 0
                ? `${formatCurrency(mesTopo.valor)} · ${mesTopo.qtd} ped.`
                : "sem vendas no período"
            }
            cor={LARANJA}
            pulseKey={pulseKey}
            destaque={mesTopo.valor > 0}
          />
        </div>
      </div>

      {/* 3) Contexto */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <LiveKpi
          titulo="Mesas abertas"
          valor={mesasAbertas}
          sub={mesasAbertas ? "no salão agora" : "salão livre"}
          spark={[mesasAbertas, Math.max(0, mesasAbertas - 1), mesasAbertas + 1, mesasAbertas]}
          cor={LARANJA}
          pulseKey={pulseKey}
        />
        <LiveKpi
          titulo="Clientes"
          valor={clientesPeriodo}
          sub={`de ${clientes.length} cad.`}
          spark={spark}
          cor={PETROLEO}
          pulseKey={pulseKey}
        />
        <LiveKpi
          titulo="Conclusão"
          valor={`${taxaEntrega}%`}
          sub={`${entregues} entregues no período`}
          cor={PETROLEO}
          pulseKey={pulseKey}
        />
      </div>

      {/* Trilho do gestor */}
      <div>
        <SectionLabel>Trilho do gestor · o que fazer agora</SectionLabel>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <DashCard>
            <ChartHeader
              titulo="Saúde da operação"
              descricao="Índice 0–100 com base em ticket, fila, estoque e tendência."
            />
            <HealthScore score={saude.score} nivel={saude.nivel} escuro={false} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat
                rotulo="Externos pagos"
                valor={fila.externosPagos}
                destaque
              />
              <MiniStat
                rotulo={a.ticket > 0 && a.ticket < META_TICKET ? "Falta p/ meta" : "Meta ticket"}
                valor={
                  a.ticket > 0 && a.ticket < META_TICKET
                    ? formatCurrency(META_TICKET - a.ticket)
                    : formatCurrency(META_TICKET)
                }
              />
            </div>
          </DashCard>

          <DashCard>
            <ChartHeader
              titulo="Prioridades de decisão"
              descricao="Ações por urgência — foque no que move o resultado agora."
            />
            <ul className="space-y-2">
              <AnimatePresence mode="popLayout">
                {prioridades.map((p, i) => (
                  <motion.li
                    key={p.titulo + i}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] px-3 py-2.5"
                  >
                    <span
                      className="inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider"
                      style={{
                        background: p.prio === "media" ? LARANJA : (prioCor[p.prio] || PETROLEO),
                        color: p.prio === "media" ? PETROLEO : "#FFFFFF",
                      }}
                    >
                      {p.prio}
                    </span>
                    <p className="mt-1 text-sm font-black leading-snug text-[#012E46]">{p.titulo}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[#6B7280]">{p.texto}</p>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </DashCard>

          <DashCard className="md:col-span-2 xl:col-span-1">
            <ChartHeader
              titulo="Snapshot operacional"
              descricao="Fila, cancelamentos, estoque e mês de pico no período filtrado."
            />
            <div className="grid grid-cols-2 gap-2">
              <MiniStat rotulo="Em aberto" valor={fila.emAberto} destaque={fila.emAberto > 0} />
              <MiniStat rotulo="Aguard. pag." valor={fila.aguardandoPagamento} destaque={fila.aguardandoPagamento > 0} />
              <MiniStat rotulo="Cancelados" valor={fila.cancelados} />
              <MiniStat rotulo="Melhor mês" valor={mesTopo.label} destaque={mesTopo.valor > 0} />
            </div>
            <p className="mt-3 text-[11px] font-semibold leading-relaxed text-[#6B7280]">
              {produtoTop
                ? `Destaque: ${produtoTop.nome} (${produtoTop.qtd} un). `
                : "Aguardando vendas no período. "}
              Externos: <span className="font-black text-[#012E46]">{fila.externos}</span>
              {" · "}
              Em aberto: <span className="font-black text-[#012E46]">{formatCurrency(fila.emAbertoValor + fila.aguardandoValor)}</span>
            </p>
          </DashCard>
        </div>
      </div>

      {/* Fluxo + Top produtos — metade / metade */}
      <div className="grid gap-3 lg:grid-cols-2 lg:items-stretch">
        <DashCard className="flex h-full min-w-0 flex-col">
          <ChartHeader
            titulo="Fluxo de faturamento"
            descricao="Evolução real do faturamento no período — picos e quedas para agir no horário certo."
          />
          <div className="min-h-0 flex-1">
            <AreaWaveChart
              serie={serie}
              pulseKey={pulseKey}
              tituloValor={formatCurrency(a.faturamento)}
            />
          </div>
        </DashCard>
        <DashCard className="flex h-full min-w-0 flex-col">
          <ChartHeader
            titulo="Top produtos"
            descricao="Itens mais vendidos com base nos pedidos pagos do período."
            acao={(
              <button
                type="button"
                onClick={irParaProdutos}
                className="shrink-0 text-[10px] font-bold text-[#012E46] underline-offset-2 hover:underline"
              >
                Ver cardápio
              </button>
            )}
          />
          <div className="min-h-0 flex-1">
            <HorizontalRankBars itens={a.topProdutos} pulseKey={pulseKey} />
          </div>
        </DashCard>
      </div>

      {/* Ritmo + comparativo */}
      <div className="grid gap-3 lg:grid-cols-2">
        <DashCard>
          <ChartHeader
            titulo="Ritmo por horário"
            descricao="Barras = faturamento · linha = pedidos. Dimensiona equipe no pico."
          />
          <ComposedBarLineChart
            dados={porHora}
            melhorLabel={melhorHora.valor > 0 ? melhorHora.label : ""}
            pulseKey={pulseKey}
          />
        </DashCard>
        <DashCard>
          <ChartHeader
            titulo="Versus período anterior"
            descricao="Variação de faturamento, pedidos e ticket com dados da loja."
          />
          {comparativo ? (
            <div className="space-y-2">
              <div className="flex flex-wrap justify-around gap-2">
                <RadialDelta valor={comparativo.faturamento} rotulo="Fat." />
                <RadialDelta valor={comparativo.pedidos} rotulo="Pedidos" />
                <RadialDelta valor={comparativo.ticket} rotulo="Ticket" />
              </div>
              <CompareLineChart
                atual={comparativo.serieAtual}
                anterior={comparativo.serieAnterior}
                pulseKey={pulseKey}
              />
            </div>
          ) : (
            <p className="py-10 text-center text-sm font-semibold text-[#6B7280]">
              Escolha um período (exceto Tudo) para comparar com o intervalo anterior.
            </p>
          )}
        </DashCard>
      </div>

      {/* Mix — 3 cards confortáveis (1 col mobile · 3 no desktop) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        <DashCard className="sm:col-span-1">
          <ChartHeader
            titulo="Canais de venda"
            descricao="Mesa/QR, externo/delivery e balcão — participação real no faturamento."
          />
          <DonutChart
            dados={canalDonut}
            centroTitulo="Mix"
            centroValor={String(canalDonut.length || "—")}
            pulseKey={pulseKey}
          />
        </DashCard>
        <DashCard className="sm:col-span-1">
          <ChartHeader
            titulo="Status dos pedidos"
            descricao="Pagos, em aberto, aguardando pagamento e cancelados."
          />
          <DonutChart
            dados={statusDonut}
            centroTitulo="Fila"
            centroValor={String(filtrados.length)}
            formato="qtd"
            pulseKey={pulseKey}
          />
          <p className="mt-2 text-center text-[11px] font-semibold text-[#6B7280]">
            Conclusão <span className="font-black text-[#012E46]">{taxaEntrega}%</span>
          </p>
        </DashCard>
        <DashCard className="sm:col-span-2 lg:col-span-1">
          <ChartHeader
            titulo="Categorias do cardápio"
            descricao="Onde o faturamento se concentra — ajuste destaque e promoção."
          />
          <DonutChart
            dados={catDonut}
            centroTitulo="Cardápio"
            centroValor={String(catDonut.length || "—")}
            pulseKey={pulseKey}
          />
        </DashCard>
      </div>

      <p className="pb-2 text-center text-[10px] font-semibold text-[#9CA3AF]">
        Atualização automática a cada 15s · pedidos em tempo real da loja
      </p>
    </div>
  );
}
