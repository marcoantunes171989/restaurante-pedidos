import { useEffect, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { AvisoErro, BarraDeAcoes, BotaoAcao, Cartao, Carregando, Dado, GradeIndicadores, Indicador, Paginador, Vazio } from "../../../components/graficos/Graficos.jsx";
import { baixarCsv } from "../../../lib/relatorios/exportacao.js";
import {
  CABECALHO_VENDAS, CANAIS, POR_PAGINA, buscarVendas, dataHora, intervaloIso, linhaCsvDaVenda, mensagemDoHistorico, textoDaNota,
  textoDasFormas, todasAsLinhas,
} from "../../../lib/relatorios/historicos.js";
import { formatCurrency } from "../../pdv/pdvHelpers.js";
import DetalheDaVenda from "./DetalheDaVenda.jsx";
import { useConsulta } from "./useConsulta.js";

const CAMPO = "h-11 w-full min-w-0 rounded-xl border border-[#D0D5DD] bg-white px-3 text-[13px] text-[#1F2933] outline-none focus:border-[#012E46]";
const inteiro = (v) => Number(v || 0).toLocaleString("pt-BR");

/** Histórico de vendas gravado pelo banco: uma linha por pagamento, com detalhe e exportação. */
export default function HistoricoVendas({ supabase, lojaId, periodo, ini, fim }) {
  const [digitado, setDigitado] = useState("");
  const [busca, setBusca] = useState("");
  const [forma, setForma] = useState("");
  const [pagina, setPagina] = useState(1);
  const [vendaAberta, setVendaAberta] = useState(null);
  const [exportando, setExportando] = useState(false);
  const [aviso, setAviso] = useState("");

  // A busca espera a pessoa parar de digitar.
  useEffect(() => {
    const espera = setTimeout(() => { setBusca(digitado); setPagina(1); }, 400);
    return () => clearTimeout(espera);
  }, [digitado]);

  const filtro = () => ({ lojaId, ...intervaloIso(periodo, ini, fim), busca, forma });
  const { dados, erro, carregando, atualizar } = useConsulta(
    () => (lojaId == null ? Promise.resolve(null) : buscarVendas(supabase, { ...filtro(), pagina })),
    JSON.stringify([lojaId, periodo, ini, fim, busca, forma, pagina]),
  );

  async function exportar() {
    setExportando(true);
    setAviso("");
    try {
      const linhas = await todasAsLinhas((p) => buscarVendas(supabase, { ...filtro(), ...p }));
      baixarCsv(`historico-de-vendas-${periodo}.csv`, CABECALHO_VENDAS, linhas.map(linhaCsvDaVenda));
    } catch (e) {
      setAviso(mensagemDoHistorico(e));
    }
    setExportando(false);
  }

  if (lojaId == null) return <Vazio titulo="Escolha uma empresa." dica="O histórico é consultado por estabelecimento." />;
  if (erro) return <AvisoErro mensagem={mensagemDoHistorico(erro)} onTentar={atualizar} />;
  if (dados?.ausente) return <Vazio titulo="Histórico ainda não disponível." dica="Ele aparece depois da atualização do banco de dados." />;
  if (!dados) return <Carregando rotulo="Carregando o histórico de vendas…" />;

  const r = dados.resumo || {};
  const lucro = r.custo == null ? null : Number(r.valorComCusto || 0) - Number(r.custo);
  const linhas = dados.linhas || [];

  return (
    <div className="space-y-3" aria-busy={carregando}>
      <GradeIndicadores>
        <Indicador rotulo="Vendas" valor={inteiro(r.vendas)} detalhe={r.estornadas > 0 ? `${inteiro(r.estornadas)} estornada(s) fora dos totais: ${formatCurrency(r.valorEstornado)}` : "Pagamentos no período"} />
        <Indicador rotulo="Valor recebido" valor={formatCurrency(r.valor)} detalhe={`Taxa de serviço ${formatCurrency(r.taxa)}`} />
        <Indicador rotulo="Descontos" valor={formatCurrency(r.descontos)} detalhe={`Acréscimos ${formatCurrency(r.acrescimos)}`} />
        <Indicador rotulo="Lucro bruto" valor={lucro == null ? "—" : formatCurrency(lucro)}
          detalhe={r.semCusto > 0 ? `${inteiro(r.semCusto)} venda(s) sem custo ficam de fora` : "Valor sem a taxa, menos o custo"} />
      </GradeIndicadores>

      <Cartao titulo="Histórico de vendas" descricao="Registro gravado no momento do pagamento. Não é alterado depois.">
        {/* Três colunas só em tela larga: abaixo disso os botões espremiam a busca. */}
        <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_14rem_auto]">
          <label className="relative block min-w-0">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
            <input aria-label="Buscar venda" value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder="Cliente, produto, pedido, cupom ou operador" className={`${CAMPO} pl-9`} />
          </label>
          <select aria-label="Forma de pagamento" value={forma} onChange={(e) => { setForma(e.target.value); setPagina(1); }} className={CAMPO}>
            <option value="">Todas as formas</option>
            {(dados.formas || []).map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <div className="min-w-0 sm:col-span-2 xl:col-span-1">
            <BarraDeAcoes>
              <BotaoAcao icone={Download} onClick={exportar} disabled={exportando || !dados.total}>{exportando ? "Gerando…" : "Exportar"}</BotaoAcao>
              <BotaoAcao icone={RefreshCw} onClick={atualizar} disabled={carregando}>Atualizar</BotaoAcao>
            </BarraDeAcoes>
          </div>
        </div>
        {aviso && <p role="alert" className="mb-2 text-xs font-semibold text-[#C81E4A]">{aviso}</p>}

        {linhas.length === 0 ? (
          <Vazio titulo="Nenhuma venda neste filtro." dica="Altere o período ou a busca." />
        ) : (
          <ul className="space-y-2">
            {linhas.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => setVendaAberta(v.id)} data-testid={`venda-${v.id}`}
                  className="grid w-full gap-x-3 gap-y-2 rounded-xl border border-[#E5E7EB] bg-white p-3 text-left transition hover:border-[#012E46] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F38525] sm:grid-cols-2 lg:grid-cols-[9rem_minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_7rem]">
                  <dl className="contents">
                    <Dado rotulo="Data">{dataHora(v.quando)}</Dado>
                    <Dado rotulo="Cliente">{v.cliente || "Não identificado"}<span className="block text-[11px] font-medium text-[#667085]">{CANAIS[v.canal] || v.canal} · {(v.pedidos || []).join(", ")}</span></Dado>
                    <Dado rotulo="Pagamento">{textoDasFormas(v.formas)}{v.cupom && <span className="block text-[11px] font-medium text-[#667085]">Cupom {v.cupom}</span>}</Dado>
                    <Dado rotulo="Nota fiscal">{textoDaNota(v.notas?.[0])}</Dado>
                    <Dado rotulo="Total">
                      <span className={v.estorno ? "line-through opacity-60" : ""}>{formatCurrency(v.total)}</span>
                      {v.estorno && <span className="block text-[11px] font-semibold text-[#C81E4A]">Estornada</span>}
                    </Dado>
                  </dl>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Paginador pagina={pagina} total={Number(dados.total) || 0} porPagina={POR_PAGINA} onMudar={setPagina} rotulo="venda(s)" />
      </Cartao>

      {vendaAberta != null && <DetalheDaVenda supabase={supabase} vendaId={vendaAberta} onFechar={() => setVendaAberta(null)} onMudou={atualizar} />}
    </div>
  );
}
