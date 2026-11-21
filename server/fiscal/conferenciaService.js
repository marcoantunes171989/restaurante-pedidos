// ════════════════════════════════════════════════════════════
//  Conferência da nota NA BASE NACIONAL da SEFAZ (consulta por chave) — o controle de que a nota está válida fiscalmente.
//  Só LÊ a SEFAZ e grava um evento no histórico (append-only); NÃO altera a nota (documento emitido é imutável).
//  Confere: a SEFAZ conhece a chave · situação (autorizada/cancelada) bate com a do sistema · protocolo igual ao guardado ·
//  assinatura (DigestValue) do XML guardado igual ao que a SEFAZ autorizou.
// ════════════════════════════════════════════════════════════

import { credencialDoCofre } from "./credencialCofre.js";
import { consultarNota } from "./sefaz/emissor.js";

const MSG = {
  FORBIDDEN: "Você não tem permissão para conferir notas desta loja.",
  NAO_ENCONTRADO: "Nota não encontrada.",
  STATUS_NAO_PERMITE: "Só se confere nota autorizada ou cancelada (as outras têm o botão Consultar na SEFAZ).",
  SEM_CHAVE: "Esta nota não tem chave de acesso.",
  SEM_CERTIFICADO: "Cadastre o certificado A1 na aba Emissão antes.",
  CERTIFICADO_ILEGIVEL: "Não foi possível abrir o certificado guardado. Envie o certificado de novo.",
  CONSULTA_INDISPONIVEL: "A SEFAZ não respondeu à consulta. Nada foi registrado: tente de novo em instantes.",
  FALHA_REGISTRO: "A SEFAZ respondeu, mas a conferência não foi gravada no histórico.",
};
const falha = (code, extra = {}) => ({ ok: false, code, erro: MSG[code] || "Não foi possível concluir.", ...extra });
const tagDe = (xml, nome) => (new RegExp(`<${nome}>([^<]*)</${nome}>`).exec(String(xml || "")) || [])[1] ?? null;

export async function processarConferencia(body = {}, deps, conexao = {}) {
  const doc = await deps.documento(String(body.documentoId || ""));
  if (!doc) return falha("NAO_ENCONTRADO");
  if (!(await deps.podeEmitir(doc.loja_id)) && !(await deps.podeConfigurar(doc.loja_id))) return falha("FORBIDDEN");
  if (!["autorizado", "cancelado"].includes(doc.status)) return falha("STATUS_NAO_PERMITE", { status: doc.status });
  if (!doc.chave) return falha("SEM_CHAVE");

  const uf = await deps.ufDaLoja(doc.loja_id);
  const cred = await credencialDoCofre(deps, doc.loja_id);
  if (cred.erro) return falha(cred.erro);
  const q = await consultarNota({ uf, modelo: Number(doc.modelo), ambiente: doc.ambiente, pfx: cred.pfx, senha: cred.senha, chNFe: doc.chave, ...conexao });
  if (!["autorizada", "cancelada", "nao_encontrada"].includes(q.situacao)) return falha("CONSULTA_INDISPONIVEL", { cStat: q.cStat ?? null, xMotivo: q.xMotivo || q.erro || null });

  const divergencias = [];
  const digSefaz = tagDe(q.protNFeXml, "digVal");
  if (q.situacao === "nao_encontrada") divergencias.push("A SEFAZ NÃO tem esta chave na base de dados (cStat 217).");
  if (q.situacao === "autorizada" && doc.status === "cancelado") divergencias.push("O sistema mostra a nota cancelada, mas a SEFAZ ainda a mostra como autorizada.");
  if (q.situacao === "cancelada" && doc.status === "autorizado") divergencias.push("A SEFAZ mostra a nota CANCELADA, mas o sistema ainda a mostra como autorizada.");
  if (q.situacao === "autorizada" && q.nProt && doc.protocolo && q.nProt !== doc.protocolo) divergencias.push(`Protocolo diferente: SEFAZ ${q.nProt} × sistema ${doc.protocolo}.`);
  if (q.situacao === "autorizada" && digSefaz) {
    const guardado = await deps.paraDanfe?.(doc.id).catch(() => null);
    const digLocal = tagDe(guardado?.xml, "DigestValue");
    if (digLocal && digLocal !== digSefaz) divergencias.push("A assinatura (DigestValue) do XML guardado é diferente da que a SEFAZ autorizou.");
  }
  const conforme = divergencias.length === 0;
  const g = await deps.registrarConferencia?.({
    documentoId: doc.id, conforme, cStat: q.cStat ?? null, xMotivo: q.xMotivo || null, protocolo: q.nProt || null, dhRecbto: q.dhRecbto || null,
    digVal: digSefaz, situacaoSefaz: q.situacao, divergencias,
  });
  if (g && g.ok === false) return falha("FALHA_REGISTRO", { detalhe: String(g.code || "").slice(0, 80), conforme, divergencias });
  return { ok: true, conforme, situacaoSefaz: q.situacao, cStat: q.cStat ?? null, xMotivo: q.xMotivo || null, protocolo: q.nProt || null, dhRecbto: q.dhRecbto || null, divergencias };
}
