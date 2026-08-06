/**
 * Cupons térmicos Pedido Prime — impressoras de automação comercial (80mm).
 *
 * Modelos (documento NÃO fiscal):
 *  1. Cupom simplificado do cliente
 *  2. Comprovante completo de pagamento
 *  3. Pedido para produção (cozinha) — um cupom por setor
 *  4. Conferência de mesa / comanda
 *  5. Pré-conta
 *  6. Comprovante de entrega / retirada
 *
 * Fonte única dos layouts do PDV. A Central de Ajuda descreve estes modelos
 * na seção "Cupons térmicos" (pdvDocumentacao.js).
 */

import { formatCurrency } from "./pdvHelpers";

const MARCA = "PEDIDO PRIME";
const SITE = "pedidoprime.com.br";

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function moeda(v) {
  return formatCurrency(Number(v) || 0);
}

function agoraFmt(d = new Date()) {
  return d.toLocaleString("pt-BR");
}

function horaFmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function dataHoraFmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return "—";
  }
}

function sep() {
  return `<div class="sep"></div>`;
}

function sepDuplo() {
  return `<div class="sep2"></div>`;
}

/** Dados de cabeçalho da loja + marca Pedido Prime. */
export function dadosLojaCupom(lojaInfo = {}) {
  const nome = (lojaInfo.nome || "Estabelecimento").toUpperCase();
  const doc = lojaInfo.documento
    ? (String(lojaInfo.documento).replace(/\D/g, "").length === 11
      ? `CPF: ${lojaInfo.documento}`
      : `CNPJ: ${lojaInfo.documento}`)
    : "";
  const endereco = lojaInfo.endereco || lojaInfo.configExterno?.endereco || "";
  const telefone = lojaInfo.telefone || lojaInfo.configExterno?.telefone || lojaInfo.emailResponsavel || "";
  return { marca: MARCA, nome, doc, endereco, telefone, site: SITE, logoUrl: lojaInfo.logoUrl || "" };
}

function cabecalhoHtml(loja, tagLinhas = []) {
  const L = dadosLojaCupom(loja);
  const tags = (Array.isArray(tagLinhas) ? tagLinhas : [tagLinhas])
    .filter(Boolean)
    .map((t) => `<div class="c sm b">${esc(t)}</div>`)
    .join("");
  return `
    <div class="c brand">${esc(L.marca)}</div>
    <div class="c b big">${esc(L.nome)}</div>
    ${L.endereco ? `<div class="c sm mut">${esc(L.endereco)}</div>` : ""}
    ${L.telefone ? `<div class="c sm mut">${esc(L.telefone)}</div>` : ""}
    ${L.doc ? `<div class="c sm mut">${esc(L.doc)}</div>` : ""}
    ${sep()}
    ${tags}
    ${tags ? sep() : ""}
  `;
}

function rodapeMarca(extra = "") {
  return `
    ${sep()}
    <div class="c sm mut">${esc(SITE)}</div>
    <div class="c sm b">Obrigado pela preferência!</div>
    <div class="c sm mut">Sistema ${esc(MARCA)}</div>
    ${extra}
  `;
}

/** Modificadores legíveis para cupom (+ extra / − remoção / obs). */
export function linhasModificadores(item = {}) {
  const out = [];
  (item.extraIngredients || []).forEach((x) => out.push(`+ ${x}`));
  (item.removedIngredients || []).forEach((x) => out.push(`- Sem ${x}`));
  (item.selectedIngredients || [])
    .filter((x) => x && !String(x).startsWith("Sem "))
    .forEach((x) => {
      if (!(item.extraIngredients || []).includes(x)) out.push(`· ${x}`);
    });
  if (item.observation) out.push(`Obs: ${item.observation}`);
  return out;
}

function modsHtml(item, { grande = false } = {}) {
  const linhas = linhasModificadores(item);
  if (!linhas.length) return "";
  const cls = grande ? "mod big-mod" : "mod";
  return linhas.map((l) => `<div class="${cls}">${esc(l)}</div>`).join("");
}

/** Resolve o setor de produção do item (cadastro do produto → heurística). */
export function setorDoItemCupom(item, products = [], setores = []) {
  const porNome = {};
  products.forEach((p) => {
    if (p?.name) porNome[p.name] = p.setorId ?? null;
  });
  const nomePorId = {};
  setores.forEach((s) => {
    if (s?.id != null) nomePorId[s.id] = s.nome || s.name || `Setor ${s.id}`;
  });
  const sid = item?.setorId ?? porNome[item?.name];
  if (sid != null && nomePorId[sid]) return nomePorId[sid];
  const prod = products.find((p) => p.name === item?.name);
  const cat = prod?.category || prod?.categoria || "";
  if (/bebida|drink|suco|refri|bar/i.test(cat) || /bebida|drink|suco|refri/i.test(item?.name || "")) return "Bar";
  if (/sobremesa|doce|bolo|sweet/i.test(cat) || /sobremesa|doce|bolo/i.test(item?.name || "")) return "Sobremesa";
  return "Cozinha";
}

/** Agrupa itens planos por nome de setor, na ordem de cadastro dos setores. */
export function agruparItensPorSetor(itens = [], products = [], setores = []) {
  const ordem = setores.filter((s) => s.ativo !== false).map((s) => s.nome || s.name).filter(Boolean);
  const grupos = new Map();
  itens.forEach((it) => {
    const setor = setorDoItemCupom(it, products, setores);
    if (!grupos.has(setor)) grupos.set(setor, []);
    grupos.get(setor).push(it);
  });
  const nomes = [
    ...ordem.filter((n) => grupos.has(n)),
    ...[...grupos.keys()].filter((n) => !ordem.includes(n)),
  ];
  return nomes.map((nome) => ({ setor: nome, itens: grupos.get(nome) || [] }));
}

function achatarItens(pedidos = []) {
  const out = [];
  pedidos.forEach((o) => {
    (o.items || []).forEach((it, idx) => {
      out.push({
        ...it,
        _pedidoId: o.id,
        _hora: o.createdAtISO || o.updatedAtISO || null,
        _comanda: o.command || "",
        _idx: idx,
      });
    });
  });
  return out;
}

const CSS_TERMICO = `
*{margin:0;padding:0;box-sizing:border-box}
@page{size:80mm auto;margin:0}
body{font-family:'Courier New',Courier,monospace;font-size:12px;width:80mm;padding:3.5mm 3mm;color:#000;line-height:1.25;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.c{text-align:center}.b{font-weight:700}.big{font-size:14px}.xl{font-size:16px}.xxl{font-size:18px}
.sm{font-size:10px}.xs{font-size:9px}.mut{color:#222}
.brand{font-size:11px;font-weight:700;letter-spacing:.12em}
.sep{border-top:1px dashed #000;margin:5px 0}
.sep2{border-top:2px solid #000;margin:6px 0}
.row{display:flex;justify-content:space-between;gap:6px;margin:2px 0;align-items:flex-start}
.row span:last-child{white-space:nowrap}
.cols{display:flex;gap:4px;font-size:10px;font-weight:700;margin:2px 0}
.cols .q{width:28px}.cols .d{flex:1}.cols .u{width:52px;text-align:right}.cols .t{width:56px;text-align:right}
.item{margin:3px 0}
.item .nome{font-weight:700}
.mod{padding-left:14px;font-size:10px}
.big-mod{padding-left:10px;font-size:12px;font-weight:700}
.box{border:1px solid #000;padding:4px 5px;margin:6px 0;text-align:center;font-size:10px;font-weight:700}
.assin{margin-top:10px}.assin .ln{border-bottom:1px solid #000;height:18px;margin:8px 0 2px}
.qr{width:72px;height:72px;margin:6px auto;border:1px solid #000;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700}
@media print{body{padding:2.5mm 2mm}}
`;

/** Abre janela de impressão térmica 80mm e dispara o print. */
export function abrirCupomTermico(tituloDoc, corpoHtml) {
  const j = window.open("", "_blank", "width=420,height=720");
  if (!j) return false;
  j.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${esc(tituloDoc)}</title>
<style>${CSS_TERMICO}</style></head><body>${corpoHtml}
<script>window.onload=function(){window.print();setTimeout(function(){window.close()},400);}</scr` + `ipt>
</body></html>`);
  j.document.close();
  return true;
}

function linhaItemSimples(it) {
  const tot = (Number(it.price) || 0) * (Number(it.quantity) || 0);
  return `<div class="item">
    <div class="row"><span class="nome">${esc(it.quantity)}x ${esc(it.name)}</span><span>${moeda(tot)}</span></div>
    ${modsHtml(it)}
  </div>`;
}

function linhaItemCompleta(it) {
  const qtd = Number(it.quantity) || 0;
  const unit = Number(it.price) || 0;
  return `<div class="item">
    <div class="cols">
      <span class="q">${esc(qtd)}</span>
      <span class="d">${esc(it.name)}</span>
      <span class="u">${moeda(unit)}</span>
      <span class="t">${moeda(unit * qtd)}</span>
    </div>
    ${modsHtml(it)}
  </div>`;
}

function linhaItemComHora(it) {
  const tot = (Number(it.price) || 0) * (Number(it.quantity) || 0);
  return `<div class="item">
    <div class="cols">
      <span class="q" style="width:36px">${esc(horaFmt(it._hora))}</span>
      <span class="q">${esc(it.quantity)}</span>
      <span class="d">${esc(it.name)}</span>
      <span class="t">${moeda(tot)}</span>
    </div>
    ${modsHtml(it)}
  </div>`;
}

function blocoFinanceiro({
  subtotal = 0,
  desconto = 0,
  acrescimo = 0,
  taxaServico = 0,
  taxaEntrega = 0,
  total = 0,
  labelTotal = "TOTAL",
} = {}) {
  return `
    ${sep()}
    <div class="row"><span>Subtotal</span><span>${moeda(subtotal)}</span></div>
    ${desconto > 0 ? `<div class="row"><span>Desconto</span><span>-${moeda(desconto)}</span></div>` : ""}
    ${acrescimo > 0 ? `<div class="row"><span>Acréscimo</span><span>${moeda(acrescimo)}</span></div>` : ""}
    ${taxaServico > 0 ? `<div class="row"><span>Taxa de serviço</span><span>${moeda(taxaServico)}</span></div>` : ""}
    ${taxaEntrega > 0 ? `<div class="row"><span>Taxa de entrega</span><span>${moeda(taxaEntrega)}</span></div>` : ""}
    ${sepDuplo()}
    <div class="row b big"><span>${esc(labelTotal)}</span><span>${moeda(total)}</span></div>
  `;
}

// ─── 1. Cupom simplificado do cliente ─────────────────────────────
export function htmlCupomClienteSimplificado(ctx = {}) {
  const {
    lojaInfo,
    pedidoNumero = "",
    atendimento = "Balcão",
    cliente = "",
    itens = [],
    subtotal = 0,
    desconto = 0,
    total = 0,
    formaPagamento = "",
    dataHora = new Date(),
  } = ctx;
  const linhas = itens.map(linhaItemSimples).join("");
  return `
    ${cabecalhoHtml(lojaInfo, [
      "COMPROVANTE NÃO FISCAL",
      "NÃO POSSUI VALOR FISCAL",
    ])}
    <div class="row"><span>Pedido</span><span class="b">#${esc(pedidoNumero || "—")}</span></div>
    <div class="row"><span>Data/Hora</span><span>${esc(agoraFmt(dataHora))}</span></div>
    <div class="row"><span>Atendimento</span><span>${esc(atendimento)}</span></div>
    <div class="row"><span>Cliente</span><span>${esc(cliente || "—")}</span></div>
    ${sep()}
    <div class="cols"><span class="q">QTD</span><span class="d">DESCRIÇÃO</span><span class="t">TOTAL</span></div>
    ${sep()}
    ${linhas || '<div class="c sm mut">Sem itens</div>'}
    ${blocoFinanceiro({ subtotal, desconto, total, labelTotal: "TOTAL" })}
    ${formaPagamento ? `<div class="row"><span>Pagamento</span><span class="b">${esc(formaPagamento)}</span></div>` : ""}
    ${rodapeMarca(`<div class="qr">QR<br>${esc(SITE)}</div>`)}
  `;
}

// ─── 2. Comprovante completo de pagamento ─────────────────────────
export function htmlComprovanteCompletoPagamento(ctx = {}) {
  const {
    lojaInfo,
    mesa = "",
    comanda = "",
    aberturaISO = null,
    fechamentoISO = null,
    cliente = "",
    telefone = "",
    garcom = "",
    operador = "",
    itens = [],
    subtotal = 0,
    desconto = 0,
    acrescimo = 0,
    taxaServico = 0,
    taxaEntrega = 0,
    total = 0,
    pagamentos = [],
    troco = 0,
    pendente = 0,
    pagamentoId = "",
    pdvId = "PDV-01",
    caixaId = "",
    autorizacao = "",
    nsu = "",
    parcelas = 1,
  } = ctx;
  const recebido = (pagamentos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const linhasPag = (pagamentos || [])
    .map((p) => `<div class="row"><span>${esc(p.forma)}</span><span>${moeda(p.valor)}</span></div>`)
    .join("");
  return `
    ${cabecalhoHtml(lojaInfo, [
      "COMPROVANTE COMPLETO DE PAGAMENTO",
      "DOCUMENTO NÃO FISCAL",
    ])}
    <div class="row"><span>Mesa</span><span class="b">${esc(mesa || "—")}</span></div>
    <div class="row"><span>Comanda</span><span>${esc(comanda || "—")}</span></div>
    <div class="row"><span>Abertura</span><span>${esc(dataHoraFmt(aberturaISO))}</span></div>
    <div class="row"><span>Fechamento</span><span>${esc(dataHoraFmt(fechamentoISO || new Date().toISOString()))}</span></div>
    <div class="row"><span>Cliente</span><span>${esc(cliente || "—")}</span></div>
    ${telefone ? `<div class="row"><span>Telefone</span><span>${esc(telefone)}</span></div>` : ""}
    ${garcom ? `<div class="row"><span>Garçom</span><span>${esc(garcom)}</span></div>` : ""}
    <div class="row"><span>Operador</span><span>${esc(operador || "—")}</span></div>
    ${sep()}
    <div class="cols"><span class="q">QTD</span><span class="d">DESCRIÇÃO</span><span class="u">UNIT.</span><span class="t">TOTAL</span></div>
    ${sep()}
    ${itens.map(linhaItemCompleta).join("") || '<div class="c sm mut">Sem itens</div>'}
    ${blocoFinanceiro({
      subtotal,
      desconto,
      acrescimo,
      taxaServico,
      taxaEntrega,
      total,
      labelTotal: "TOTAL DA CONTA",
    })}
    ${sep()}
    <div class="c b">PAGAMENTOS</div>
    ${linhasPag || '<div class="c sm mut">—</div>'}
    <div class="row b"><span>Total recebido</span><span>${moeda(recebido)}</span></div>
    ${troco > 0 ? `<div class="row b"><span>Troco</span><span>${moeda(troco)}</span></div>` : ""}
    ${pendente > 0.009 ? `<div class="row"><span>Saldo pendente</span><span>${moeda(pendente)}</span></div>` : ""}
    ${sep()}
    <div class="c b sm">CONTROLE INTERNO</div>
    <div class="row sm"><span>Pagamento</span><span>${esc(pagamentoId || "—")}</span></div>
    <div class="row sm"><span>PDV</span><span>${esc(pdvId)}</span></div>
    <div class="row sm"><span>Caixa</span><span>${esc(caixaId || "—")}</span></div>
    ${autorizacao ? `<div class="row sm"><span>Autorização</span><span>${esc(autorizacao)}</span></div>` : ""}
    ${nsu ? `<div class="row sm"><span>NSU</span><span>${esc(nsu)}</span></div>` : ""}
    <div class="row sm"><span>Parcelas</span><span>${esc(parcelas)}</span></div>
    ${rodapeMarca()}
  `;
}

// ─── 3. Pedido para produção (cozinha / setor) ────────────────────
export function htmlPedidoProducao(ctx = {}) {
  const {
    lojaInfo,
    setor = "Cozinha",
    pedidoNumero = "",
    mesa = "",
    comanda = "",
    atendimento = "Salão",
    garcom = "",
    entradaISO = null,
    prioridade = false,
    itens = [],
    observacaoGeral = "",
  } = ctx;
  const qtdTotal = itens.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const linhas = itens.map((it) => `
    <div class="item">
      <div class="xxl b">${esc(it.quantity)}x ${esc(it.name)}</div>
      ${modsHtml(it, { grande: true })}
    </div>
  `).join("");
  return `
    ${cabecalhoHtml(lojaInfo, [])}
    <div class="c xxl b">*** ${esc(String(setor).toUpperCase())} ***</div>
    <div class="c sm">PEDIDO PARA PRODUÇÃO</div>
    ${sepDuplo()}
    <div class="row"><span>Pedido</span><span class="b xl">#${esc(pedidoNumero || "—")}</span></div>
    <div class="row"><span>Mesa</span><span class="b">${esc(mesa || "—")}</span></div>
    <div class="row"><span>Comanda</span><span>${esc(comanda || "—")}</span></div>
    <div class="row"><span>Atendimento</span><span>${esc(atendimento)}</span></div>
    ${garcom ? `<div class="row"><span>Garçom</span><span>${esc(garcom)}</span></div>` : ""}
    <div class="row"><span>Entrada</span><span>${esc(dataHoraFmt(entradaISO))}</span></div>
    <div class="row"><span>Impressão</span><span>${esc(agoraFmt())}</span></div>
    ${sepDuplo()}
    ${linhas || '<div class="c sm mut">Sem itens neste setor</div>'}
    ${observacaoGeral ? `${sep()}<div class="box">OBSERVAÇÃO: ${esc(observacaoGeral)}</div>` : ""}
    ${sepDuplo()}
    <div class="row b"><span>Itens do setor</span><span>${esc(qtdTotal)}</span></div>
    <div class="row b"><span>Prioritário</span><span>${prioridade ? "SIM" : "NÃO"}</span></div>
    <div class="c sm mut" style="margin-top:8px">${esc(MARCA)} · Produção</div>
  `;
}

// ─── 4. Conferência de mesa / comanda ─────────────────────────────
export function htmlConferenciaMesa(ctx = {}) {
  const {
    lojaInfo,
    mesa = "",
    comanda = "",
    cliente = "",
    itens = [],
    subtotal = 0,
    descontoProvisorio = 0,
    taxaEstimada = 0,
    totalEstimado = 0,
  } = ctx;
  const qtd = itens.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  return `
    ${cabecalhoHtml(lojaInfo, [
      "CONFERÊNCIA DE MESA / COMANDA",
      "CONTA AINDA EM ABERTO",
    ])}
    <div class="row"><span>Mesa</span><span class="b">${esc(mesa || "—")}</span></div>
    <div class="row"><span>Comanda</span><span>${esc(comanda || "—")}</span></div>
    <div class="row"><span>Cliente</span><span>${esc(cliente || "—")}</span></div>
    <div class="row"><span>Impressão</span><span>${esc(agoraFmt())}</span></div>
    ${sep()}
    <div class="cols"><span class="q" style="width:36px">HORA</span><span class="q">QTD</span><span class="d">DESCRIÇÃO</span><span class="t">TOTAL</span></div>
    ${sep()}
    ${itens.map(linhaItemComHora).join("") || '<div class="c sm mut">Sem itens</div>'}
    ${sep()}
    <div class="row"><span>Qtd. itens</span><span>${esc(qtd)}</span></div>
    <div class="row"><span>Subtotal</span><span>${moeda(subtotal)}</span></div>
    ${descontoProvisorio > 0 ? `<div class="row"><span>Desconto (provisório)</span><span>-${moeda(descontoProvisorio)}</span></div>` : ""}
    ${taxaEstimada > 0 ? `<div class="row"><span>Taxa serviço (estimada)</span><span>${moeda(taxaEstimada)}</span></div>` : ""}
    ${sepDuplo()}
    <div class="row b big"><span>TOTAL ESTIMADO</span><span>${moeda(totalEstimado || subtotal + taxaEstimada - descontoProvisorio)}</span></div>
    <div class="box">CONTA EM ABERTO — valores podem alterar até o fechamento</div>
    ${rodapeMarca()}
  `;
}

// ─── 5. Pré-conta ─────────────────────────────────────────────────
export function htmlPreConta(ctx = {}) {
  const {
    lojaInfo,
    mesa = "",
    comanda = "",
    cliente = "",
    pessoas = 0,
    itens = [],
    subtotal = 0,
    desconto = 0,
    taxaServico = 0,
    total = 0,
    formasAceitas = "PIX · Dinheiro · Débito · Crédito",
  } = ctx;
  const nPessoas = Math.max(0, Number(pessoas) || 0);
  const porPessoa = nPessoas > 0 ? total / nPessoas : 0;
  const arredondado = nPessoas > 0 ? Math.ceil(porPessoa * 100) / 100 : 0;
  const ajuste = nPessoas > 0 ? (arredondado * nPessoas) - total : 0;
  return `
    ${cabecalhoHtml(lojaInfo, [
      "PRÉ-CONTA",
      "DOCUMENTO SEM VALOR FISCAL",
    ])}
    <div class="row"><span>Mesa</span><span class="b">${esc(mesa || "—")}</span></div>
    <div class="row"><span>Comanda</span><span>${esc(comanda || "—")}</span></div>
    <div class="row"><span>Cliente</span><span>${esc(cliente || "—")}</span></div>
    ${nPessoas > 0 ? `<div class="row"><span>Pessoas</span><span>${esc(nPessoas)}</span></div>` : ""}
    <div class="row"><span>Impressão</span><span>${esc(agoraFmt())}</span></div>
    ${sep()}
    <div class="cols"><span class="q">QTD</span><span class="d">DESCRIÇÃO</span><span class="t">TOTAL</span></div>
    ${sep()}
    ${itens.map(linhaItemSimples).join("") || '<div class="c sm mut">Sem itens</div>'}
    ${blocoFinanceiro({ subtotal, desconto, taxaServico, total, labelTotal: "TOTAL" })}
    ${nPessoas > 1 ? `
      ${sep()}
      <div class="c b">DIVISÃO SUGERIDA</div>
      <div class="row"><span>${esc(nPessoas)} pessoas</span><span class="b">${moeda(arredondado)} / pessoa</span></div>
      ${ajuste > 0.009 ? `<div class="row sm"><span>Ajuste de arredondamento</span><span>${moeda(ajuste)}</span></div>` : ""}
    ` : ""}
    ${sep()}
    <div class="c sm">Formas aceitas</div>
    <div class="c sm b">${esc(formasAceitas)}</div>
    <div class="qr">QR<br>conta</div>
    <div class="c xs mut">Para consultar ou dividir a conta</div>
    ${rodapeMarca()}
  `;
}

// ─── 6. Comprovante de entrega / retirada ─────────────────────────
export function htmlComprovanteEntregaRetirada(ctx = {}) {
  const {
    lojaInfo,
    tipo = "retirada", // retirada | entrega
    pedidoNumero = "",
    codigoRastreio = "",
    cliente = "",
    telefone = "",
    endereco = "",
    realizadoISO = null,
    previstoISO = null,
    retiradoISO = null,
    itens = [],
    volumes = 1,
    conferidoPor = "",
    entreguePor = "",
    formaPagamento = "",
    statusPagamento = "PAGO",
    total = 0,
  } = ctx;
  const titulo = tipo === "entrega" ? "COMPROVANTE DE ENTREGA" : "COMPROVANTE DE RETIRADA";
  return `
    ${cabecalhoHtml(lojaInfo, [titulo, "DOCUMENTO NÃO FISCAL"])}
    <div class="row"><span>Pedido</span><span class="b xl">#${esc(pedidoNumero || "—")}</span></div>
    <div class="row"><span>Código</span><span class="b">${esc(codigoRastreio || pedidoNumero || "—")}</span></div>
    <div class="row"><span>Cliente</span><span>${esc(cliente || "—")}</span></div>
    ${telefone ? `<div class="row"><span>Telefone</span><span>${esc(telefone)}</span></div>` : ""}
    ${endereco && tipo === "entrega" ? `<div class="sm" style="margin:4px 0"><span class="b">Endereço</span><br>${esc(endereco)}</div>` : ""}
    <div class="row"><span>Realizado</span><span>${esc(dataHoraFmt(realizadoISO))}</span></div>
    <div class="row"><span>Previsto</span><span>${esc(dataHoraFmt(previstoISO))}</span></div>
    ${retiradoISO ? `<div class="row"><span>${tipo === "entrega" ? "Entregue" : "Retirado"}</span><span>${esc(dataHoraFmt(retiradoISO))}</span></div>` : ""}
    ${sep()}
    <div class="cols"><span class="q">QTD</span><span class="d">DESCRIÇÃO</span></div>
    ${sep()}
    ${itens.map((it) => `
      <div class="item">
        <div class="row"><span class="nome">${esc(it.quantity)}x ${esc(it.name)}</span></div>
        ${modsHtml(it)}
      </div>
    `).join("") || '<div class="c sm mut">Sem itens</div>'}
    ${sep()}
    <div class="row"><span>Volumes</span><span>${esc(volumes)}</span></div>
    <div class="row"><span>Conferido por</span><span>${esc(conferidoPor || "—")}</span></div>
    <div class="row"><span>Entregue por</span><span>${esc(entreguePor || "—")}</span></div>
    <div class="row"><span>Pagamento</span><span>${esc(formaPagamento || "—")}</span></div>
    <div class="row b"><span>Status</span><span>${esc(statusPagamento)}</span></div>
    ${total > 0 ? `<div class="row b"><span>Total</span><span>${moeda(total)}</span></div>` : ""}
    ${sep()}
    <div class="assin">
      <div class="sm">Nome: ________________________________</div>
      <div class="sm" style="margin-top:10px">Assinatura: ___________________________</div>
      <div class="sm" style="margin-top:10px">Data e hora: __________________________</div>
    </div>
    ${rodapeMarca()}
  `;
}

/** Contexto padrão a partir da conta do PDV. */
export function montarCtxConta({
  lojaInfo,
  conta,
  pedidos = [],
  products = [],
  setores = [],
  currentUser,
  caixaAberto,
  financeiros = {},
  pessoas = 0,
  observacaoGeral = "",
} = {}) {
  const itens = achatarItens(pedidos);
  const comanda = (conta?.comandas || []).filter(Boolean).join(", ") || pedidos[0]?.command || "";
  const pedidoNumero = pedidos[0]?.id
    ? String(pedidos[0].id).slice(-6)
    : (comanda || "").replace(/\D/g, "").slice(-6);
  const atendimento = conta?.externo ? "Delivery / Retirada" : /balc/i.test(conta?.mesa || "") ? "Balcão" : "Salão";
  return {
    lojaInfo,
    mesa: conta?.mesa || "",
    comanda,
    pedidoNumero,
    atendimento,
    cliente: conta?.cliente || "",
    telefone: conta?.telefone || "",
    aberturaISO: conta?.aberturaISO || pedidos[0]?.createdAtISO || null,
    operador: currentUser?.name || "",
    garcom: "",
    itens,
    products,
    setores,
    pessoas,
    observacaoGeral,
    caixaId: caixaAberto?.id ? String(caixaAberto.id).slice(-6) : "",
    pdvId: "PDV-CAIXA",
    ...financeiros,
  };
}

/** Imprime um cupom por setor de cozinha (finalidade produção). */
export function imprimirPedidosProducaoPorSetor(ctx = {}) {
  const { itens = [], products = [], setores = [], lojaInfo } = ctx;
  const grupos = agruparItensPorSetor(itens, products, setores);
  if (!grupos.length) {
    const ok = abrirCupomTermico("Cozinha", htmlPedidoProducao({ ...ctx, setor: "Cozinha", itens: [] }));
    return ok ? 1 : 0;
  }
  let n = 0;
  grupos.forEach((g, i) => {
    // Pequeno atraso evita bloqueio de pop-up em sequência.
    const delay = i * 350;
    setTimeout(() => {
      abrirCupomTermico(
        `${g.setor} · Pedido #${ctx.pedidoNumero || ""}`,
        htmlPedidoProducao({
          ...ctx,
          lojaInfo,
          setor: g.setor,
          itens: g.itens,
        }),
      );
    }, delay);
    n += 1;
  });
  return n;
}

export const CUPONS_TERMICOS = {
  clienteSimplificado: "cliente_simplificado",
  pagamentoCompleto: "pagamento_completo",
  producao: "producao",
  conferencia: "conferencia",
  preConta: "pre_conta",
  entregaRetirada: "entrega_retirada",
};
