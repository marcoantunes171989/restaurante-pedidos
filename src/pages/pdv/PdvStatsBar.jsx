import { useMemo, useState } from "react";
import {
  ChevronDown, X, DoorClosed, DoorOpen, Wallet, CheckCircle2, TrendingUp, Ticket,
  ChefHat, Flame, PackageCheck, PieChart, Hourglass, Bike, UtensilsCrossed, Percent,
} from "lucide-react";
import { ehPedidoExterno, formatCurrency, orderTotal } from "./pdvHelpers";

/**
 * Faixa de resumo do turno — botão abre detalhe (métricas + análise financeira).
 * Padrão clean/branco alinhado ao restante do PDV Pedido Prime.
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
}) {
  const [modalAberto, setModalAberto] = useState(true);
  const dataTurno = agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const horaTurno = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dataCompleta = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <section
      className="shrink-0 border-b border-[var(--pp-border)] bg-white px-3 py-2 sm:px-4 lg:px-4 lg:py-1.5"
      style={{ paddingLeft: "max(0.75rem, env(safe-area-inset-left))", paddingRight: "max(0.75rem, env(safe-area-inset-right))" }}
    >
      {/* Mobile */}
      <div className="flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="inline-flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-[var(--pp-border)] bg-white px-3 text-left shadow-[inset_0_0_0_1px_rgba(15,76,92,0.04)] active:scale-[0.99]"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">Resumo do turno · {dataTurno} {horaTurno}</span>
            <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-black text-[var(--pp-text)]">
              <span className="text-[#1F7A3D]">{mesasDisponiveis} livres</span>
              <span className="text-[var(--pp-primary-text)]">{mesasOcupadas} ocup.</span>
              <span className="text-[#8D6708]">{pagamentoPendente} pend.</span>
              <span className="tabular-nums">{formatCurrency(faturamentoDia)}</span>
            </span>
            <span className="block truncate text-[10px] font-bold text-[var(--pp-text-muted)]">
              Cozinha · {cozinha.recebido} receb. · {cozinha.preparando} preparo · {cozinha.pronto} pronto · {cozinha.retirado} retirado
            </span>
          </span>
          <ChevronDown size={16} className="shrink-0 text-[var(--pp-text-muted)]" aria-hidden="true" />
        </button>
        {pagamentoPendente > 0 && (
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="grid h-11 min-w-11 place-items-center rounded-xl border border-[#F5DFA3] bg-white px-2 text-xs font-black text-[#8D6708]"
          >
            {pagamentoPendente}
          </button>
        )}
      </div>

      {/* Desktop — turno · mesa · cozinha · financeiro */}
      <div className="hidden items-stretch gap-2 lg:flex">
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--pp-border)] bg-white px-2.5 text-[11px] font-bold text-[var(--pp-text-body)] shadow-[inset_0_0_0_1px_rgba(15,76,92,0.03)] transition hover:border-[var(--pp-primary)] active:scale-[0.99]"
        >
          <span className="text-[var(--pp-text-muted)]">Turno</span>
          <span className="font-black text-[var(--pp-text)]">{dataTurno} · {horaTurno}</span>
          <ChevronDown size={13} aria-hidden="true" />
        </button>

        <GrupoInfo titulo="Mesa">
          <Metrica label="Disponíveis" valor={mesasDisponiveis} tom="text-[#1F7A3D]" />
          <Metrica label="Ocupadas" valor={mesasOcupadas} tom="text-[var(--pp-primary-text)]" />
        </GrupoInfo>

        <GrupoInfo titulo="Status cozinha" className="min-w-0">
          <Metrica label="Recebido" valor={cozinha.recebido} tom="text-[#0F4C5C]" />
          <Metrica label="Em preparo" valor={cozinha.preparando} tom="text-[var(--pp-primary-text)]" />
          <Metrica label="Pronto" valor={cozinha.pronto} tom="text-[#1F7A3D]" />
          <Metrica label="Retirado" valor={cozinha.retirado} tom="text-[var(--pp-text-body)]" />
          <Metrica label="Aguard. pagto" valor={pagamentoPendente} tom="text-[#8D6708]" />
        </GrupoInfo>

        <GrupoInfo titulo="Financeiro" className="min-w-0 flex-1">
          <Metrica label="Finalizados" valor={pagamentoFinalizado} tom="text-[#1F7A3D]" />
          <Metrica label="Faturamento" valor={formatCurrency(faturamentoDia)} tom="text-[var(--pp-text)]" />
          <Metrica label="Ticket médio" valor={formatCurrency(ticketMedio)} tom="text-[var(--pp-text)]" />
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
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Resumo do turno"
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-[var(--pp-border)] bg-white shadow-2xl sm:rounded-3xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--pp-border)] bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--pp-primary-text)]">Pedido Prime</p>
            <h2 className="text-base font-black text-[var(--pp-text)] sm:text-lg">Resumo do turno</h2>
            <p className="mt-0.5 text-sm capitalize text-[var(--pp-text-muted)]">{dataCompleta} · {horaTurno}</p>
          </div>
          <button type="button" onClick={onFechar} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--pp-border)] bg-white" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-white px-4 py-4 sm:px-5">
          {/* KPIs principais */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <CardMetrica Icon={DoorOpen} label="Mesas disponíveis" valor={mesasDisponiveis} tom="text-[#1F7A3D]" />
            <CardMetrica Icon={DoorClosed} label="Mesas ocupadas" valor={mesasOcupadas} tom="text-[var(--pp-primary-text)]" />
            <CardMetrica Icon={Wallet} label="Pag. pendente" valor={pagamentoPendente} tom="text-[#8D6708]" />
            <CardMetrica Icon={CheckCircle2} label="Pag. finalizado" valor={pagamentoFinalizado} tom="text-[#1F7A3D]" />
            <CardMetrica Icon={TrendingUp} label="Faturamento" valor={formatCurrency(faturamentoDia)} tom="text-[var(--pp-text)]" />
            <CardMetrica Icon={Ticket} label="Ticket médio" valor={formatCurrency(ticketMedio)} tom="text-[var(--pp-text)]" />
          </div>

          {/* Análise financeira */}
          <section>
            <SecaoTitulo Icon={PieChart} titulo="Análise financeira do turno" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <CardMetrica Icon={Hourglass} label="Em aberto" valor={formatCurrency(analise.totalAberto)} tom="text-[#8D6708]" />
              <CardMetrica Icon={Percent} label="Ocupação" valor={`${analise.ocupacaoPct}%`} tom="text-[var(--pp-text)]" />
              <CardMetrica Icon={UtensilsCrossed} label="Mesas (pago)" valor={formatCurrency(analise.fatMesa)} tom="text-[var(--pp-text)]" />
              <CardMetrica Icon={Bike} label="Delivery" valor={formatCurrency(analise.fatDelivery)} tom="text-[var(--pp-text)]" />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Por forma de pagamento</p>
                {analise.porForma.length === 0 ? (
                  <p className="mt-2 text-xs font-semibold text-[var(--pp-text-muted)]">Nenhum pagamento registrado hoje.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {analise.porForma.map((f) => (
                      <li key={f.nome}>
                        <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px]">
                          <span className="truncate font-bold text-[var(--pp-text)]">{f.nome}</span>
                          <span className="shrink-0 font-black tabular-nums text-[var(--pp-text)]">{formatCurrency(f.valor)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white">
                          <div
                            className="h-full rounded-full bg-[var(--pp-primary)]"
                            style={{ width: `${Math.max(4, f.pct)}%` }}
                          />
                        </div>
                        <p className="mt-0.5 text-[9px] font-semibold text-[var(--pp-text-muted)]">{f.pct}% · {f.qtd} {f.qtd === 1 ? "pagamento" : "pagamentos"}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Indicadores do dia</p>
                <ul className="mt-2 space-y-2 text-[11px]">
                  <IndicadorLinha label="Pedidos pagos" valor={String(analise.qtdPagos)} />
                  <IndicadorLinha label="Contas em aberto" valor={String(analise.qtdAberto)} />
                  <IndicadorLinha label="Ticket médio mesa" valor={formatCurrency(analise.ticketMesa)} />
                  <IndicadorLinha label="Ticket médio delivery" valor={formatCurrency(analise.ticketDelivery)} />
                  <IndicadorLinha label="Maior venda" valor={formatCurrency(analise.maiorVenda)} />
                  <IndicadorLinha label="Potencial do aberto" valor={formatCurrency(analise.totalAberto)} destaque />
                </ul>
              </div>
            </div>
          </section>

          <section>
            <SecaoTitulo Icon={ChefHat} titulo="Status da cozinha" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <CardMetrica Icon={ChefHat} label="Recebido" valor={cozinha.recebido} tom="text-[#0F4C5C]" />
              <CardMetrica Icon={Flame} label="Em preparo" valor={cozinha.preparando} tom="text-[var(--pp-primary-text)]" />
              <CardMetrica Icon={CheckCircle2} label="Pronto" valor={cozinha.pronto} tom="text-[#1F7A3D]" />
              <CardMetrica Icon={PackageCheck} label="Retirado" valor={cozinha.retirado} tom="text-[var(--pp-text-body)]" />
            </div>
          </section>

          <section>
            <SecaoTitulo titulo={`Contas em aberto (${abertas.length})`} />
            {abertas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--pp-border)] px-3 py-4 text-center text-sm text-[var(--pp-text-muted)]">Nenhuma conta aberta no momento.</p>
            ) : (
              <ul className="space-y-2">
                {abertas.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[var(--pp-text)]">{c.mesa}</p>
                      <p className="truncate text-xs font-semibold text-[var(--pp-text-muted)]">
                        {c.cliente || "Cliente não identificado"}
                        {c.solicitada ? " · pagamento solicitado" : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-black tabular-nums text-[var(--pp-text)]">{formatCurrency(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SecaoTitulo titulo={`Pagamentos de hoje (${pagos.length})`} />
            {pagos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--pp-border)] px-3 py-4 text-center text-sm text-[var(--pp-text-muted)]">Nenhum pagamento registrado hoje.</p>
            ) : (
              <ul className="space-y-2">
                {pagos.slice(0, 30).map((o) => {
                  const tot = orderTotal(o) * (1 + (Number(taxaPct) || 0) / 100);
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[var(--pp-text)]">{o.table || o.command}</p>
                        <p className="truncate text-xs font-semibold text-[var(--pp-text-muted)]">
                          {o.customer || "Cliente"} · #{o.command || o.id}
                          {o.pagamentoForma ? ` · ${o.pagamentoForma}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-black tabular-nums text-[#1F7A3D]">{formatCurrency(tot)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="shrink-0 border-t border-[var(--pp-border)] bg-white px-4 py-3 sm:px-5">
          <button type="button" onClick={onFechar} className="btn-laranja min-h-12 w-full rounded-2xl text-sm font-black text-white">
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
    <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">
      {Icon && <Icon size={13} aria-hidden="true" />}
      {titulo}
    </h3>
  );
}

function IndicadorLinha({ label, valor, destaque }) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-[var(--pp-border)]/70 pb-1.5 last:border-0 last:pb-0">
      <span className="font-semibold text-[var(--pp-text-muted)]">{label}</span>
      <span className={`font-black tabular-nums ${destaque ? "text-[var(--pp-primary-text)]" : "text-[var(--pp-text)]"}`}>{valor}</span>
    </li>
  );
}

function GrupoInfo({ titulo, children, className = "" }) {
  return (
    <div
      className={`flex items-center gap-x-2.5 rounded-lg border border-[var(--pp-border)] bg-white px-2.5 py-1 shadow-[inset_0_0_0_1px_rgba(15,76,92,0.03)] ${className}`}
    >
      <span className="shrink-0 border-r border-[var(--pp-border)] pr-2 text-[9px] font-black uppercase leading-tight tracking-wide text-[var(--pp-text-muted)]">
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
      <p className="truncate text-[9px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">{label}</p>
      <p className={`truncate text-[13px] font-black tabular-nums ${tom}`}>{valor}</p>
    </div>
  );
}

function CardMetrica({ Icon, label, valor, tom, className = "" }) {
  return (
    <div className={`rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5 ${className}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[var(--pp-text-muted)]">
        <Icon size={14} aria-hidden="true" />
        <p className="text-[10px] font-bold uppercase tracking-wide">{label}</p>
      </div>
      <p className={`truncate text-lg font-black tabular-nums ${tom}`}>{valor}</p>
    </div>
  );
}
