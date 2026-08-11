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
      className="relative min-w-0 overflow-hidden px-1 py-1"
    >
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

/**
 * Dashboard Gerencial — Central de Decisão ao vivo.
 * Pulso visual a cada 15s + pedidos em tempo real (Supabase).
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
    setRestante(15);
    const tick = setInterval(() => {
      setRestante((s) => {
        if (s <= 1) {
          setPulseKey((k) => k + 1);
          setAtualizadoEm(new Date());
          setFlash(true);
          setTimeout(() => setFlash(false), 900);
          return 15;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [periodo]);

  useEffect(() => {
    const sig = `${orders.length}|${orders.map((o) => `${o.id}:${o.paymentStatus || ""}:${o.status || ""}`).join("|")}`;
    if (prevSig.current && prevSig.current !== sig) {
      setPulseKey((k) => k + 1);
      setAtualizadoEm(new Date());
      setRestante(15);
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 900);
      prevSig.current = sig;
      return () => clearTimeout(t);
    }
    prevSig.current = sig;
    return undefined;
  }, [orders]);

  const prioCor = { alta: "#C81E4A", media: LARANJA, baixa: PETROLEO };

  return (
    <div className="-mx-1 min-h-[calc(100dvh-5.5rem)] lg:-mx-2">
      <div
        className="relative overflow-hidden rounded-[1.75rem] border border-[#E5E7EB] bg-white"
        style={{
          backgroundImage:
            "radial-gradient(1100px 400px at 8% -12%, rgba(1,46,70,0.07), transparent 55%), radial-gradient(800px 360px at 92% 0%, rgba(243,133,37,0.09), transparent 48%)",
        }}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB]/80 px-4 py-3 sm:px-5">
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
                  onClick={() => setPeriodo(p.id)}
                />
              ))}
            </div>
            <RefreshCountdown segundos={15} restante={restante} />
          </div>
        </header>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
          {/* CANVAS — superfície contínua */}
          <div className="min-w-0 p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-[#E5E7EB]/80 pb-4 xl:grid-cols-5">
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

            <section className="pt-4">
              <AreaWaveChart
                serie={serie}
                pulseKey={pulseKey}
                tituloValor={formatCurrency(a.faturamento)}
              />
            </section>

            <div className="mt-2 grid gap-6 border-t border-[#E5E7EB]/80 pt-5 xl:grid-cols-2">
              <section>
                <div className="mb-2 flex items-end justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-black text-[#012E46]">Ritmo por horário</h2>
                    <p className="text-[11px] font-semibold text-[#6B7280]">Barras = fat. · linha = pedidos</p>
                  </div>
                </div>
                <ComposedBarLineChart
                  dados={porHora}
                  melhorLabel={melhorHora.valor > 0 ? melhorHora.label : ""}
                  pulseKey={pulseKey}
                />
              </section>
              <section>
                <div className="mb-2">
                  <h2 className="text-sm font-black text-[#012E46]">Versus período anterior</h2>
                  <p className="text-[11px] font-semibold text-[#6B7280]">Tendência para decisão rápida</p>
                </div>
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
                    Escolha um período (exceto Tudo) para comparar.
                  </p>
                )}
              </section>
            </div>

            <div className="mt-5 grid gap-5 border-t border-[#E5E7EB]/80 pt-5 md:grid-cols-3">
              <section>
                <h2 className="mb-2 text-sm font-black text-[#012E46]">Canais</h2>
                <DonutChart dados={canalDonut} centroTitulo="Mix" centroValor={String(canalDonut.length || "—")} pulseKey={pulseKey} />
              </section>
              <section>
                <h2 className="mb-2 text-sm font-black text-[#012E46]">Status</h2>
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
              </section>
              <section>
                <h2 className="mb-2 text-sm font-black text-[#012E46]">Categorias</h2>
                <DonutChart dados={catDonut} centroTitulo="Cardápio" centroValor={String(catDonut.length || "—")} pulseKey={pulseKey} />
              </section>
            </div>
          </div>

          {/* TRILHO LATERAL — decisões */}
          <aside className="border-t border-[#E5E7EB] bg-[#012E46] text-white lg:min-h-[calc(100dvh-5.5rem)] lg:border-l lg:border-t-0">
            <div className="sticky top-0 flex max-h-[calc(100dvh-6rem)] flex-col gap-5 overflow-y-auto p-4 sm:p-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Trilho do gestor</p>
                <h2 className="mt-1 text-lg font-black tracking-tight">O que fazer agora</h2>
              </div>

              <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                <HealthScore score={saude.score} nivel={saude.nivel} escuro />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/10 px-2.5 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">Ritmo agora</p>
                  <p className="mt-0.5 text-base font-black tabular-nums text-[#F38525]">
                    {ritmoHora > 0 ? formatCurrency(ritmoHora) : "—"}
                  </p>
                  <p className="text-[10px] font-semibold text-white/60">{horaAgora}h · fat. da hora</p>
                </div>
                <div className="rounded-xl bg-white/10 px-2.5 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">Meta ticket</p>
                  <p className="mt-0.5 text-base font-black tabular-nums text-white">
                    {formatCurrency(META_TICKET)}
                  </p>
                  <p className={`text-[10px] font-semibold ${ticketGap != null && ticketGap > 0 ? "text-[#F38525]" : "text-[#5E8C31]"}`}>
                    {ticketGap == null
                      ? "sem vendas ainda"
                      : ticketGap > 0
                        ? `faltam ${formatCurrency(ticketGap)}`
                        : "meta atingida"}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Prioridades</p>
                <ul className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {prioridades.map((p, i) => (
                      <motion.li
                        key={p.titulo + i}
                        layout
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="rounded-xl bg-white px-3 py-2.5 text-[#012E46]"
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
                        <p className="mt-1 text-sm font-black leading-snug">{p.titulo}</p>
                        <p className="mt-0.5 text-[11px] font-semibold text-[#6B7280]">{p.texto}</p>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Top produtos</p>
                  <button
                    type="button"
                    onClick={irParaProdutos}
                    className="text-[10px] font-bold text-[#F38525] underline-offset-2 hover:underline"
                  >
                    Ver cardápio
                  </button>
                </div>
                <div className="rounded-2xl bg-white p-3 text-[#012E46]">
                  <HorizontalRankBars itens={a.topProdutos} pulseKey={pulseKey} />
                </div>
              </div>

              <div className="space-y-2 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Snapshot</p>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-white/10 px-2 py-2">
                    <p className="text-lg font-black tabular-nums text-[#F38525]">{abertos.length}</p>
                    <p className="text-[10px] font-bold uppercase text-white/70">Em aberto</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-2 py-2">
                    <p className="text-lg font-black tabular-nums text-white">{cancelados}</p>
                    <p className="text-[10px] font-bold uppercase text-white/70">Cancelados</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-2 py-2">
                    <p className="text-lg font-black tabular-nums text-white">{semEstoque}</p>
                    <p className="text-[10px] font-bold uppercase text-white/70">Estoque ↓</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-2 py-2">
                    <p className="text-lg font-black tabular-nums text-[#F38525]">
                      {melhorHora.valor > 0 ? melhorHora.label : "—"}
                    </p>
                    <p className="text-[10px] font-bold uppercase text-white/70">Melhor hora</p>
                  </div>
                </div>
                <p className="pt-1 text-[11px] font-semibold leading-relaxed text-white/75">
                  {produtoTop
                    ? `Destaque: ${produtoTop.nome} (${produtoTop.qtd} un).`
                    : "Aguardando vendas no período selecionado."}
                  {" "}
                  Em aberto: {formatCurrency(a.emAberto)}. Taxa de conclusão {taxaEntrega}%.
                </p>
              </div>

              <p className="mt-auto text-center text-[10px] font-semibold text-white/40">
                Atualização automática a cada 15s · pedidos em tempo real
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
