// ════════════════════════════════════════════════════════════
//  Históricos de vendas e de estoque (migration 225). O banco grava e devolve; aqui só pedimos,
//  formatamos e exportamos. Só quem administra a empresa consulta (conferido no servidor).
// ════════════════════════════════════════════════════════════
import { intervaloPeriodo } from "./analiseVendas.js";
import { formatCurrency } from "../../pages/pdv/pdvHelpers.js";

export const POR_PAGINA = 20;
const LOTE_EXPORTACAO = 500;
const MAXIMO_EXPORTACAO = 20000;

export const TIPOS_MOVIMENTO = { venda: "Venda", ajuste: "Ajuste", cadastro: "Cadastro", estorno: "Estorno" };
export const CANAIS = { mesa: "Mesa", consumo_local: "Consumo no local", retirada: "Retirada", entrega: "Entrega" };
const STATUS_NOTA = {
  autorizado: "autorizada", cancelado: "cancelada", rejeitado: "rejeitada", contingencia: "em contingência",
  enviado: "enviada", assinado: "em emissão", reservado: "em emissão", erro: "com erro",
};

export const dataHora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

/** Período da tela → datas em ISO para o banco ("tudo" não limita o começo). */
export function intervaloIso(periodo, ini, fim, agora = new Date()) {
  const [de, ate] = intervaloPeriodo(periodo, ini, fim, agora);
  return { de: de.getTime() > 0 ? de.toISOString() : null, ate: ate.toISOString() };
}

export function textoDaNota(nota) {
  if (!nota) return "Sem nota";
  const modelo = Number(nota.modelo) === 55 ? "NF-e" : "NFC-e";
  const teste = nota.ambiente === "homologacao" ? " (teste)" : "";
  return `${modelo} ${nota.numero} · ${STATUS_NOTA[nota.status] || nota.status}${teste}`;
}

export const textoDasFormas = (formas) => (formas || []).map((f) => `${f.forma} ${formatCurrency(Number(f.valor) || 0)}`).join(" + ") || "—";

/** Quanto o movimento mudou o estoque, com o sinal. */
export const variacaoDoMovimento = (m) => (Number(m.depois) || 0) - (Number(m.antes) || 0);
export const textoDaVariacao = (m) => `${variacaoDoMovimento(m) > 0 ? "+" : variacaoDoMovimento(m) < 0 ? "−" : ""}${Number(m.quantidade) || 0}`;

/** Justificativa mostrada na linha: a venda (pedido e nota) ou o motivo informado. */
export function justificativaDoMovimento(m) {
  if (m.tipo !== "venda") return m.motivo || "—";
  if (!m.vendaId) return "Venda sem registro detalhado";
  return [`Pedido ${(m.pedidos || []).join(", ")}`, textoDaNota(m.notas?.[0]), m.cliente].filter(Boolean).join(" · ");
}

/** A função ainda não existe neste banco (migration 225 não rodada). */
export const semFuncao = (erro) => !!erro && (erro.code === "PGRST202" || erro.code === "42883");

async function consultar(supabase, funcao, args) {
  const { data, error } = await supabase.rpc(funcao, args);
  if (semFuncao(error)) return { ausente: true };
  if (error) throw error;
  return data;
}

export const buscarVendas = (supabase, { lojaId, de = null, ate = null, busca = "", forma = "", pagina = 1, porPagina = POR_PAGINA }) =>
  consultar(supabase, "app_vendas_historico", {
    p_loja_id: lojaId, p_de: de, p_ate: ate, p_busca: busca.trim() || null, p_forma: forma || null, p_pagina: pagina, p_por_pagina: porPagina,
  });

export const buscarVenda = (supabase, vendaId) => consultar(supabase, "app_venda_detalhe", { p_venda_id: vendaId });

export const buscarMovimentos = (supabase, { lojaId, de = null, ate = null, produtoId = null, tipo = "", pagina = 1, porPagina = POR_PAGINA }) =>
  consultar(supabase, "app_estoque_movimentos", {
    p_loja_id: lojaId, p_de: de, p_ate: ate, p_produto_id: produtoId || null, p_tipo: tipo || null, p_pagina: pagina, p_por_pagina: porPagina,
  });

export async function ajustarEstoque(supabase, { produtoId, novoEstoque, motivo }) {
  const { data, error } = await supabase.rpc("app_estoque_ajustar", { p_produto_id: produtoId, p_novo_estoque: novoEstoque, p_motivo: motivo });
  if (error) throw error;
  return data;
}

const RECUSAS = [
  ["justificativa_obrigatoria", "Escreva a justificativa do ajuste (pelo menos 3 letras)."],
  ["estoque_sem_mudanca", "O estoque informado é igual ao atual."],
  ["parametro_invalido", "Informe uma quantidade inteira, de zero em diante."],
  ["produto_nao_encontrado", "Produto não encontrado ou sem permissão para ajustar."],
  ["forbidden", "Só quem administra a empresa pode ver estes históricos."],
  ["venda_nao_encontrada", "Venda não encontrada."],
];
export function mensagemDoHistorico(erro) {
  const texto = String(erro?.message || "");
  return RECUSAS.find(([codigo]) => texto.includes(codigo))?.[1] || `Não foi possível concluir${texto ? `: ${texto}` : ""}.`;
}

/** Todas as linhas do filtro, em lotes, para a exportação. `buscar` recebe { pagina, porPagina }. */
export async function todasAsLinhas(buscar) {
  const linhas = [];
  for (let pagina = 1; linhas.length < MAXIMO_EXPORTACAO; pagina += 1) {
    const r = await buscar({ pagina, porPagina: LOTE_EXPORTACAO });
    if (!r || r.ausente) break;
    linhas.push(...(r.linhas || []));
    if (linhas.length >= (Number(r.total) || 0) || !r.linhas?.length) break;
  }
  return linhas;
}

const numeroOuVazio = (v) => (v == null ? "" : Number(v));

export const CABECALHO_VENDAS = ["Data", "Pedidos", "Cliente", "Telefone", "Canal", "Mesa", "Operador", "Formas", "Subtotal", "Taxa de serviço", "Acréscimo", "Desconto", "Desconto de cupom", "Cupom", "Total", "Itens", "Custo", "Nota fiscal", "Origem do registro"];
export const linhaCsvDaVenda = (v) => [
  dataHora(v.quando), (v.pedidos || []).join(", "), v.cliente || "", v.telefone || "", CANAIS[v.canal] || v.canal, v.mesa || "", v.operador || "",
  textoDasFormas(v.formas), numeroOuVazio(v.subtotal), numeroOuVazio(v.taxa), numeroOuVazio(v.acrescimo), numeroOuVazio(v.descontoManual),
  numeroOuVazio(v.descontoCupom), v.cupom || "", numeroOuVazio(v.total), numeroOuVazio(v.itens), numeroOuVazio(v.custo),
  textoDaNota(v.notas?.[0]), v.origem === "reconstruida" ? "Reconstruída" : "Na venda",
];

export const CABECALHO_MOVIMENTOS = ["Data", "Produto", "Tipo", "Movimento", "Antes", "Depois", "Justificativa", "Usuário"];
export const linhaCsvDoMovimento = (m) => [
  dataHora(m.quando), m.produto, TIPOS_MOVIMENTO[m.tipo] || m.tipo, variacaoDoMovimento(m), numeroOuVazio(m.antes), numeroOuVazio(m.depois),
  justificativaDoMovimento(m), m.usuario || "",
];
