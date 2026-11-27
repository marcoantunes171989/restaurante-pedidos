/**
 * Peças de interface do Dashboard e dos Relatórios: cartões, indicadores,
 * gráficos em SVG/HTML e estados de vazio, carregando e erro.
 *
 * Os gráficos medem a própria largura e desenham em pixels reais, para o
 * texto não encolher no celular. Todos aceitam toque e teclado.
 */
import { useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Minus, RefreshCw, Table2 } from "lucide-react";
import { CORES } from "./cores.js";
import { caminhoSuave, compacto, degrauDeCor, indicesDeRotulo, ticks } from "./escala.js";

const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function cx(...partes) {
  return partes.filter(Boolean).join(" ");
}

/** Mede a largura do elemento e acompanha mudanças de tela ou de layout. */
function useLargura() {
  const [no, setNo] = useState(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    if (!no) return undefined;
    const medir = () => setLargura(Math.floor(no.clientWidth));
    medir();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observador = new ResizeObserver(medir);
    observador.observe(no);
    return () => observador.disconnect();
  }, [no]);
  return [setNo, largura];
}

// ── Estrutura ─────────────────────────────────────────────────
export function Cartao({ titulo, descricao = null, acao = null, children, className = "" }) {
  const id = useId();
  return (
    <section aria-labelledby={titulo ? id : undefined}
      className={cx("flex min-w-0 flex-col rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(1,46,70,0.05)] sm:p-5", className)}>
      {titulo && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <h3 id={id} className="page-title text-[15px] font-semibold leading-snug text-[#012E46]">{titulo}</h3>
            {descricao && <p className="mt-0.5 text-xs leading-snug text-[#667085]">{descricao}</p>}
          </div>
          {acao}
        </header>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

export function LinkCartao({ onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className="-my-1 shrink-0 rounded-lg py-1 text-xs font-semibold text-[#012E46] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F38525]">
      {children}
    </button>
  );
}

export function BotaoAcao({ icone: Icone = null, children, ativo = false, onClick, disabled = false, perigo = false, ...resto }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} {...resto}
      className={cx(
        "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F38525] disabled:cursor-not-allowed disabled:opacity-40",
        ativo
          ? perigo ? "border-[#C81E4A] bg-[#FDF2F5] text-[#C81E4A]" : "border-[#012E46] bg-[#E8EDF0] text-[#012E46]"
          : "border-[#E5E7EB] bg-white text-[#344054] hover:bg-[#F8FAFC]",
      )}>
      {Icone && <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function BarraDeAcoes({ children }) {
  return <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">{children}</div>;
}

// ── Indicadores ───────────────────────────────────────────────
export function Variacao({ valor, comparadoA = "", inverter = false }) {
  if (valor == null || !Number.isFinite(valor)) return null;
  const arredondado = Math.round(valor);
  const bom = inverter ? arredondado < 0 : arredondado > 0;
  const Icone = arredondado === 0 ? Minus : arredondado > 0 ? ArrowUpRight : ArrowDownRight;
  const cor = arredondado === 0 ? "#667085" : bom ? "#1F7A3D" : CORES.perigo;
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-[11px] font-semibold leading-snug" style={{ color: cor }}>
      <span className="inline-flex items-center gap-0.5">
        <Icone className="h-3.5 w-3.5" aria-hidden="true" />
        {arredondado > 0 ? "+" : ""}{arredondado}%
      </span>
      {comparadoA && <span className="font-medium text-[#667085]">vs. {comparadoA}</span>}
    </p>
  );
}

export function Minigrafico({ valores = [], cor = CORES.petroleo }) {
  if (valores.length < 2 || !valores.some((v) => v > 0)) return null;
  const max = Math.max(...valores, 1);
  const pontos = valores.map((v, i) => [(i / (valores.length - 1)) * 100, 22 - (v / max) * 20]);
  const linha = caminhoSuave(pontos);
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full" aria-hidden="true">
      <path d={`${linha} L100,24 L0,24 Z`} fill={cor} fillOpacity="0.08" />
      <path d={linha} fill="none" stroke={cor} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

export function Indicador({ rotulo, valor, detalhe = null, variacao = null, comparadoA = "", inverter = false, serie = null, icone: Icone = null, alerta = false }) {
  return (
    <article className={cx("flex min-w-0 flex-col gap-1 rounded-2xl border bg-white p-3 shadow-[0_1px_2px_rgba(1,46,70,0.05)] sm:p-4", alerta ? "border-[#F38525]" : "border-[#E5E7EB]")}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[10.5px] font-semibold uppercase leading-snug tracking-wider text-[#667085]">{rotulo}</p>
        {Icone && <Icone className="hidden h-4 w-4 shrink-0 text-[#012E46] min-[360px]:block" aria-hidden="true" />}
      </div>
      <p className="font-semibold leading-tight tracking-tight text-[#012E46] [overflow-wrap:anywhere]" style={{ fontSize: "clamp(1.05rem, 5.2vw, 1.25rem)" }}>{valor}</p>
      <Variacao valor={variacao} comparadoA={comparadoA} inverter={inverter} />
      {detalhe && <p className="text-[11px] leading-snug text-[#667085]">{detalhe}</p>}
      {serie && <div className="mt-auto pt-1"><Minigrafico valores={serie} /></div>}
    </article>
  );
}

export function GradeIndicadores({ children, colunas = 4 }) {
  const classes = {
    3: "sm:grid-cols-3",
    4: "md:grid-cols-4",
    5: "sm:grid-cols-3 xl:grid-cols-5",
    6: "sm:grid-cols-3 2xl:grid-cols-6",
  };
  return <div className={cx("grid grid-cols-2 gap-2.5 sm:gap-3", classes[colunas])}>{children}</div>;
}

// ── Estados ───────────────────────────────────────────────────
export function Vazio({ titulo = "Sem dados no período.", dica = "Altere o período ou aguarde novas movimentações.", compactoAltura = false }) {
  return (
    <div className={cx("flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#D0D5DD] px-4 text-center", compactoAltura ? "py-5" : "min-h-[160px] py-8")}>
      <BarChart3 className="mb-1 h-6 w-6 text-[#98A2B3]" aria-hidden="true" />
      <p className="text-sm font-semibold text-[#475467]">{titulo}</p>
      {dica && <p className="text-xs text-[#667085]">{dica}</p>}
    </div>
  );
}

export function Carregando({ rotulo = "Carregando dados de vendas…" }) {
  const bloco = "animate-pulse rounded-2xl bg-[#F1F4F6]";
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{rotulo}</span>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className={cx(bloco, "h-24")} />)}
      </div>
      <div className={cx(bloco, "h-64")} />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cx(bloco, "h-48")} />
        <div className={cx(bloco, "h-48")} />
      </div>
    </div>
  );
}

export function AvisoErro({ mensagem, onTentar = null }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-[#C81E4A]/40 bg-[#FDF2F5] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#C81E4A]" aria-hidden="true" />
        <p className="text-sm font-semibold text-[#7A1230]">{mensagem}</p>
      </div>
      {onTentar && <BotaoAcao icone={RefreshCw} onClick={onTentar}>Tentar novamente</BotaoAcao>}
    </div>
  );
}

/** Hora da última carga e botão que busca os dados de novo. */
export function SituacaoDados({ dados }) {
  const { carregando, atualizadoEm, atualizar } = dados;
  return (
    <div className="flex items-center gap-2">
      {atualizadoEm && (
        <p className="text-[11px] text-[#667085]" aria-live="polite">
          Atualizado às {atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
      {atualizar && (
        <button type="button" onClick={atualizar} disabled={carregando} aria-label="Atualizar dados" title="Atualizar dados"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#012E46] transition hover:bg-[#F8FAFC] disabled:opacity-50">
          <RefreshCw className={cx("h-4 w-4", carregando && "animate-spin")} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ── Gráfico de tendência (área + período anterior) ────────────
export function GraficoTendencia({ pontos = [], temAnterior = false, formatar = moeda, rotuloAtual = "Período atual", rotuloAnterior = "Período anterior", descricaoQtd = "pedido(s)", titulo = "Faturamento no tempo", rotuloColunaQtd = "Ped." }) {
  const [ref, largura] = useLargura();
  const [ativo, setAtivo] = useState(null);
  const [tabela, setTabela] = useState(false);
  const semMovimento = useReducedMotion();
  const gid = useId();

  if (!pontos.length) return <Vazio titulo="Nenhuma venda no período." />;

  const altura = largura && largura < 480 ? 200 : 260;
  const margem = { e: 46, d: 10, t: 10, b: 24 };
  const w = Math.max(0, largura - margem.e - margem.d);
  const h = altura - margem.t - margem.b;
  const marcas = ticks(Math.max(...pontos.map((p) => Math.max(p.valor, p.anterior || 0))));
  const topo = marcas.at(-1);
  const n = pontos.length;
  const x = (i) => margem.e + (n > 1 ? (i / (n - 1)) * w : w / 2);
  const y = (v) => margem.t + h - (v / topo) * h;
  const linha = caminhoSuave(pontos.map((p, i) => [x(i), y(p.valor)]));
  const linhaAnt = temAnterior ? caminhoSuave(pontos.map((p, i) => [x(i), y(p.anterior || 0)])) : "";
  const sel = ativo != null && ativo < n ? pontos[ativo] : null;

  function apontar(e) {
    const caixa = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - caixa.left - margem.e) / (w || 1);
    setAtivo(Math.max(0, Math.min(n - 1, Math.round(pos * (n - 1)))));
  }
  function teclas(e) {
    if (e.key === "ArrowRight") { e.preventDefault(); setAtivo((a) => Math.min(n - 1, a == null ? 0 : a + 1)); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setAtivo((a) => Math.max(0, a == null ? n - 1 : a - 1)); }
    if (e.key === "Escape") setAtivo(null);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-[#475467]">
          {temAnterior && (
            <>
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: CORES.petroleo }} />{rotuloAtual}</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: CORES.neutro }} />{rotuloAnterior}</span>
            </>
          )}
        </div>
        <button type="button" onClick={() => setTabela((t) => !t)} aria-pressed={tabela}
          className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-[#012E46] hover:bg-[#F8FAFC]">
          <Table2 className="h-3.5 w-3.5" aria-hidden="true" />{tabela ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>

      {tabela ? (
        <div className="max-h-[260px] overflow-y-auto rounded-xl border border-[#E5E7EB]">
          <table className="w-full table-fixed border-collapse text-xs">
            <thead className="sticky top-0 bg-[#F8FAFC] text-[10px] uppercase tracking-wide text-[#667085]">
              <tr>
                <th className="px-2 py-2 text-left">Quando</th>
                <th className="px-2 py-2 text-right">Atual</th>
                {temAnterior && <th className="px-2 py-2 text-right">Anterior</th>}
                <th className="w-16 px-2 py-2 text-right">{rotuloColunaQtd}</th>
              </tr>
            </thead>
            <tbody>
              {pontos.map((p) => (
                <tr key={p.chave} className="border-t border-[#F1F4F6] tabular-nums text-[#344054]">
                  <td className="px-2 py-1.5 font-semibold">{p.rotulo}</td>
                  <td className="px-2 py-1.5 text-right">{formatar(p.valor)}</td>
                  {temAnterior && <td className="px-2 py-1.5 text-right text-[#667085]">{formatar(p.anterior || 0)}</td>}
                  <td className="px-2 py-1.5 text-right">{p.qtd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative w-full" style={{ height: altura }}>
          {largura > 0 && (
            <svg width={largura} height={altura} role="img" tabIndex={0}
              aria-label={`${titulo}, ${n} ponto(s). Use as setas para percorrer.`}
              className="block touch-pan-y outline-none focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F38525]"
              onPointerMove={apontar} onPointerDown={apontar}
              onPointerLeave={(e) => { if (e.pointerType === "mouse") setAtivo(null); }}
              onKeyDown={teclas} onBlur={() => setAtivo(null)}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CORES.petroleo} stopOpacity="0.20" />
                  <stop offset="100%" stopColor={CORES.petroleo} stopOpacity="0" />
                </linearGradient>
              </defs>
              {marcas.map((m) => (
                <g key={m}>
                  <line x1={margem.e} x2={margem.e + w} y1={y(m)} y2={y(m)} stroke={CORES.grade} />
                  <text x={margem.e - 6} y={y(m) + 3} textAnchor="end" fontSize="10" fill={CORES.eixo}>{compacto(m)}</text>
                </g>
              ))}
              {indicesDeRotulo(n, w).map((i) => (
                <text key={i} x={x(i)} y={altura - 7} textAnchor={n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="10" fill={CORES.eixo}>{pontos[i].rotulo}</text>
              ))}
              {n > 1 && <path d={`${linha} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${gid})`} />}
              {linhaAnt && <path d={linhaAnt} fill="none" stroke={CORES.neutro} strokeWidth="2" strokeDasharray="5 4" />}
              <motion.path key={`${n}-${pontos[0].chave}`} d={linha} fill="none" stroke={CORES.petroleo} strokeWidth="2.5" strokeLinecap="round"
                initial={semMovimento ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: "easeOut" }} />
              {n <= 16 && pontos.map((p, i) => <circle key={p.chave} cx={x(i)} cy={y(p.valor)} r="4" fill={CORES.petroleo} stroke="#FFFFFF" strokeWidth="2" />)}
              {sel && (
                <g pointerEvents="none">
                  <line x1={x(ativo)} x2={x(ativo)} y1={margem.t} y2={margem.t + h} stroke={CORES.petroleo} strokeOpacity="0.35" />
                  <circle cx={x(ativo)} cy={y(sel.valor)} r="5.5" fill={CORES.laranja} stroke="#FFFFFF" strokeWidth="2" />
                </g>
              )}
            </svg>
          )}
          {sel && largura > 0 && (
            <div role="status" className="pointer-events-none absolute top-1 z-10 w-40 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-[11px] shadow-[0_8px_24px_rgba(1,46,70,0.14)]"
              style={{ left: Math.max(0, Math.min(largura - 160, x(ativo) > largura / 2 ? x(ativo) - 172 : x(ativo) + 12)) }}>
              <p className="font-semibold text-[#475467]">{sel.rotulo}</p>
              <p className="text-sm font-semibold text-[#012E46]">{formatar(sel.valor)}</p>
              <p className="text-[#667085]">{sel.qtd} {descricaoQtd}</p>
              {temAnterior && <p className="mt-0.5 text-[#667085]">Anterior: {formatar(sel.anterior || 0)}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Colunas (horas, dias da semana, faixas) ───────────────────
export function GraficoColunas({ dados = [], formatar = moeda, formatarEixo = compacto, detalhe = null, destacarMaior = true, rotuloMaior = "Maior", altura = 190 }) {
  const [ref, largura] = useLargura();
  const [ativo, setAtivo] = useState(null);
  const semMovimento = useReducedMotion();

  if (!dados.length || !dados.some((d) => d.valor > 0)) return <Vazio />;

  const margem = { e: 40, d: 4, t: 10, b: 22 };
  const w = Math.max(0, largura - margem.e - margem.d);
  const h = altura - margem.t - margem.b;
  const maior = Math.max(...dados.map((d) => d.valor));
  const marcas = ticks(maior, 3);
  const topo = marcas.at(-1);
  const faixa = w / dados.length;
  const barra = Math.max(3, Math.min(44, faixa - Math.max(2, faixa * 0.3)));
  const iMaior = dados.findIndex((d) => d.valor === maior);
  const iSel = ativo != null && ativo < dados.length ? ativo : iMaior;
  const sel = dados[iSel];
  const rotulos = new Set(indicesDeRotulo(dados.length, w, Math.max(30, ...dados.map((d) => d.rotulo.length * 6.5))));

  return (
    <div>
      <div ref={ref} className="w-full" style={{ height: altura }}>
        {largura > 0 && (
          <svg width={largura} height={altura} className="block" role="group" aria-label="Gráfico de colunas">
            {marcas.map((m) => (
              <g key={m}>
                <line x1={margem.e} x2={margem.e + w} y1={margem.t + h - (m / topo) * h} y2={margem.t + h - (m / topo) * h} stroke={CORES.grade} />
                <text x={margem.e - 6} y={margem.t + h - (m / topo) * h + 3} textAnchor="end" fontSize="10" fill={CORES.eixo}>{formatarEixo(m)}</text>
              </g>
            ))}
            {dados.map((d, i) => {
              const alt = d.valor > 0 ? Math.max(3, (d.valor / topo) * h) : 0;
              const bx = margem.e + i * faixa + (faixa - barra) / 2;
              const by = margem.t + h - alt;
              const r = Math.min(4, barra / 2, alt);
              const forma = `M${bx},${margem.t + h} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + barra - r} Q${bx + barra},${by} ${bx + barra},${by + r} V${margem.t + h} Z`;
              const cor = destacarMaior && i === iMaior ? CORES.laranja : CORES.petroleo;
              return (
                <g key={`${d.rotulo}-${i}`} role="img" tabIndex={0} className="pp-chart-focus-svg cursor-pointer"
                  aria-label={`${d.rotulo}: ${formatar(d.valor)}`}
                  onPointerEnter={() => setAtivo(i)} onPointerDown={() => setAtivo(i)} onFocus={() => setAtivo(i)}
                  onPointerLeave={(e) => { if (e.pointerType === "mouse") setAtivo(null); }}>
                  <rect x={margem.e + i * faixa} y={margem.t} width={faixa} height={h} fill="transparent" />
                  {alt > 0 && (
                    <motion.path d={forma} fill={cor} opacity={ativo != null && ativo !== i ? 0.45 : 1}
                      initial={semMovimento ? false : { scaleY: 0 }} animate={{ scaleY: 1 }}
                      style={{ transformBox: "fill-box", originY: 1 }} transition={{ duration: 0.45, delay: Math.min(i * 0.015, 0.3) }} />
                  )}
                  {rotulos.has(i) && <text x={bx + barra / 2} y={altura - 6} textAnchor="middle" fontSize="10" fill={CORES.eixo}>{d.rotulo}</text>}
                </g>
              );
            })}
          </svg>
        )}
      </div>
      {sel && (
        <p className="mt-2 rounded-xl bg-[#F8FAFC] px-3 py-2 text-xs text-[#475467]" aria-live="polite">
          <span className="font-semibold text-[#012E46]">{ativo == null ? `${rotuloMaior}: ` : ""}{sel.rotulo}</span>
          {" · "}<span className="font-semibold text-[#012E46]">{formatar(sel.valor)}</span>
          {detalhe ? ` · ${detalhe(sel)}` : ""}
        </p>
      )}
    </div>
  );
}

// ── Ranking em barras horizontais ─────────────────────────────
/**
 * itens: [{ chave, rotulo, valor, texto?, detalhe?, variacao?, cor? }]
 * `texto` substitui o valor formatado.
 */
export function Ranking({ itens = [], formatar = moeda, numerar = true, destacarPrimeiro = true, maximo = null, aoClicar = null, vazio = "Sem dados no período.", comparadoA = "" }) {
  const semMovimento = useReducedMotion();
  if (!itens.length) return <Vazio titulo={vazio} dica="" compactoAltura />;
  const topo = maximo || Math.max(...itens.map((i) => i.valor), 1);
  return (
    <ol className="space-y-3">
      {itens.map((item, i) => {
        const conteudo = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-2">
                {numerar && <span className="w-4 shrink-0 text-right text-[11px] font-semibold text-[#98A2B3]">{i + 1}</span>}
                <span className="min-w-0 text-[13px] font-semibold leading-snug text-[#1F2933] [overflow-wrap:anywhere]">{item.rotulo}</span>
              </span>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#012E46]">{item.texto ?? formatar(item.valor)}</span>
            </span>
            <span className={cx("mt-1.5 block h-2 overflow-hidden rounded-full bg-[#F1F4F6]", numerar && "ml-6")}>
              <motion.span className="block h-full rounded-full"
                style={{ background: item.cor || (destacarPrimeiro && i === 0 ? CORES.laranja : CORES.petroleo) }}
                initial={semMovimento ? false : { width: 0 }}
                animate={{ width: `${Math.max(item.valor > 0 ? 2 : 0, Math.min(100, (item.valor / topo) * 100))}%` }}
                transition={{ duration: 0.5, delay: Math.min(i * 0.03, 0.3) }} />
            </span>
            {(item.detalhe || item.variacao != null) && (
              <span className={cx("mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-[#667085]", numerar && "ml-6")}>
                {item.detalhe && <span>{item.detalhe}</span>}
                {item.variacao != null && <Variacao valor={item.variacao} comparadoA={comparadoA} />}
              </span>
            )}
          </>
        );
        return (
          <li key={item.chave ?? item.rotulo}>
            {aoClicar
              ? <button type="button" onClick={() => aoClicar(item)} className="block w-full rounded-lg text-left transition hover:bg-[#F8FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F38525]">{conteudo}</button>
              : conteudo}
          </li>
        );
      })}
    </ol>
  );
}

// ── Composição (parte do todo) ────────────────────────────────
/** partes: [{ rotulo, valor, cor, detalhe? }] — substitui gráficos de rosca. */
export function Composicao({ partes = [], formatar = moeda, vazio = "Sem dados no período." }) {
  const [ativo, setAtivo] = useState(null);
  const semMovimento = useReducedMotion();
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (!(total > 0)) return <Vazio titulo={vazio} dica="" compactoAltura />;
  const pct = (v) => {
    const p = (v / total) * 100;
    return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
  };
  const visiveis = partes.filter((p) => p.valor > 0);
  return (
    <div>
      <motion.div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true"
        initial={semMovimento ? false : { opacity: 0, scaleX: 0.6 }} animate={{ opacity: 1, scaleX: 1 }} style={{ originX: 0 }}>
        {visiveis.map((p) => (
          <span key={p.rotulo} className="block h-full transition-opacity" onPointerEnter={() => setAtivo(p.rotulo)} onPointerLeave={() => setAtivo(null)}
            style={{ flexGrow: p.valor, flexBasis: 0, minWidth: 6, background: p.cor, opacity: ativo && ativo !== p.rotulo ? 0.35 : 1 }} />
        ))}
      </motion.div>
      <ul className="mt-3 space-y-1">
        {partes.map((p) => (
          <li key={p.rotulo} onPointerEnter={() => setAtivo(p.rotulo)} onPointerLeave={() => setAtivo(null)}
            className={cx("flex items-start justify-between gap-3 rounded-lg px-1.5 py-1", ativo === p.rotulo && "bg-[#F8FAFC]")}>
            <span className="flex min-w-0 items-start gap-2">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.cor }} />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-snug text-[#1F2933]">{p.rotulo}</span>
                {p.detalhe && <span className="block text-[11px] text-[#667085]">{p.detalhe}</span>}
              </span>
            </span>
            <span className="shrink-0 text-right tabular-nums">
              <span className="block text-[13px] font-semibold text-[#012E46]">{formatar(p.valor)}</span>
              <span className="block text-[11px] text-[#667085]">{pct(p.valor)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Mapa de calor (dia da semana × hora) ──────────────────────
export function MapaCalor({ dados, formatar = moeda }) {
  const [ref, largura] = useLargura();
  const [ativo, setAtivo] = useState(null);
  const { dias, horas, celulas, max, melhor } = dados;

  if (!horas.length) return <Vazio />;

  // Em telas estreitas as horas viram linhas: sete colunas cabem sem rolagem.
  const emPe = largura > 0 && largura < 40 + horas.length * 30;
  const colunas = emPe ? dias : horas;
  const linhas = emPe ? horas : dias;
  const celula = (l, c) => (emPe ? { di: c, hi: l } : { di: l, hi: c });
  const rotulos = new Set(indicesDeRotulo(colunas.length, largura - 40, 30));
  const sel = ativo && celulas[ativo.di]?.[ativo.hi] ? ativo : null;

  return (
    <div ref={ref} className="w-full">
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `34px repeat(${colunas.length}, minmax(0, 1fr))` }}>
        <span />
        {colunas.map((c, i) => (
          <span key={c} className="overflow-visible whitespace-nowrap text-center text-[10px] font-semibold text-[#667085]">{rotulos.has(i) ? c : ""}</span>
        ))}
        {linhas.map((rotuloLinha, l) => (
          <div key={rotuloLinha} className="contents">
            <span className="flex items-center text-[10px] font-semibold text-[#667085]">{rotuloLinha}</span>
            {colunas.map((_, c) => {
              const { di, hi } = celula(l, c);
              const v = celulas[di][hi];
              const grau = degrauDeCor(v.valor, max);
              const marcado = sel && sel.di === di && sel.hi === hi;
              return (
                <button key={c} type="button"
                  aria-label={`${dias[di]} ${horas[hi]}: ${v.qtd ? `${formatar(v.valor)}, ${v.qtd} pedido(s)` : "sem vendas"}`}
                  onPointerEnter={() => setAtivo({ di, hi })} onFocus={() => setAtivo({ di, hi })} onClick={() => setAtivo({ di, hi })}
                  onPointerLeave={(e) => { if (e.pointerType === "mouse") setAtivo(null); }}
                  className="block w-full rounded-[4px] p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F38525]"
                  style={{
                    height: emPe ? 22 : 28,
                    minHeight: 0,
                    background: grau < 0 ? CORES.vazio : CORES.rampa[grau],
                    boxShadow: marcado ? `0 0 0 2px ${CORES.laranja}` : "none",
                  }} />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#667085]">
        <p aria-live="polite" className="text-xs text-[#475467]">
          {sel ? (
            <><span className="font-semibold text-[#012E46]">{dias[sel.di]} · {horas[sel.hi]}</span> — {formatar(celulas[sel.di][sel.hi].valor)} · {celulas[sel.di][sel.hi].qtd} pedido(s)</>
          ) : melhor ? (
            <>Mais forte: <span className="font-semibold text-[#012E46]">{melhor.dia} · {melhor.hora}</span> — {formatar(melhor.valor)} · {melhor.qtd} pedido(s)</>
          ) : null}
        </p>
        <span className="inline-flex items-center gap-1" aria-hidden="true">
          menos
          {CORES.rampa.map((c) => <span key={c} className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />)}
          mais
        </span>
      </div>
    </div>
  );
}

// ── Listas e tabelas ──────────────────────────────────────────
export function Paginador({ pagina, total, porPagina, onMudar, rotulo = "item(ns)" }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (total <= porPagina) return null;
  return (
    <nav aria-label="Paginação" className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-[#667085]">
        {(pagina - 1) * porPagina + 1}–{Math.min(total, pagina * porPagina)} de {total} {rotulo}
      </p>
      <div className="flex items-center gap-2">
        <BotaoAcao onClick={() => onMudar(pagina - 1)} disabled={pagina <= 1}>Anterior</BotaoAcao>
        <span className="text-xs font-semibold tabular-nums text-[#012E46]">{pagina}/{paginas}</span>
        <BotaoAcao onClick={() => onMudar(pagina + 1)} disabled={pagina >= paginas}>Próxima</BotaoAcao>
      </div>
    </nav>
  );
}

/** Par rótulo/valor usado nos cartões de linha em telas estreitas. */
export function Dado({ rotulo, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#667085]">{rotulo}</dt>
      <dd className="text-[13px] font-semibold text-[#1F2933] [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}
