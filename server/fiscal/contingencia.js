// ════════════════════════════════════════════════════════════
//  Contingência off-line da NFC-e (Etapa E7, parte 1) — só servidor.
//
//  Fontes oficiais:
//  - Ajuste SINIEF 19/16, cláusula 11ª: transmitir até o 1º dia útil
//    seguinte; vedado reusar em contingência número já transmitido como
//    "Normal"; rejeitada → refazer com o MESMO número e série.
//  - MOC 7.0 Anexo IV (NFC-e): tpEmis=9, dhCont, xJust, idDest=1, finNFe=1,
//    indFinal=1, indPres=1; avançar um número ao entrar em contingência;
//    manter a mesma chave (e cNF) ao transmitir depois. Só NFC-e (mod 65).
//  - Portaria SRE 40/2024 (SP): contingência off-line autorizada desde 10/07/2024.
//  - QR Code: v2 off-line (ver qrcodeNfce.js) — é o único formato off-line
//    aceito pelo XSD vigente (PL 010h v1.03).
//
//  NF-e (modelo 55) — SVC (MOC 7.0 Anexo III, §2.1.3):
//  - tpEmis 6 (SVC-AN) ou 7 (SVC-RS), conforme a UF (portal nacional,
//    "Autorizadores em contingência"); dhCont + xJust; número NOVO (a nota
//    sem resposta não pode ter o mesmo número/série autorizado nos dois lados);
//    só usar com StatusServico 107 na SVC; a nota autorizada na SVC NÃO
//    precisa ser reenviada à SEFAZ de origem.
//
//  NF-e (55) — EPEC (NT 2014.001 v1.41): tpEmis 4, número NOVO; o aviso
//  (evento 110140) vai ao Ambiente Nacional; a NF-e vai depois à SEFAZ de
//  origem com a MESMA chave. O AN bloqueia novos EPEC com pendência > 168 h.
//
//  Limite do desenho: o certificado fica no servidor. Cobre a SEFAZ fora do
//  ar ou lenta; sem internet na loja não há como assinar a nota.
// ════════════════════════════════════════════════════════════

import { montarXmlNFe, dataHoraFiscal } from "../../src/lib/fiscal/nfeXml.js";
import { dvChave } from "../../src/lib/fiscal/nfeDaVenda.js";
import { assinarNFe } from "./assinarNFe.js";
import { urlQrCodeV2Offline, grupoInfNFeSupl } from "./qrcodeNfce.js";
import { readFileSync } from "node:fs";

const ENDERECOS = JSON.parse(readFileSync(new URL("./sefaz/enderecos.json", import.meta.url), "utf8"));

const pad = (v, n) => String(v).padStart(n, "0").slice(-n);

/**
 * Converte os dados de uma nota normal na versão em contingência:
 * NFC-e off-line (tpEmis 9, padrão) ou NF-e na SVC (tpEmis 6/7).
 * @param {object} dados  dados da nota (formato de montarXmlNFe), com chave e ide
 * @param {{ nNF:number, dhCont:string|Date, xJust:string, tpEmis?:6|7|9 }} o  nNF = número NOVO reservado
 */
export function paraContingencia(dados, { nNF, dhCont, xJust, tpEmis = 9 } = {}) {
  const ide = dados?.ide || {};
  const chave = String(dados?.chave || "");
  const tp = Number(tpEmis);
  if (![4, 6, 7, 9].includes(tp)) throw new Error("Forma de contingência inválida.");
  if (tp === 9 && Number(ide.mod) !== 65) throw new Error("Contingência off-line é só para NFC-e (modelo 65).");
  if (tp !== 9 && Number(ide.mod) !== 55) throw new Error("A SVC e o EPEC são só para NF-e (modelo 55).");
  if (!/^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/.test(chave)) throw new Error("Chave de acesso da nota original inválida.");
  if (String(chave[34]) !== "1") throw new Error("A nota de origem precisa ser de emissão normal.");
  if (tp === 9) {
    if (Number(ide.idDest ?? 1) !== 1) throw new Error("Contingência off-line exige operação interna (idDest 1).");
    if (Number(ide.indPres ?? 1) !== 1) throw new Error("Contingência off-line exige venda presencial (indPres 1).");
    if (Number(ide.indFinal ?? 1) !== 1 || Number(ide.finNFe ?? 1) !== 1) throw new Error("Contingência off-line exige consumidor final e finalidade normal.");
  }
  if (!/^[1-9][0-9]{0,8}$/.test(String(nNF))) throw new Error("Número da nota em contingência inválido.");
  if (Number(nNF) === Number(ide.nNF)) throw new Error("Use um número novo: o número já tentado no modo normal não pode ir para a contingência.");
  const just = String(xJust ?? "").trim();
  if (just.length < 15) throw new Error("A justificativa da contingência precisa de pelo menos 15 caracteres.");
  if (just.length > 256) throw new Error("A justificativa da contingência pode ter no máximo 256 caracteres.");
  const quando = dhCont instanceof Date ? dhCont : new Date(String(dhCont ?? ""));
  if (Number.isNaN(quando.getTime())) throw new Error("Data e hora de entrada em contingência inválida.");

  const cNF = chave.slice(35, 43);
  if (cNF === pad(nNF, 8)) throw new Error("Código numérico (cNF) igual ao número da nota; gere outro código.");
  // AAMM da chave = ano/mês da emissão (dhEmi) da nota em contingência.
  const dh = dataHoraFiscal(ide.dhEmi, ide.fuso);
  const base = chave.slice(0, 2) + dh.slice(2, 4) + dh.slice(5, 7) + chave.slice(6, 25) + pad(nNF, 9) + String(tp) + cNF;
  const dv = dvChave(base);
  if (dv == null) throw new Error("Não foi possível calcular o dígito verificador da chave.");
  const novaChave = base + dv;
  return {
    ...dados,
    chave: novaChave,
    ide: { ...ide, nNF: Number(nNF), tpEmis: tp, cDV: String(dv), dhCont: dhCont instanceof Date ? dhCont.toISOString() : String(dhCont), xJust: just },
  };
}

/**
 * Monta e assina a NFC-e em contingência, com o QR Code off-line calculado
 * a partir do próprio XML (dia do dhEmi, vNF) e do DigestValue da assinatura.
 */
export function montarNfceContingencia(dados, { chavePrivadaPem, certificadoBase64, urlQrCode, urlChave, idCsc, csc } = {}) {
  if (Number(dados?.ide?.tpEmis) !== 9) throw new Error("Use paraContingencia antes de montar a nota off-line.");
  const { xml, chave, totais } = montarXmlNFe(dados);
  const dhEmi = (/<dhEmi>([^<]+)<\/dhEmi>/.exec(xml) || [])[1] || "";
  const vNF = (/<vNF>([^<]+)<\/vNF>/.exec(xml) || [])[1] || "";
  let qrCode = "";
  const assinado = assinarNFe(xml, {
    chavePrivadaPem, certificadoBase64,
    infNFeSupl: (digestValue) => {
      qrCode = urlQrCodeV2Offline({ urlBase: urlQrCode, chave, tpAmb: dados.ide.tpAmb, dia: dhEmi.slice(8, 10), vNF, digestValue, idCsc, csc });
      return grupoInfNFeSupl({ qrCode, urlChave });
    },
  });
  return { xml: assinado, chave, qrCode, totais };
}

/** Qual SVC atende a UF (lista oficial versionada em enderecos.json). */
export function svcDaUf(uf) {
  for (const [autorizador, ufs] of Object.entries(ENDERECOS.svc || {})) {
    if (ufs.includes(String(uf))) return { autorizador, tpEmis: autorizador === "SVC-AN" ? 6 : 7 };
  }
  throw new Error(`UF ${uf} sem SVC cadastrada.`);
}

/** Monta e assina a NF-e (55) em contingência SVC (tpEmis 6/7) ou EPEC (4). Sem QR Code. */
export function montarNfeSvc(dados, { chavePrivadaPem, certificadoBase64 } = {}) {
  if (![4, 6, 7].includes(Number(dados?.ide?.tpEmis))) throw new Error("Use paraContingencia com tpEmis 4, 6 ou 7 antes de montar a NF-e em contingência.");
  const { xml, chave, totais } = montarXmlNFe(dados);
  return { xml: assinarNFe(xml, { chavePrivadaPem, certificadoBase64, infNFeSupl: "" }), chave, totais };
}

/** EPEC: a NF-e precisa chegar à SEFAZ de origem antes de 168 h (bloqueio do AN, NT 2014.001 §4.2). */
export function prazoEpec(dhEmi) {
  const d = dhEmi instanceof Date ? dhEmi : new Date(String(dhEmi ?? ""));
  if (Number.isNaN(d.getTime())) throw new Error("Data de emissão inválida.");
  return new Date(d.getTime() + 168 * 3600 * 1000);
}

const FUSO_MS = -3 * 3600 * 1000; // Brasília (sem horário de verão desde 2019)

/**
 * Prazo para transmitir: fim do 1º dia útil seguinte à emissão (horário de
 * Brasília). Considera só sábado e domingo — com feriado o prazo real é maior,
 * então este cálculo nunca passa do limite legal.
 */
export function prazoContingencia(dhEmi) {
  const d = dhEmi instanceof Date ? dhEmi : new Date(String(dhEmi ?? ""));
  if (Number.isNaN(d.getTime())) throw new Error("Data de emissão inválida.");
  const local = new Date(d.getTime() + FUSO_MS); // relógio de Brasília em campos UTC
  const dia = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  do { dia.setUTCDate(dia.getUTCDate() + 1); } while (dia.getUTCDay() === 0 || dia.getUTCDay() === 6);
  return new Date(dia.getTime() + 24 * 3600 * 1000 - 1 - FUSO_MS);
}
