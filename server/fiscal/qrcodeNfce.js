// ════════════════════════════════════════════════════════════
//  QR Code da NFC-e (somente servidor — o CSC nunca vai ao navegador).
//
//  v3 (NT 2025.001; formato conforme padrão do XSD do PL 010h v1.03),
//  emissão normal: <url>?p=<chave>|3|<tpAmb>  — SEM CSC e sem hash.
//  v2 (ainda aceita): <url>?p=<chave>|2|<tpAmb>|<idCSC>|<hash>, com hash =
//  SHA-1 (hex) de "<chave>|2|<tpAmb>|<idCSC>" concatenado ao CSC.
//  ⚠ O cálculo do hash v2 segue o manual do QR Code (NT 2015.002); conferir
//  com o manual vigente antes de usar v2 em produção.
//  Contingência off-line (tpEmis 9, Etapa E7): o XSD vigente (PL 010h v1.03)
//  só aceita a v2 off-line: <url>?p=<chave>|2|<tpAmb>|<dia>|<vNF>|<digVal>|<idCSC>|<hash>,
//  digVal = DigestValue (texto base64) convertido para hexa; hash = SHA-1 (hex,
//  maiúsculo) de "<parâmetros 1 a 7 separados por |>" + CSC. Fonte: "Manual de
//  Padrões Técnicos do DANFE NFC-e e QR-Code" v6.0 (03/2025), seções 4.3.2,
//  4.3.5 e 4.3.6.2 — os exemplos do manual estão nos testes.
//  A URL base é a da tabela oficial da UF/ambiente (configuração), nunca fixa.
// ════════════════════════════════════════════════════════════

import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

const CHAVE_RE = /^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/;

function validarBase({ urlBase, chave, tpAmb }, contingencia = false) {
  if (!/^https?:\/\/[^?#\s]+$/i.test(String(urlBase || ""))) throw new Error("URL base do QR Code inválida (http/https, sem parâmetros).");
  if (!CHAVE_RE.test(String(chave || ""))) throw new Error("Chave de acesso inválida para o QR Code.");
  if (!contingencia && String(chave)[34] === "9") throw new Error("NFC-e em contingência (tpEmis 9) usa o QR Code off-line.");
  if (contingencia && String(chave)[34] !== "9") throw new Error("QR Code off-line só para NFC-e em contingência (tpEmis 9).");
  if (![1, 2].includes(Number(tpAmb))) throw new Error("Ambiente (tpAmb) deve ser 1 ou 2.");
}

export function urlQrCodeV3({ urlBase, chave, tpAmb }) {
  validarBase({ urlBase, chave, tpAmb });
  return `${urlBase}?p=${chave}|3|${Number(tpAmb)}`;
}

function idCscLimpo(idCsc, csc) {
  const id = String(parseInt(String(idCsc ?? "").replace(/\D/g, "") || "x", 10));
  if (!/^(0|[1-9][0-9]{0,5})$/.test(id)) throw new Error("Identificador do CSC inválido.");
  if (!csc || String(csc).length < 1) throw new Error("CSC não informado.");
  return id;
}
const hashCsc = (base, csc) => createHash("sha1").update(base + String(csc)).digest("hex").toUpperCase();

export function urlQrCodeV2({ urlBase, chave, tpAmb, idCsc, csc }) {
  validarBase({ urlBase, chave, tpAmb });
  const base = `${chave}|2|${Number(tpAmb)}|${idCscLimpo(idCsc, csc)}`;
  return `${urlBase}?p=${base}|${hashCsc(base, csc)}`;
}

/** v2 em contingência off-line (tpEmis 9). dia e vNF devem ser os do XML (dhEmi, vNF). */
export function urlQrCodeV2Offline({ urlBase, chave, tpAmb, dia, vNF, digestValue, idCsc, csc }) {
  validarBase({ urlBase, chave, tpAmb }, true);
  if (!/^(0[1-9]|[12][0-9]|3[01])$/.test(String(dia))) throw new Error("Dia da emissão inválido para o QR Code (2 dígitos).");
  if (!/^(0|0\.[0-9]{2}|[1-9][0-9]{0,12}(\.[0-9]{2})?)$/.test(String(vNF))) throw new Error("Valor total inválido para o QR Code (use ponto decimal).");
  if (!/^[A-Za-z0-9+/]{27}=$/.test(String(digestValue))) throw new Error("DigestValue inválido (SHA-1 em base64).");
  const digVal = Buffer.from(String(digestValue), "ascii").toString("hex");
  const base = `${chave}|2|${Number(tpAmb)}|${dia}|${vNF}|${digVal}|${idCscLimpo(idCsc, csc)}`;
  return `${urlBase}?p=${base}|${hashCsc(base, csc)}`;
}

const escTexto = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Grupo infNFeSupl (entre </infNFe> e a assinatura). */
export function grupoInfNFeSupl({ qrCode, urlChave }) {
  if (!qrCode || !urlChave) throw new Error("QR Code e URL de consulta são obrigatórios na NFC-e.");
  return `<infNFeSupl><qrCode>${escTexto(qrCode)}</qrCode><urlChave>${escTexto(urlChave)}</urlChave></infNFeSupl>`;
}
