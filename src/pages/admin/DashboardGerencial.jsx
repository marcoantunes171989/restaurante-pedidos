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

/** Card branco padrão — borda + sombra (compatível com tema claro admin). */
function DashCard({ children, className = "", as: Tag = "section" }) {
  return (
    <Tag
      className={`rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_0_rgba(1,46,70,0.04)] ${className}`}
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

function LiveKpi({ titulo, valor, sub, variacao, spark, cor = PETROLEO, pulseKey }) {
  const reduce = useReducedMotion();
  const up = (variacao || 0) >= 0;
  return (
    <motion.article
      layout
      key={`${titulo}-${pulseKey}`}
      initial={reduce ? false : { opacity: 0.55, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="relative min-w-0 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white px-3.5 py-3 shadow-[0_1px_0_rgba(1,46,70,0.04)]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#012E46] via-[#F38525] to-transparent opacity-80" />
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B7280]">{titulo}</p>
      <p className="mt-0.5 text-xl font-black tabular-nums tracking-tight text-[#012E46] sm:text-2xl">{valor}</p>
      {variacao != null ? (
        <p className={`text-[11px] font-bold ${up ? "text-[#5E8C31]" : "text-[#C81E4A]"}`}>
          {up ? "▲ +" : "▼ "}{Math.abs(variacao).toFixed(0)}% vs ant.
        </p>
      ) : (
        <p className="text-[11px] font-semibold text-[#6B7280]">{sub}</p>
      )}
      <div className="mt-1">
        <Sparkline valores={spark} cor={cor} pulseKey={pulseKey} height={28} />
      </div>
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
 * Dashboard Gerencial — Central de Decisão ao vivo.
 * Cards com identificação clara + decisões do trilho na tela principal.
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
  const abertos = filtrados.filter((o) => o.paymentStatus !== "paid" && o.status !== "cancelled");
  const cancelados = filtrados.filter((o) => o.status === "cancelled").length;
  const semEstoque = products.filter(
    (p) => p.controlaEstoque && (Number(p.estoque) || 0) <= (Number(p.estoqueMinimo) || 5),
  ).length;
  const produtoTop = a.topProdutos[0] || null;
  const entregues = filtrados.filter((o) => o.status === "delivered").length;
  const naoCancel = filtrados.filter((o) => o.status !== "cancelled").length;
  const taxaEntrega = naoCancel ? Math.round((entregues / naoCancel) * 100) : 100;

  const horaAgora = new Date().getHours();
  const labelHora = `${String(horaAgora).padStart(2, "0")}h`;
  const ritmoHora = porHora.find((h) => h.label === labelHora)?.valor ?? 0;
  const ticketGap = a.ticket > 0 ? META_TICKET - a.ticket : null;

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
      abertos: abertos.length,
      cancelados,
      totalPedidos: a.totalPedidos,
      semEstoque,
      mesasAbertas,
      variacaoFat: comparativo?.faturamento,
    }),
    [a.ticket, abertos.length, cancelados, a.totalPedidos, semEstoque, mesasAbertas, comparativo],
  );

  const prioridades = useMemo(
    () => prioridadesDecisao({
      abertos: abertos.length,
      emAbertoValor: a.emAberto,
      semEstoque,
      melhorHora,
      produtoTop,
      ticket: a.ticket,
      taxaEntrega,
    }),
    [abertos.length, a.emAberto, semEstoque, melhorHora, produtoTop, a.ticket, taxaEntrega],
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
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-[0_1px_0_rgba(1,46,70,0.04)] sm:px-5">
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
            Análise assertiva · sync {fmtHora(atualizadoEm)} · pulso {PULSE_MS / 1000}s
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
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

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-5">
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
      </div>

      {/* Trilho do gestor — na tela principal (cards legíveis) */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
          Trilho do gestor · o que fazer agora
        </p>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <DashCard>
            <ChartHeader
              titulo="Saúde da operação"
              descricao="Índice 0–100 para priorizar o turno com base em ticket, fila, estoque e tendência."
            />
            <HealthScore score={saude.score} nivel={saude.nivel} escuro={false} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat
                rotulo={`Ritmo ${horaAgora}h`}
                valor={ritmoHora > 0 ? formatCurrency(ritmoHora) : "—"}
                destaque
              />
              <MiniStat
                rotulo={ticketGap == null ? "Meta ticket" : ticketGap > 0 ? "Falta p/ meta" : "Meta ok"}
                valor={
                  ticketGap == null
                    ? formatCurrency(META_TICKET)
                    : ticketGap > 0
                      ? formatCurrency(ticketGap)
                      : formatCurrency(META_TICKET)
                }
              />
            </div>
          </DashCard>

          <DashCard>
            <ChartHeader
              titulo="Prioridades de decisão"
              descricao="Ações ordenadas por urgência — foque no que move o resultado agora."
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

          <DashCard>
            <ChartHeader
              titulo="Snapshot operacional"
              descricao="Fila, cancelamentos, estoque e horário de pico — leitura rápida do salão."
            />
            <div className="grid grid-cols-2 gap-2">
              <MiniStat rotulo="Em aberto" valor={abertos.length} destaque />
              <MiniStat rotulo="Cancelados" valor={cancelados} />
              <MiniStat rotulo="Estoque ↓" valor={semEstoque} />
              <MiniStat
                rotulo="Melhor hora"
                valor={melhorHora.valor > 0 ? melhorHora.label : "—"}
                destaque
              />
            </div>
            <p className="mt-3 text-[11px] font-semibold leading-relaxed text-[#6B7280]">
              {produtoTop
                ? `Destaque: ${produtoTop.nome} (${produtoTop.qtd} un). `
                : "Aguardando vendas no período. "}
              Em aberto: <span className="font-black text-[#012E46]">{formatCurrency(a.emAberto)}</span>
              {" · "}
              Conclusão: <span className="font-black text-[#012E46]">{taxaEntrega}%</span>
            </p>
          </DashCard>
        </div>
      </div>

      {/* Gráfico protagonista */}
      <DashCard>
        <ChartHeader
          titulo="Fluxo de faturamento"
          descricao="Evolução do faturamento no período — identifica picos e quedas para agir no horário certo."
        />
        <AreaWaveChart
          serie={serie}
          pulseKey={pulseKey}
          tituloValor={formatCurrency(a.faturamento)}
        />
      </DashCard>

      {/* Ritmo + comparativo */}
      <div className="grid gap-3 xl:grid-cols-2">
        <DashCard>
          <ChartHeader
            titulo="Ritmo por horário"
            descricao="Barras = faturamento · linha = pedidos. Use para dimensionar equipe no pico."
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
            descricao="Variação de faturamento, pedidos e ticket — sinaliza se o dia está acima ou abaixo."
          />
          {comparativo ? (
            <div className="space-y-2">
              <div className="flex justify-around">
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

      {/* Mix + top produtos */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DashCard>
          <ChartHeader
            titulo="Canais de venda"
            descricao="Participação mesa/QR vs balcão/delivery no faturamento."
          />
          <DonutChart
            dados={canalDonut}
            centroTitulo="Mix"
            centroValor={String(canalDonut.length || "—")}
            pulseKey={pulseKey}
          />
        </DashCard>
        <DashCard>
          <ChartHeader
            titulo="Status dos pedidos"
            descricao="Fila atual: pagos, em aberto e cancelados — saúde da operação."
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
        <DashCard>
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
        <DashCard>
          <ChartHeader
            titulo="Top produtos"
            descricao="Itens mais vendidos — empurre no caixa e no cardápio."
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
          <HorizontalRankBars itens={a.topProdutos} pulseKey={pulseKey} />
        </DashCard>
      </div>

      <p className="pb-2 text-center text-[10px] font-semibold text-[#9CA3AF]">
        Atualização automática a cada 15s · pedidos em tempo real
      </p>
    </div>
  );
}
