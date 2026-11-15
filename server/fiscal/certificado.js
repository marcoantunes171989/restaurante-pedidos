// ════════════════════════════════════════════════════════════
//  Leitura do certificado A1 (.pfx / PKCS#12) — somente servidor.
//  Usa node-forge só para abrir o PKCS#12 (o Node não lê PFX sozinho).
//  Devolve chave privada (PEM) e certificado (DER base64) para a assinatura
//  e os metadados que vão para a tela (titular, CNPJ, validade).
//  Nunca registre em log o conteúdo, a senha nem a chave.
// ════════════════════════════════════════════════════════════

import forge from "node-forge";
import { Buffer } from "node:buffer";

// OID ICP-Brasil do CNPJ da pessoa jurídica no subjectAltName (otherName).
const OID_CNPJ_ICP = "2.16.76.1.3.3";

function cnpjDoCertificado(cert) {
  // 1) subjectAltName otherName 2.16.76.1.3.3 (padrão e-CNPJ ICP-Brasil)
  try {
    const ext = cert.getExtension("subjectAltName");
    const asn1 = ext && forge.asn1.fromDer(ext.value);
    const nomes = asn1?.value || [];
    for (const n of nomes) {
      if (n.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && n.type === 0) {
        const [oidNode, valNode] = n.value;
        if (forge.asn1.derToOid(oidNode.value) === OID_CNPJ_ICP) {
          let v = valNode.value?.[0]?.value;
          if (Array.isArray(v)) v = v[0]?.value;
          const doc = String(v || "").replace(/[^0-9A-Z]/gi, "").toUpperCase();
          if (/^[0-9A-Z]{12}[0-9]{2}$/.test(doc)) return doc;
        }
      }
    }
  } catch { /* segue para o CN */ }
  // 2) CN no formato "RAZAO SOCIAL:CNPJ"
  const cn = cert.subject.getField("CN")?.value || "";
  const m = /:([0-9A-Z]{12}[0-9]{2})\s*$/i.exec(cn);
  return m ? m[1].toUpperCase() : null;
}

/**
 * @param {Buffer|Uint8Array} pfx  conteúdo do arquivo .pfx/.p12
 * @param {string} senha
 */
export function lerCertificadoPfx(pfx, senha) {
  let p12;
  try {
    const der = forge.util.createBuffer(Buffer.from(pfx).toString("binary"));
    const asn1 = forge.asn1.fromDer(der);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, String(senha ?? ""));
  } catch (e) {
    // `cause` fica só no servidor (diagnóstico); a mensagem ao usuário é genérica.
    if (/mac|password|invalid password|decrypt/i.test(String(e?.message))) throw new Error("Senha do certificado incorreta.", { cause: e });
    throw new Error("Arquivo não é um certificado A1 (.pfx) válido.", { cause: e });
  }
  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const chave = chaves.find((b) => b.key)?.key;
  if (!chave) throw new Error("O certificado não contém a chave privada.");
  // Certificado do titular = o que tem a mesma chave pública da chave privada.
  const titularBag = certs.find((b) => b.cert && b.cert.publicKey?.n?.equals?.(chave.n)) || certs[0];
  if (!titularBag?.cert) throw new Error("O arquivo não contém o certificado do titular.");
  const cert = titularBag.cert;
  const derCert = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return {
    titular: cert.subject.getField("CN")?.value || "",
    cnpj: cnpjDoCertificado(cert),
    validadeInicio: cert.validity.notBefore,
    validadeFim: cert.validity.notAfter,
    chavePrivadaPem: forge.pki.privateKeyToPem(chave),
    certificadoBase64: Buffer.from(derCert, "binary").toString("base64"),
  };
}
