// ════════════════════════════════════════════════════════════
//  Eventos da NF-e/NFC-e (Etapa E6): cancelamento (110111), cancelamento
//  por substituição da NFC-e (110112) e carta de correção da NF-e (110110).
//  Envelope genérico do PL 010d (envEvento 1.00) + conteúdo conforme os
//  schemas específicos de cada evento. XML em forma canônica, assinado
//  como a NF-e (RSA-SHA1, C14N 2001).
//
//  Prazos (cancelamento etc.) NÃO são fixados aqui: a SEFAZ recusa fora do
//  prazo e o motivo dela chega ao usuário.
//  Códigos de retorno (MOC): 128 lote processado; 135 registrado e
//  vinculado; 136 registrado sem vínculo; 155 cancelamento fora de prazo.
// ════════════════════════════════════════════════════════════

import { assinaturaDoElemento } from "../assinarNFe.js";
import { textoCondicaoUsoCCe } from "../validarXsd.js";
import { enviarSoap, enderecoServico } from "./transporte.js";
import { dataHoraFiscal, textoFiscal } from "../../../src/lib/fiscal/nfeXml.js";

const NS = "http://www.portalfiscal.inf.br/nfe";
const CHAVE_RE = /^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function texto(valor, min, max, rotulo) {
  const t = textoFiscal(valor);
  if (t.length < min || t.length > max) throw new Error(`${rotulo} deve ter de ${min} a ${max} caracteres.`);
  return esc(t);
}
function protocolo(nProt) {
  if (!/^[0-9]{15}$/.test(String(nProt || ""))) throw new Error("Protocolo de autorização inválido (15 dígitos).");
  return nProt;
}

export function detCancelamento({ nProt, xJust }) {
  return `<detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${protocolo(nProt)}</nProt><xJust>${texto(xJust, 15, 255, "Justificativa")}</xJust></detEvento>`;
}

export function detCancelamentoSubstituicao({ cOrgaoAutor, verAplic, nProt, xJust, chNFeRef }) {
  if (!/^[0-9]{2}$/.test(String(cOrgaoAutor))) throw new Error("UF autora inválida.");
  if (!CHAVE_RE.test(String(chNFeRef))) throw new Error("Chave da nota substituta inválida.");
  return `<detEvento versao="1.00"><descEvento>Cancelamento por substituicao</descEvento><cOrgaoAutor>${cOrgaoAutor}</cOrgaoAutor><tpAutor>1</tpAutor>` +
    `<verAplic>${texto(verAplic, 1, 20, "Versão do aplicativo")}</verAplic><nProt>${protocolo(nProt)}</nProt>` +
    `<xJust>${texto(xJust, 15, 255, "Justificativa")}</xJust><chNFeRef>${chNFeRef}</chNFeRef></detEvento>`;
}

export function detCartaCorrecao({ xCorrecao }) {
  return `<detEvento versao="1.00"><descEvento>Carta de Correcao</descEvento><xCorrecao>${texto(xCorrecao, 15, 1000, "Correção")}</xCorrecao>` +
    `<xCondUso>${esc(textoCondicaoUsoCCe())}</xCondUso></detEvento>`;
}

export function montarEvento({ tpEvento, chNFe, cnpj, tpAmb, cOrgao, dhEvento, nSeqEvento = 1, detEvento, fuso = "-03:00" }) {
  if (!/^[0-9]{6}$/.test(String(tpEvento))) throw new Error("Tipo de evento inválido.");
  if (!CHAVE_RE.test(String(chNFe))) throw new Error("Chave da nota inválida.");
  const seq = Number(nSeqEvento);
  if (!Number.isInteger(seq) || seq < 1 || seq > 99) throw new Error("Sequência do evento deve ser de 1 a 99.");
  const id = `ID${tpEvento}${chNFe}${String(seq).padStart(2, "0")}`;
  return `<evento xmlns="${NS}" versao="1.00"><infEvento Id="${id}"><cOrgao>${cOrgao}</cOrgao><tpAmb>${Number(tpAmb)}</tpAmb>` +
    `<CNPJ>${cnpj}</CNPJ><chNFe>${chNFe}</chNFe><dhEvento>${dataHoraFiscal(dhEvento || new Date(), fuso)}</dhEvento>` +
    `<tpEvento>${tpEvento}</tpEvento><nSeqEvento>${seq}</nSeqEvento><verEvento>1.00</verEvento>${detEvento}</infEvento></evento>`;
}

export function assinarEvento(eventoXml, { chavePrivadaPem, certificadoBase64 }) {
  const s = String(eventoXml);
  if (s.includes("<Signature")) throw new Error("Evento já assinado.");
  const ini = s.indexOf("<infEvento ");
  const fim = s.indexOf("</infEvento>") + "</infEvento>".length;
  const elemento = s.slice(ini, fim);
  const id = (/^<infEvento Id="(ID[0-9A-Z]{52})"/.exec(elemento) || [])[1];
  if (!id) throw new Error("Evento sem Id válido.");
  return s.slice(0, fim) + assinaturaDoElemento({ elemento, nome: "infEvento", id, chavePrivadaPem, certificadoBase64 }) + "</evento>";
}

export function montarEnvEvento({ idLote, eventoAssinado }) {
  if (!/^[0-9]{1,15}$/.test(String(idLote))) throw new Error("Número do lote inválido.");
  return `<envEvento xmlns="${NS}" versao="1.00"><idLote>${idLote}</idLote>${eventoAssinado}</envEvento>`;
}

const tag = (xml, n) => (new RegExp(`<${n}>([^<]*)</${n}>`).exec(xml) || [])[1] ?? null;
const REGISTRADO = new Set([135, 136, 155]);

export function interpretarRetEvento(xml) {
  const s = String(xml || "");
  const i = s.indexOf("<retEvento");
  if (i < 0) return { situacao: "rejeitado", cStat: Number(tag(s, "cStat")), xMotivo: tag(s, "xMotivo") };
  const retEventoXml = s.slice(i, s.indexOf("</retEvento>") + "</retEvento>".length);
  const cStat = Number(tag(retEventoXml, "cStat"));
  return {
    situacao: REGISTRADO.has(cStat) ? "registrado" : "rejeitado",
    cStat, xMotivo: tag(retEventoXml, "xMotivo"), nProt: tag(retEventoXml, "nProt"),
    dhRegEvento: tag(retEventoXml, "dhRegEvento"), retEventoXml,
  };
}

export function montarProcEvento({ eventoAssinado, retEventoXml }) {
  return `<procEventoNFe xmlns="${NS}" versao="1.00">${eventoAssinado}${retEventoXml}</procEventoNFe>`;
}

/** Envia UM evento assinado. situacao: registrado | rejeitado | incerto | indisponivel */
export async function enviarEvento({ uf, modelo, ambiente, autorizador, eventoAssinado, idLote, pfx, senha, ca, timeoutMs, enviar = enviarSoap, endereco = enderecoServico }) {
  const r = await enviar({
    url: endereco({ uf: autorizador || uf, modelo, ambiente, servico: "RecepcaoEvento" }), servico: "NFeRecepcaoEvento4",
    dados: montarEnvEvento({ idLote, eventoAssinado }), pfx, senha, ca, timeoutMs,
  });
  if (!r.ok) return r.incerto ? { situacao: "incerto", xMotivo: r.erro } : { situacao: "indisponivel", xMotivo: r.erro };
  const res = interpretarRetEvento(r.xml);
  if (res.situacao === "registrado") res.procEvento = montarProcEvento({ eventoAssinado, retEventoXml: res.retEventoXml });
  return res;
}
