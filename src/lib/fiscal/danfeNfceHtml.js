// ════════════════════════════════════════════════════════════
//  DANFE NFC-e em papel de 80 mm (Etapa E8, parte 2).
//  Fonte: Manual de Especificações Técnicas do DANFE NFC-e e QR Code v6.0
//  (mar/2025), item 3 — divisões I a IX, QR Code centralizado (figura 5),
//  QR com no mínimo 25 mm, valores com vírgula decimal e ponto de milhar,
//  datas no horário local, chave em 11 blocos de 4.
//  Recebe os dados que o servidor tirou do XML (server/fiscal/danfeNfce.js):
//  nada é acrescentado além do XML e do protocolo.
// ════════════════════════════════════════════════════════════

import { nomeMeioPagamento } from "./meiosPagamento.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtd = (v) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const so = (v) => String(v ?? "").replace(/\D/g, "");

export function mascaraCnpj(v) {
  const s = String(v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  return s.length === 14 ? `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}` : s;
}
export function mascaraCpf(v) {
  const s = so(v);
  return s.length === 11 ? `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}` : s;
}
/** Chave de acesso em 11 blocos de 4 posições. */
export function chaveEmBlocos(chave) {
  return (String(chave || "").match(/.{1,4}/g) || []).join(" ");
}
/** Data/hora no horário local de Brasília (o XML traz o fuso). */
export function dataHoraLocal(iso, fuso = "America/Sao_Paulo") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(",", "");
}

export const CSS_DANFE_NFCE = `
@page{size:80mm auto;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff}
.danfe{width:80mm;padding:3mm 3mm 6mm;font-size:10px;line-height:1.3}
.c{text-align:center}.b{font-weight:700}.sep{border-top:1px dashed #000;margin:2mm 0}
.alerta{text-align:center;font-weight:700;font-size:11px;border:1px solid #000;padding:1.5mm;margin:2mm 0}
table{width:100%;border-collapse:collapse}th,td{padding:.3mm 0;vertical-align:top}
th{font-size:9px;text-align:left;border-bottom:1px solid #000}
.trib{font-size:9px;text-align:center;margin-top:1mm}
th:nth-child(4),td:nth-child(4){padding-left:1.2mm}
.n{text-align:right;white-space:nowrap}
.row{display:flex;justify-content:space-between;gap:2mm}
.chave{font-family:"Courier New",monospace;font-size:10px;text-align:center;word-break:break-all}
.qr{display:block;margin:2mm auto;width:32mm;height:32mm;image-rendering:pixelated}
.quebra{page-break-after:always;break-after:page}
`;

function vias(d) {
  // Contingência: 2ª via fica no estabelecimento até a autorização (item 3.1.8).
  return d.contingencia ? ["consumidor", "estabelecimento"] : ["consumidor"];
}

function umaVia(d, qrDataUrl, via) {
  const e = d.emitente || {};
  const t = d.totais || {};
  const aviso = d.contingencia ? `<div class="alerta">EMITIDA EM CONTINGÊNCIA<br>Pendente de autorização</div>` : "";
  const itens = (d.itens || []).map((it) => `<tr><td>${esc(it.cProd)}</td><td>${esc(it.xProd)}</td><td class="n">${qtd(it.qCom)}</td><td>${esc(it.uCom)}</td><td class="n">${brl(it.vUnCom)}</td><td class="n">${brl(it.vProd)}</td></tr>`).join("");
  const temAjuste = (t.vAcresc || 0) > 0 || (t.vDesc || 0) > 0;
  const c = d.consumidor;
  const consumidor = c?.cnpj ? `CONSUMIDOR CNPJ: ${esc(mascaraCnpj(c.cnpj))}`
    : c?.cpf ? `CONSUMIDOR CPF: ${esc(mascaraCpf(c.cpf))}`
    : c?.idEstrangeiro ? `CONSUMIDOR Id. Estrangeiro: ${esc(c.idEstrangeiro)}`
    : "CONSUMIDOR NÃO IDENTIFICADO";
  return `<div class="danfe">
  <div class="c"><div>CNPJ: ${esc(mascaraCnpj(e.cnpj || e.cpf))}</div><div class="b">${esc(e.nome)}</div><div>${esc(e.endereco)}</div>
  <div class="b">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div></div>
  ${aviso}
  <div class="sep"></div>
  <table><thead><tr><th>Código</th><th>Descrição</th><th class="n">Qtde</th><th>Un</th><th class="n">Vl Unit</th><th class="n">Vl Total</th></tr></thead><tbody>${itens}</tbody></table>
  <div class="sep"></div>
  <div class="row"><span>Qtde. total de itens</span><span>${esc(t.qtdItens)}</span></div>
  <div class="row"><span>Valor total R$</span><span>${brl(t.vProd)}</span></div>
  ${(t.vAcresc || 0) > 0 ? `<div class="row"><span>Acréscimos R$</span><span>${brl(t.vAcresc)}</span></div>` : ""}
  ${(t.vDesc || 0) > 0 ? `<div class="row"><span>Desconto R$</span><span>${brl(t.vDesc)}</span></div>` : ""}
  ${temAjuste ? `<div class="row b"><span>Valor a Pagar R$</span><span>${brl(t.vNF)}</span></div>` : ""}
  <div class="row b" style="margin-top:1mm"><span>FORMA DE PAGAMENTO</span><span>VALOR PAGO R$</span></div>
  ${(d.pagamentos || []).map((p) => `<div class="row"><span>${esc(nomeMeioPagamento(p.tPag, p.xPag))}</span><span>${brl(p.vPag)}</span></div>`).join("")}
  ${(d.troco || 0) > 0 ? `<div class="row"><span>Troco R$</span><span>${brl(d.troco)}</span></div>` : ""}
  ${(t.vTotTrib || 0) > 0 ? `<div class="trib">Informação dos Tributos Totais Incidentes<br>(Lei Federal 12.741/2012) R$ ${brl(t.vTotTrib)}</div>` : ""}
  <div class="sep"></div>
  <div class="c b">Consulte pela Chave de Acesso em</div><div class="c">${esc(d.urlChave)}</div>
  <div class="chave">${esc(chaveEmBlocos(d.chave))}</div>
  <div class="sep"></div>
  <div class="c">${consumidor}</div>${c?.nome ? `<div class="c">${esc(c.nome)}</div>` : ""}
  <div class="c b">NFC-e nº ${esc(d.numero)} Série ${esc(d.serie)} ${esc(dataHoraLocal(d.dhEmi))}${via === "estabelecimento" ? " · Via do Estabelecimento" : ""}</div>
  ${d.protocolo ? `<div class="c">Protocolo de autorização: ${esc(d.protocolo.nProt)}</div><div class="c">Data de autorização: ${esc(dataHoraLocal(d.protocolo.dhRecbto))}</div>` : ""}
  ${aviso}
  ${qrDataUrl ? `<img class="qr" alt="QR Code da NFC-e" src="${esc(qrDataUrl)}">` : ""}
  ${d.homologacao ? `<div class="alerta">EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO – SEM VALOR FISCAL</div>` : ""}
  ${d.infAdFisco ? `<div class="c">${esc(d.infAdFisco)}</div>` : ""}
  ${d.xMsg ? `<div class="c">${esc(d.xMsg)}</div>` : ""}
  ${d.infCpl ? `<div class="sep"></div><div class="c">${esc(d.infCpl)}</div>` : ""}
</div>`;
}

/** Corpo HTML do DANFE (uma ou duas vias). */
export function htmlDanfeNfce(d, { qrDataUrl = "" } = {}) {
  const lista = vias(d);
  return lista.map((v, i) => `${umaVia(d, qrDataUrl, v)}${i < lista.length - 1 ? '<div class="quebra"></div>' : ""}`).join("");
}

/** Imagem do QR Code (data URL PNG) com margem segura. */
export async function qrCodeDataUrl(texto, gerar) {
  if (!texto) return "";
  const lib = gerar || (await import("qrcode")).default;
  return lib.toDataURL(String(texto), { errorCorrectionLevel: "M", margin: 4, width: 320 });
}

/** Escreve o DANFE numa janela já aberta (aberta no clique, por causa do bloqueio de pop-up). */
export function escreverDanfeNfce(janela, d, qrDataUrl) {
  janela.document.open();
  janela.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>NFC-e ${esc(d.numero)}</title><style>${CSS_DANFE_NFCE}</style></head><body>${htmlDanfeNfce(d, { qrDataUrl })}<script>window.onload=function(){window.print();setTimeout(function(){window.close()},400);}</scr` + `ipt></body></html>`);
  janela.document.close();
}
