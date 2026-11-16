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
//  Limite do desenho: o certificado fica no servidor. Cobre a SEFAZ fora do
//  ar ou lenta; sem internet na loja não há como assinar a nota.
// ════════════════════════════════════════════════════════════

import { montarXmlNFe, dataHoraFiscal } from "../../src/lib/fiscal/nfeXml.js";
import { dvChave } from "../../src/lib/fiscal/nfeDaVenda.js";
import { assinarNFe } from "./assinarNFe.js";
import { urlQrCodeV2Offline, grupoInfNFeSupl } from "./qrcodeNfce.js";

const pad = (v, n) => String(v).padStart(n, "0").slice(-n);

/**
 * Converte os dados de uma NFC-e normal na versão em contingência off-line.
 * @param {object} dados  dados da nota (formato de montarXmlNFe), com chave e ide
 * @param {{ nNF:number, dhCont:string|Date, xJust:string }} o  nNF = número NOVO reservado
 */
export function paraContingencia(dados, { nNF, dhCont, xJust } = {}) {
  const ide = dados?.ide || {};
  const chave = String(dados?.chave || "");
  if (Number(ide.mod) !== 65) throw new Error("Contingência off-line é só para NFC-e (modelo 65).");
  if (!/^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/.test(chave)) throw new Error("Chave de acesso da nota original inválida.");
  if (Number(ide.idDest ?? 1) !== 1) throw new Error("Contingência off-line exige operação interna (idDest 1).");
  if (Number(ide.indPres ?? 1) !== 1) throw new Error("Contingência off-line exige venda presencial (indPres 1).");
  if (Number(ide.indFinal ?? 1) !== 1 || Number(ide.finNFe ?? 1) !== 1) throw new Error("Contingência off-line exige consumidor final e finalidade normal.");
  if (!/^[1-9][0-9]{0,8}$/.test(String(nNF))) throw new Error("Número da nota em contingência inválido.");
  if (Number(nNF) === Number(ide.nNF)) throw new Error("Use um número novo: o número já tentado no modo normal não pode ir para a contingência.");
  const just = String(xJust ?? "").trim();
  if (just.length < 15) throw new Error("A justificativa da contingência precisa de pelo menos 15 caracteres.");
  if (just.length > 256) throw new Error("A justificativa da contingência pode ter no máximo 256 caracteres.");
  const quando = dhCont instanceof Date ? dhCont : new Date(String(dhCont ?? ""));
  if (Number.isNaN(quando.getTime())) throw new Error("Data e hora de entrada em contingência inválida.");

  const cNF = chave.slice(35, 43);
  if (cNF === pad(nNF, 8)) throw new Error("Código numérico (cNF) igual ao número da nota; gere outro código.");
  // AAMM da chave = ano/mês da emissão (dhEmi) da nota off-line.
  const dh = dataHoraFiscal(ide.dhEmi, ide.fuso);
  const base = chave.slice(0, 2) + dh.slice(2, 4) + dh.slice(5, 7) + chave.slice(6, 25) + pad(nNF, 9) + "9" + cNF;
  const dv = dvChave(base);
  if (dv == null) throw new Error("Não foi possível calcular o dígito verificador da chave.");
  const novaChave = base + dv;
  return {
    ...dados,
    chave: novaChave,
    ide: { ...ide, nNF: Number(nNF), tpEmis: 9, cDV: String(dv), dhCont: dhCont instanceof Date ? dhCont.toISOString() : String(dhCont), xJust: just },
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
