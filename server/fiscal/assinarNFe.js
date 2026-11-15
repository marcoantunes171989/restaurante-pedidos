// ════════════════════════════════════════════════════════════
//  Assinatura digital da NF-e / NFC-e (XMLDSig enveloped) — só servidor.
//
//  Algoritmos FIXOS pelo XSD do leiaute (xmldsig-core-schema_v1.01.xsd):
//  C14N REC-xml-c14n-20010315, RSA-SHA1, digest SHA-1, transforms
//  enveloped-signature + c14n, Reference URI="#NFe<chave>".
//
//  O gerador (src/lib/fiscal/nfeXml.js) já produz o XML na forma canônica
//  (provado contra o libxml2 em canonico.test.js). Por isso a forma
//  canônica do infNFe é o próprio texto com a declaração de namespace
//  herdada, e a do SignedInfo é montada aqui já canônica (elementos vazios
//  expandidos, namespace ds declarado). A verificação independente fica
//  em assinatura.test.js (libxml2 + chave pública do certificado).
// ════════════════════════════════════════════════════════════

import { createHash, createSign } from "node:crypto";

const NS_NFE = "http://www.portalfiscal.inf.br/nfe";
const NS_DS = "http://www.w3.org/2000/09/xmldsig#";
const ALG = {
  c14n: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  rsaSha1: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
  enveloped: "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
  sha1: "http://www.w3.org/2000/09/xmldsig#sha1",
};

function signedInfoCanonico(id, digest, comNamespace) {
  const ns = comNamespace ? ` xmlns="${NS_DS}"` : "";
  return `<SignedInfo${ns}><CanonicalizationMethod Algorithm="${ALG.c14n}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${ALG.rsaSha1}"></SignatureMethod><Reference URI="#${id}"><Transforms>` +
    `<Transform Algorithm="${ALG.enveloped}"></Transform><Transform Algorithm="${ALG.c14n}"></Transform></Transforms>` +
    `<DigestMethod Algorithm="${ALG.sha1}"></DigestMethod><DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
}

/**
 * @param {string} xml  <NFe xmlns=...><infNFe Id="NFe..." versao="4.00">...</infNFe></NFe> (sem assinatura)
 * @param {{ chavePrivadaPem:string, certificadoBase64:string, infNFeSupl?:string }} cred
 * @returns {string} XML assinado: <NFe><infNFe/>[infNFeSupl]<Signature/></NFe>
 */
export function assinarNFe(xml, { chavePrivadaPem, certificadoBase64, infNFeSupl = "" } = {}) {
  const s = String(xml || "");
  if (s.includes("<Signature")) throw new Error("XML já assinado.");
  const ini = s.indexOf("<infNFe ");
  const fim = s.indexOf("</infNFe>");
  if (ini < 0 || fim < 0) throw new Error("XML sem o grupo infNFe.");
  if (!s.startsWith(`<NFe xmlns="${NS_NFE}">`) || !s.endsWith("</infNFe></NFe>")) throw new Error("XML fora do formato gerado pelo emissor.");
  const infNFe = s.slice(ini, fim + "</infNFe>".length);
  const id = (/^<infNFe Id="(NFe[0-9A-Z]{44})"/.exec(infNFe) || [])[1];
  if (!id) throw new Error("infNFe sem Id válido.");
  if (!chavePrivadaPem || !certificadoBase64) throw new Error("Credencial de assinatura ausente.");

  // C14N do subconjunto infNFe = herda a declaração de namespace do pai.
  const infNFeCanon = infNFe.replace("<infNFe ", `<infNFe xmlns="${NS_NFE}" `);
  const digest = createHash("sha1").update(infNFeCanon, "utf8").digest("base64");

  const assinador = createSign("RSA-SHA1");
  assinador.update(signedInfoCanonico(id, digest, true), "utf8");
  const valor = assinador.sign(chavePrivadaPem, "base64");

  const signature = `<Signature xmlns="${NS_DS}">${signedInfoCanonico(id, digest, false)}` +
    `<SignatureValue>${valor}</SignatureValue><KeyInfo><X509Data><X509Certificate>${certificadoBase64}</X509Certificate></X509Data></KeyInfo></Signature>`;
  return s.slice(0, fim + "</infNFe>".length) + infNFeSupl + signature + "</NFe>";
}
