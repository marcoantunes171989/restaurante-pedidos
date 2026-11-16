// ════════════════════════════════════════════════════════════
//  Transporte até a SEFAZ: SOAP 1.2 sobre HTTPS com certificado do
//  cliente (A1). Só Node (https nativo aceita o .pfx + senha) — sem
//  biblioteca extra. Nunca desliga a verificação do servidor.
//
//  Regra de ouro: TEMPO ESGOTADO é situação INCERTA — a nota pode ter
//  chegado. Quem chama deve CONSULTAR pela chave antes de reenviar.
// ════════════════════════════════════════════════════════════

import { request } from "node:https";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

const ENDERECOS = JSON.parse(readFileSync(new URL("./enderecos.json", import.meta.url), "utf8"));
const NS_WSDL = "http://www.portalfiscal.inf.br/nfe/wsdl/";

/** Endereço oficial do serviço (tabela versionada em enderecos.json). */
export function enderecoServico({ uf, modelo, ambiente, servico }) {
  const url = ENDERECOS[uf]?.[String(modelo)]?.[ambiente]?.[servico];
  if (!url) throw new Error(`Sem endereço oficial cadastrado para ${uf} / modelo ${modelo} / ${ambiente} / ${servico}.`);
  return url;
}

export function envelopeSoap(servico, dadosXml) {
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>' +
    `<nfeDadosMsg xmlns="${NS_WSDL}${servico}">${dadosXml}</nfeDadosMsg>` +
    "</soap12:Body></soap12:Envelope>";
}

/** Conteúdo interno de <nfeResultMsg> (o retorno da SEFAZ) ou null. */
export function extrairResultado(soap) {
  const m = /<(?:\w+:)?nfeResultMsg\b[^>]*>([\s\S]*?)<\/(?:\w+:)?nfeResultMsg>/.exec(String(soap || ""));
  return m ? m[1].trim() : null;
}

/**
 * @param {object} o
 * @param {string} o.url        endereço https do serviço
 * @param {string} o.servico    ex.: "NFeStatusServico4", "NFeAutorizacao4"
 * @param {string} o.dados      XML da mensagem (consStatServ, enviNFe...)
 * @param {Buffer} o.pfx / o.senha  certificado A1 do emitente
 * @param {Buffer|string} [o.ca]  autoridades confiáveis extras (testes / cadeia ICP)
 * @param {number} [o.timeoutMs]
 * @returns {Promise<{ok:true, xml:string, status:number} | {ok:false, code:string, erro:string, incerto?:boolean}>}
 */
export function enviarSoap({ url, servico, dados, pfx, senha, ca, timeoutMs = 30000 }) {
  let destino;
  try { destino = new URL(url); } catch { destino = null; }
  if (!destino || destino.protocol !== "https:") return Promise.resolve({ ok: false, code: "URL_INVALIDA", erro: "Endereço da SEFAZ inválido." });
  const corpo = envelopeSoap(servico, dados);
  return new Promise((resolve) => {
    let fim = false;
    const terminar = (r) => { if (!fim) { fim = true; resolve(r); } };
    const req = request({
      method: "POST", hostname: destino.hostname, port: destino.port || 443, path: destino.pathname + destino.search,
      pfx, passphrase: senha, ...(ca ? { ca } : {}),
      rejectUnauthorized: true, minVersion: "TLSv1.2",
      headers: { "content-type": "application/soap+xml; charset=utf-8", "content-length": Buffer.byteLength(corpo) },
    }, (res) => {
      let txt = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { txt += c; });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return terminar({ ok: false, code: `HTTP_${res.statusCode}`, erro: "A SEFAZ respondeu com erro." });
        const xml = extrairResultado(txt);
        if (!xml) return terminar({ ok: false, code: "RESPOSTA_INVALIDA", erro: "Resposta da SEFAZ fora do formato esperado.", incerto: true });
        terminar({ ok: true, xml, status: res.statusCode });
      });
    });
    req.setTimeout(timeoutMs, () => {
      terminar({ ok: false, code: "TEMPO_ESGOTADO", erro: "A SEFAZ não respondeu a tempo. Consulte a nota antes de reenviar.", incerto: true });
      req.destroy();
    });
    req.on("error", () => terminar({ ok: false, code: "CONEXAO", erro: "Não foi possível conectar com a SEFAZ." }));
    req.end(corpo);
  });
}
