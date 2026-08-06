import { useMemo, useState } from "react";
import {
  ChevronDown, X, DoorClosed, DoorOpen, Wallet, CheckCircle2, TrendingUp, Ticket,
  ChefHat, Flame, PackageCheck, PieChart, Hourglass, Bike, UtensilsCrossed, Percent,
} from "lucide-react";
import { MarcaPedidoPrime } from "../../components/BrandLogo";
import { ehPedidoExterno, formatCurrency, orderTotal } from "./pdvHelpers";

/** Paleta local do resumo — tokens oficiais Pedido Prime (identidade-visual). */
const C = {
  petroleo: "#0F4C5C",
  laranja: "#E67E22",
  laranjaTxt: "#A6540E",
  verde: "#5E8C31",
  grafite: "#2D3436",
  borda: "#E6E6E6",
  muted: "#7A868C",
};

/**
 * Faixa de resumo do turno — botão abre detalhe (métricas + análise financeira).
 * Fundo branco, acentos laranja e azul petróleo — leitura rápida do dia.
 */
export default function PdvStatsBar({
  agora,
  mesasDisponiveis = 0,
  mesasOcupadas = 0,
  totalMesas = 0,
  pagamentoPendente = 0,
  pagamentoFinalizado = 0,
  faturamentoDia = 0,
  ticketMedio = 0,
  cozinha = { recebido: 0, preparando: 0, pronto: 0, retirado: 0 },
  contasAbertas = [],
  pagosHoje = [],
  taxaPct = 0,
  /** Só para preview/conferência visual — não usar no PDV real. */
  inicialAberto = false,
}) {
  const [modalAberto, setModalAberto] = useState(!!inicialAberto);
  const dataTurno = agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const horaTurno = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dataCompleta = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <section
      className="shrink-0 border-b bg-white px-3 py-2 sm:px-4 lg:px-4 lg:py-1.5"
      style={{
        borderColor: C.borda,
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
      }}
    >
      {/* Mobile — atalho compacto para a análise do dia */}
      <div className="flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="inline-flex min-h-11 flex-1 items-center gap-2.5 rounded-xl border bg-white px-3 text-left transition active:scale-[0.99]"
          style={{ borderColor: C.borda, boxShadow: "inset 3px 0 0 0 #0F4C5C" }}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.petroleo }}>
              Resumo do turno · {dataTurno} {horaTurno}
            </span>
            <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5 text-sm font-black" style={{ color: C.grafite }}>
              <span style={{ color: C.verde }}>{mesasDisponiveis} livres</span>
              <span style={{ color: C.laranjaTxt }}>{mesasOcupadas} ocup.</span>
              <span style={{ color: C.laranjaTxt }}>{pagamentoPendente} pend.</span>
              <span className="tabular-nums" style={{ color: C.petroleo }}>{formatCurrency(faturamentoDia)}</span>
            </span>
            <span className="mt-0.5 block truncate text-[10px] font-semibold" style={{ color: C.muted }}>
              Cozinha · {cozinha.recebido} receb. · {cozinha.preparando} preparo · {cozinha.pronto} pronto · {cozinha.retirado} retirado
            </span>
          </span>
          <ChevronDown size={16} className="shrink-0" style={{ color: C.petroleo }} aria-hidden="true" />
        </button>
        {pagamentoPendente > 0 && (
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="grid h-11 min-w-11 place-items-center rounded-xl border bg-white px-2 text-xs font-black"
            style={{ borderColor: "rgba(230,126,34,0.35)", color: C.laranjaTxt, background: "rgba(230,126,34,0.08)" }}
            aria-label={`${pagamentoPendente} pagamentos pendentes`}
          >
            {pagamentoPendente}
          </button>
        )}
      </div>

      {/* Desktop — faixa clean: turno · mesa · cozinha · financeiro */}
      <div className="hidden items-stretch gap-2 lg:flex">
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-white px-2.5 text-[11px] font-bold transition hover:border-[var(--pp-primary)] active:scale-[0.99]"
          style={{ borderColor: C.borda, color: C.grafite, boxShadow: "inset 3px 0 0 0 #0F4C5C" }}
        >
          <span style={{ color: C.petroleo }}>Turno</span>
          <span className="font-black" style={{ color: C.grafite }}>{dataTurno} · {horaTurno}</span>
          <ChevronDown size={13} style={{ color: C.laranja }} aria-hidden="true" />
        </button>

        <GrupoInfo titulo="Mesa">
          <Metrica label="Disponíveis" valor={mesasDisponiveis} tom={C.verde} />
          <Metrica label="Ocupadas" valor={mesasOcupadas} tom={C.laranjaTxt} />
        </GrupoInfo>

        <GrupoInfo titulo="Status cozinha" className="min-w-0">
          <Metrica label="Recebido" valor={cozinha.recebido} tom={C.petroleo} />
          <Metrica label="Em preparo" valor={cozinha.preparando} tom={C.laranjaTxt} />
          <Metrica label="Pronto" valor={cozinha.pronto} tom={C.verde} />
          <Metrica label="Retirado" valor={cozinha.retirado} tom={C.grafite} />
          <Metrica label="Aguard. pagto" valor={pagamentoPendente} tom={C.laranjaTxt} />
        </GrupoInfo>

        <GrupoInfo titulo="Financeiro" className="min-w-0 flex-1">
          <Metrica label="Finalizados" valor={pagamentoFinalizado} tom={C.verde} />
          <Metrica label="Faturamento" valor={formatCurrency(faturamentoDia)} tom={C.petroleo} />
          <Metrica label="Ticket médio" valor={formatCurrency(ticketMedio)} tom={C.grafite} />
        </GrupoInfo>
      </div>

      {modalAberto && (
        <ModalResumoTurno
          dataCompleta={dataCompleta}
          horaTurno={horaTurno}
          mesasDisponiveis={mesasDisponiveis}
          mesasOcupadas={mesasOcupadas}
          totalMesas={totalMesas}
          pagamentoPendente={pagamentoPendente}
          pagamentoFinalizado={pagamentoFinalizado}
          faturamentoDia={faturamentoDia}
          ticketMedio={ticketMedio}
          cozinha={cozinha}
          contasAbertas={contasAbertas}
          pagosHoje={pagosHoje}
          taxaPct={taxaPct}
          onFechar={() => setModalAberto(false)}
        />
      )}
    </section>
  );
}

function ModalResumoTurno({
  dataCompleta,
  horaTurno,
  mesasDisponiveis,
  mesasOcupadas,
  totalMesas = 0,
  pagamentoPendente,
  pagamentoFinalizado,
  faturamentoDia,
  ticketMedio,
  cozinha = { recebido: 0, preparando: 0, pronto: 0, retirado: 0 },
  contasAbertas,
  pagosHoje,
  taxaPct = 0,
  onFechar,
}) {
  const analise = useMemo(
    () => montarAnaliseFinanceira({ contasAbertas, pagosHoje, taxaPct, mesasDisponiveis, mesasOcupadas, totalMesas, faturamentoDia }),
    [contasAbertas, pagosHoje, taxaPct, mesasDisponiveis, mesasOcupadas, totalMesas, faturamentoDia],
  );

  const abertas = analise.contasMesa;
  const pagos = analise.pagosOrdenados;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(15,76,92,0.42)] p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Resumo do turno"
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border bg-white shadow-2xl sm:rounded-3xl"
        style={{ borderColor: C.borda, paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Cabeçalho institucional — marca + leitura do dia */}
        <div
          className="flex shrink-0 items-start justify-between gap-3 border-b bg-white px-4 py-3.5 sm:px-5"
          style={{ borderColor: C.borda }}
        >
          <div className="min-w-0">
            <MarcaPedidoPrime size={32} className="mb-2" />
            <h2 className="text-lg font-black tracking-tight sm:text-xl" style={{ color: C.petroleo }}>
              Resumo do turno
            </h2>
            <p className="mt-0.5 text-sm capitalize" style={{ color: C.muted }}>
              {dataCompleta} · {horaTurno}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border bg-white transition hover:bg-[rgba(15,76,92,0.06)]"
            style={{ borderColor: C.borda, color: C.petroleo }}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-white px-4 py-4 sm:px-5">
          {/* KPIs do dia — leitura em 1 olhar */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <CardMetrica Icon={DoorOpen} label="Mesas disponíveis" valor={mesasDisponiveis} tom={C.verde} iconeTom="verde" />
            <CardMetrica Icon={DoorClosed} label="Mesas ocupadas" valor={mesasOcupadas} tom={C.laranjaTxt} iconeTom="laranja" />
            <CardMetrica Icon={Wallet} label="Pag. pendente" valor={pagamentoPendente} tom={C.laranjaTxt} iconeTom="laranja" />
            <CardMetrica Icon={CheckCircle2} label="Pag. finalizado" valor={pagamentoFinalizado} tom={C.verde} iconeTom="verde" />
            <CardMetrica Icon={TrendingUp} label="Faturamento" valor={formatCurrency(faturamentoDia)} tom={C.petroleo} iconeTom="petroleo" destaque />
            <CardMetrica Icon={Ticket} label="Ticket médio" valor={formatCurrency(ticketMedio)} tom={C.petroleo} iconeTom="petroleo" />
          </div>

          {/* Análise financeira — um bloco, uma pergunta: como foi o caixa? */}
          <section>
            <SecaoTitulo Icon={PieChart} titulo="Análise financeira do turno" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <CardMetrica Icon={Hourglass} label="Em aberto" valor={formatCurrency(analise.totalAberto)} tom={C.laranjaTxt} iconeTom="laranja" />
              <CardMetrica Icon={Percent} label="% Ocupação" valor={`${analise.ocupacaoPct}%`} tom={C.petroleo} iconeTom="petroleo" />
              <CardMetrica Icon={UtensilsCrossed} label="Mesas (pago)" valor={formatCurrency(analise.fatMesa)} tom={C.grafite} iconeTom="petroleo" />
              <CardMetrica Icon={Bike} label="Delivery" valor={formatCurrency(analise.fatDelivery)} tom={C.grafite} iconeTom="petroleo" />
            </div>
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              <PainelBranco titulo="Por forma de pagamento">
                {analise.porForma.length === 0 ? (
                  <p className="text-xs font-semibold" style={{ color: C.muted }}>Nenhum pagamento registrado hoje.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {analise.porForma.map((f) => (
                      <li key={f.nome}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                          <span className="truncate font-bold" style={{ color: C.grafite }}>{f.nome}</span>
                          <span className="shrink-0 font-black tabular-nums" style={{ color: C.petroleo }}>{formatCurrency(f.valor)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(15,76,92,0.08)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(4, f.pct)}%`,
                              background: "linear-gradient(90deg, #EC8636 0%, #E67E22 100%)",
                            }}
                          />
                        </div>
                        <p className="mt-0.5 text-[10px] font-semibold" style={{ color: C.muted }}>
                          {f.pct}% · {f.qtd} {f.qtd === 1 ? "pagamento" : "pagamentos"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </PainelBranco>

              <PainelBranco titulo="Indicadores do dia">
                <ul className="space-y-2.5 text-[12px]">
                  <IndicadorLinha label="Pedidos pagos" valor={String(analise.qtdPagos)} />
                  <IndicadorLinha label="Contas em aberto" valor={String(analise.qtdAberto)} />
                  <IndicadorLinha label="Ticket médio mesa" valor={formatCurrency(analise.ticketMesa)} />
                  <IndicadorLinha label="Ticket médio delivery" valor={formatCurrency(analise.ticketDelivery)} />
                  <IndicadorLinha label="Maior venda" valor={formatCurrency(analise.maiorVenda)} />
                  <IndicadorLinha label="Potencial do aberto" valor={formatCurrency(analise.totalAberto)} destaque />
                </ul>
              </PainelBranco>
            </div>
          </section>

          <section>
            <SecaoTitulo Icon={ChefHat} titulo="Status da cozinha" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <CardMetrica Icon={ChefHat} label="Recebido" valor={cozinha.recebido} tom={C.petroleo} iconeTom="petroleo" />
              <CardMetrica Icon={Flame} label="Em preparo" valor={cozinha.preparando} tom={C.laranjaTxt} iconeTom="laranja" />
              <CardMetrica Icon={CheckCircle2} label="Pronto" valor={cozinha.pronto} tom={C.verde} iconeTom="verde" />
              <CardMetrica Icon={PackageCheck} label="Retirado" valor={cozinha.retirado} tom={C.grafite} iconeTom="petroleo" />
            </div>
          </section>

          <section>
            <SecaoTitulo titulo={`Contas em aberto (${abertas.length})`} />
            {abertas.length === 0 ? (
              <p
                className="rounded-xl border border-dashed px-3 py-4 text-center text-sm"
                style={{ borderColor: C.borda, color: C.muted }}
              >
                Nenhuma conta aberta no momento.
              </p>
            ) : (
              <ul className="space-y-2">
                {abertas.map((c) => (
                  <li
                    key={c.key}
                    className="flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5"
                    style={{ borderColor: C.borda }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black" style={{ color: C.petroleo }}>{c.mesa}</p>
                      <p className="truncate text-xs font-semibold" style={{ color: C.muted }}>
                        {c.cliente || "Cliente não identificado"}
                        {c.solicitada ? " · pagamento solicitado" : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-black tabular-nums" style={{ color: C.laranjaTxt }}>
                      {formatCurrency(c.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SecaoTitulo titulo={`Pagamentos de hoje (${pagos.length})`} />
            {pagos.length === 0 ? (
              <p
                className="rounded-xl border border-dashed px-3 py-4 text-center text-sm"
                style={{ borderColor: C.borda, color: C.muted }}
              >
                Nenhum pagamento registrado hoje.
              </p>
            ) : (
              <ul className="space-y-2">
                {pagos.slice(0, 30).map((o) => {
                  const tot = orderTotal(o) * (1 + (Number(taxaPct) || 0) / 100);
                  return (
                    <li
                      key={o.id}
                      className="flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5"
                      style={{ borderColor: C.borda }}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black" style={{ color: C.grafite }}>{o.table || o.command}</p>
                        <p className="truncate text-xs font-semibold" style={{ color: C.muted }}>
                          {o.customer || "Cliente"} · #{o.command || o.id}
                          {o.pagamentoForma ? ` · ${o.pagamentoForma}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-black tabular-nums" style={{ color: C.verde }}>
                        {formatCurrency(tot)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="shrink-0 border-t bg-white px-4 py-3 sm:px-5" style={{ borderColor: C.borda }}>
          <button
            type="button"
            onClick={onFechar}
            className="btn-laranja min-h-12 w-full rounded-2xl text-sm font-black text-white"
          >
            Fechar resumo
          </button>
        </div>
      </div>
    </div>
  );
}

function montarAnaliseFinanceira({
  contasAbertas = [],
  pagosHoje = [],
  taxaPct = 0,
  mesasDisponiveis = 0,
  mesasOcupadas = 0,
  totalMesas = 0,
  faturamentoDia = 0,
}) {
  const fator = 1 + (Number(taxaPct) || 0) / 100;
  const contasMesa = (contasAbertas || []).filter((c) => !c.externo);
  const contasDelivery = (contasAbertas || []).filter((c) => c.externo);
  const totalAberto = (contasAbertas || []).reduce((s, c) => s + (Number(c.total) || 0), 0);

  const pagos = pagosHoje || [];
  let fatMesa = 0;
  let fatDelivery = 0;
  let qtdMesa = 0;
  let qtdDelivery = 0;
  let maiorVenda = 0;
  const mapaForma = {};

  pagos.forEach((o) => {
    const tot = orderTotal(o) * fator;
    maiorVenda = Math.max(maiorVenda, tot);
    if (ehPedidoExterno(o)) {
      fatDelivery += tot;
      qtdDelivery += 1;
    } else {
      fatMesa += tot;
      qtdMesa += 1;
    }
    const formas = String(o.pagamentoForma || "Não informado")
      .split(/\s*\+\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    const lista = formas.length ? formas : ["Não informado"];
    const parte = tot / lista.length;
    lista.forEach((nome) => {
      if (!mapaForma[nome]) mapaForma[nome] = { nome, valor: 0, qtd: 0 };
      mapaForma[nome].valor += parte;
      mapaForma[nome].qtd += 1;
    });
  });

  const baseFat = faturamentoDia > 0 ? faturamentoDia : fatMesa + fatDelivery;
  const porForma = Object.values(mapaForma)
    .map((f) => ({
      ...f,
      pct: baseFat > 0 ? Math.round((f.valor / baseFat) * 100) : 0,
    }))
    .sort((a, b) => b.valor - a.valor);

  const mesasBase = totalMesas > 0 ? totalMesas : mesasDisponiveis + mesasOcupadas;
  const ocupacaoPct = mesasBase > 0 ? Math.round((mesasOcupadas / mesasBase) * 100) : 0;

  const pagosOrdenados = [...pagos].sort(
    (a, b) => new Date(b.updatedAtISO || b.createdAtISO || 0) - new Date(a.updatedAtISO || a.createdAtISO || 0),
  );

  return {
    contasMesa,
    contasDelivery,
    totalAberto,
    fatMesa,
    fatDelivery,
    ticketMesa: qtdMesa ? fatMesa / qtdMesa : 0,
    ticketDelivery: qtdDelivery ? fatDelivery / qtdDelivery : 0,
    maiorVenda,
    porForma,
    ocupacaoPct,
    qtdPagos: pagos.length,
    qtdAberto: (contasAbertas || []).length,
    pagosOrdenados,
  };
}

function SecaoTitulo({ Icon, titulo }) {
  return (
    <h3
      className="mb-2.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em]"
      style={{ color: C.petroleo }}
    >
      {Icon && <Icon size={14} aria-hidden="true" style={{ color: C.laranja }} />}
      {titulo}
    </h3>
  );
}

function PainelBranco({ titulo, children }) {
  return (
    <div className="rounded-xl border bg-white px-3.5 py-3" style={{ borderColor: C.borda }}>
      <p className="mb-2.5 text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: C.petroleo }}>
        {titulo}
      </p>
      {children}
    </div>
  );
}

function IndicadorLinha({ label, valor, destaque }) {
  return (
    <li
      className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
      style={{ borderColor: "rgba(230,230,230,0.9)" }}
    >
      <span className="font-semibold" style={{ color: C.muted }}>{label}</span>
      <span
        className="font-black tabular-nums"
        style={{ color: destaque ? C.laranjaTxt : C.petroleo }}
      >
        {valor}
      </span>
    </li>
  );
}

function GrupoInfo({ titulo, children, className = "" }) {
  return (
    <div
      className={`flex items-center gap-x-2.5 rounded-lg border bg-white px-2.5 py-1 ${className}`}
      style={{ borderColor: C.borda }}
    >
      <span
        className="shrink-0 border-r pr-2 text-[9px] font-black uppercase leading-tight tracking-wide"
        style={{ borderColor: C.borda, color: C.petroleo }}
      >
        {titulo.split(" ").map((p) => (
          <span key={p} className="block">{p}</span>
        ))}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
        {children}
      </div>
    </div>
  );
}

function Metrica({ label, valor, tom }) {
  return (
    <div className="min-w-0 leading-tight">
      <p className="truncate text-[9px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>{label}</p>
      <p className="truncate text-[13px] font-black tabular-nums" style={{ color: tom }}>{valor}</p>
    </div>
  );
}

const ICONE_BG = {
  petroleo: { bg: "rgba(15,76,92,0.10)", fg: C.petroleo },
  laranja: { bg: "rgba(230,126,34,0.12)", fg: C.laranja },
  verde: { bg: "rgba(94,140,49,0.12)", fg: C.verde },
};

function CardMetrica({ Icon, label, valor, tom, iconeTom = "petroleo", destaque = false, className = "" }) {
  const ico = ICONE_BG[iconeTom] || ICONE_BG.petroleo;
  return (
    <div
      className={`rounded-xl border bg-white px-3 py-2.5 ${className}`}
      style={{
        borderColor: destaque ? "rgba(15,76,92,0.28)" : C.borda,
        boxShadow: destaque ? "inset 3px 0 0 0 #0F4C5C" : undefined,
      }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg"
          style={{ background: ico.bg, color: ico.fg }}
        >
          <Icon size={13} aria-hidden="true" />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>{label}</p>
      </div>
      <p className="truncate text-lg font-black tabular-nums leading-none" style={{ color: tom }}>{valor}</p>
    </div>
  );
}
