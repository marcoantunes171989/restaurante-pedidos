import { useEffect, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import FiltroPeriodo from "../../../components/FiltroPeriodo.jsx";
import { AvisoErro, BarraDeAcoes, BotaoAcao, Cartao, Carregando, Dado, GradeIndicadores, Indicador, Paginador, Vazio } from "../../../components/graficos/Graficos.jsx";
import { baixarCsv } from "../../../lib/relatorios/exportacao.js";
import { POR_PAGINA, dataHora, intervaloIso, mensagemDoHistorico, textoDaNota, todasAsLinhas } from "../../../lib/relatorios/historicos.js";
import {
  CABECALHO_PONTOS, GRUPOS_DE_PONTOS, buscarPontos, comSinal, dia, diaDoRelatorio, linhaCsvDosPontos, registrarVencimentos, rotuloDaLinha,
} from "../../../lib/relatorios/pontos.js";
import { formatCurrency } from "../../pdv/pdvHelpers.js";
import { useConsulta } from "../relatorios/useConsulta.js";
import HistoricoDoCliente from "./HistoricoDoCliente.jsx";

const CAMPO = "h-11 w-full min-w-0 rounded-xl border border-[#D0D5DD] bg-white px-3 text-[13px] text-[#1F2933] outline-none focus:border-[#012E46]";
const inteiro = (v) => Number(v || 0).toLocaleString("pt-BR");

/** Visão gerencial: pontos usados e vencidos por data, cliente, cupom fiscal e cupom de desconto. */
export default function PontosUsadosVencidos({ supabase, lojaId }) {
  const [periodo, setPeriodo] = useState("30");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [grupo, setGrupo] = useState("");
  const [digitado, setDigitado] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [cliente, setCliente] = useState(null);
  const [exportando, setExportando] = useState(false);
  const [aviso, setAviso] = useState("");

  // A busca espera a pessoa parar de digitar.
  useEffect(() => {
    const espera = setTimeout(() => { setBusca(digitado); setPagina(1); }, 400);
    return () => clearTimeout(espera);
  }, [digitado]);

  const filtro = () => ({ lojaId, ...intervaloIso(periodo, ini, fim), grupo, busca });
  // Antes de ler, o banco registra o que venceu desde a última visita.
  const { dados, erro, carregando, atualizar } = useConsulta(
    async () => {
      if (lojaId == null) return null;
      await registrarVencimentos(supabase, lojaId);
      return buscarPontos(supabase, { ...filtro(), pagina });
    },
    JSON.stringify([lojaId, periodo, ini, fim, grupo, busca, pagina]),
  );

  async function exportar() {
    setExportando(true);
    setAviso("");
    try {
      const linhas = await todasAsLinhas((p) => buscarPontos(supabase, { ...filtro(), ...p }));
      baixarCsv(`pontos-usados-e-vencidos-${periodo}.csv`, CABECALHO_PONTOS, linhas.map(linhaCsvDosPontos));
    } catch (e) {
      setAviso(mensagemDoHistorico(e));
    }
    setExportando(false);
  }

  if (lojaId == null) return <Vazio titulo="Escolha uma empresa." dica="Os pontos são consultados por estabelecimento." />;

  const r = dados?.resumo || {};
  const linhas = dados?.linhas || [];

  return (
    <div className="space-y-3" aria-busy={carregando}>
      <FiltroPeriodo valor={periodo} ini={ini} fim={fim} onMudar={(p) => { setPeriodo(p); setPagina(1); }} onIni={setIni} onFim={setFim} />

      {erro ? <AvisoErro mensagem={mensagemDoHistorico(erro)} onTentar={atualizar} /> : dados?.ausente ? (
        <Vazio titulo="Pontos usados e vencidos ainda não disponíveis." dica="Eles aparecem depois da atualização do banco de dados." />
      ) : !dados ? <Carregando rotulo="Carregando os pontos…" /> : (
        <>
          <GradeIndicadores>
            <Indicador rotulo="Pontos usados" valor={inteiro(r.usados)} detalhe={`${formatCurrency(r.valorUsado)} em pagamentos`} />
            <Indicador rotulo="Pontos vencidos" valor={inteiro(r.vencidos)} detalhe="No período" />
            <Indicador rotulo="Vencem em 30 dias" valor={inteiro(r.aVencer)} detalhe="A partir de hoje" />
            <Indicador rotulo="Em circulação" valor={inteiro(r.emCirculacao)} detalhe={`${inteiro(r.clientes)} cliente(s) no filtro`} />
          </GradeIndicadores>

          {(dados.porDia || []).length > 0 && (
            <Cartao titulo="Por dia">
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {dados.porDia.map((d) => (
                  <li key={d.dia} className="rounded-xl border border-[#E5E7EB] p-3">
                    <dl className="grid grid-cols-2 gap-2">
                      <div className="col-span-2 text-[12px] font-semibold text-[#012E46]">{diaDoRelatorio(d.dia)}</div>
                      <Dado rotulo="Usados">{inteiro(d.usados)}</Dado>
                      <Dado rotulo="Vencidos">{inteiro(d.vencidos)}</Dado>
                    </dl>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}

          <Cartao titulo="Pontos usados e vencidos" descricao="Toque em uma linha para ver o histórico do cliente.">
            <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_auto]">
              <label className="relative block min-w-0">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
                <input aria-label="Buscar pontos" value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder="Cliente, pedido, nota ou cupom" className={`${CAMPO} pl-9`} />
              </label>
              <select aria-label="Situação dos pontos" value={grupo} onChange={(e) => { setGrupo(e.target.value); setPagina(1); }} className={CAMPO}>
                <option value="">Usados e vencidos</option>
                {Object.entries(GRUPOS_DE_PONTOS).map(([id, rotulo]) => <option key={id} value={id}>{rotulo}</option>)}
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
              <Vazio titulo="Nenhum ponto usado ou vencido neste filtro." dica="Altere o período ou a busca." />
            ) : (
              <ul className="space-y-2">
                {linhas.map((l) => (
                  <li key={l.id}>
                    <button type="button" data-testid={`ponto-${l.id}`} onClick={() => setCliente(l.clienteId)} disabled={l.clienteId == null}
                      className="grid w-full gap-x-3 gap-y-2 rounded-xl border border-[#E5E7EB] bg-white p-3 text-left transition hover:border-[#012E46] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F38525] sm:grid-cols-2 lg:grid-cols-[9rem_minmax(0,1.2fr)_minmax(0,1.6fr)_7rem]">
                      <dl className="contents">
                        <Dado rotulo="Data">{l.grupo === "vencido" ? dia(l.quando) : dataHora(l.quando)}</Dado>
                        <Dado rotulo="Cliente">{l.cliente || "Não identificado"}<span className="block text-[11px] font-medium text-[#667085]">{l.telefone}</span></Dado>
                        <Dado rotulo={rotuloDaLinha(l)}>
                          {l.vendaId ? `${(l.pedidos || []).join(", ")} · ${textoDaNota(l.notas?.[0])}` : l.descricao || "—"}
                          {(l.cupom || l.valor != null) && <span className="block text-[11px] font-medium text-[#667085]">{[l.valor != null && formatCurrency(l.valor), l.cupom && `Cupom ${l.cupom}`].filter(Boolean).join(" · ")}</span>}
                        </Dado>
                        <Dado rotulo="Pontos"><span className={Number(l.pontos) < 0 ? "text-[#C81E4A]" : "text-[#1F7A3D]"}>{comSinal(l.pontos)}</span></Dado>
                      </dl>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Paginador pagina={pagina} total={Number(dados.total) || 0} porPagina={POR_PAGINA} onMudar={setPagina} rotulo="lançamento(s)" />
          </Cartao>
        </>
      )}

      {cliente != null && <HistoricoDoCliente supabase={supabase} lojaId={lojaId} clienteId={cliente} onFechar={() => setCliente(null)} />}
    </div>
  );
}
