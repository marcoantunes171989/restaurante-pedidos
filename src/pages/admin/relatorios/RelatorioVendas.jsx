import { useMemo, useState } from "react";
import { Download, Package, Printer, Search, Share2, Star, Tag } from "lucide-react";
import {
  BarraDeAcoes,
  BotaoAcao,
  Cartao,
  Composicao,
  Dado,
  GradeIndicadores,
  Indicador,
  Paginador,
  Ranking,
  Vazio,
} from "../../../components/graficos/Graficos.jsx";
import { CORES } from "../../../components/graficos/cores.js";
import {
  intervaloAnterior,
  pedidosNoIntervalo,
  ehPago,
  paresDeProdutos,
  porCategoria,
  rankingProdutos,
  resumoCurvaAbc,
  resumoVendas,
  rotuloComparacao,
} from "../../../lib/relatorios/analiseVendas.js";
import { baixarCsv, escHtml } from "../../../lib/relatorios/exportacao.js";
import { formatCurrency } from "../../pdv/pdvHelpers.js";

const COR_CLASSE = { A: CORES.petroleo, B: CORES.rampa[1], C: CORES.rampa[0] };
const TEXTO_CLASSE = {
  A: "Classe A — sustentam o resultado",
  B: "Classe B — intermediários",
  C: "Classe C — cauda",
};
const ORDENACOES = [
  { id: "valor", rotulo: "Maior faturamento" },
  { id: "qtd", rotulo: "Mais unidades" },
  { id: "margem", rotulo: "Maior margem" },
  { id: "nome", rotulo: "Nome (A–Z)" },
];
const POR_PAGINA = 10;

const inteiro = (v) => Number(v || 0).toLocaleString("pt-BR");
const pct = (v) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function Selo({ classe }) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
      style={{ background: COR_CLASSE[classe], color: classe === "C" ? CORES.petroleo : "#FFFFFF" }}
      title={TEXTO_CLASSE[classe]}>{classe}</span>
  );
}

export default function RelatorioVendas({ orders, filtrados, products, periodo, ini, fim, rotuloPeriodo, lojaInfo, onVerCupons }) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState("valor");
  const [pagina, setPagina] = useState(1);
  const [aviso, setAviso] = useState("");

  const atual = useMemo(() => resumoVendas(filtrados, products), [filtrados, products]);
  const pagosAntes = useMemo(
    () => pedidosNoIntervalo(orders, intervaloAnterior(periodo, ini, fim)).filter(ehPago),
    [orders, periodo, ini, fim],
  );
  const ranking = useMemo(() => rankingProdutos(atual.pagos, products), [atual.pagos, products]);
  const categorias = useMemo(() => porCategoria(atual.pagos, products, pagosAntes), [atual.pagos, products, pagosAntes]);
  const abc = useMemo(() => resumoCurvaAbc(ranking), [ranking]);
  const pares = useMemo(() => paresDeProdutos(atual.pagos), [atual.pagos]);

  const ativos = products.filter((p) => p.active !== false);
  const comVenda = new Set(ranking.map((p) => p.nome));
  const ativosComVenda = ativos.filter((p) => comVenda.has(p.name)).length;
  const classeA = abc[0];

  const termo = busca.trim().toLowerCase();
  const filtradosRanking = ranking
    .filter((p) => !termo || `${p.nome} ${p.categoria}`.toLowerCase().includes(termo))
    .sort((a, b) => (ordem === "nome" ? a.nome.localeCompare(b.nome, "pt-BR") : (b[ordem] ?? -Infinity) - (a[ordem] ?? -Infinity)));
  const paginas = Math.max(1, Math.ceil(filtradosRanking.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, paginas);
  const visiveis = filtradosRanking.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  function avisar(texto) {
    setAviso(texto);
    setTimeout(() => setAviso(""), 3500);
  }

  function exportar() {
    baixarCsv(`relatorio-vendas-${periodo}.csv`,
      ["Produto", "Categoria", "Classe", "Quantidade", "Faturamento (produtos)", "Participação %", "Preço médio", "Margem estimada"],
      ranking.map((p) => [p.nome, p.categoria, p.classe, p.qtd, Number(p.valor.toFixed(2)), Number(p.participacao.toFixed(2)), Number(p.precoMedio.toFixed(2)), p.margem == null ? "" : Number(p.margem.toFixed(2))]));
  }

  function imprimir() {
    const empresa = escHtml(lojaInfo?.nome || "Restaurante");
    const tabela = (cabecalho, linhas) => `<table><thead><tr>${cabecalho.map((c, i) => `<th class="${i ? "r" : ""}">${c}</th>`).join("")}</tr></thead><tbody>${
      linhas.map((l) => `<tr>${l.map((c, i) => `<td class="${i ? "r" : ""}">${escHtml(c)}</td>`).join("")}</tr>`).join("")
      || `<tr><td colspan="${cabecalho.length}">Nenhuma venda no período.</td></tr>`
    }</tbody></table>`;
    const janela = window.open("", "_blank", "width=900,height=700");
    if (!janela) { avisar("Libere os pop-ups para imprimir."); return; }
    janela.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório de Vendas — ${empresa}</title>
      <style>
        @page { size: A4; margin: 14mm; } * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color:#0f172a; margin:0; }
        h1 { font-size:18px; margin:0; color:#012E46; border-bottom:3px solid #012E46; padding-bottom:8px; }
        h2 { font-size:14px; margin:18px 0 6px; } p { font-size:11px; color:#475569; }
        table { width:100%; border-collapse:collapse; font-size:11px; }
        th { background:#012E46; color:#fff; text-align:left; padding:6px 8px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        td { padding:6px 8px; border-bottom:1px solid #e2e8f0; } .r { text-align:right; }
      </style></head><body>
      <h1>Relatório de Vendas — ${empresa}</h1>
      <p>Período: <b>${escHtml(rotuloPeriodo)}</b> · Emitido em ${new Date().toLocaleString("pt-BR")}</p>
      <p>Faturamento: <b>${formatCurrency(atual.faturamento)}</b> (produtos ${formatCurrency(atual.subtotal)} + taxa ${formatCurrency(atual.taxa)}) · Pedidos pagos: <b>${atual.qtdPagos}</b> · Itens: <b>${atual.itens}</b></p>
      <h2>Produtos</h2>
      ${tabela(["Produto", "Classe", "Qtd", "Faturamento", "%"], ranking.map((p) => [p.nome, p.classe, p.qtd, formatCurrency(p.valor), pct(p.participacao)]))}
      <h2>Categorias</h2>
      ${tabela(["Categoria", "Qtd", "Faturamento"], categorias.map((c) => [c.rotulo, c.qtd, formatCurrency(c.valor)]))}
      <p>Documento sem valor fiscal.</p>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    janela.document.close();
  }

  async function compartilhar() {
    const texto = `Relatório de vendas — ${rotuloPeriodo}\nFaturamento: ${formatCurrency(atual.faturamento)}\nPedidos pagos: ${atual.qtdPagos}\nTicket médio: ${atual.ticket == null ? "—" : formatCurrency(atual.ticket)}`;
    try {
      if (navigator.share) { await navigator.share({ title: "Relatório de vendas", text: texto }); return; }
    } catch { return; /* o usuário cancelou */ }
    try {
      await navigator.clipboard.writeText(texto);
      avisar("Resumo copiado.");
    } catch {
      avisar("Não foi possível compartilhar.");
    }
  }

  return (
    <div className="space-y-3">
      <BarraDeAcoes>
        <BotaoAcao icone={Download} onClick={exportar} disabled={!ranking.length}>Exportar CSV</BotaoAcao>
        <BotaoAcao icone={Printer} onClick={imprimir}>PDF / Imprimir</BotaoAcao>
        <BotaoAcao icone={Share2} onClick={compartilhar}>Compartilhar</BotaoAcao>
        {aviso && <p role="status" className="col-span-2 text-xs font-semibold text-[#012E46]">{aviso}</p>}
      </BarraDeAcoes>

      <GradeIndicadores colunas={3}>
        <Indicador rotulo="Produtos com venda" valor={inteiro(ranking.length)} icone={Package}
          detalhe={ativos.length ? `${ativosComVenda} de ${ativos.length} ativos no cardápio` : null} />
        <Indicador rotulo="Preço médio por item" valor={atual.itens ? formatCurrency(atual.subtotal / atual.itens) : "—"} icone={Tag}
          detalhe="Valor dos produtos ÷ unidades" />
        <Indicador rotulo="Produtos classe A" valor={ranking.length ? inteiro(classeA.produtos) : "—"} icone={Star}
          detalhe={ranking.length && atual.subtotal ? `Somam ${Math.round((classeA.valor / atual.subtotal) * 100)}% das vendas` : null} />
      </GradeIndicadores>

      <div className="grid gap-3 lg:grid-cols-2">
        <Cartao titulo="Categorias" descricao={pagosAntes.length ? `Variação em relação a ${rotuloComparacao(periodo)}` : "Faturamento dos produtos"}>
          <Ranking vazio="Nenhuma venda no período."
            itens={categorias.slice(0, 8).map((c) => ({
              chave: c.rotulo,
              rotulo: c.rotulo,
              valor: c.valor,
              detalhe: `${inteiro(c.qtd)} un. · ${atual.subtotal ? Math.round((c.valor / atual.subtotal) * 100) : 0}%`,
              variacao: c.variacao,
            }))} />
          {categorias.length > 8 && <p className="mt-3 text-xs text-[#667085]">+{categorias.length - 8} categoria(s) no CSV e na impressão</p>}
        </Cartao>

        <div className="flex min-w-0 flex-col gap-3">
          <Cartao titulo="Curva ABC" descricao="A: primeiros 80% do faturamento · B: até 95% · C: restante">
            <Composicao vazio="Nenhuma venda no período."
              partes={abc.map((c) => ({ rotulo: TEXTO_CLASSE[c.classe], valor: c.valor, cor: COR_CLASSE[c.classe], detalhe: `${c.produtos} produto(s)` }))} />
          </Cartao>
          <Cartao titulo="Vendidos juntos" descricao="Pares no mesmo pedido (2 ou mais vezes)">
            <Ranking vazio="Nenhum par repetido no período." formatar={inteiro} destacarPrimeiro={false}
              itens={pares.map((p) => ({ chave: p.rotulo, rotulo: p.rotulo, valor: p.qtd, texto: `${p.qtd}×` }))} />
          </Cartao>
        </div>
      </div>

      <Cartao titulo="Ranking de produtos" descricao="Valores dos produtos, sem a taxa de serviço">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar produto</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" aria-hidden="true" />
            <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} placeholder="Buscar produto ou categoria"
              className="pdv-toque min-h-[40px] w-full rounded-xl border border-[#E5E7EB] bg-white pl-9 pr-3 text-sm text-[#1F2933] outline-none focus:border-[#012E46]" />
          </label>
          <label>
            <span className="sr-only">Ordenar por</span>
            <select value={ordem} onChange={(e) => { setOrdem(e.target.value); setPagina(1); }}
              className="pdv-toque min-h-[40px] w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#344054] outline-none focus:border-[#012E46] sm:w-auto">
              {ORDENACOES.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
            </select>
          </label>
        </div>

        {visiveis.length === 0 ? (
          <Vazio titulo={ranking.length ? "Nenhum produto encontrado." : "Nenhuma venda no período."} dica={ranking.length ? "Ajuste a busca." : undefined} />
        ) : (
          <>
            {/* Cartões em telas estreitas; tabela quando há largura. */}
            <ul className="grid gap-2 md:grid-cols-2 xl:hidden">
              {visiveis.map((p) => (
                <li key={p.nome} className="min-w-0 rounded-xl border border-[#E5E7EB] p-3">
                  <div className="flex items-start gap-2">
                    <Selo classe={p.classe} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-[#012E46] [overflow-wrap:anywhere]">{p.nome}</p>
                      <p className="text-[11px] text-[#667085]">{p.categoria}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-[#012E46]">{formatCurrency(p.valor)}</p>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 min-[360px]:grid-cols-4">
                    <Dado rotulo="Qtd">{inteiro(p.qtd)}</Dado>
                    <Dado rotulo="Parte">{pct(p.participacao)}</Dado>
                    <Dado rotulo="Preço">{formatCurrency(p.precoMedio)}</Dado>
                    <Dado rotulo="Margem">{p.margem == null ? "—" : formatCurrency(p.margem)}</Dado>
                  </dl>
                  <div className="mt-2"><BotaoAcao onClick={() => onVerCupons(p.nome)}>Ver cupons</BotaoAcao></div>
                </li>
              ))}
            </ul>
            <table className="hidden w-full border-collapse text-sm xl:table">
              <thead className="text-[10px] uppercase tracking-wider text-[#667085]">
                <tr className="border-b border-[#E5E7EB]">
                  <th className="py-2 pr-3 text-left">Produto</th>
                  <th className="py-2 pr-3 text-right">Qtd</th>
                  <th className="py-2 pr-3 text-right">Faturamento</th>
                  <th className="py-2 pr-3 text-right">Parte</th>
                  <th className="py-2 pr-3 text-right">Preço médio</th>
                  <th className="py-2 pr-3 text-right">Margem</th>
                  <th className="py-2 text-right"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {visiveis.map((p) => (
                  <tr key={p.nome} className="border-b border-[#F1F4F6] hover:bg-[#F8FAFC]">
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2">
                        <Selo classe={p.classe} />
                        <span className="min-w-0">
                          <span className="block font-semibold text-[#012E46]">{p.nome}</span>
                          <span className="block text-[11px] text-[#667085]">{p.categoria}</span>
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right text-[#344054]">{inteiro(p.qtd)}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold text-[#012E46]">{formatCurrency(p.valor)}</td>
                    <td className="py-2.5 pr-3 text-right text-[#667085]">{pct(p.participacao)}</td>
                    <td className="py-2.5 pr-3 text-right text-[#667085]">{formatCurrency(p.precoMedio)}</td>
                    <td className="py-2.5 pr-3 text-right text-[#344054]">{p.margem == null ? "—" : `${formatCurrency(p.margem)} (${Math.round(p.margemPct)}%)`}</td>
                    <td className="py-2.5 text-right"><BotaoAcao onClick={() => onVerCupons(p.nome)}>Ver cupons</BotaoAcao></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <Paginador pagina={paginaAtual} total={filtradosRanking.length} porPagina={POR_PAGINA} onMudar={setPagina} rotulo="produto(s)" />
      </Cartao>
    </div>
  );
}
