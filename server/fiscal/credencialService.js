// ════════════════════════════════════════════════════════════
//  Cadastro das credenciais fiscais (certificado A1, CSC) — servidor.
//  Recebe o pedido já autenticado pela API e as dependências (permissão,
//  documento da loja, gravação no cofre). Nunca devolve nem registra em
//  log o arquivo, a senha ou o CSC — só metadados.
// ════════════════════════════════════════════════════════════

import { Buffer } from "node:buffer";
import { lerCertificadoPfx } from "./certificado.js";

const LIMITE_PFX_BYTES = 64 * 1024; // certificados A1 têm poucos KB
const MENSAGENS = {
  FORBIDDEN: "Você não tem permissão para configurar a nota fiscal desta loja.",
  ACAO_INVALIDA: "Ação inválida.",
  LOJA_INVALIDA: "Loja inválida.",
  ARQUIVO_INVALIDO: "Envie o arquivo do certificado A1 (.pfx).",
  ARQUIVO_GRANDE: "Arquivo grande demais para um certificado A1.",
  SENHA_INCORRETA: "Senha do certificado incorreta.",
  CERTIFICADO_INVALIDO: "Arquivo não é um certificado A1 (.pfx) válido.",
  SEM_CNPJ: "Não foi possível ler o CNPJ do certificado. Use um e-CNPJ A1.",
  SEM_DOCUMENTO_LOJA: "Cadastre o CNPJ da loja antes de enviar o certificado.",
  CNPJ_DIVERGENTE: "O certificado é de outra empresa: a raiz do CNPJ (8 primeiros dígitos) não é a da loja.",
  CERTIFICADO_VENCIDO: "Certificado vencido. Envie um certificado dentro da validade.",
  CERTIFICADO_FUTURO: "Certificado ainda não está na validade.",
  AMBIENTE_INVALIDO: "Escolha o ambiente do CSC (homologação ou produção).",
  ID_CSC_INVALIDO: "O identificador do CSC deve ter só números (até 6).",
  CSC_INVALIDO: "Informe o CSC (código de segurança) fornecido pela SEFAZ.",
  ERRO_COFRE: "Não foi possível guardar a credencial. Tente novamente.",
};
const falha = (code) => ({ ok: false, code, erro: MENSAGENS[code] || MENSAGENS.ERRO_COFRE });
const so = (v) => String(v ?? "").replace(/[^0-9A-Z]/gi, "").toUpperCase();

/**
 * @param {object} body  { acao:'certificado'|'csc'|'revogar', lojaId, ... }
 * @param {object} deps  { podeConfigurar(lojaId), documentoDaLoja(lojaId), registrar(p), revogar(id, lojaId), agora() }
 */
export async function processarCredencial(body = {}, deps) {
  const acao = String(body.acao || "");
  const lojaId = Number(body.lojaId);
  if (!["certificado", "csc", "revogar"].includes(acao)) return falha("ACAO_INVALIDA");
  if (!Number.isSafeInteger(lojaId) || lojaId <= 0) return falha("LOJA_INVALIDA");
  if (!(await deps.podeConfigurar(lojaId))) return falha("FORBIDDEN");
  const agora = deps.agora ? deps.agora() : new Date();

  if (acao === "revogar") {
    const r = await deps.revogar(String(body.id || ""), lojaId);
    return r?.ok ? { ok: true } : falha(r?.code || "ERRO_COFRE");
  }

  if (acao === "csc") {
    const ambiente = String(body.ambiente || "");
    if (!["homologacao", "producao"].includes(ambiente)) return falha("AMBIENTE_INVALIDO");
    const idDig = String(body.idCsc ?? "").trim();
    if (!/^[0-9]{1,6}$/.test(idDig)) return falha("ID_CSC_INVALIDO");
    const csc = String(body.csc ?? "").trim();
    if (csc.length < 1 || csc.length > 60) return falha("CSC_INVALIDO");
    const r = await deps.registrar({ lojaId, tipo: "csc", ambiente, idCsc: String(parseInt(idDig, 10)), segredo: csc });
    return r?.ok ? { ok: true, tipo: "csc", ambiente, idCsc: String(parseInt(idDig, 10)) } : falha(r?.code || "ERRO_COFRE");
  }

  // certificado A1
  const b64 = String(body.pfxBase64 || "");
  if (!b64) return falha("ARQUIVO_INVALIDO");
  if (b64.length > Math.ceil(LIMITE_PFX_BYTES * 4 / 3) + 4) return falha("ARQUIVO_GRANDE");
  const bytes = Buffer.from(b64, "base64");
  if (!bytes.length) return falha("ARQUIVO_INVALIDO");
  let cert;
  try {
    cert = lerCertificadoPfx(bytes, String(body.senha ?? ""));
  } catch (e) {
    return falha(/senha/i.test(String(e?.message)) ? "SENHA_INCORRETA" : "CERTIFICADO_INVALIDO");
  }
  if (!cert.cnpj) return falha("SEM_CNPJ");
  const docLoja = so(await deps.documentoDaLoja(lojaId));
  if (docLoja.length !== 14) return falha("SEM_DOCUMENTO_LOJA");
  if (cert.cnpj.slice(0, 8) !== docLoja.slice(0, 8)) return falha("CNPJ_DIVERGENTE");
  if (cert.validadeFim <= agora) return falha("CERTIFICADO_VENCIDO");
  if (cert.validadeInicio > agora) return falha("CERTIFICADO_FUTURO");

  const r = await deps.registrar({
    lojaId, tipo: "certificado_a1", ambiente: null, titular: cert.titular, documentoTitular: cert.cnpj,
    validadeInicio: cert.validadeInicio.toISOString(), validadeFim: cert.validadeFim.toISOString(),
    segredo: JSON.stringify({ pfx: b64, senha: String(body.senha ?? "") }),
  });
  if (!r?.ok) return falha(r?.code || "ERRO_COFRE");
  const diasRestantes = Math.floor((cert.validadeFim - agora) / 86400000);
  return { ok: true, tipo: "certificado_a1", titular: cert.titular, cnpj: cert.cnpj, validadeFim: cert.validadeFim.toISOString(), diasRestantes };
}
