// ════════════════════════════════════════════════════════════
//  Venda → rascunho fiscal (Etapa 1 do módulo NF-e/NFC-e) — Pedido Prime
//
//  Converte UMA venda paga (pedidos da conta + pagamento do caixa) no rascunho
//  que o futuro emissor transforma em XML (mod. 65 ou 55). Puro e sem
//  dependências de rede/banco: tudo testável.
//
//  Regras de projeto:
//   - Dinheiro sempre em CENTAVOS inteiros (sem erro de ponto flutuante).
//   - Desconto (cupom + manual) vira vDesc RATEADO por item; acréscimo vira
//     vOutro rateado; a soma dos itens fecha exatamente o total.
//   - Taxa de serviço NÃO tem tratamento fixo: a loja (com o contador) escolhe
//     "outras_despesas" (entra na nota como vOutro) ou "fora_da_nota". Sem
//     escolha, a venda fica com pendência — o sistema não decide sozinho.
//   - Códigos de meio de pagamento (tPag) NÃO estão fixos aqui: vêm do mapa
//     configurado (fonte oficial: Informe Técnico de meios de pagamento ENCAT).
//   - Nunca adivinha: produto não encontrado, nome ambíguo, forma sem código
//     ou total divergente viram PENDÊNCIA, e a venda não fica apta.
// ════════════════════════════════════════════════════════════

import { resolverFiscalProduto, pendenciasFiscais } from "../fiscalService.js";

// ── Dinheiro em centavos ───────────────────────────────────
export function paraCentavos(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, (m, i, s) => (s.includes(",") ? "" : m)).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export function deCentavos(c) {
  return Math.round(c) / 100;
}
function brl(c) {
  const s = (Math.abs(c) / 100).toFixed(2).replace(".", ",");
  return c < 0 ? `-${s}` : s;
}

/**
 * Rateia `totalCentavos` proporcionalmente às `bases` (centavos). A sobra de
 * arredondamento vai, um centavo por vez, para os maiores itens — a soma do
 * resultado é SEMPRE igual ao total.
 */
export function ratearCentavos(totalCentavos, bases = []) {
  const n = bases.length;
  if (!n) return [];
  const total = Math.max(0, Math.round(totalCentavos));
  const out = new Array(n).fill(0);
  if (!total) return out;
  const soma = bases.reduce((s, b) => s + Math.max(0, b), 0);
  // Ordem de recebimento da sobra: maior base primeiro (empate: ordem original).
  const ordem = bases.map((b, i) => [Math.max(0, b), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[1]);
  if (!soma) { out[ordem[0]] = total; return out; }
  let usado = 0;
  for (let i = 0; i < n; i++) { out[i] = Math.floor((total * Math.max(0, bases[i])) / soma); usado += out[i]; }
  let sobra = total - usado;
  for (let k = 0; sobra > 0; k = (k + 1) % n, sobra--) out[ordem[k]] += 1;
  return out;
}

// ── Vínculo item do pedido → produto cadastrado ────────────
const normNome = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Hoje o item do pedido guarda só nome/preço/quantidade. Se o item tiver o id
 * do produto (produtoId/productId), ele vence; senão casa pelo nome dentro da
 * MESMA loja. Nome repetido não é escolhido automaticamente.
 * @returns {{ produto: object|null, via: 'id'|'nome'|'ambiguo'|'nenhum' }}
 */
export function vincularProduto(item, produtos = [], lojaId = null) {
  const daLoja = (produtos || []).filter((p) => lojaId == null || p.lojaId == null || String(p.lojaId) === String(lojaId));
  const id = item?.produtoId ?? item?.productId ?? null;
  if (id != null) {
    const p = daLoja.find((x) => String(x.id) === String(id));
    if (p) return { produto: p, via: "id" };
  }
  const alvo = normNome(item?.name ?? item?.nome);
  if (!alvo) return { produto: null, via: "nenhum" };
  const achados = daLoja.filter((p) => normNome(p.name ?? p.nome) === alvo);
  if (achados.length === 1) return { produto: achados[0], via: "nome" };
  if (achados.length > 1) return { produto: null, via: "ambiguo" };
  return { produto: null, via: "nenhum" };
}

// ── Pagamentos → meio de pagamento fiscal ──────────────────
/**
 * @param detalhes  [{ forma, valor }] como o caixa grava hoje.
 * @param formas    formas cadastradas da loja [{ id, nome, tipo }].
 * @param mapaMeios { [tipoOuIdDaForma]: codigoMeio } — configuração da loja.
 */
export function mapearPagamentos(detalhes = [], formas = [], mapaMeios = {}) {
  const pendencias = [];
  const pagamentos = (detalhes || []).map((d) => {
    const nome = String(d?.forma ?? "").trim() || "Pagamento";
    const valorCentavos = paraCentavos(d?.valor);
    const cad = (formas || []).find((f) => normNome(f.nome) === normNome(nome)) || null;
    let meio = null;
    if (cad) meio = mapaMeios?.[`id:${cad.id}`] ?? mapaMeios?.[cad.tipo] ?? null;
    if (!meio && /pontos/i.test(nome)) {
      pendencias.push(`Pagamento com pontos (R$ ${brl(valorCentavos)}): defina com o contador se é desconto ou outro meio.`);
    } else if (!meio) {
      pendencias.push(`Forma "${nome}" sem código de pagamento fiscal configurado.`);
    }
    return { forma: nome, formaId: cad?.id ?? null, tipo: cad?.tipo ?? null, meio, valorCentavos };
  });
  return { pagamentos, pendencias };
}

/**
 * Composição da conta fechada no caixa (o PDV calcula; a baixa passa a
 * receber). Mesma fórmula do PDV: subtotal + taxa + acréscimo − desconto
 * manual − cupom, nunca abaixo de zero. Serve direto como `ajustes` de
 * montarVendaFiscal (subtotal/total são ignorados lá).
 */
export function composicaoDaConta({ subtotal, taxaServico, acrescimo, descontoManual, descontoCupom } = {}) {
  const pos = (v) => Math.max(0, paraCentavos(v));
  const c = { subtotal: pos(subtotal), taxaServico: pos(taxaServico), acrescimo: pos(acrescimo), descontoManual: pos(descontoManual), descontoCupom: pos(descontoCupom) };
  const total = Math.max(0, c.subtotal + c.taxaServico + c.acrescimo - c.descontoManual - c.descontoCupom);
  return {
    subtotal: deCentavos(c.subtotal), taxaServico: deCentavos(c.taxaServico), acrescimo: deCentavos(c.acrescimo),
    descontoManual: deCentavos(c.descontoManual), descontoCupom: deCentavos(c.descontoCupom), total: deCentavos(total),
  };
}

const STATUS_FORA = new Set(["cancelled", "cancelado", "canceled"]);
const TRATAMENTOS_TAXA = new Set(["outras_despesas", "fora_da_nota"]);

/**
 * Monta o rascunho fiscal de uma venda paga.
 *
 * @param {object}   p
 * @param {object[]} p.pedidos    pedidos da conta (formato do app: { id, lojaId, status, items:[{name,price,quantity,produtoId?}] }).
 * @param {object[]} p.produtos   produtos da loja (com vínculo fiscal).
 * @param {object}   p.pagamento  { total, troco, detalhes:[{forma, valor}] } — o que o caixa cobrou.
 * @param {object}   [p.ajustes]  { desconto, descontoCupom, descontoManual, acrescimo, taxaServico } em reais.
 * @param {object}   [p.regras]   { taxaServico: 'outras_despesas'|'fora_da_nota' } — decisão da loja/contador.
 * @param {object[]} [p.formas]   formas de pagamento cadastradas.
 * @param {object}   [p.mapaMeios] mapa forma → código do meio de pagamento.
 * @param {object}   [p.ctxFiscal] contexto do resolverFiscalProduto.
 */
export function montarVendaFiscal({
  pedidos = [], produtos = [], pagamento = {}, ajustes = {}, regras = {},
  formas = [], mapaMeios = {}, ctxFiscal = {}, parcial = false,
} = {}) {
  // parcial=true: prévia no caixa ANTES de fechar — não confere total cobrado,
  // troco nem cobertura do pagamento (ainda em digitação). A emissão real usa
  // sempre a conferência completa.
  const pendencias = [];
  const validos = (pedidos || []).filter((o) => !STATUS_FORA.has(String(o?.status ?? "").toLowerCase()));
  const lojas = [...new Set(validos.map((o) => o?.lojaId).filter((x) => x != null).map(String))];
  if (lojas.length > 1) {
    return { apto: false, erro: "A venda mistura pedidos de lojas diferentes.", pendencias: ["Pedidos de lojas diferentes."], itens: [], pagamentos: [], totais: null, pedidosIds: [] };
  }
  const lojaId = validos.find((o) => o?.lojaId != null)?.lojaId ?? null;

  // 1) Itens (valor bruto = preço × quantidade, como o app e a RPC 118 calculam).
  const itens = [];
  for (const o of validos) {
    for (const it of o?.items || []) {
      const quantidade = Number(it?.quantity ?? it?.quantidade ?? 0);
      const unitC = paraCentavos(it?.price ?? it?.valorUnitario);
      if (!(quantidade > 0)) continue;
      const brutoC = Math.round(unitC * quantidade);
      const { produto, via } = vincularProduto(it, produtos, lojaId);
      const pend = [];
      let fiscal = null;
      if (!produto) {
        pend.push(via === "ambiguo"
          ? `Mais de um produto com o nome "${it?.name}". Vincule o item ao produto certo.`
          : `Item "${it?.name}" sem produto cadastrado na loja.`);
      } else {
        fiscal = resolverFiscalProduto(produto, ctxFiscal);
        pend.push(...pendenciasFiscais(fiscal));
      }
      if (brutoC <= 0) pend.push("Item com valor zero.");
      itens.push({
        seq: itens.length + 1, pedidoId: o.id,
        produtoId: produto?.id ?? null, vinculo: via,
        nome: it?.name ?? it?.nome ?? "", quantidade,
        valorUnitario: deCentavos(unitC), valorBruto: deCentavos(brutoC),
        _brutoC: brutoC, fiscal, pendencias: pend,
      });
    }
  }
  if (!itens.length) pendencias.push("Venda sem itens.");

  // 2) Ajustes da conta.
  const descontoC = paraCentavos(ajustes.desconto) + paraCentavos(ajustes.descontoCupom) + paraCentavos(ajustes.descontoManual);
  const acrescimoC = paraCentavos(ajustes.acrescimo);
  const taxaC = paraCentavos(ajustes.taxaServico);
  const tratTaxa = regras?.taxaServico;
  if (taxaC > 0 && !TRATAMENTOS_TAXA.has(tratTaxa)) {
    pendencias.push("Taxa de serviço sem regra fiscal definida (entra na nota como outras despesas ou fica fora da nota?).");
  }
  const taxaNaNotaC = taxaC > 0 && tratTaxa === "outras_despesas" ? taxaC : 0;
  const taxaForaC = taxaC > 0 && tratTaxa === "fora_da_nota" ? taxaC : 0;

  const bases = itens.map((x) => x._brutoC);
  const vProdC = bases.reduce((s, b) => s + b, 0);
  if (descontoC > vProdC) pendencias.push("Desconto maior que o valor dos produtos.");
  const descItens = ratearCentavos(Math.min(descontoC, vProdC), bases);
  const outroItens = ratearCentavos(acrescimoC + taxaNaNotaC, bases);
  itens.forEach((it, i) => {
    it.vDesc = deCentavos(descItens[i]);
    it.vOutro = deCentavos(outroItens[i]);
    it.valorLiquido = deCentavos(it._brutoC - descItens[i] + outroItens[i]);
    delete it._brutoC;
  });
  const vDescC = descItens.reduce((s, x) => s + x, 0);
  const vOutroC = outroItens.reduce((s, x) => s + x, 0);
  const vNFC = vProdC - vDescC + vOutroC;

  // 3) Pagamentos: confere o que o caixa cobrou com a composição.
  const { pagamentos, pendencias: pendPag } = mapearPagamentos(pagamento?.detalhes, formas, mapaMeios);
  pendencias.push(...pendPag);
  const cobradoC = paraCentavos(pagamento?.total);
  const esperadoC = vNFC + taxaForaC + (taxaC > 0 && !TRATAMENTOS_TAXA.has(tratTaxa) ? taxaC : 0);
  if (!parcial && itens.length && cobradoC !== esperadoC) {
    pendencias.push(`Total cobrado (R$ ${brl(cobradoC)}) difere da composição da venda (R$ ${brl(esperadoC)}): diferença de R$ ${brl(cobradoC - esperadoC)}.`);
  }
  // Parte não fiscal (taxa fora da nota) sai dos pagamentos, rateada.
  const pagosC = pagamentos.map((p) => p.valorCentavos);
  const foraPorPag = ratearCentavos(taxaForaC, pagosC);
  pagamentos.forEach((p, i) => { p.valorCentavos -= foraPorPag[i]; p.valor = deCentavos(p.valorCentavos); });
  const vPagC = pagamentos.reduce((s, p) => s + p.valorCentavos, 0);
  const trocoCalcC = Math.max(0, vPagC - vNFC);
  if (!parcial && pagamento?.troco != null && pagamento.troco !== "" && paraCentavos(pagamento.troco) !== trocoCalcC) {
    pendencias.push(`Troco informado (R$ ${brl(paraCentavos(pagamento.troco))}) difere de pago − valor da nota (R$ ${brl(trocoCalcC)}).`);
  }
  if (!parcial && itens.length && vPagC < vNFC) pendencias.push("Pagamentos não cobrem o valor da nota.");

  const itensPend = itens.filter((it) => it.pendencias.length);
  const apto = itens.length > 0 && pendencias.length === 0 && itensPend.length === 0;
  return {
    apto, erro: null, lojaId,
    pedidosIds: validos.map((o) => o.id),
    itens,
    pagamentos: pagamentos.map((p) => ({ forma: p.forma, formaId: p.formaId, tipo: p.tipo, meio: p.meio, valor: p.valor })),
    totais: {
      vProd: deCentavos(vProdC), vDesc: deCentavos(vDescC), vOutro: deCentavos(vOutroC),
      vNF: deCentavos(vNFC), vPag: deCentavos(vPagC), vTroco: deCentavos(trocoCalcC),
      taxaServicoForaDaNota: deCentavos(taxaForaC),
    },
    pendencias,
    resumo: apto ? "Venda pronta para virar nota fiscal." : `${pendencias.length} pendência(s) da venda e ${itensPend.length} item(ns) com pendência.`,
  };
}

/**
 * U2 — "Corrigir e emitir de novo": refaz só a parte FISCAL dos itens de uma
 * venda já guardada na nota (depois que a loja corrigiu o cadastro do produto).
 * Valores, pagamentos e pedidos não mudam (o banco confere — migration 188).
 * @returns {object} a venda com fiscal/pendências novas e apto recalculado
 */
export function refazerFiscalDaVenda(venda, produtos = [], ctxFiscal = {}) {
  const itens = (venda?.itens || []).map((it) => {
    const produto = (produtos || []).find((p) => String(p.id) === String(it.produtoId)) || null;
    const pend = [];
    let fiscal = null;
    if (!produto) pend.push(`Item "${it.nome}" sem produto cadastrado na loja.`);
    else { fiscal = resolverFiscalProduto(produto, ctxFiscal); pend.push(...pendenciasFiscais(fiscal)); }
    return { ...it, fiscal, pendencias: pend };
  });
  const apto = (venda?.pendencias || []).length === 0 && itens.length > 0 && itens.every((it) => it.pendencias.length === 0);
  return { ...venda, itens, apto };
}
