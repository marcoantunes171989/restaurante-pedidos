// ════════════════════════════════════════════════════════════
//  QR Code da NFC-e (somente servidor — o CSC nunca vai ao navegador).
//
//  v3 (NT 2025.001; formato conforme padrão do XSD do PL 010h v1.03),
//  emissão normal: <url>?p=<chave>|3|<tpAmb>  — SEM CSC e sem hash.
//  v2 (ainda aceita): <url>?p=<chave>|2|<tpAmb>|<idCSC>|<hash>, com hash =
//  SHA-1 (hex) de "<chave>|2|<tpAmb>|<idCSC>" concatenado ao CSC.
//  ⚠ O cálculo do hash v2 segue o manual do QR Code (NT 2015.002); conferir
//  com o manual vigente antes de usar v2 em produção.
//  Contingência (tpEmis 9) tem formato próprio (assinado) — Etapa E7.
//  A URL base é a da tabela oficial da UF/ambiente (configuração), nunca fixa.
// ════════════════════════════════════════════════════════════

import { createHash } from "node:crypto";

const CHAVE_RE = /^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/;

function validarBase({ urlBase, chave, tpAmb }) {
  if (!/^https?:\/\/[^?#\s]+$/i.test(String(urlBase || ""))) throw new Error("URL base do QR Code inválida (http/https, sem parâmetros).");
  if (!CHAVE_RE.test(String(chave || ""))) throw new Error("Chave de acesso inválida para o QR Code.");
  if (String(chave)[34] === "9") throw new Error("NFC-e em contingência (tpEmis 9) usa outro formato de QR Code (Etapa E7).");
  if (![1, 2].includes(Number(tpAmb))) throw new Error("Ambiente (tpAmb) deve ser 1 ou 2.");
}

export function urlQrCodeV3({ urlBase, chave, tpAmb }) {
  validarBase({ urlBase, chave, tpAmb });
  return `${urlBase}?p=${chave}|3|${Number(tpAmb)}`;
}

export function urlQrCodeV2({ urlBase, chave, tpAmb, idCsc, csc }) {
  validarBase({ urlBase, chave, tpAmb });
  const id = String(parseInt(String(idCsc ?? "").replace(/\D/g, "") || "x", 10));
  if (!/^(0|[1-9][0-9]{0,5})$/.test(id)) throw new Error("Identificador do CSC inválido.");
  if (!csc || String(csc).length < 1) throw new Error("CSC não informado.");
  const base = `${chave}|2|${Number(tpAmb)}|${id}`;
  const hash = createHash("sha1").update(base + String(csc)).digest("hex").toUpperCase();
  return `${urlBase}?p=${base}|${hash}`;
}

const escTexto = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Grupo infNFeSupl (entre </infNFe> e a assinatura). */
export function grupoInfNFeSupl({ qrCode, urlChave }) {
  if (!qrCode || !urlChave) throw new Error("QR Code e URL de consulta são obrigatórios na NFC-e.");
  return `<infNFeSupl><qrCode>${escTexto(qrCode)}</qrCode><urlChave>${escTexto(urlChave)}</urlChave></infNFeSupl>`;
}
