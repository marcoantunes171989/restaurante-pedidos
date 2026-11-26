// ════════════════════════════════════════════════════════════
//  Acesso às RPCs fiscais da migration 175 (Etapa E2).
//  Cada função recebe o cliente supabase-js (testável com mock).
//  As tabelas fiscais novas NÃO têm acesso direto: tudo passa por RPC.
// ════════════════════════════════════════════════════════════

import { dbParaEmitente } from "../emitenteFiscalService.js";
import { tabelaParaEnvio } from "./ibpt.js";

const MENSAGENS = {
  FORBIDDEN: "Você não tem permissão para esta ação fiscal.",
  NAO_ENCONTRADO: "Documento fiscal não encontrado.",
  PRODUCAO_BLOQUEADA: "Produção bloqueada: cadastre um certificado A1 válido antes de emitir com valor fiscal.",
  SEM_SERIE: "Nenhuma série ativa para este documento e ambiente. Configure a série em Fiscal › Emissão.",
  NUMERACAO_ESGOTADA: "A numeração desta série chegou ao limite. Configure uma nova série.",
  MODELO_INVALIDO: "Modelo de documento inválido (use NF-e 55 ou NFC-e 65).",
  SERIE_INVALIDA: "Série inválida (0 a 999).",
  AMBIENTE_INVALIDO: "Ambiente inválido (homologação ou produção).",
  NUMERO_INVALIDO: "Número inválido (1 a 999.999.999).",
  MAPA_INVALIDO: "Cada forma de pagamento precisa de um código de 2 dígitos.",
  TAXA_INVALIDA: "Escolha se a taxa de serviço entra na nota (outras despesas) ou fica fora.",
  IBSCBS_INVALIDO: "Confira os campos do IBS/CBS: CST com 3 números, cClassTrib com 6 e alíquotas em percentual.",
  ENTREGA_INVALIDA: "Confira a configuração da entrega: modalidade do frete e transportador.",
  CHAVE_IDEMPOTENCIA_OBRIGATORIA:"Venda sem identificador único para a nota.",
  VALOR_INVALIDO: "Valor ou quantidade inválidos.",
  STATUS_NAO_PERMITE: "Este documento não pode mais ser descartado.",
  MOTIVO_OBRIGATORIO: "Informe o motivo (mínimo 3 letras).",
  UF_INVALIDA: "UF inválida.",
  UF_DIFERENTE_DA_LOJA: "Você só pode importar a tabela IBPT da UF da sua loja.",
  FORMATO_INVALIDO: "O arquivo da tabela IBPT está fora do formato esperado.",
  VIGENCIA_INVALIDA: "A tabela IBPT não informa uma vigência válida.",
  TABELA_VENCIDA: "Tabela IBPT vencida. Baixe a tabela vigente no portal do IBPT.",
  POUCOS_NCM: "A tabela tem poucos NCMs. Confira se é o CSV de mercadorias do IBPT.",
  NCM_DEMAIS: "A tabela tem NCMs demais para ser a tabela do IBPT.",
  ALIQUOTA_INVALIDA: "A tabela tem alíquotas inválidas (fora de 0 a 100).",
  VIGENCIA_ANTERIOR: "Já existe uma tabela IBPT mais nova para esta UF.",
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
    return { mapaMeios: d.mapa_meios && typeof d.mapa_meios === "object" ? d.mapa_meios : {}, taxaServicoTratamento: d.taxa_servico_tratamento ?? null,
      ...(d.ibscbs_sn ? { ibsCbsSn: d.ibscbs_sn } : {}), ...(d.entrega_nfce ? { entregaNfce: d.entrega_nfce } : {}) };
  } catch {
    return vazio;
  }
}

/** Formato que o selo/rascunho fiscal espera (seloFiscalDaConta.config). */
export function configVendaParaSelo(c) {
  return { mapaMeios: c?.mapaMeios || {}, regras: c?.taxaServicoTratamento ? { taxaServico: c.taxaServicoTratamento } : {}, ...(c?.ibsCbsSn ? { ibsCbsSn: c.ibsCbsSn } : {}), ...(c?.entregaNfce ? { entregaNfce: c.entregaNfce } : {}) };
}

/** NFC-e de entrega a domicílio da loja (migration 206). `config` no formato de normalizarEntregaNfce. */
export async function salvarEntregaNfce(supabase, lojaId, config) {
  await chamar(supabase, "app_fiscal_salvar_entrega_nfce", { p_loja_id: lojaId, p_config: config });
  return true;
}

/** IBS/CBS do Simples da loja (migration 205). `config` no formato de normalizarIbsCbsSn. */
export async function salvarIbsCbsSn(supabase, lojaId, config) {
  await chamar(supabase, "app_fiscal_salvar_ibscbs_sn", { p_loja_id: lojaId, p_config: config });
  return true;
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

/**
 * Envia certificado A1 / CSC para a API do servidor (/api/fiscal-credencial).
 * O segredo vai direto ao servidor pelo HTTPS; a resposta traz só metadados.
 */
export async function enviarCredencialFiscal(supabase, corpo, opts = {}) {
  return chamarApiFiscal(supabase, "/api/fiscal-credencial", corpo, opts);
}

/** Teste de conexão com a SEFAZ usando o certificado do cofre (só servidor). */
export async function testarConexaoSefaz(supabase, { lojaId, modelo = 65, ambiente = "homologacao" }, opts = {}) {
  return chamarApiFiscal(supabase, "/api/fiscal-emitir", { acao: "status", lojaId, modelo, ambiente }, opts);
}

export async function chamarApiFiscal(supabase, rota, corpo, { fetchFn = (...a) => globalThis.fetch(...a) } = {}) {
  const { data } = (await supabase?.auth?.getSession?.()) || {};
  const token = data?.session?.access_token;
  if (!token) throw Object.assign(new Error("Faça login novamente para continuar."), { code: "SEM_LOGIN" });
  let resp;
  try {
    resp = await fetchFn(rota, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo || {}),
    });
  } catch {
    throw Object.assign(new Error("Sem conexão com o servidor. Tente novamente."), { code: "REDE" });
  }
  let r;
  try { r = await resp.json(); } catch { r = null; }
  if (!resp.ok || !r?.ok) {
    throw Object.assign(new Error(r?.erro || "Não foi possível concluir. Tente novamente."), { code: r?.code || `HTTP_${resp.status}` });
  }
  return r;
}

/** Conteúdo de um arquivo (File/Blob) em base64, sem o prefixo "data:". */
export async function arquivoParaBase64(arquivo) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return globalThis.btoa(bin);
}

/** E10: o que falta para ligar a produção (migration 186). */
export async function consultarLiberacaoProducao(supabase, lojaId) {
  const d = await chamar(supabase, "app_fiscal_producao_liberada", { p_loja_id: lojaId });
  return { liberada: !!d.liberada, faltas: Array.isArray(d.faltas) ? d.faltas : [], emProducao: !!d.em_producao };
}

export async function resumoCredenciaisFiscais(supabase, lojaId) {
  const d = await chamar(supabase, "app_fiscal_credenciais_resumo", { p_loja_id: lojaId });
  return (d.credenciais || []).map((c) => ({
    tipo: c.tipo, ambiente: c.ambiente ?? null, titular: c.titular ?? null, documentoTitular: c.documento_titular ?? null,
    idCsc: c.id_csc ?? null, validadeInicio: c.validade_inicio ?? null, validadeFim: c.validade_fim ?? null,
    cadastrado: !!c.cadastrado, atualizadoEm: c.atualizado_em ?? null,
  }));
}

// ── Tabela IBPT (migration 190) ────────────────────────────
const isoParaBr = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
function ibptMigracaoPendente(e) {
  return e?.code === "MIGRACAO_PENDENTE" ? Object.assign(new Error("Tabela IBPT ainda não instalada no banco (migration 190 pendente)."), { code: "MIGRACAO_PENDENTE" }) : e;
}

/** Estado das tabelas IBPT (sem os NCMs). Super vê todas as UFs; admin de loja, só a da sua loja. */
export async function resumoTabelasIbpt(supabase, lojaId) {
  try {
    const d = await chamar(supabase, "app_fiscal_ibpt_resumo", { p_loja_id: lojaId });
    return {
      ufLoja: d.ufLoja || "", ehSuper: !!d.ehSuper,
      tabelas: (d.tabelas || []).map((t) => ({ uf: t.uf, versao: t.versao, chave: t.chave || "", fonte: t.fonte || "",
        vigenciaInicio: isoParaBr(t.vigenciaInicio), vigenciaFim: isoParaBr(t.vigenciaFim), qtdNcm: t.qtdNcm, importadoEm: t.importadoEm || null })),
    };
  } catch (e) { throw ibptMigracaoPendente(e); }
}

/** Grava a tabela (já conferida na tela). O banco valida tudo de novo. */
export async function importarTabelaIbpt(supabase, lojaId, tabela, uf) {
  try {
    return await chamar(supabase, "app_fiscal_ibpt_importar", { p_loja_id: lojaId, ...tabelaParaEnvio(tabela, uf) });
  } catch (e) { throw ibptMigracaoPendente(e); }
}
