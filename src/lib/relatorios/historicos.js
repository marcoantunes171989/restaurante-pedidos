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
  const daVenda = () => [`Pedido ${(m.pedidos || []).join(", ")}`, textoDaNota(m.notas?.[0]), m.cliente].filter(Boolean).join(" · ");
  if (m.tipo === "estorno" && m.vendaId) return `${m.motivo || "Estorno"} · ${daVenda()}`;
  if (m.tipo !== "venda") return m.motivo || "—";
  return m.vendaId ? daVenda() : "Venda sem registro detalhado";
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

// ── Estorno de venda (migration 226) ────────────────────────
export const MOTIVO_ESTORNO_MINIMO = 15;

export const buscarPreviaDoEstorno = (supabase, vendaId) => consultar(supabase, "app_venda_estorno_previa", { p_venda_id: vendaId });

export async function estornarVenda(supabase, { vendaId, motivo }) {
  const { data, error } = await supabase.rpc("app_venda_estornar", { p_venda_id: vendaId, p_motivo: motivo });
  if (error) throw error;
  return data;
}

/** Vendas ainda não estornadas cobertas por uma nota. Vazio para quem não administra ou sem a migration. */
export async function vendasDaNota(supabase, documentoId) {
  const r = await consultar(supabase, "app_venda_da_nota", { p_documento_id: documentoId });
  return Array.isArray(r) ? r : [];
}

const BLOQUEIOS = {
  venda_ja_estornada: () => "Esta venda já foi estornada.",
  pedido_nao_consta_como_pago: () => "Um pedido desta venda não consta mais como pago. Confira o pedido antes de estornar.",
  venda_com_nota_ativa: (detalhe) => `A venda tem nota fiscal ativa${detalhe ? `: ${detalhe}` : ""}. Cancele ou descarte a nota antes, no menu Fiscal.`,
  abra_o_caixa_para_estornar: () => "Há dinheiro a devolver: abra o caixa antes de estornar.",
  venda_nao_encontrada: () => "Venda não encontrada ou sem permissão para estornar.",
  justificativa_obrigatoria: () => `Escreva a justificativa do estorno (pelo menos ${MOTIVO_ESTORNO_MINIMO} letras).`,
};
export const textoDoBloqueio = (b) => BLOQUEIOS[b?.codigo]?.(b.detalhe) || "Esta venda não pode ser estornada agora.";

export function mensagemDoEstorno(erro) {
  const texto = String(erro?.message || "");
  const codigo = Object.keys(BLOQUEIOS).find((c) => texto.includes(c));
  return codigo ? BLOQUEIOS[codigo](erro?.details) : mensagemDoHistorico(erro);
}

/** O que o estorno vai fazer, em frases, a partir da prévia calculada pelo banco. */
export function efeitosDoEstorno(plano) {
  if (!plano) return [];
  const efeitos = [{ titulo: "Pedidos", linhas: [`${(plano.pedidos || []).join(", ")} passam a cancelados e saem do faturamento.`] }];
  efeitos.push({
    titulo: "Estoque",
    linhas: plano.semRegistroDeEstoque
      ? ["Esta venda não tem baixa registrada: o estoque não muda."]
      : plano.estoque.map((e) => (e.existe ? `${e.produto}: voltam ${e.quantidade}` : `${e.produto}: produto excluído, não volta ao estoque`)),
  });
  if (plano.pontos?.length) {
    const porCliente = new Map();
    for (const p of plano.pontos) {
      const c = porCliente.get(p.clienteId) || { nome: p.cliente || "Cliente", saldo: Number(p.saldo) || 0, soma: 0, partes: [] };
      c.soma += Number(p.pontos) || 0;
      c.partes.push(`${p.pontos > 0 ? "+" : ""}${p.pontos}`);
      porCliente.set(p.clienteId, c);
    }
    efeitos.push({
      titulo: "Pontos",
      linhas: [...porCliente.values()].map((c) => `${c.nome}: ${c.partes.join(" e ")} pts, saldo de ${c.saldo} para ${c.saldo + c.soma}${c.saldo + c.soma < 0 ? " (os pontos já foram usados: o saldo fica negativo)" : ""}`),
    });
  }
  // A parte paga com pontos volta em pontos (acima); aqui entra só o que o cliente recebe de volta.
  const aDevolver = (plano.caixa || []).filter((c) => !/pontos/i.test(c.forma));
  efeitos.push({
    titulo: "Dinheiro",
    linhas: [
      aDevolver.length ? `Devolva ao cliente: ${textoDasFormas(aDevolver)}. O sistema não faz o reembolso no cartão nem no PIX.` : "Nada a devolver em dinheiro, cartão ou PIX.",
      plano.caixaId == null ? "Nenhum caixa aberto: a saída não é lançada no caixa." : "A saída é lançada no caixa aberto.",
    ],
  });
  if (plano.cupom) {
    efeitos.push({ titulo: "Cupom", linhas: [plano.cupomUsoId == null ? `Cupom ${plano.cupom}: uso não localizado, o contador não muda.` : `O uso do cupom ${plano.cupom} volta a ficar disponível.`] });
  }
  return efeitos;
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

export const CABECALHO_VENDAS = ["Data", "Pedidos", "Cliente", "Telefone", "Canal", "Mesa", "Operador", "Formas", "Subtotal", "Taxa de serviço", "Acréscimo", "Desconto", "Desconto de cupom", "Cupom", "Total", "Itens", "Custo", "Nota fiscal", "Origem do registro", "Situação", "Motivo do estorno"];
export const linhaCsvDaVenda = (v) => [
  dataHora(v.quando), (v.pedidos || []).join(", "), v.cliente || "", v.telefone || "", CANAIS[v.canal] || v.canal, v.mesa || "", v.operador || "",
  textoDasFormas(v.formas), numeroOuVazio(v.subtotal), numeroOuVazio(v.taxa), numeroOuVazio(v.acrescimo), numeroOuVazio(v.descontoManual),
  numeroOuVazio(v.descontoCupom), v.cupom || "", numeroOuVazio(v.total), numeroOuVazio(v.itens), numeroOuVazio(v.custo),
  textoDaNota(v.notas?.[0]), v.origem === "reconstruida" ? "Reconstruída" : "Na venda",
  v.estorno ? `Estornada em ${dataHora(v.estorno.quando)} por ${v.estorno.por || "—"}` : "Válida", v.estorno?.motivo || "",
];

export const CABECALHO_MOVIMENTOS = ["Data", "Produto", "Tipo", "Movimento", "Antes", "Depois", "Justificativa", "Usuário"];
export const linhaCsvDoMovimento = (m) => [
  dataHora(m.quando), m.produto, TIPOS_MOVIMENTO[m.tipo] || m.tipo, variacaoDoMovimento(m), numeroOuVazio(m.antes), numeroOuVazio(m.depois),
  justificativaDoMovimento(m), m.usuario || "",
];
