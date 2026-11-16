// ════════════════════════════════════════════════════════════
//  Mensagens da comunicação com a SEFAZ (leiaute 4.00) e leitura dos
//  retornos. Formatos validados contra os XSD oficiais (PL 9q para as
//  mensagens + PL 010h para a NF-e).
//
//  Códigos de situação (cStat) usados na interpretação — tabela de
//  códigos do Manual de Orientação do Contribuinte (MOC); conferir lá ao
//  incluir novos: 100/150 autorizado; 101/151/155 cancelado; 103 lote
//  recebido (assíncrono); 104 lote processado; 107 serviço em operação;
//  108/109 serviço paralisado; 204 duplicidade; 217 NF-e não consta.
// ════════════════════════════════════════════════════════════

const NS = "http://www.portalfiscal.inf.br/nfe";

export function montarConsStatServ({ tpAmb, cUF }) {
  if (![1, 2].includes(Number(tpAmb)) || !/^[0-9]{2}$/.test(String(cUF))) throw new Error("Ambiente ou UF inválidos para o status do serviço.");
  return `<consStatServ xmlns="${NS}" versao="4.00"><tpAmb>${Number(tpAmb)}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ></consStatServ>`;
}

export function montarConsSitNFe({ tpAmb, chNFe }) {
  if (!/^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/.test(String(chNFe))) throw new Error("Chave inválida para consulta.");
  return `<consSitNFe xmlns="${NS}" versao="4.00"><tpAmb>${Number(tpAmb)}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chNFe}</chNFe></consSitNFe>`;
}

const semDeclaracao = (x) => String(x || "").replace(/^\s*<\?xml[^>]*\?>\s*/, "");

/** Envio SÍNCRONO de UMA nota (o assíncrono acaba em 05/04/2027 — NT 2023.002 v1.02). */
export function montarEnviNFeSincrono({ idLote, nfeAssinada }) {
  if (!/^[0-9]{1,15}$/.test(String(idLote))) throw new Error("Número do lote inválido (até 15 dígitos).");
  const nfe = semDeclaracao(nfeAssinada);
  if (!nfe.startsWith("<NFe ") || !nfe.includes("<Signature")) throw new Error("A nota precisa estar assinada antes do envio.");
  return `<enviNFe xmlns="${NS}" versao="4.00"><idLote>${idLote}</idLote><indSinc>1</indSinc>${nfe}</enviNFe>`;
}

/** nfeProc = nota assinada + protocolo de autorização (o XML que se guarda e entrega). */
export function montarProcNFe({ nfeAssinada, protNFeXml }) {
  if (!protNFeXml) throw new Error("Sem protocolo de autorização.");
  return `<nfeProc xmlns="${NS}" versao="4.00">${semDeclaracao(nfeAssinada)}${protNFeXml}</nfeProc>`;
}

// ── Leitura (XML plano e conhecido: extração direta) ───────
const tag = (xml, nome) => (new RegExp(`<${nome}>([^<]*)</${nome}>`).exec(xml) || [])[1] ?? null;

export function lerRetorno(xml) {
  const s = String(xml || "");
  const iProt = s.indexOf("<protNFe");
  const protNFeXml = iProt >= 0 ? s.slice(iProt, s.indexOf("</protNFe>") + "</protNFe>".length) : null;
  const antesProt = iProt >= 0 ? s.slice(0, iProt) : s;
  const prot = protNFeXml ? {
    chNFe: tag(protNFeXml, "chNFe"), nProt: tag(protNFeXml, "nProt"), dhRecbto: tag(protNFeXml, "dhRecbto"),
    cStat: Number(tag(protNFeXml, "cStat")), xMotivo: tag(protNFeXml, "xMotivo"), digVal: tag(protNFeXml, "digVal"),
  } : null;
  return {
    tpAmb: Number(tag(antesProt, "tpAmb")), cStat: Number(tag(antesProt, "cStat")), xMotivo: tag(antesProt, "xMotivo"),
    dhRecbto: tag(antesProt, "dhRecbto"), chNFe: tag(antesProt, "chNFe"), prot, protNFeXml,
  };
}

const AUTORIZADO = new Set([100, 150]);
const CANCELADO = new Set([101, 151, 155]);
const PARALISADO = new Set([108, 109]);

export function interpretarStatus(r) {
  return { operando: r.cStat === 107, cStat: r.cStat, xMotivo: r.xMotivo };
}

/** Resultado do envio síncrono. situacao: autorizada | rejeitada | consultar | indisponivel | incerta */
export function interpretarAutorizacao(r) {
  if (PARALISADO.has(r.cStat)) return { situacao: "indisponivel", cStat: r.cStat, xMotivo: r.xMotivo };
  if (r.cStat === 103) return { situacao: "incerta", cStat: r.cStat, xMotivo: "Lote recebido para processamento assíncrono: consultar a nota." };
  if (r.cStat === 104 && r.prot) {
    const p = r.prot;
    if (AUTORIZADO.has(p.cStat)) {
      return { situacao: "autorizada", cStat: p.cStat, xMotivo: p.xMotivo, nProt: p.nProt, dhRecbto: p.dhRecbto, chNFe: p.chNFe, protNFeXml: r.protNFeXml };
    }
    if (p.cStat === 204) return { situacao: "consultar", cStat: p.cStat, xMotivo: p.xMotivo, chNFe: p.chNFe };
    return { situacao: "rejeitada", cStat: p.cStat, xMotivo: p.xMotivo, chNFe: p.chNFe };
  }
  return { situacao: "rejeitada", cStat: r.cStat, xMotivo: r.xMotivo };
}

/** Resultado da consulta pela chave. situacao: autorizada | cancelada | nao_encontrada | indisponivel | indefinida */
export function interpretarConsulta(r) {
  if (PARALISADO.has(r.cStat)) return { situacao: "indisponivel", cStat: r.cStat, xMotivo: r.xMotivo };
  if (AUTORIZADO.has(r.cStat) && r.prot) {
    return { situacao: "autorizada", cStat: r.cStat, xMotivo: r.xMotivo, nProt: r.prot.nProt, dhRecbto: r.prot.dhRecbto, protNFeXml: r.protNFeXml };
  }
  if (CANCELADO.has(r.cStat)) return { situacao: "cancelada", cStat: r.cStat, xMotivo: r.xMotivo };
  if (r.cStat === 217) return { situacao: "nao_encontrada", cStat: r.cStat, xMotivo: r.xMotivo };
  return { situacao: "indefinida", cStat: r.cStat, xMotivo: r.xMotivo };
}
