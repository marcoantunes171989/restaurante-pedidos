// ════════════════════════════════════════════════════════════
//  Inutilização / descarte de número de NFC-e e NF-e de emissão própria.
//
//  Regras:
//   • Só número que NUNCA foi autorizado: reservado, erro, rejeitada, ou "enviado" sem confirmação.
//   • Nota que tem chave e já foi transmitida é CONSULTADA na SEFAZ antes: se a SEFAZ já a tem (autorizada ou cancelada) NÃO se inutiliza
//     (evita número duplicado/perdido); se a consulta não responde, nada é feito.
//   • Estado que ainda tem o serviço (fora de AC, BA e SP): envia NFeInutilizacao4, exige cStat 102 e guarda o PROTOCOLO.
//   • AC, BA e SP (sem o serviço desde 11/11/2026): só registra o número como não usado (controle do emitente), sem protocolo.
//   • Nota autorizada não se inutiliza: o caminho é o cancelamento (prazo legal).
//  Permissão: gestão da loja (mesma do cancelamento).
// ════════════════════════════════════════════════════════════

import { credencialDoCofre } from "./credencialCofre.js";
import { COD_UF } from "./sefaz/ufs.js";
import { consultarNota } from "./sefaz/emissor.js";
import { montarInutNFe, assinarInutNFe, enviarInutilizacao } from "./sefaz/inutilizacao.js";
import { inutilizacaoNaSefaz } from "../../src/lib/fiscal/inutilizacaoUf.js";

const PODE = new Set(["reservado", "erro", "rejeitado", "enviado"]);
const MSG = {
  FORBIDDEN: "Você não tem permissão para inutilizar números de nota (só administrador da loja).",
  NAO_ENCONTRADO: "Nota não encontrada.",
  MOTIVO_CURTO: "Escreva o motivo com pelo menos 15 caracteres: ele vai para a SEFAZ e fica no histórico.",
  AUTORIZADA: "Esta nota está AUTORIZADA na SEFAZ: não se inutiliza número autorizado. Se a venda foi cancelada, use Cancelar nota (dentro do prazo legal).",
  JA_INUTILIZADA: "Este número já foi inutilizado ou descartado.",
  STATUS_NAO_PERMITE: "Só é possível inutilizar número de nota que nunca foi autorizada (reservada, com erro ou rejeitada).",
  JA_NA_SEFAZ: "A SEFAZ já tem esta nota (autorizada ou cancelada): o número NÃO pode ser inutilizado. Use Consultar na SEFAZ para trazer o protocolo e o XML.",
  CONSULTA_INDISPONIVEL: "Não foi possível confirmar na SEFAZ se esta nota existe. Nada foi feito: tente de novo em instantes.",
  SEM_CERTIFICADO: "Cadastre o certificado A1 na aba Emissão antes.",
  CERTIFICADO_ILEGIVEL: "Não foi possível abrir o certificado guardado. Envie o certificado de novo.",
  UF_NAO_SUPORTADA: "O estado da loja ainda não está configurado no emissor.",
  ENTRADA_INVALIDA: "Dados inválidos.",
  INUTILIZACAO_REJEITADA: "A SEFAZ recusou a inutilização.",
  SEFAZ_INDISPONIVEL: "A SEFAZ não respondeu ao pedido de inutilização. Nada foi gravado: tente de novo.",
  FALHA_REGISTRO: "A SEFAZ respondeu, mas o resultado não foi gravado no sistema (o protocolo vem na resposta). Fale com o suporte antes de repetir.",
  SEM_USUARIO: "Não foi possível identificar o usuário logado para registrar. Faça login de novo.",
};
const falha = (code, extra = {}) => ({ ok: false, code, erro: MSG[code] || "Não foi possível concluir.", ...extra });
const limpar = (m) => String(m || "").replace(/\s+/g, " ").slice(0, 220);

export async function processarInutilizacao(body = {}, deps, conexao = {}) {
  const motivo = String(body.motivo ?? "").replace(/\s+/g, " ").trim();
  if (motivo.length < 15 || motivo.length > 255) return falha("MOTIVO_CURTO");
  const doc = await deps.documento(String(body.documentoId || ""));
  if (!doc) return falha("NAO_ENCONTRADO");
  if (!(await deps.podeConfigurar(doc.loja_id))) return falha("FORBIDDEN");
  if (doc.status === "autorizado") return falha("AUTORIZADA", { protocolo: doc.protocolo || null });
  if (doc.status === "descartado") return falha("JA_INUTILIZADA");
  if (!PODE.has(doc.status)) return falha("STATUS_NAO_PERMITE", { status: doc.status });

  const uf = await deps.ufDaLoja(doc.loja_id);
  const cUF = COD_UF[uf];
  if (!cUF) return falha("UF_NAO_SUPORTADA");
  const usuario = await deps.usuarioAtual().catch(() => null);
  if (!usuario || (!usuario.id && !usuario.email)) return falha("SEM_USUARIO");
  const agora = deps.agora ? deps.agora() : new Date();
  const regra = inutilizacaoNaSefaz({ uf, ambiente: doc.ambiente, agora });

  // Certificado: precisa para consultar a SEFAZ e, onde ainda existe, para assinar a inutilização.
  const precisaConsultar = !!doc.chave && doc.status !== "reservado";
  let cred = null;
  if (precisaConsultar || regra.naSefaz) {
    cred = await credencialDoCofre(deps, doc.loja_id);
    if (cred.erro) return falha(cred.erro);
  }

  // 1) A SEFAZ não pode ter a nota: confere na base nacional antes de inutilizar.
  if (precisaConsultar) {
    const q = await consultarNota({ uf, modelo: Number(doc.modelo), ambiente: doc.ambiente, pfx: cred.pfx, senha: cred.senha, chNFe: doc.chave, ...conexao });
    if (q.situacao === "autorizada" || q.situacao === "cancelada") return falha("JA_NA_SEFAZ", { cStat: q.cStat ?? null, protocolo: q.nProt || null });
    if (q.situacao !== "nao_encontrada") return falha("CONSULTA_INDISPONIVEL", { cStat: q.cStat ?? null, xMotivo: q.xMotivo || q.erro || null });
  }

  const registrar = async (p) => {
    const g = await deps.registrarInutilizacao({ documentoId: doc.id, motivo, usuarioId: usuario.id ?? null, ...p });
    return g;
  };

  // 2) Estado sem o serviço (AC, BA, SP): controle do emitente, sem protocolo.
  if (!regra.naSefaz) {
    const g = await registrar({ inutilizado: false, xMotivo: regra.motivo });
    if (g && g.ok === false) return falha("FALHA_REGISTRO", { detalhe: String(g.code || "").slice(0, 80) });
    return { ok: true, inutilizado: false, naSefaz: false, numero: doc.numero, serie: doc.serie, modelo: Number(doc.modelo), aviso: regra.motivo };
  }

  // 3) Estado com o serviço: pede a inutilização e guarda o protocolo da SEFAZ.
  let inutAssinada;
  try {
    const cnpj = doc.rascunho?.dados?.emit?.CNPJ || (await deps.cnpjDaLoja?.(doc.loja_id));
    inutAssinada = assinarInutNFe(montarInutNFe({
      tpAmb: doc.ambiente === "producao" ? 1 : 2, cUF, ano: agora.getUTCFullYear(), cnpj, modelo: doc.modelo, serie: doc.serie, nIni: doc.numero, xJust: motivo,
    }), cred);
  } catch (e) {
    return falha("ENTRADA_INVALIDA", { detalhe: limpar(e?.message) });
  }
  const r = await enviarInutilizacao({ uf, modelo: Number(doc.modelo), ambiente: doc.ambiente, inutAssinada, pfx: cred.pfx, senha: cred.senha, ca: deps.ca, timeoutMs: deps.timeoutMs, enviar: deps.enviar, endereco: deps.endereco });
  if (r.situacao !== "inutilizado") {
    if (r.situacao === "rejeitado") return falha("INUTILIZACAO_REJEITADA", { cStat: r.cStat ?? null, xMotivo: r.xMotivo || null });
    return falha("SEFAZ_INDISPONIVEL", { xMotivo: r.xMotivo || null });
  }
  const g = await registrar({ inutilizado: true, protocolo: r.nProt, cStat: r.cStat, xMotivo: r.xMotivo, dhRecbto: r.dhRecbto || null, xml: r.procInut });
  if (g && g.ok === false) return falha("FALHA_REGISTRO", { detalhe: String(g.code || "").slice(0, 80), protocolo: r.nProt || null, cStat: r.cStat ?? null });
  return { ok: true, inutilizado: true, naSefaz: true, protocolo: r.nProt, cStat: r.cStat, xMotivo: r.xMotivo, dhRecbto: r.dhRecbto || null, numero: doc.numero, serie: doc.serie, modelo: Number(doc.modelo) };
}
