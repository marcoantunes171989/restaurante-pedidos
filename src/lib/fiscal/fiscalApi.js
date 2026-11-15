// ════════════════════════════════════════════════════════════
//  Acesso às RPCs fiscais da migration 175 (Etapa E2).
//  Cada função recebe o cliente supabase-js (testável com mock).
//  As tabelas fiscais novas NÃO têm acesso direto: tudo passa por RPC.
// ════════════════════════════════════════════════════════════

import { dbParaEmitente } from "../emitenteFiscalService.js";

const MENSAGENS = {
  FORBIDDEN: "Você não tem permissão para esta ação fiscal.",
  NAO_ENCONTRADO: "Documento fiscal não encontrado.",
  PRODUCAO_BLOQUEADA: "Produção bloqueada: cadastre um certificado A1 válido antes de emitir com valor fiscal.",
  SEM_SERIE: "Nenhuma série ativa para este documento e ambiente. Configure a série na Configuração Fiscal.",
  NUMERACAO_ESGOTADA: "A numeração desta série chegou ao limite. Configure uma nova série.",
  MODELO_INVALIDO: "Modelo de documento inválido (use NF-e 55 ou NFC-e 65).",
  SERIE_INVALIDA: "Série inválida (0 a 999).",
  AMBIENTE_INVALIDO: "Ambiente inválido (homologação ou produção).",
  NUMERO_INVALIDO: "Número inválido (1 a 999.999.999).",
  MAPA_INVALIDO: "Cada forma de pagamento precisa de um código de 2 dígitos.",
  TAXA_INVALIDA: "Escolha se a taxa de serviço entra na nota (outras despesas) ou fica fora.",
  CHAVE_IDEMPOTENCIA_OBRIGATORIA: "Venda sem identificador único para a nota.",
  VALOR_INVALIDO: "Valor ou quantidade inválidos.",
  STATUS_NAO_PERMITE: "Este documento não pode mais ser descartado.",
  MOTIVO_OBRIGATORIO: "Informe o motivo (mínimo 3 letras).",
};

export function mensagemErroFiscal(code, extra = {}) {
  if (code === "NUMERO_JA_USADO") {
    return `Esse número já foi usado nesta série. O próximo precisa ser ${extra?.minimo ?? "maior"} ou mais.`;
  }
  return MENSAGENS[code] || "Não foi possível concluir a operação fiscal. Tente novamente.";
}

function erroFiscal(code, extra) {
  return Object.assign(new Error(mensagemErroFiscal(code, extra)), { code, ...(extra || {}) });
}

// RPC inexistente no banco (migration 175 ainda não aplicada).
function rpcAusente(error) {
  const c = String(error?.code || "");
  return c === "42883" || c === "PGRST202" || /could not find the function|function .* does not exist/i.test(String(error?.message || ""));
}

async function chamar(supabase, nome, params) {
  if (!supabase?.rpc) throw erroFiscal("SEM_CLIENTE");
  const { data, error } = await supabase.rpc(nome, params);
  if (error) {
    if (rpcAusente(error)) throw Object.assign(new Error("Recursos fiscais ainda não instalados no banco (migration 175 pendente)."), { code: "MIGRACAO_PENDENTE" });
    throw Object.assign(new Error(mensagemErroFiscal("")), { code: "RPC_ERROR", detalhe: error.message });
  }
  if (data && data.ok === false) throw erroFiscal(data.code, { minimo: data.minimo, status: data.status });
  return data || {};
}

/**
 * Emitente da loja pela RPC (funciona com a ACL endurecida do HML).
 * Sem a 175 instalada, usa o caminho antigo (`legado`, leitura direta).
 * Nunca lança: em erro devolve null (a tela segue sem o selo).
 */
export async function buscarEmitenteFiscal(supabase, lojaId, { legado = null } = {}) {
  if (lojaId == null) return null;
  try {
    const d = await chamar(supabase, "app_fiscal_emitente_da_loja", { p_loja_id: lojaId });
    return d.emitente ? dbParaEmitente(d.emitente) : null;
  } catch (e) {
    if (e?.code === "MIGRACAO_PENDENTE" && typeof legado === "function") {
      try { return await legado(lojaId); } catch { return null; }
    }
    return null;
  }
}

export async function buscarConfigFiscalVenda(supabase, lojaId) {
  const vazio = { mapaMeios: {}, taxaServicoTratamento: null };
  if (lojaId == null) return vazio;
  try {
    const d = await chamar(supabase, "app_fiscal_config_venda", { p_loja_id: lojaId });
    return { mapaMeios: d.mapa_meios && typeof d.mapa_meios === "object" ? d.mapa_meios : {}, taxaServicoTratamento: d.taxa_servico_tratamento ?? null };
  } catch {
    return vazio;
  }
}

/** Formato que o selo/rascunho fiscal espera (seloFiscalDaConta.config). */
export function configVendaParaSelo(c) {
  return { mapaMeios: c?.mapaMeios || {}, regras: c?.taxaServicoTratamento ? { taxaServico: c.taxaServicoTratamento } : {} };
}

export async function salvarConfigFiscalVenda(supabase, lojaId, { mapaMeios = {}, taxaServicoTratamento = null } = {}) {
  const mapa = mapaMeios && typeof mapaMeios === "object" ? mapaMeios : {};
  if (Object.values(mapa).some((v) => !/^[0-9]{2}$/.test(String(v)))) throw erroFiscal("MAPA_INVALIDO");
  await chamar(supabase, "app_fiscal_salvar_config_venda", { p_loja_id: lojaId, p_mapa_meios: mapa, p_taxa_servico_tratamento: taxaServicoTratamento });
  return true;
}

export async function listarSeriesFiscais(supabase, lojaId) {
  const d = await chamar(supabase, "app_fiscal_listar_series", { p_loja_id: lojaId });
  return (d.series || []).map((s) => ({ id: s.id, modelo: s.modelo, serie: s.serie, ambiente: s.ambiente, proximoNumero: s.proximo_numero, ativa: s.ativa }));
}

export async function salvarSerieFiscal(supabase, lojaId, { modelo, serie, ambiente, proximoNumero, ativa = true } = {}) {
  const d = await chamar(supabase, "app_fiscal_salvar_serie", {
    p_loja_id: lojaId, p_modelo: modelo, p_serie: serie, p_ambiente: ambiente, p_proximo_numero: proximoNumero, p_ativa: ativa,
  });
  return d.id;
}

export async function reservarDocumentoFiscal(supabase, { lojaId, modelo, ambiente, idempotencyKey, rascunho = {}, pedidosIds = [], valorTotal = 0, qtdItens = 0 } = {}) {
  if (!idempotencyKey) throw erroFiscal("CHAVE_IDEMPOTENCIA_OBRIGATORIA");
  const d = await chamar(supabase, "app_fiscal_reservar_documento", {
    p_loja_id: lojaId, p_modelo: modelo, p_ambiente: ambiente, p_idempotency_key: idempotencyKey,
    p_rascunho: rascunho, p_pedidos_ids: pedidosIds, p_valor_total: valorTotal, p_qtd_itens: qtdItens,
  });
  return { documentoId: d.documento_id, modelo: d.modelo, serie: d.serie, numero: d.numero, ambiente: d.ambiente, status: d.status, reutilizado: !!d.reutilizado };
}

export async function descartarDocumentoFiscal(supabase, documentoId, motivo) {
  if (!motivo || String(motivo).trim().length < 3) throw erroFiscal("MOTIVO_OBRIGATORIO");
  await chamar(supabase, "app_fiscal_descartar_documento", { p_documento_id: documentoId, p_motivo: String(motivo).trim() });
  return true;
}

export async function resumoCredenciaisFiscais(supabase, lojaId) {
  const d = await chamar(supabase, "app_fiscal_credenciais_resumo", { p_loja_id: lojaId });
  return (d.credenciais || []).map((c) => ({
    tipo: c.tipo, ambiente: c.ambiente ?? null, titular: c.titular ?? null, documentoTitular: c.documento_titular ?? null,
    idCsc: c.id_csc ?? null, validadeInicio: c.validade_inicio ?? null, validadeFim: c.validade_fim ?? null,
    cadastrado: !!c.cadastrado, atualizadoEm: c.atualizado_em ?? null,
  }));
}
