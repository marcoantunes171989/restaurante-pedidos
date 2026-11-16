// Leitura do certificado A1 guardado no cofre (176) — só servidor.
import { Buffer } from "node:buffer";
import { lerCertificadoPfx } from "./certificado.js";

/** @returns {Promise<{pfx, senha, chavePrivadaPem, certificadoBase64} | {erro:'SEM_CERTIFICADO'|'CERTIFICADO_ILEGIVEL'}>} */
export async function credencialDoCofre(deps, lojaId) {
  const s = await deps.segredoCertificado(lojaId);
  if (!s?.pfx) return { erro: "SEM_CERTIFICADO" };
  const pfx = Buffer.from(s.pfx, "base64");
  try {
    const c = lerCertificadoPfx(pfx, s.senha);
    return { pfx, senha: s.senha, chavePrivadaPem: c.chavePrivadaPem, certificadoBase64: c.certificadoBase64 };
  } catch {
    return { erro: "CERTIFICADO_ILEGIVEL" };
  }
}
