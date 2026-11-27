import { useMemo, useState } from "react";
import { Armchair, Banknote, CircleCheck, ClipboardList, Clock, Receipt, ShoppingBag, Wallet, XCircle } from "lucide-react";
import { FilterChip } from "../../components/Prime";
import {
  Carregando,
  AvisoErro,
  Cartao,
  GradeIndicadores,
  GraficoTendencia,
  Indicador,
  LinkCartao,
  Ranking,
  SituacaoDados,
  Vazio,
} from "../../components/graficos/Graficos.jsx";
import { useDadosVendas } from "../../components/graficos/contextoDados.js";
import { clientesNoPeriodo, mesasAbertasAgora, prioridades } from "../../lib/dashboard/analiseDashboard.js";
import {
  abaixoDoMinimo,
  intervaloAnterior,
  intervaloPeriodo,
  pedidosNoIntervalo,
  rankingProdutos,
  resumoVendas,
  rotuloComparacao,
  serieTemporal,
  variacaoPct,
} from "../../lib/relatorios/analiseVendas.js";
import { formatCurrency } from "../pdv/pdvHelpers.js";

const PERIODOS = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "7", label: "7 dias" },
  { id: "15", label: "15 dias" },
  { id: "30", label: "30 dias" },
  { id: "tudo", label: "Tudo" },
];

const PRIORIDADE = {
  alta: { rotulo: "Alta", fundo: "#FDF2F5", cor: "#C81E4A" },
  media: { rotulo: "Média", fundo: "#FEF3E8", cor: "#9A4D0B" },
  baixa: { rotulo: "Baixa", fundo: "#E8EDF0", cor: "#012E46" },
};

const inteiro = (v) => Number(v || 0).toLocaleString("pt-BR");
const decimal = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

function Titulo({ children }) {
  return <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#667085]">{children}</h2>;
}

/**
 * Painel do momento: o que está pendente, o resultado do período e o que
 * fazer. A análise detalhada de cada assunto fica nos Relatórios.
 */
export default function DashboardGerencial({
  orders = [],
  products = [],
  clientes = [],
  lojaNome = "",
  irParaProdutos = () => {},
  irParaRelatorio = () => {},
}) {
  const [periodo, setPeriodo] = useState("hoje");
  const dados = useDadosVendas();

  const filtrados = useMemo(
    () => (periodo === "tudo" ? orders : pedidosNoIntervalo(orders, intervaloPeriodo(periodo))),
    [orders, periodo],
  );
  const anteriores = useMemo(() => pedidosNoIntervalo(orders, intervaloAnterior(periodo)), [orders, periodo]);
  const atual = useMemo(() => resumoVendas(filtrados, products), [filtrados, products]);
  const anterior = useMemo(() => (anteriores.length ? resumoVendas(anteriores, products) : null), [anteriores, products]);
  const serie = useMemo(() => serieTemporal({ orders, periodo }), [orders, periodo]);
  const topProdutos = useMemo(() => rankingProdutos(atual.pagos, products).slice(0, 5), [atual.pagos, products]);
  const reposicao = useMemo(
    () => products.filter(abaixoDoMinimo).sort((a, b) => (Number(a.estoque) || 0) - (Number(b.estoque) || 0)),
    [products],
  );
  const mesas = mesasAbertasAgora(orders);
  const identificados = clientesNoPeriodo(filtrados);
  const acoes = prioridades({ atual, anterior, semEstoque: reposicao.length });

  const comparadoA = rotuloComparacao(periodo);
  const delta = (campo) => (anterior ? variacaoPct(atual[campo], anterior[campo]) : null);
  const serieDe = (f) => serie.pontos.map(f);
  const semDados = orders.length === 0;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="page-title text-xl font-semibold tracking-tight text-[#012E46]">Dashboard</h1>
          <p className="text-xs text-[#667085]">{lojaNome || "Loja selecionada"}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <FilterChip key={p.id} size="sm" selected={periodo === p.id} label={p.label} onClick={() => setPeriodo(p.id)} />
            ))}
          </div>
          <SituacaoDados dados={dados} />
        </div>
      </header>

      {dados.erro && <AvisoErro mensagem={dados.erro} onTentar={dados.atualizar} />}

      {dados.carregando && semDados ? <Carregando /> : (
        <>
          <section>
            <Titulo>Operação</Titulo>
            <GradeIndicadores>
              <Indicador rotulo="Em aberto" valor={inteiro(atual.emAberto.qtd)} icone={ClipboardList} alerta={atual.emAberto.qtd > 0}
                detalhe={atual.emAberto.qtd ? `${formatCurrency(atual.emAberto.valor)} a receber` : "Nenhum pedido pendente"} />
              <Indicador rotulo="Aguardando pagamento" valor={inteiro(atual.aguardando.qtd)} icone={Wallet} alerta={atual.aguardando.qtd > 0}
                detalhe={atual.aguardando.qtd ? `${formatCurrency(atual.aguardando.valor)} no caixa` : "Nenhuma conta pedida"} />
              <Indicador rotulo="Mesas abertas" valor={inteiro(mesas)} icone={Armchair} detalhe={mesas ? "Neste momento" : "Salão livre"} />
              <Indicador rotulo="Cancelados" valor={inteiro(atual.cancelados.qtd)} icone={XCircle}
                detalhe={atual.cancelados.qtd ? `${formatCurrency(atual.cancelados.valor)} não vendidos` : "Nenhum no período"}
                variacao={anterior ? variacaoPct(atual.cancelados.qtd, anterior.cancelados.qtd) : null} comparadoA={comparadoA} inverter />
            </GradeIndicadores>
          </section>

          <section>
            <Titulo>Resultado do período</Titulo>
            <GradeIndicadores>
              <Indicador rotulo="Faturamento" valor={formatCurrency(atual.faturamento)} icone={Banknote}
                variacao={delta("faturamento")} comparadoA={comparadoA} serie={serieDe((p) => p.valor)}
                detalhe={atual.taxa > 0 ? `Inclui ${formatCurrency(atual.taxa)} de taxa de serviço` : null} />
              <Indicador rotulo="Pedidos pagos" valor={inteiro(atual.qtdPagos)} icone={CircleCheck}
                variacao={delta("qtdPagos")} comparadoA={comparadoA} serie={serieDe((p) => p.qtd)}
                detalhe={atual.totalPedidos ? `de ${inteiro(atual.totalPedidos)} pedido(s) no período` : null} />
              <Indicador rotulo="Ticket médio" valor={atual.ticket == null ? "—" : formatCurrency(atual.ticket)} icone={Receipt}
                variacao={delta("ticket")} comparadoA={comparadoA} serie={serieDe((p) => (p.qtd ? p.valor / p.qtd : 0))} />
              <Indicador rotulo="Itens por pedido" valor={decimal(atual.itensPorPedido)} icone={ShoppingBag}
                variacao={delta("itensPorPedido")} comparadoA={comparadoA}
                detalhe={atual.itens ? `${inteiro(atual.itens)} item(ns) vendidos` : null} />
            </GradeIndicadores>
          </section>

          <div className="grid gap-3 xl:grid-cols-3 xl:items-start">
            <Cartao className="xl:col-span-2" titulo="Evolução do faturamento"
              descricao={serie.granularidade === "hora" ? "Hora a hora" : serie.granularidade === "mes" ? "Mês a mês" : "Dia a dia"}
              acao={<LinkCartao onClick={() => irParaRelatorio("geral")}>Análise completa</LinkCartao>}>
              <GraficoTendencia pontos={serie.pontos} temAnterior={serie.temAnterior}
                rotuloAnterior={periodo === "hoje" ? "Ontem" : "Período anterior"}
                rotuloAtual={periodo === "hoje" ? "Hoje" : "Período atual"} />
            </Cartao>

            <Cartao titulo="O que fazer agora" descricao="Em ordem de urgência">
              {acoes.length === 0 ? (
                <Vazio titulo="Nenhuma pendência." dica="Sem contas, estoque ou quedas para tratar." />
              ) : (
                <ul className="space-y-2">
                  {acoes.map((a) => (
                    <li key={a.id} className="rounded-xl border border-[#E5E7EB] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold leading-snug text-[#012E46]">{a.titulo}</p>
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                          style={{ background: PRIORIDADE[a.prio].fundo, color: PRIORIDADE[a.prio].cor }}>{PRIORIDADE[a.prio].rotulo}</span>
                      </div>
                      <p className="mt-0.5 text-xs leading-snug text-[#667085]">{a.texto}</p>
                      {a.destino && <LinkCartao onClick={() => irParaRelatorio(a.destino)}>Ver relatório</LinkCartao>}
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Cartao className="lg:col-span-2" titulo="Produtos que mais faturam" descricao="Cinco primeiros do período"
              acao={<LinkCartao onClick={() => irParaRelatorio("vendas")}>Ranking completo</LinkCartao>}>
              <Ranking vazio="Nenhuma venda no período."
                itens={topProdutos.map((p) => ({
                  chave: p.nome,
                  rotulo: p.nome,
                  valor: p.valor,
                  detalhe: `${inteiro(p.qtd)} un. · ${p.participacao.toFixed(0)}% das vendas`,
                }))} />
            </Cartao>

            <div className="flex min-w-0 flex-col gap-3">
              <Cartao titulo="Repor estoque" descricao="Zerados ou abaixo do mínimo"
                acao={<LinkCartao onClick={irParaProdutos}>Abrir cardápio</LinkCartao>}>
                {reposicao.length === 0 ? (
                  <p className="text-sm text-[#667085]">Nenhum produto com estoque controlado precisa de reposição.</p>
                ) : (
                  <ul className="divide-y divide-[#F1F4F6]">
                    {reposicao.slice(0, 5).map((p) => (
                      <li key={p.id ?? p.name} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                        <span className="min-w-0 truncate font-semibold text-[#1F2933]">{p.name}</span>
                        <span className="shrink-0 font-semibold" style={{ color: (Number(p.estoque) || 0) <= 0 ? "#C81E4A" : "#9A4D0B" }}>
                          {(Number(p.estoque) || 0) <= 0 ? "Zerado" : `${p.estoque} un.`}
                        </span>
                      </li>
                    ))}
                    {reposicao.length > 5 && <li className="pt-1.5 text-xs text-[#667085]">+{reposicao.length - 5} produto(s) no relatório de estoque</li>}
                  </ul>
                )}
              </Cartao>
              <Cartao titulo="Clientes no período" acao={<LinkCartao onClick={() => irParaRelatorio("clientes")}>Ver clientes</LinkCartao>}>
                <p className="flex items-baseline gap-2">
                  <span className="text-xl font-semibold tabular-nums text-[#012E46]">{inteiro(identificados)}</span>
                  <span className="text-xs text-[#667085]">identificado(s) · {inteiro(clientes.length)} cadastrado(s)</span>
                </p>
              </Cartao>
            </div>
          </div>

          <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-[11px] text-[#667085]">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Faturamento conta somente pedidos pagos.
          </p>
        </>
      )}
    </div>
  );
}
