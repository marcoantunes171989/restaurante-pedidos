import { useState } from "react";
import { Download, PackagePlus, RefreshCw } from "lucide-react";
import ModalCentral from "../../../components/ModalCentral.jsx";
import { AvisoErro, BarraDeAcoes, BotaoAcao, Cartao, Carregando, Dado, GradeIndicadores, Indicador, Paginador, Vazio } from "../../../components/graficos/Graficos.jsx";
import { baixarCsv } from "../../../lib/relatorios/exportacao.js";
import {
  CABECALHO_MOVIMENTOS, POR_PAGINA, TIPOS_MOVIMENTO, ajustarEstoque, buscarMovimentos, dataHora, intervaloIso, justificativaDoMovimento,
  linhaCsvDoMovimento, mensagemDoHistorico, textoDaVariacao, todasAsLinhas, variacaoDoMovimento,
} from "../../../lib/relatorios/historicos.js";
import { useConsulta } from "./useConsulta.js";

const CAMPO = "h-11 w-full min-w-0 rounded-xl border border-[#D0D5DD] bg-white px-3 text-[13px] text-[#1F2933] outline-none focus:border-[#012E46]";
const inteiro = (v) => Number(v || 0).toLocaleString("pt-BR");

/** Linha a linha do estoque: venda (com pedido e nota), ajuste e cadastro, por produto e por empresa. */
export default function MovimentacoesEstoque({ supabase, lojaId, products = [], periodo, ini, fim, onAjustado }) {
  const [produtoId, setProdutoId] = useState("");
  const [tipo, setTipo] = useState("");
  const [pagina, setPagina] = useState(1);
  const [ajustando, setAjustando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [aviso, setAviso] = useState("");

  const daLoja = products.filter((p) => p.lojaId == null || p.lojaId === lojaId).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const filtro = () => ({ lojaId, ...intervaloIso(periodo, ini, fim), produtoId: produtoId ? Number(produtoId) : null, tipo });
  const { dados, erro, carregando, atualizar } = useConsulta(
    () => (lojaId == null ? Promise.resolve(null) : buscarMovimentos(supabase, { ...filtro(), pagina })),
    JSON.stringify([lojaId, periodo, ini, fim, produtoId, tipo, pagina]),
  );

  async function exportar() {
    setExportando(true);
    setAviso("");
    try {
      const linhas = await todasAsLinhas((p) => buscarMovimentos(supabase, { ...filtro(), ...p }));
      baixarCsv(`movimentacoes-de-estoque-${periodo}.csv`, CABECALHO_MOVIMENTOS, linhas.map(linhaCsvDoMovimento));
    } catch (e) {
      setAviso(mensagemDoHistorico(e));
    }
    setExportando(false);
  }

  if (lojaId == null) return <Vazio titulo="Escolha uma empresa." dica="As movimentações são consultadas por estabelecimento." />;
  if (erro) return <AvisoErro mensagem={mensagemDoHistorico(erro)} onTentar={atualizar} />;
  if (dados?.ausente) return <Vazio titulo="Movimentações ainda não disponíveis." dica="Elas aparecem depois da atualização do banco de dados." />;
  if (!dados) return <Carregando rotulo="Carregando as movimentações de estoque…" />;

  const linhas = dados.linhas || [];

  return (
    <div className="space-y-3" aria-busy={carregando}>
      <GradeIndicadores colunas={3}>
        <Indicador rotulo="Movimentações" valor={inteiro(dados.total)} detalhe="No período e filtro" />
        <Indicador rotulo="Unidades que saíram" valor={inteiro(dados.saidas)} />
        <Indicador rotulo="Unidades que entraram" valor={inteiro(dados.entradas)} />
      </GradeIndicadores>

      <Cartao titulo="Movimentações de estoque" descricao="Cada baixa mostra o pedido e a nota fiscal da venda.">
        {/* Três colunas só em tela larga: abaixo disso os botões espremiam o filtro de produto. */}
        <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_auto]">
          <select aria-label="Produto" value={produtoId} onChange={(e) => { setProdutoId(e.target.value); setPagina(1); }} className={CAMPO}>
            <option value="">Todos os produtos</option>
            {daLoja.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="Tipo de movimentação" value={tipo} onChange={(e) => { setTipo(e.target.value); setPagina(1); }} className={CAMPO}>
            <option value="">Todos os tipos</option>
            {Object.entries(TIPOS_MOVIMENTO).map(([id, rotulo]) => <option key={id} value={id}>{rotulo}</option>)}
          </select>
          <div className="min-w-0 sm:col-span-2 xl:col-span-1">
            <BarraDeAcoes>
              <BotaoAcao icone={PackagePlus} onClick={() => setAjustando(true)} disabled={daLoja.length === 0}>Ajustar estoque</BotaoAcao>
              <BotaoAcao icone={Download} onClick={exportar} disabled={exportando || !dados.total}>{exportando ? "Gerando…" : "Exportar"}</BotaoAcao>
              <BotaoAcao icone={RefreshCw} onClick={atualizar} disabled={carregando}>Atualizar</BotaoAcao>
            </BarraDeAcoes>
          </div>
        </div>
        {aviso && <p role="alert" className="mb-2 text-xs font-semibold text-[#C81E4A]">{aviso}</p>}

        {linhas.length === 0 ? (
          <Vazio titulo="Nenhuma movimentação neste filtro." dica="Altere o período, o produto ou o tipo." />
        ) : (
          <ul className="space-y-2">
            {linhas.map((m) => (
              <li key={m.id} className="rounded-xl border border-[#E5E7EB] p-3">
                <dl className="grid gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-[9rem_minmax(0,1.2fr)_6rem_8rem_minmax(0,2fr)]">
                  <Dado rotulo="Data">{dataHora(m.quando)}</Dado>
                  <Dado rotulo="Produto">{m.produto}<span className="block text-[11px] font-medium text-[#667085]">{TIPOS_MOVIMENTO[m.tipo] || m.tipo}</span></Dado>
                  <Dado rotulo="Movimento"><span className={variacaoDoMovimento(m) < 0 ? "text-[#C81E4A]" : "text-[#1F7A3D]"}>{textoDaVariacao(m)}</span></Dado>
                  <Dado rotulo="Antes → depois">{m.antes} → {m.depois}</Dado>
                  <Dado rotulo="Justificativa">{justificativaDoMovimento(m)}{m.usuario && <span className="block text-[11px] font-medium text-[#667085]">por {m.usuario}</span>}</Dado>
                </dl>
              </li>
            ))}
          </ul>
        )}
        <Paginador pagina={pagina} total={Number(dados.total) || 0} porPagina={POR_PAGINA} onMudar={setPagina} rotulo="movimentação(ões)" />
      </Cartao>

      {ajustando && (
        <AjusteDeEstoque supabase={supabase} produtos={daLoja} produtoInicial={produtoId} onFechar={() => setAjustando(false)}
          onPronto={() => { setAjustando(false); setPagina(1); atualizar(); onAjustado?.(); }} />
      )}
    </div>
  );
}

function AjusteDeEstoque({ supabase, produtos, produtoInicial = "", onFechar, onPronto }) {
  const [produtoId, setProdutoId] = useState(produtoInicial);
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);
  const produto = produtos.find((p) => String(p.id) === String(produtoId));
  const pronto = !!produto && /^\d+$/.test(quantidade) && motivo.trim().length >= 3;

  async function confirmar() {
    if (!pronto || gravando) return;
    setGravando(true);
    setErro("");
    try {
      await ajustarEstoque(supabase, { produtoId: produto.id, novoEstoque: Number(quantidade), motivo: motivo.trim() });
      onPronto();
    } catch (e) {
      setErro(mensagemDoHistorico(e));
      setGravando(false);
    }
  }

  return (
    <ModalCentral ariaLabel="Ajustar estoque" titulo="Ajustar estoque" subtitulo="Fica registrado com o seu nome." tamanho="md" onFechar={onFechar}
      rodape={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onFechar} className="h-11 rounded-xl border border-[#D0D5DD] px-6 text-sm font-semibold text-[#344054]">Cancelar</button>
          <button type="button" data-testid="ajuste-estoque-confirmar" onClick={confirmar} disabled={!pronto || gravando}
            className="h-11 rounded-xl bg-[#012E46] px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {gravando ? "Gravando…" : "Gravar ajuste"}
          </button>
        </div>
      )}>
      <label className="block text-[13px] font-semibold text-[#344054]">Produto
        <select aria-label="Produto do ajuste" value={produtoId} onChange={(e) => setProdutoId(e.target.value)} className={`${CAMPO} mt-1`}>
          <option value="">Escolha o produto</option>
          {produtos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="block text-[13px] font-semibold text-[#344054]">Quantidade em estoque agora
        <input aria-label="Nova quantidade" inputMode="numeric" value={quantidade} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, "").slice(0, 7))} className={`${CAMPO} mt-1`} />
        {produto && <span className="mt-1 block text-xs font-medium text-[#667085]">No sistema: {produto.estoque ?? 0}</span>}
      </label>
      <label className="block text-[13px] font-semibold text-[#344054]">Justificativa
        <textarea aria-label="Justificativa" value={motivo} maxLength={200} rows={3} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: contagem do dia, perda, entrada de mercadoria"
          className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-white p-3 text-[13px] text-[#1F2933] outline-none focus:border-[#012E46]" />
      </label>
      {erro && <p role="alert" className="text-xs font-semibold text-[#C81E4A]">{erro}</p>}
    </ModalCentral>
  );
}
