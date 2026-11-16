// ════════════════════════════════════════════════════════════
//  DANFE NF-e (modelo 55) em A4 retrato, folhas soltas (Etapa E8, parte 3).
//  Fonte: MOC 7.0 — Anexo II (DANFE e Código de Barras, v7.00):
//   3.1 campos (só o que consta do XML; chave em 11 blocos), 3.1.3 emitente
//   (nome, endereço completo e telefone), 3.1.7 colunas que não podem ser
//   suprimidas, 3.1.8 informações complementares, 3.3.1–3.3.3 supressões
//   permitidas (canhoto, fatura e ISSQN não usados), 3.7 fontes (Times New
//   Roman; rótulos em caixa alta), 3.9.1/3.9.3 campo do protocolo (uso ou
//   EPEC), 3.10.2 número da folha em todas as folhas, item 2 (CODE-128C:
//   ≥ 6 cm × 0,8 cm). "SEM VALOR FISCAL" em homologação (item 3).
//  EPEC: MOC 7.0 Visão Geral 3.3.4 — duas vias, protocolo do EPEC, motivo e
//  hora da contingência e a expressão obrigatória.
// ════════════════════════════════════════════════════════════

import { svgCode128c } from "./code128c.js";
import { mascaraCnpj, mascaraCpf, chaveEmBlocos, dataHoraLocal } from "./danfeNfceHtml.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtd = (v) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const doc = (cnpj, cpf) => (cnpj ? mascaraCnpj(cnpj) : cpf ? mascaraCpf(cpf) : "");
const cep = (v) => { const s = String(v || "").replace(/\D/g, ""); return s.length === 8 ? `${s.slice(0, 5)}-${s.slice(5)}` : s; };
const data = (iso) => dataHoraLocal(iso).slice(0, 10);
const hora = (iso) => dataHoraLocal(iso).slice(11);

export const EXPRESSAO_EPEC = "DANFE impresso em contingência - EPEC regularmente recebida pela Receita Federal do Brasil";
export const ITENS_POR_FOLHA = 22;
const FRETE = { 0: "0 - Remetente (CIF)", 1: "1 - Destinatário (FOB)", 2: "2 - Terceiros", 3: "3 - Próprio Remetente", 4: "4 - Próprio Destinatário", 9: "9 - Sem Ocorrência de Transporte" };

export const CSS_DANFE_NFE = `
@page{size:A4 portrait;margin:7mm}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#000;font-family:"Times New Roman",Times,serif}
.folha{width:196mm;font-size:10pt}
.folha+.folha,.via+.via{page-break-before:always;break-before:page}
.bloco{font-size:6pt;font-weight:700;text-transform:uppercase;margin:1.2mm 0 .3mm}
.g{display:grid;border:1px solid #000;border-bottom:0;border-right:0}
.c{border-right:1px solid #000;border-bottom:1px solid #000;padding:.4mm 1mm;min-height:7mm;overflow:hidden}
.r{display:block;font-size:6pt;text-transform:uppercase}
.v{display:block;font-size:10pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.n{text-align:right}
.emit .nome{font-size:12pt;font-weight:700}.emit .end{font-size:8pt;font-weight:700}
.danfe{text-align:center}.danfe .t{font-size:12pt;font-weight:700}.danfe .s{font-size:8pt}.danfe .b{font-size:10pt;font-weight:700}
.chave{font-weight:700;font-size:10pt;letter-spacing:.2mm}
table.itens{width:100%;border-collapse:collapse;font-size:6.5pt}
table.itens th{font-size:5.5pt;text-transform:uppercase;border:1px solid #000;padding:.3mm .5mm;font-weight:700}
table.itens td{border-left:1px solid #000;border-right:1px solid #000;border-bottom:1px dashed #000;padding:.3mm .5mm;vertical-align:top}
.adic{font-size:7pt;white-space:pre-wrap}
.marca{font-size:10pt;font-weight:700;text-align:center;border:1px solid #000;padding:1mm;margin-top:1mm}
`;

function campo(rotulo, valor, extra = "") {
  return `<div class="c ${extra}"><span class="r">${esc(rotulo)}</span><span class="v">${esc(valor)}</span></div>`;
}

function cabecalho(d, folha, total) {
  const e = d.emitente || {}, en = e.ender || {};
  const end1 = [[en.xLgr, en.nro].filter(Boolean).join(", "), en.xCpl].filter(Boolean).join(" - ");
  const end2 = [en.xBairro, cep(en.CEP)].filter(Boolean).join(" - ");
  const end3 = [en.xMun, en.UF].filter(Boolean).join(" - ") + (en.fone ? ` · Fone: ${en.fone}` : "");
  const protRotulo = d.epec ? "PROTOCOLO DE AUTORIZAÇÃO DO EPEC" : "PROTOCOLO DE AUTORIZAÇÃO DE USO";
  const prot = d.epec ? `${d.epec.nProt} ${dataHoraLocal(d.epec.dhRegistro)}`.trim() : d.protocolo ? `${d.protocolo.nProt} ${dataHoraLocal(d.protocolo.dhRecbto)}` : "";
  return `
  <div class="g" style="grid-template-columns:78mm 34mm 84mm">
    <div class="c emit" style="min-height:30mm"><span class="r">Identificação do emitente</span>
      <div class="nome">${esc(e.nome)}</div><div class="end">${esc(end1)}</div><div class="end">${esc(end2)}</div><div class="end">${esc(end3)}</div></div>
    <div class="c danfe"><div class="t">DANFE</div><div class="s">DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA</div>
      <div class="s" style="margin-top:1mm">0 - ENTRADA<br>1 - SAÍDA <span class="b" style="border:1px solid #000;padding:0 1.5mm">${esc(d.tpNF)}</span></div>
      <div class="b" style="margin-top:1mm">Nº ${esc(String(d.numero).padStart(9, "0").replace(/(\d{3})(\d{3})(\d{3})/, "$1.$2.$3"))}</div>
      <div class="b">SÉRIE ${esc(String(d.serie).padStart(3, "0"))}</div><div class="b">FOLHA ${folha}/${total}</div></div>
    <div class="c" style="text-align:center">
      <div style="margin:1mm auto">${svgCode128c(d.chave)}</div>
      <span class="r">Chave de acesso</span><div class="chave">${esc(chaveEmBlocos(d.chave))}</div>
      <div style="font-size:8pt;margin-top:1mm">Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora</div></div>
  </div>
  <div class="g" style="grid-template-columns:112mm 84mm">${campo("Natureza da operação", d.natOp)}${campo(protRotulo, prot)}</div>
  <div class="g" style="grid-template-columns:65mm 65mm 66mm">${campo("Inscrição estadual", e.ie)}${campo("Insc. estadual do subst. trib.", e.iest || "")}${campo("CNPJ", doc(e.cnpj, e.cpf))}</div>`;
}

function destinatario(d) {
  const x = d.destinatario || {}, en = x.ender || {};
  return `<div class="bloco">Destinatário / remetente</div>
  <div class="g" style="grid-template-columns:118mm 46mm 32mm">${campo("Nome / razão social", x.nome)}${campo("CNPJ / CPF", doc(x.cnpj, x.cpf))}${campo("Data da emissão", data(d.dhEmi))}</div>
  <div class="g" style="grid-template-columns:96mm 50mm 18mm 32mm">${campo("Endereço", [[en.xLgr, en.nro].filter(Boolean).join(", "), en.xCpl].filter(Boolean).join(" - "))}${campo("Bairro / distrito", en.xBairro)}${campo("CEP", cep(en.CEP))}${campo("Data da saída/entrada", d.dhSaiEnt ? data(d.dhSaiEnt) : "")}</div>
  <div class="g" style="grid-template-columns:78mm 38mm 12mm 36mm 32mm">${campo("Município", en.xMun)}${campo("Fone / fax", en.fone || "")}${campo("UF", en.UF)}${campo("Inscrição estadual", x.ie || "")}${campo("Hora da saída/entrada", d.dhSaiEnt ? hora(d.dhSaiEnt) : "")}</div>`;
}

function imposto(d) {
  const t = d.totais || {};
  return `<div class="bloco">Cálculo do imposto</div>
  <div class="g" style="grid-template-columns:repeat(5,1fr) 1fr">${campo("Base de cálc. do ICMS", brl(t.vBC), "n")}${campo("Valor do ICMS", brl(t.vICMS), "n")}${campo("Base de cálc. ICMS S.T.", brl(t.vBCST), "n")}${campo("Valor do ICMS subst.", brl(t.vST), "n")}${campo("Valor total dos produtos", brl(t.vProd), "n")}<div class="c" style="border:0"></div></div>
  <div class="g" style="grid-template-columns:repeat(6,1fr)">${campo("Valor do frete", brl(t.vFrete), "n")}${campo("Valor do seguro", brl(t.vSeg), "n")}${campo("Desconto", brl(t.vDesc), "n")}${campo("Outras despesas", brl(t.vOutro), "n")}${campo("Valor do IPI", brl(t.vIPI), "n")}${campo("Valor total da nota", brl(t.vNF), "n")}</div>
  <div class="bloco">Transportador / volumes transportados</div>
  <div class="g" style="grid-template-columns:90mm 56mm 50mm">${campo("Nome / razão social", "")}${campo("Frete por conta", FRETE[d.modFrete] || d.modFrete || "")}${campo("CNPJ / CPF", "")}</div>`;
}

function itens(lista) {
  const linhas = lista.map((it) => `<tr><td>${esc(it.cProd)}</td><td>${esc(it.xProd)}${it.infAdProd ? `<br><i>${esc(it.infAdProd)}</i>` : ""}</td><td>${esc(it.NCM)}</td><td>${esc(it.cst)}</td><td>${esc(it.CFOP)}</td><td>${esc(it.uCom)}</td><td class="n">${qtd(it.qCom)}</td><td class="n">${brl(it.vUnCom)}</td><td class="n">${brl(it.vProd)}</td><td class="n">${brl(it.vBC)}</td><td class="n">${brl(it.vICMS)}</td><td class="n">${brl(it.vIPI)}</td><td class="n">${brl(it.pICMS)}</td><td class="n">${brl(it.pIPI)}</td></tr>`).join("");
  const cst = lista.some((it) => it.csosn) ? "O/CSOSN" : "O/CST";
  return `<div class="bloco">Dados dos produtos / serviços</div>
  <table class="itens"><thead><tr><th>Código</th><th>Descrição do produto / serviço</th><th>NCM/SH</th><th>${cst}</th><th>CFOP</th><th>Un</th><th>Quant.</th><th>Valor unit.</th><th>Valor total</th><th>BC ICMS</th><th>Valor ICMS</th><th>Valor IPI</th><th>Alíq. ICMS</th><th>Alíq. IPI</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

function adicionais(d) {
  const linhas = [];
  if (d.homologacao) linhas.push("EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL");
  if (d.epec) {
    linhas.push(EXPRESSAO_EPEC);
    if (d.dhCont || d.xJust) linhas.push(`Entrada em contingência: ${dataHoraLocal(d.dhCont)}${d.xJust ? ` - Motivo: ${d.xJust}` : ""}`);
  }
  if (d.infAdFisco) linhas.push(d.infAdFisco);
  if (d.infCpl) linhas.push(d.infCpl);
  return `<div class="bloco">Dados adicionais</div>
  <div class="g" style="grid-template-columns:130mm 66mm"><div class="c" style="min-height:28mm"><span class="r">Informações complementares</span><div class="adic">${esc(linhas.join("\n"))}</div></div><div class="c"><span class="r">Reservado ao fisco</span></div></div>`;
}

/** Corpo HTML do DANFE (uma via; EPEC = duas vias). */
export function htmlDanfeNfe(d) {
  const lotes = [];
  const todos = d.itens || [];
  for (let i = 0; i < Math.max(1, todos.length); i += ITENS_POR_FOLHA) lotes.push(todos.slice(i, i + ITENS_POR_FOLHA));
  const via = (nomeVia) => `<div class="via">${lotes.map((lote, i) => `<div class="folha">
    ${cabecalho(d, i + 1, lotes.length)}
    ${destinatario(d)}${imposto(d)}${itens(lote)}${adicionais(d)}
    ${d.epec ? `<div class="marca">CONTINGÊNCIA EPEC · ${esc(nomeVia)}</div>` : ""}
    ${d.homologacao ? `<div class="marca">SEM VALOR FISCAL</div>` : ""}
  </div>`).join("")}</div>`;
  return d.epec ? via("Via do destinatário") + via("Via do emitente") : via("");
}

/** Escreve o DANFE numa janela já aberta (aberta no clique). */
export function escreverDanfeNfe(janela, d) {
  janela.document.open();
  janela.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>NF-e ${esc(d.numero)}</title><style>${CSS_DANFE_NFE}</style></head><body>${htmlDanfeNfe(d)}<script>window.onload=function(){window.print();}</scr` + `ipt></body></html>`);
  janela.document.close();
}
