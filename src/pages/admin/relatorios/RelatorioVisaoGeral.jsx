import { useMemo } from "react";
import { Banknote, CircleCheck, HandCoins, Percent, Receipt, ShoppingBag } from "lucide-react";
import {
  Cartao,
  Composicao,
  GradeIndicadores,
  GraficoTendencia,
  Indicador,
  LinkCartao,
  MapaCalor,
  Ranking,
} from "../../../components/graficos/Graficos.jsx";
import { CORES } from "../../../components/graficos/cores.js";
import {
  CANAIS,
  intervaloAnterior,
  mapaCalor,
  pedidosNoIntervalo,
  porCanal,
  porFormaPagamento,
  porMesa,
  resumoDiario,
  resumoVendas,
  rotuloComparacao,
  serieTemporal,
  variacaoPct,
} from "../../../lib/relatorios/analiseVendas.js";
import { formatCurrency } from "../../pdv/pdvHelpers.js";

const COR_CANAL = { [CANAIS[0]]: CORES.petroleo, [CANAIS[1]]: CORES.laranja, [CANAIS[2]]: CORES.rampa[0] };

const inteiro = (v) => Number(v || 0).toLocaleString("pt-BR");
const moedaOuTraco = (v) => (v == null ? "—" : formatCurrency(v));

/**
 * Visão geral: resultado do período, quando e por onde se vende.
 * Produtos e categorias ficam no relatório de Vendas.
 */
export default function RelatorioVisaoGeral({ orders, filtrados, products, periodo, ini, fim, irParaVendas, irParaMesas }) {
  const atual = useMemo(() => resumoVendas(filtrados, products), [filtrados, products]);
  const anterior = useMemo(() => {
    const lista = pedidosNoIntervalo(orders, intervaloAnterior(periodo, ini, fim));
    return lista.length ? resumoVendas(lista, products) : null;
  }, [orders, products, periodo, ini, fim]);
  const serie = useMemo(() => serieTemporal({ orders, periodo, ini, fim }), [orders, periodo, ini, fim]);
  const calor = useMemo(() => mapaCalor(atual.pagos), [atual.pagos]);
  const canais = useMemo(() => porCanal(atual.pagos), [atual.pagos]);
  const formas = useMemo(() => porFormaPagamento(atual.pagos), [atual.pagos]);
  const mesas = useMemo(() => porMesa(atual.pagos).slice(0, 8), [atual.pagos]);
  const diario = resumoDiario(serie);

  const comparadoA = rotuloComparacao(periodo);
  const delta = (campo) => (anterior ? variacaoPct(atual[campo], anterior[campo]) : null);

  return (
    <div className="space-y-3">
      <GradeIndicadores colunas={6}>
        <Indicador rotulo="Faturamento" valor={formatCurrency(atual.faturamento)} icone={Banknote}
          variacao={delta("faturamento")} comparadoA={comparadoA} serie={serie.pontos.map((p) => p.valor)}
          detalhe={`Produtos: ${formatCurrency(atual.subtotal)}`} />
        <Indicador rotulo="Pedidos pagos" valor={inteiro(atual.qtdPagos)} icone={CircleCheck}
          variacao={delta("qtdPagos")} comparadoA={comparadoA}
          detalhe={atual.pctPagos == null ? null : `${Math.round(atual.pctPagos)}% de ${inteiro(atual.totalPedidos)} pedido(s)`} />
        <Indicador rotulo="Ticket médio" valor={moedaOuTraco(atual.ticket)} icone={Receipt}
          variacao={delta("ticket")} comparadoA={comparadoA} />
        <Indicador rotulo="Itens vendidos" valor={inteiro(atual.itens)} icone={ShoppingBag}
          variacao={delta("itens")} comparadoA={comparadoA}
          detalhe={atual.itensPorPedido == null ? null : `${atual.itensPorPedido.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por pedido`} />
        <Indicador rotulo="Margem estimada" valor={moedaOuTraco(atual.margem)} icone={Percent}
          variacao={delta("margem")} comparadoA={comparadoA}
          detalhe={atual.margem == null
            ? "Cadastre o custo dos produtos"
            : `${atual.margemPct.toFixed(0)}% · calculada sobre ${Math.round(atual.cobertura)}% das vendas (com custo)`} />
        <Indicador rotulo="Taxa de serviço" valor={formatCurrency(atual.taxa)} icone={HandCoins}
          variacao={delta("taxa")} comparadoA={comparadoA} detalhe="Somada nas vendas pagas do período" />
      </GradeIndicadores>

      <Cartao titulo="Evolução do faturamento"
        descricao={serie.granularidade === "hora" ? "Hora a hora" : serie.granularidade === "mes" ? "Mês a mês" : "Dia a dia"}>
        <GraficoTendencia pontos={serie.pontos} temAnterior={serie.temAnterior} />
        {diario && (
          <dl className="mt-3 grid grid-cols-1 gap-2 min-[400px]:grid-cols-3">
            {[
              ["Melhor dia", diario.melhor.rotulo, formatCurrency(diario.melhor.valor)],
              ["Média por dia", formatCurrency(diario.mediaDiaria), `em ${diario.dias} dia(s)`],
              ["Dias com venda", inteiro(diario.diasComVenda), `de ${diario.dias}`],
            ].map(([rotulo, valor, sub]) => (
              <div key={rotulo} className="rounded-xl bg-[#F8FAFC] px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#667085]">{rotulo}</dt>
                <dd className="text-base font-semibold text-[#012E46]">{valor} <span className="text-[11px] font-semibold text-[#667085]">{sub}</span></dd>
              </div>
            ))}
          </dl>
        )}
      </Cartao>

      <Cartao titulo="Quando você vende" descricao="Faturamento por dia da semana e horário">
        <MapaCalor dados={calor} />
      </Cartao>

      <div className="grid gap-3 lg:grid-cols-3">
        <Cartao titulo="Canais de venda">
          <Composicao vazio="Nenhuma venda no período."
            partes={CANAIS.map((nome) => {
              const c = canais.find((x) => x.rotulo === nome);
              return {
                rotulo: nome,
                valor: c?.valor || 0,
                cor: COR_CANAL[nome],
                detalhe: c ? `${inteiro(c.qtd)} pedido(s) · ticket ${formatCurrency(c.ticket)}` : "sem vendas",
              };
            })} />
        </Cartao>
        <Cartao titulo="Formas de pagamento">
          <Ranking vazio="Nenhuma venda no período."
            itens={formas.map((f) => ({
              chave: f.rotulo,
              rotulo: f.rotulo,
              valor: f.valor,
              detalhe: `${inteiro(f.qtd)} pedido(s) · ${atual.faturamento ? Math.round((f.valor / atual.faturamento) * 100) : 0}%`,
            }))} />
        </Cartao>
        <Cartao titulo="Mesas que mais faturam" acao={<LinkCartao onClick={irParaMesas}>Ver mapa</LinkCartao>}>
          <Ranking vazio="Nenhuma venda em mesa."
            itens={mesas.map((m) => ({
              chave: m.rotulo,
              rotulo: m.rotulo,
              valor: m.valor,
              detalhe: `${inteiro(m.qtd)} pedido(s) · ticket ${formatCurrency(m.ticket)}`,
            }))} />
        </Cartao>
      </div>

      <p className="text-center text-xs text-[#667085]">
        Produtos, categorias e curva ABC estão no <LinkCartao onClick={irParaVendas}>relatório de Vendas</LinkCartao>
      </p>
    </div>
  );
}
