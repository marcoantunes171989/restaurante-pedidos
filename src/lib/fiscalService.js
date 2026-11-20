// ════════════════════════════════════════════════════════════
//  Camada de serviço fiscal — Central Fiscal Prime (Fase 6)
//
//  Resolve a configuração fiscal EFETIVA de um produto, centralizando a
//  lógica tributária em um único lugar (fora dos componentes React) para
//  ser consumida pelo futuro emissor de NF-e/NFC-e.
//
//  Ordem de prioridade das fontes (a primeira que existir vence):
//    1. config-loja   — produto vinculado a uma configuração fiscal da loja
//                       (loja_fiscal_regra, Fase 5). É a fonte preferida.
//    2. cadastros     — vínculos por FK do produto: NCM → Regra de ICMS,
//                       CFOP, PIS, COFINS, IPI, CEST (Fases 1–2).
//    3. produto-jsonb — campos fiscais legados no JSONB do produto (079).
//    4. indefinido    — nada configurado.
//
//  Puro e sem dependências (testável). Não emite nota: apenas RESOLVE os
//  parâmetros válidos no momento — o emissor decide o resto.
// ════════════════════════════════════════════════════════════

// Forma normalizada devolvida pelo resolvedor (todos os campos presentes).
const BASE_FISCAL = {
  ncm: "", cest: "", cfop: "", cstIcms: "", csosn: "",
  icmsAliquota: 0, icmsReducao: 0, fcpAliquota: 0, icmsSt: false, mva: 0,
  cstPis: "", pisAliquota: 0, cstCofins: "", cofinsAliquota: 0,
  ipiCst: "", ipiAliquota: 0, ibsAliquota: 0, cbsAliquota: 0, impostoSeletivo: 0,
  beneficioCbenef: "",
  origemMercadoria: "", // origem da mercadoria (0 a 8); vazio = padrão 0 (nacional) com aviso
  creditoSnAliquota: 0, // alíquota de crédito do Simples Nacional (CSOSN 101/900); 0 = não informada
  unidadeComercial: "", unidadeTributavel: "", // sigla (UN, KG, L, PC…); vazio = padrão UN com aviso
};

// "KG - Quilograma" → "KG"; só aceita sigla de 1 a 6 letras (leiaute: uCom/uTrib 1–6 caracteres).
const siglaUnidade = (v) => { const c = soCodigo(v).toUpperCase(); return /^[A-Z]{1,6}$/.test(c) ? c : ""; };

const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const str = (v) => (v == null ? "" : String(v));
// "00 - Tributada" → "00"; mantém já-limpos.
const soCodigo = (v) => str(v).trim().split(/\s|-/)[0] || "";

function porId(lista, id) {
  if (id == null || !Array.isArray(lista)) return null;
  return lista.find((x) => String(x.id) === String(id)) || null;
}

// Fonte 1 — configuração fiscal da loja (loja_fiscal_regra).
function daConfigLoja(cfg) {
  return {
    ...BASE_FISCAL,
    ncm: str(cfg.ncmCodigo), cest: str(cfg.cestCodigo), cfop: str(cfg.cfopCodigo),
    cstIcms: str(cfg.cstIcms), csosn: str(cfg.csosn),
    icmsAliquota: num(cfg.icmsAliquota), icmsReducao: num(cfg.icmsReducao), fcpAliquota: num(cfg.fcpAliquota),
    icmsSt: !!cfg.icmsSt, mva: num(cfg.mva),
    cstPis: str(cfg.cstPis), pisAliquota: num(cfg.pisAliquota),
    cstCofins: str(cfg.cstCofins), cofinsAliquota: num(cfg.cofinsAliquota),
    ipiCst: str(cfg.ipiCst), ipiAliquota: num(cfg.ipiAliquota),
    ibsAliquota: num(cfg.ibsAliquota), cbsAliquota: num(cfg.cbsAliquota), impostoSeletivo: num(cfg.impostoSeletivo),
    beneficioCbenef: str(cfg.beneficioCbenef),
    origemMercadoria: str(cfg.origemMercadoria), creditoSnAliquota: num(cfg.creditoSnAliquota),
  };
}

// Fonte 2 — vínculos por FK (NCM→ICMS, CFOP, PIS, COFINS, IPI, CEST).
function dosCadastros(produto, ctx) {
  const ncm = porId(ctx.fiscalNcm, produto.ncmId);
  const icms = ncm ? porId(ctx.fiscalIcms, ncm.icmsId) : null;
  const cfop = porId(ctx.fiscalCfop, produto.cfopId);
  const pis = porId(ctx.fiscalPis, produto.pisId);
  const cofins = porId(ctx.fiscalCofins, produto.cofinsId);
  const ipi = porId(ctx.fiscalIpi, produto.ipiId);
  const cest = porId(ctx.fiscalCest, produto.cestId);
  return {
    ...BASE_FISCAL,
    ncm: str(ncm?.codigo), cest: str(cest?.codigo || ncm?.cest),
    cfop: str(cfop?.codigo),
    cstIcms: soCodigo(icms?.cst), csosn: soCodigo(icms?.csosn),
    icmsAliquota: num(icms?.aliquota), icmsReducao: num(icms?.reducaoBase), fcpAliquota: num(icms?.fcp),
    icmsSt: !!icms?.icmsSt, mva: num(icms?.mva),
    cstPis: soCodigo(pis?.cst), pisAliquota: num(pis?.aliquota),
    cstCofins: soCodigo(cofins?.cst), cofinsAliquota: num(cofins?.aliquota),
    ipiCst: soCodigo(ipi?.cst), ipiAliquota: num(ipi?.aliquota),
  };
}

// Fonte 3 — JSONB fiscal legado do produto.
function doJsonb(fis) {
  return {
    ...BASE_FISCAL,
    ncm: str(fis.ncm), cest: str(fis.cest), cfop: str(fis.cfop),
    cstIcms: soCodigo(fis.cst || fis.cstIcms), csosn: soCodigo(fis.csosn),
    icmsAliquota: num(fis.aliquotaIcms ?? fis.icms), icmsReducao: num(fis.reducaoBase),
    fcpAliquota: num(fis.fcp), icmsSt: !!fis.icmsSt, mva: num(fis.mva),
    cstPis: soCodigo(fis.cstPis), pisAliquota: num(fis.aliquotaPis ?? fis.pis),
    cstCofins: soCodigo(fis.cstCofins), cofinsAliquota: num(fis.aliquotaCofins ?? fis.cofins),
    ipiCst: soCodigo(fis.cstIpi), ipiAliquota: num(fis.aliquotaIpi ?? fis.ipi),
    beneficioCbenef: str(fis.cBenef || fis.beneficio),
    origemMercadoria: soCodigo(fis.origemMercadoria ?? fis.origem ?? fis.orig),
    unidadeComercial: siglaUnidade(fis.unidadeComercial), unidadeTributavel: siglaUnidade(fis.unidadeTributavel),
    creditoSnAliquota: num(fis.creditoSnAliquota),
  };
}

// NCM / CFOP / CEST do próprio produto: vínculos por cadastro (FK) e, na falta, o JSONB legado.
function identificacaoDoProduto(produto, ctx) {
  const cad = dosCadastros(produto, ctx);
  const fis = produto.fiscal && typeof produto.fiscal === "object" ? doJsonb(produto.fiscal) : BASE_FISCAL;
  return { ncm: cad.ncm || fis.ncm, cfop: cad.cfop || fis.cfop, cest: cad.cest || fis.cest };
}

// true quando o objeto de cadastros/JSONB tem ao menos um dado fiscal útil.
function temAlgumDado(f) {
  return !!(f.ncm || f.cfop || f.cstIcms || f.csosn || f.cstPis || f.cstCofins ||
    f.icmsAliquota || f.pisAliquota || f.cofinsAliquota || f.ipiAliquota);
}

/**
 * Resolve a configuração fiscal efetiva de um produto.
 *
 * @param {object} produto  Produto (com lojaFiscalRegraId, ncmId, cfopId…, fiscal JSONB).
 * @param {object} ctx      Cadastros disponíveis: { lojaFiscalRegras, fiscalNcm,
 *                          fiscalIcms, fiscalCfop, fiscalPis, fiscalCofins,
 *                          fiscalIpi, fiscalCest }.
 * @returns {object}        BASE_FISCAL + { fonte, origem }.
 *                          fonte ∈ 'config-loja' | 'cadastros' | 'produto-jsonb' | 'indefinido'.
 */
export function resolverFiscalProduto(produto, ctx = {}) {
  if (!produto || typeof produto !== "object") {
    return { ...BASE_FISCAL, fonte: "indefinido", origem: null };
  }

  // Origem da mercadoria (0 a 8) é característica do PRODUTO: se o cadastro do produto a informa,
  // vale em qualquer fonte (regra da loja, cadastros ou JSONB); senão cai na da regra, se houver.
  const fisProd = produto.fiscal && typeof produto.fiscal === "object" ? produto.fiscal : null;
  const origemProd = fisProd ? soCodigo(fisProd.origemMercadoria ?? fisProd.origem ?? fisProd.orig) : "";
  // Unidade comercial/tributável também são do produto (cadastro: UN, KG, L, PC…).
  const uComProd = fisProd ? siglaUnidade(fisProd.unidadeComercial) : "";
  const uTribProd = fisProd ? siglaUnidade(fisProd.unidadeTributavel) : "";
  const creditoProd = fisProd ? num(fisProd.creditoSnAliquota) : 0;
  const comOrigem = (r) => ({
    ...r,
    ...(creditoProd > 0 ? { creditoSnAliquota: creditoProd } : {}),
    ...(/^[0-8]$/.test(origemProd) ? { origemMercadoria: origemProd } : {}),
    ...(uComProd ? { unidadeComercial: uComProd } : {}),
    ...(uTribProd ? { unidadeTributavel: uTribProd } : {}),
  });

  // 1) Configuração fiscal da loja (Fase 5) — fonte preferida.
  const cfg = porId(ctx.lojaFiscalRegras, produto.lojaFiscalRegraId);
  if (cfg) {
    const daRegra = daConfigLoja(cfg);
    // A regra da loja manda, mas NÃO apaga o que o cadastro do produto já informa: se a regra vem sem NCM,
    // CFOP ou CEST, completa com o que foi vinculado ao produto (cadastro, "Atualização em lote" ou dados do
    // produto). Só preenche lacuna; nunca troca um valor que a regra tem. Campos de tributação (CST/CSOSN,
    // alíquotas) continuam só da regra, para não misturar combinações de impostos.
    const lacunas = !daRegra.ncm || !daRegra.cfop || !daRegra.cest ? identificacaoDoProduto(produto, ctx) : null;
    const completa = lacunas ? {
      ...daRegra,
      ncm: daRegra.ncm || lacunas.ncm, cfop: daRegra.cfop || lacunas.cfop, cest: daRegra.cest || lacunas.cest,
    } : daRegra;
    const preenchidos = lacunas ? ["ncm", "cfop", "cest"].filter((k) => !daRegra[k] && completa[k]) : [];
    return comOrigem({ ...completa, fonte: "config-loja", origem: { id: cfg.id, nome: cfg.regraNome || null, versao: cfg.versaoImportada ?? null, customizada: !!cfg.customizada, ...(preenchidos.length ? { completadoPeloProduto: preenchidos } : {}) } });
  }

  // 2) Vínculos por FK (NCM→ICMS, CFOP, PIS, COFINS, IPI, CEST).
  const cad = dosCadastros(produto, ctx);
  if (temAlgumDado(cad)) {
    return comOrigem({ ...cad, fonte: "cadastros", origem: { ncmId: produto.ncmId ?? null, cfopId: produto.cfopId ?? null } });
  }

  // 3) JSONB fiscal legado.
  const fis = produto.fiscal;
  if (fis && typeof fis === "object") {
    const j = doJsonb(fis);
    if (temAlgumDado(j)) return comOrigem({ ...j, fonte: "produto-jsonb", origem: null });
  }

  // 4) Nada configurado.
  return { ...BASE_FISCAL, fonte: "indefinido", origem: null };
}

// Rótulo amigável da fonte (para UI/prévia).
export function rotuloFonteFiscal(fonte) {
  switch (fonte) {
    case "config-loja": return "Configuração da loja";
    case "cadastros": return "Cadastros fiscais (NCM/CFOP…)";
    case "produto-jsonb": return "Dados fiscais do produto";
    default: return "Não configurado";
  }
}

// Pendências que impediriam uma emissão de NF-e/NFC-e (checagem mínima).
export function pendenciasFiscais(resolvido) {
  const p = [];
  if (!resolvido || resolvido.fonte === "indefinido") return ["Sem configuração fiscal"];
  if (!resolvido.ncm) p.push("NCM ausente");
  if (!resolvido.cfop) p.push("CFOP ausente");
  if (!resolvido.cstIcms && !resolvido.csosn) p.push("CST/CSOSN de ICMS ausente");
  return p;
}

export { BASE_FISCAL };
