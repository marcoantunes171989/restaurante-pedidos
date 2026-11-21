// ════════════════════════════════════════════════════════════
//  Eventos pedidos pela tela (Etapa E6): cancelar, cancelar por
//  substituição (NFC-e) e carta de correção (NF-e). Permissão: gestão da
//  loja (app_fiscal_pode_configurar). Registro via migration 178.
// ════════════════════════════════════════════════════════════

import { Buffer } from "node:buffer";
import { lerCertificadoPfx } from "./certificado.js";
import { COD_UF } from "./sefaz/ufs.js";
import { janelaCancelamentoNfce } from "../../src/lib/fiscal/prazoCancelamento.js";
import { detCancelamento, detCancelamentoSubstituicao, detCartaCorrecao, montarEvento, assinarEvento, enviarEvento } from "./sefaz/eventos.js";

const TIPO = { cancelar: "110111", substituir: "110112", cce: "110110" };
const MENSAGENS = {
  FORBIDDEN: "Você não tem permissão para cancelar ou corrigir notas.",
  ENTRADA_INVALIDA: "Dados inválidos.",
  NAO_ENCONTRADO: "Nota não encontrada.",
  STATUS_NAO_PERMITE: "Só é possível cancelar ou corrigir uma nota autorizada.",
  SO_NFCE: "Cancelamento por substituição vale só para NFC-e.",
  SO_NFE: "Carta de correção vale só para NF-e.",
  SEM_CERTIFICADO: "Cadastre o certificado A1 na aba Emissão antes.",
  CERTIFICADO_ILEGIVEL: "Não foi possível abrir o certificado guardado. Envie o certificado de novo.",
  UF_NAO_SUPORTADA: "O estado da loja ainda não está configurado no emissor.",
  PRAZO_EXPIRADO: "O prazo legal para cancelar esta NFC-e já passou.",
};
const falha = (code, extra = {}) => ({ ok: false, code, erro: MENSAGENS[code] || "Não foi possível concluir.", ...extra });

export async function processarEvento(body, deps) {
  const acao = String(body.acao);
  const tpEvento = TIPO[acao];
  const doc = await deps.documento(String(body.documentoId || ""));
  if (!doc) return falha("NAO_ENCONTRADO");
  if (!(await deps.podeConfigurar(doc.loja_id))) return falha("FORBIDDEN");
  if (doc.status !== "autorizado" || !doc.protocolo || !doc.chave) return falha("STATUS_NAO_PERMITE");
  if (acao === "substituir" && Number(doc.modelo) !== 65) return falha("SO_NFCE");
  if (acao === "cce" && Number(doc.modelo) !== 55) return falha("SO_NFE");

  const uf = await deps.ufDaLoja(doc.loja_id);
  const cUF = COD_UF[uf];
  if (!cUF) return falha("UF_NAO_SUPORTADA");

  // Prazo legal do cancelamento da NFC-e (Ajuste SINIEF 19/16, cl. 15: até 30 min da autorização; a UF só pode reduzir). Conferido ANTES de
  // assinar e enviar: fora do prazo a SEFAZ rejeitaria (501) e o pedido seria só ruído. Venda coberta por nota de contingência segue
  // outra regra (substituição, 168 h) e não entra aqui.
  if (acao === "cancelar" && Number(doc.modelo) === 65 && !doc.contingencia_documento_id) {
    const aut = await deps.paraDanfe?.(doc.id).catch(() => null);
    const dh = aut?.documento?.dh_autorizacao;
    if (dh) {
      const j = janelaCancelamentoNfce({ dhAutorizacao: dh, uf, agora: deps.agora ? deps.agora() : new Date() });
      if (!j.dentro) {
        return falha("PRAZO_EXPIRADO", { prazoMin: j.prazoMin, erro: `O prazo legal para cancelar a NFC-e é de ${j.prazoMin} minutos da autorização e já passou (limite: ${j.limite.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}). Fora do prazo, só por pedido de regularização ao fisco do estado (em SP: Posto Fiscal, via SIPET).` });
      }
    }
  }

  let det;
  try {
    if (acao === "cancelar") det = detCancelamento({ nProt: doc.protocolo, xJust: body.xJust });
    if (acao === "substituir") det = detCancelamentoSubstituicao({ cOrgaoAutor: cUF, verAplic: "PedidoPrime 1.0", nProt: doc.protocolo, xJust: body.xJust, chNFeRef: body.chNFeRef });
    if (acao === "cce") det = detCartaCorrecao({ xCorrecao: body.xCorrecao });
  } catch (e) {
    return falha("ENTRADA_INVALIDA", { detalhe: e.message });
  }

  const s = await deps.segredoCertificado(doc.loja_id);
  if (!s?.pfx) return falha("SEM_CERTIFICADO");
  const pfx = Buffer.from(s.pfx, "base64");
  let cert;
  try { cert = lerCertificadoPfx(pfx, s.senha); } catch { return falha("CERTIFICADO_ILEGIVEL"); }

  // Nota autorizada pela SVC (tpEmis 6/7 na chave): cancelamento só na própria
  // SVC (MOC 7.0 Anexo III §2.1.3.4 c). CC-e não existe na SVC: vai à SEFAZ de origem.
  const autorizador = acao === "cancelar" ? ({ 6: "SVC-AN", 7: "SVC-RS" })[String(doc.chave)[34]] : undefined;
  const nSeq = acao === "cce" ? await deps.proximaSequencia(doc.id, tpEvento) : 1;
  const cnpj = doc.rascunho?.dados?.emit?.CNPJ || cert.cnpj;
  const evento = assinarEvento(montarEvento({
    tpEvento, chNFe: doc.chave, cnpj, tpAmb: doc.ambiente === "producao" ? 1 : 2, cOrgao: cUF, nSeqEvento: nSeq, detEvento: det,
  }), cert);

  const r = await enviarEvento({
    uf, modelo: Number(doc.modelo), ambiente: doc.ambiente, autorizador, eventoAssinado: evento, idLote: String(Date.now()).slice(-15),
    pfx, senha: s.senha, ca: deps.ca, timeoutMs: deps.timeoutMs, enviar: deps.enviar, endereco: deps.endereco,
  });
  await deps.registrarEvento({
    documentoId: doc.id, tpEvento, nSeq, status: r.situacao, cStat: r.cStat ?? null, xMotivo: r.xMotivo ?? null,
    protocolo: r.nProt ?? null, xml: r.situacao === "registrado" ? r.procEvento : null,
  });
  return { ok: r.situacao === "registrado", situacao: r.situacao, cStat: r.cStat ?? null, xMotivo: r.xMotivo ?? null, protocolo: r.nProt ?? null, nSeq };
}
