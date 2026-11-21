// ════════════════════════════════════════════════════════════
//  Inutilização de numeração da NF-e/NFC-e (serviço NFeInutilizacao4, MOC 4.00).
//  Só vale para número que NUNCA foi autorizado. Retorno: cStat 102 (inutilização homologada) + nProt.
//  AC, BA e SP não têm mais o serviço (src/lib/fiscal/inutilizacaoUf.js): lá o sistema só registra o número como não usado.
// ════════════════════════════════════════════════════════════

import { assinaturaDoElemento } from "../assinarNFe.js";
import { enviarSoap, enderecoServico } from "./transporte.js";
import { textoFiscal } from "../../../src/lib/fiscal/nfeXml.js";

const NS = "http://www.portalfiscal.inf.br/nfe";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tag = (xml, n) => (new RegExp(`<${n}>([^<]*)</${n}>`).exec(xml) || [])[1] ?? null;

/** Monta o pedido SEM assinatura. xJust: 15 a 255 caracteres (exigência do leiaute). */
export function montarInutNFe({ tpAmb, cUF, ano, cnpj, modelo, serie, nIni, nFim = nIni, xJust }) {
  const just = textoFiscal(xJust);
  if (just.length < 15 || just.length > 255) throw new Error("A justificativa da inutilização deve ter de 15 a 255 caracteres.");
  if (!/^[0-9]{14}$|^[0-9A-Z]{14}$/.test(String(cnpj))) throw new Error("CNPJ do emitente inválido.");
  if (![55, 65].includes(Number(modelo))) throw new Error("Modelo inválido (55 ou 65).");
  const s = Number(serie), a = Number(nIni), b = Number(nFim), aa = Number(ano) % 100;
  if (!Number.isInteger(s) || s < 0 || s > 999) throw new Error("Série inválida.");
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a || b > 999999999) throw new Error("Faixa de numeração inválida.");
  const id = `ID${String(cUF).padStart(2, "0")}${String(aa).padStart(2, "0")}${cnpj}${String(Number(modelo)).padStart(2, "0")}${String(s).padStart(3, "0")}${String(a).padStart(9, "0")}${String(b).padStart(9, "0")}`;
  return `<inutNFe xmlns="${NS}" versao="4.00"><infInut Id="${id}"><tpAmb>${Number(tpAmb)}</tpAmb><xServ>INUTILIZAR</xServ><cUF>${cUF}</cUF>` +
    `<ano>${String(aa).padStart(2, "0")}</ano><CNPJ>${cnpj}</CNPJ><mod>${Number(modelo)}</mod><serie>${s}</serie><nNFIni>${a}</nNFIni><nNFFin>${b}</nNFFin>` +
    `<xJust>${esc(just)}</xJust></infInut></inutNFe>`;
}

export function assinarInutNFe(inutXml, { chavePrivadaPem, certificadoBase64 }) {
  const s = String(inutXml);
  if (s.includes("<Signature")) throw new Error("Pedido de inutilização já assinado.");
  const ini = s.indexOf("<infInut ");
  const fim = s.indexOf("</infInut>") + "</infInut>".length;
  const elemento = s.slice(ini, fim);
  const id = (/^<infInut Id="(ID[0-9A-Z]{41})"/.exec(elemento) || [])[1];
  if (!id) throw new Error("Pedido de inutilização sem Id válido.");
  return s.slice(0, fim) + assinaturaDoElemento({ elemento, nome: "infInut", id, chavePrivadaPem, certificadoBase64 }) + "</inutNFe>";
}

/** cStat 102 = inutilização homologada. Qualquer outro = rejeitada (com o motivo da SEFAZ). */
export function interpretarRetInutNFe(xml) {
  const s = String(xml || "");
  const i = s.indexOf("<retInutNFe");
  if (i < 0) return { situacao: "rejeitado", cStat: Number(tag(s, "cStat")) || null, xMotivo: tag(s, "xMotivo") };
  const fim = s.indexOf("</retInutNFe>");
  const retXml = s.slice(i, fim < 0 ? undefined : fim + "</retInutNFe>".length);
  const cStat = Number(tag(retXml, "cStat"));
  return {
    situacao: cStat === 102 ? "inutilizado" : "rejeitado", cStat, xMotivo: tag(retXml, "xMotivo"),
    nProt: tag(retXml, "nProt"), dhRecbto: tag(retXml, "dhRecbto"), retXml,
  };
}

export function montarProcInutNFe({ inutAssinada, retXml }) {
  return `<ProcInutNFe xmlns="${NS}" versao="4.00">${inutAssinada}${retXml}</ProcInutNFe>`;
}

/** situacao: inutilizado | rejeitado | incerto | indisponivel */
export async function enviarInutilizacao({ uf, modelo, ambiente, inutAssinada, pfx, senha, ca, timeoutMs, enviar = enviarSoap, endereco = enderecoServico }) {
  const r = await enviar({ url: endereco({ uf, modelo, ambiente, servico: "Inutilizacao" }), servico: "NFeInutilizacao4", dados: inutAssinada, pfx, senha, ca, timeoutMs });
  if (!r.ok) return r.incerto ? { situacao: "incerto", xMotivo: r.erro } : { situacao: "indisponivel", xMotivo: r.erro };
  const res = interpretarRetInutNFe(r.xml);
  if (res.situacao === "inutilizado") res.procInut = montarProcInutNFe({ inutAssinada, retXml: res.retXml });
  return res;
}
