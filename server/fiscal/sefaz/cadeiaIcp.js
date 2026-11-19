// ════════════════════════════════════════════════════════════
//  Autoridades confiáveis para falar com a SEFAZ (somente servidor).
//  Os serviços de autorização da SEFAZ-SP usam certificado da cadeia
//  ICP-Brasil, ausente do armazenamento padrão do Node. Aqui entram as
//  CAs padrão + a raiz "AC Raiz Brasileira v10" (arquivo em ./icp/, com o
//  SHA-256 fixado abaixo). A verificação do servidor NUNCA é desligada.
// ════════════════════════════════════════════════════════════

import tls from "node:tls";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";

// SHA-256 da raiz ICP-Brasil v10 (conferido em duas fontes oficiais: ITI e SERPRO).
export const FINGERPRINT_SHA256 = "6E:0B:FF:06:9A:26:99:4C:15:DE:2C:48:88:CC:54:AF:84:88:2E:54:95:B7:FB:F6:6B:E9:CC:FF:EC:74:89:F6";

let cache = null;

/** Raiz ICP-Brasil v10 (PEM). Lança erro se o arquivo for diferente do esperado. */
export function raizIcpBrasilV10() {
  if (cache) return cache;
  const pem = readFileSync(new URL("./icp/ICP-Brasilv10.crt", import.meta.url), "utf8");
  const cert = new X509Certificate(pem);
  if (cert.fingerprint256 !== FINGERPRINT_SHA256) {
    throw new Error("Raiz ICP-Brasil v10 alterada ou corrompida (SHA-256 diferente do esperado).");
  }
  if (!cert.ca) throw new Error("O arquivo da raiz ICP-Brasil não é de uma autoridade certificadora.");
  cache = pem;
  return pem;
}

/** Lista para o parâmetro `ca` do https/tls: CAs padrão do Node + raiz ICP-Brasil v10. */
export function cadeiaConfiavelSefaz() {
  return [...tls.rootCertificates, raizIcpBrasilV10()];
}
