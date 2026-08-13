// ════════════════════════════════════════════════════════════
//  Serviço do EMITENTE fiscal — NFC-e (mod. 65) — Pedido Prime
//
//  Centraliza as constantes de CRT, a normalização do emitente, a validação
//  do cadastro, o percentual de preenchimento, as pendências para NFC-e, a
//  liberação do ambiente de homologação e os rótulos amigáveis.
//
//  Puro e sem dependências (testável). NÃO trata tributação de PRODUTO —
//  isso continua em src/lib/fiscalService.js. NÃO guarda segredos
//  (certificado/CSC/senha) — fora de escopo desta fase.
// ════════════════════════════════════════════════════════════

// ── CRT — Código do Regime Tributário (fonte canônica é o código) ──
// Suporta os CRT do leiaute vigente da NF-e/NFC-e.
export const CRT_OPCOES = [
  { codigo: "1", descricao: "Simples Nacional" },
  { codigo: "2", descricao: "Simples Nacional — excesso de sublimite de receita bruta" },
  { codigo: "3", descricao: "Regime Normal" },
  { codigo: "4", descricao: "Simples Nacional — MEI" },
];

export function rotuloCrt(codigo) {
  const o = CRT_OPCOES.find((x) => x.codigo === String(codigo ?? "").trim());
  return o ? `${o.codigo} — ${o.descricao}` : "";
}
export function descricaoCrt(codigo) {
  const o = CRT_OPCOES.find((x) => x.codigo === String(codigo ?? "").trim());
  return o ? o.descricao : "";
}
export function crtValido(codigo) {
  return CRT_OPCOES.some((x) => x.codigo === String(codigo ?? "").trim());
}

// ── Ambientes NFC-e ────────────────────────────────────────
export const AMBIENTES_NFCE = [
  { valor: "simulacao", rotulo: "Simulação", nota: "Testes internos, sem valor fiscal." },
  { valor: "homologacao", rotulo: "Homologação", nota: "Ambiente de testes da SEFAZ (sem valor fiscal)." },
  { valor: "producao", rotulo: "Produção", nota: "Emissão com valor fiscal." },
];
export function rotuloAmbienteNfce(valor) {
  const a = AMBIENTES_NFCE.find((x) => x.valor === String(valor ?? "").trim());
  return a ? a.rotulo : "Simulação";
}

// ── UF — normalização e código IBGE (preparado p/ o serviço fiscal) ──
export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const COD_UF_IBGE = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29",
  MG: "31", ES: "32", RJ: "33", SP: "35",
  PR: "41", SC: "42", RS: "43",
  MS: "50", MT: "51", GO: "52", DF: "53",
};
export function normalizarUf(uf) {
  const u = String(uf ?? "").trim().toUpperCase();
  return UFS.includes(u) ? u : "";
}
export function ufValida(uf) {
  return UFS.includes(String(uf ?? "").trim().toUpperCase());
}
// Código IBGE da UF (2 dígitos) — derivado, nunca digitado pelo usuário.
export function codigoUf(uf) {
  return COD_UF_IBGE[normalizarUf(uf)] || "";
}

// ── Documento fiscal (CNPJ/CPF) — preparado p/ CNPJ ALFANUMÉRICO ──
// A evolução oficial do CNPJ passa a admitir LETRAS nas 12 primeiras posições
// (os 2 dígitos verificadores finais continuam numéricos). Por isso o documento
// FISCAL NÃO pode ser saneado com \D (soDigitos), que apagaria as letras de um
// documento válido. Aqui só removemos a FORMATAÇÃO permitida (pontuação/espaço)
// e normalizamos o caixa — as letras são preservadas.
//
// Camadas separadas de propósito:
//   normalizarDocumentoFiscal  → saneamento (não valida)
//   documentoFiscalPresente    → validação de PRESENÇA
//   documentoNumericoValido    → validação ESTRUTURAL do formato numérico atual
//   documentoEhAlfanumerico    → detecção do formato futuro
//   documentoSuportadoParaChave→ o que o gerador de chave desta versão aceita
const CHARS_FORMATACAO_DOC = /[.\-/\s]/g;
export function normalizarDocumentoFiscal(doc) {
  return String(doc ?? "").trim().toUpperCase().replace(CHARS_FORMATACAO_DOC, "");
}
export function documentoFiscalPresente(doc) {
  return normalizarDocumentoFiscal(doc).length > 0;
}
export function documentoEhAlfanumerico(doc) {
  return /[A-Z]/.test(normalizarDocumentoFiscal(doc));
}
// CPF (11) ou CNPJ (14) puramente numérico — mantém a compatibilidade atual.
export function documentoNumericoValido(doc) {
  const d = normalizarDocumentoFiscal(doc);
  return /^\d{11}$/.test(d) || /^\d{14}$/.test(d);
}
// O gerador de chave desta versão só suporta CNPJ NUMÉRICO de 14 dígitos.
export function documentoSuportadoParaChave(doc) {
  return /^\d{14}$/.test(normalizarDocumentoFiscal(doc));
}

// ── Validação de dígitos verificadores (CPF / CNPJ num. / CNPJ alfanumérico) ──
// Separação de responsabilidades: normalização (acima) → validação estrutural →
// validação dos DV. NUNCA usa \D genérico no CNPJ (preserva letras).
//
// CNPJ alfanumérico segue o algoritmo OFICIAL da Receita Federal (vigente a
// partir de 2026): 12 primeiras posições alfanuméricas + 2 DV numéricos. O
// valor de cada caractere no cálculo do DV é (código ASCII − 48): '0'..'9'→0..9
// e 'A'..'Z'→17..42. Pesos idênticos ao CNPJ tradicional (módulo 11). Para CNPJ
// puramente numérico o algoritmo coincide com o tradicional.
function valorCaractereCnpj(ch) {
  return ch.charCodeAt(0) - 48;
}
function dvCnpj(base) {
  // base: 12 (1º DV) ou 13 (2º DV) caracteres. Pesos módulo 11 da direita p/ esquerda.
  const pesos = base.length === 12
    ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += valorCaractereCnpj(base[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCpf(doc) {
  const d = String(doc ?? "").replace(/\D/g, ""); // CPF é sempre numérico
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // sequência repetida (000…, 111…)
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(d[i], 10) * (10 - i);
  let dv = (soma * 10) % 11; if (dv === 10) dv = 0;
  if (dv !== parseInt(d[9], 10)) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(d[i], 10) * (11 - i);
  dv = (soma * 10) % 11; if (dv === 10) dv = 0;
  return dv === parseInt(d[10], 10);
}

export function validarCnpjNumerico(doc) {
  const d = normalizarDocumentoFiscal(doc);
  if (!/^\d{14}$/.test(d)) return false;
  if (/^(\d)\1{13}$/.test(d)) return false; // sequência repetida
  const dv1 = dvCnpj(d.slice(0, 12));
  const dv2 = dvCnpj(d.slice(0, 12) + String(dv1));
  return d[12] === String(dv1) && d[13] === String(dv2);
}

export function validarCnpjAlfanumerico(doc) {
  const d = normalizarDocumentoFiscal(doc);
  // 12 posições alfanuméricas + 2 DV numéricos (leiaute oficial vigente).
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d)) return false;
  const dv1 = dvCnpj(d.slice(0, 12));
  const dv2 = dvCnpj(d.slice(0, 12) + String(dv1));
  return d[12] === String(dv1) && d[13] === String(dv2);
}

/**
 * Valida um documento fiscal (CPF, CNPJ numérico ou CNPJ alfanumérico).
 * Retorna { valido, tipo, motivo }. NÃO comprova existência na Receita —
 * validação apenas matemática/estrutural.
 */
export function validarDocumentoFiscal(doc) {
  const d = normalizarDocumentoFiscal(doc);
  if (!d) return { valido: false, tipo: "desconhecido", motivo: "Documento não informado." };
  const alfanumerico = /[A-Z]/.test(d);
  if (!alfanumerico && d.length === 11) {
    return validarCpf(d)
      ? { valido: true, tipo: "cpf", motivo: "CPF válido." }
      : { valido: false, tipo: "cpf", motivo: "CPF inválido. Verifique os dígitos informados." };
  }
  if (d.length === 14) {
    if (alfanumerico) {
      return validarCnpjAlfanumerico(d)
        ? { valido: true, tipo: "cnpj-alfanumerico", motivo: "CNPJ (alfanumérico) válido." }
        : { valido: false, tipo: "cnpj-alfanumerico", motivo: "CNPJ inválido. Verifique os dígitos verificadores." };
    }
    return validarCnpjNumerico(d)
      ? { valido: true, tipo: "cnpj", motivo: "CNPJ válido." }
      : { valido: false, tipo: "cnpj", motivo: "CNPJ inválido. Verifique os dígitos informados." };
  }
  return { valido: false, tipo: "desconhecido", motivo: "Documento deve ter 11 (CPF) ou 14 (CNPJ) caracteres." };
}

// Consulta externa oficial fica como PREPARAÇÃO (não chamar terceiros nesta fase).
// A validação atual é matemática/estrutural — não comprova existência na Receita.
export async function consultarCadastroCnpj() {
  return { disponivel: false, motivo: "Consulta oficial de CNPJ não habilitada nesta fase." };
}

// ── Segmentos de estabelecimento (sugestão de template fiscal) ──
export const SEGMENTOS_LOJA = [
  "Restaurante", "Pizzaria", "Hamburgueria", "Bar", "Cafeteria", "Açaíteria", "Outros",
];

// ── Validações estruturais de endereço/numeração ───────────
export const SERIE_NFCE_MIN = 1;
export const SERIE_NFCE_MAX = 999; // leiaute NFC-e: série de 3 posições (0–999); 0 não é usado.
export function serieNfceValida(serie) {
  const n = parseInt(serie, 10);
  return Number.isInteger(n) && n >= SERIE_NFCE_MIN && n <= SERIE_NFCE_MAX;
}
export function cepValido(cep) {
  return /^\d{8}$/.test(String(cep ?? "").replace(/\D/g, ""));
}
// Código IBGE do município tem 7 dígitos — mantido como TEXTO (preserva zeros).
export function codigoMunicipioIbgeValido(cod) {
  return /^\d{7}$/.test(String(cod ?? "").replace(/\D/g, ""));
}

// ── helpers de saneamento ──────────────────────────────────
const soDig = (v) => String(v ?? "").replace(/\D/g, "");
const t = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };
const intOuNull = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };

// Campos de texto simples do emitente (para trim/empty→null).
const CAMPOS_TEXTO = [
  "razaoSocial", "nomeFantasia", "inscricaoEstadual", "inscricaoMunicipal", "crt", "cnaePrincipal",
  "cep", "logradouro", "numero", "complemento", "bairro", "municipio", "codigoMunicipioIbge", "uf",
  "telefoneFiscal", "emailFiscal", "segmento",
];

/**
 * Normaliza os dados do emitente vindos do formulário:
 *  - trim em textos; string vazia → null;
 *  - UF em maiúsculas (se válida); CEP só dígitos; série inteira ≥ 1;
 *  - ambiente restrito ao conjunto válido (default simulacao).
 *  Preserva códigos/zero válidos (ex.: CRT "0" não existe, mas não força).
 */
export function normalizarEmitenteFiscal(dados = {}) {
  const out = {};
  for (const k of CAMPOS_TEXTO) out[k] = t(dados[k]);
  if (out.uf) out.uf = normalizarUf(out.uf) || out.uf.toUpperCase();
  if (out.cep) out.cep = soDig(out.cep) || null;
  if (out.codigoMunicipioIbge) out.codigoMunicipioIbge = soDig(out.codigoMunicipioIbge) || null;
  const amb = String(dados.nfceAmbiente ?? "").trim();
  out.nfceAmbiente = AMBIENTES_NFCE.some((a) => a.valor === amb) ? amb : "simulacao";
  out.nfceSerie = intOuNull(dados.nfceSerie) ?? 1;
  // Flags de habilitação de documento (default seguro: desabilitado).
  out.nfceHabilitada = dados.nfceHabilitada === true;
  out.nfeHabilitada = dados.nfeHabilitada === true;
  return out;
}

// ── Mapeamento DB ↔ front (puro) ───────────────────────────
export function dbParaEmitente(r) {
  if (!r) return null;
  return {
    id: r.id, lojaId: r.loja_id,
    razaoSocial: r.razao_social ?? "", nomeFantasia: r.nome_fantasia ?? "",
    inscricaoEstadual: r.inscricao_estadual ?? "", inscricaoMunicipal: r.inscricao_municipal ?? "",
    crt: r.crt ?? "", cnaePrincipal: r.cnae_principal ?? "",
    cep: r.cep ?? "", logradouro: r.logradouro ?? "", numero: r.numero ?? "", complemento: r.complemento ?? "",
    bairro: r.bairro ?? "", municipio: r.municipio ?? "", codigoMunicipioIbge: r.codigo_municipio_ibge ?? "", uf: r.uf ?? "",
    telefoneFiscal: r.telefone_fiscal ?? "", emailFiscal: r.email_fiscal ?? "",
    nfceAmbiente: r.nfce_ambiente ?? "simulacao", nfceSerie: r.nfce_serie ?? 1,
    // Migration 109 (tolerante se ausente): segmento + flags de habilitação.
    segmento: r.segmento ?? "", nfceHabilitada: r.nfce_habilitada ?? false, nfeHabilitada: r.nfe_habilitada ?? false,
    criadoEmISO: r.criado_em ?? null, atualizadoEmISO: r.atualizado_em ?? null,
  };
}
// Campos introduzidos pela migration 109 (separados p/ fallback tolerante no upsert).
export const CAMPOS_EMITENTE_109 = ["segmento", "nfce_habilitada", "nfe_habilitada"];
// Monta o payload snake_case para UPSERT (já normalizado). loja_id é
// definido pela API (nunca pelo formulário) para não burlar o RLS.
export function emitenteParaDb(dados = {}) {
  const n = normalizarEmitenteFiscal(dados);
  return {
    razao_social: n.razaoSocial, nome_fantasia: n.nomeFantasia,
    inscricao_estadual: n.inscricaoEstadual, inscricao_municipal: n.inscricaoMunicipal,
    crt: n.crt, cnae_principal: n.cnaePrincipal,
    cep: n.cep, logradouro: n.logradouro, numero: n.numero, complemento: n.complemento,
    bairro: n.bairro, municipio: n.municipio, codigo_municipio_ibge: n.codigoMunicipioIbge, uf: n.uf,
    telefone_fiscal: n.telefoneFiscal, email_fiscal: n.emailFiscal,
    nfce_ambiente: n.nfceAmbiente, nfce_serie: n.nfceSerie,
    segmento: n.segmento, nfce_habilitada: n.nfceHabilitada, nfe_habilitada: n.nfeHabilitada,
  };
}

// ── Campos mínimos para NFC-e (mod. 65) ────────────────────
// documento (CNPJ/CPF) vem de tab_lojas.documento e entra via `documento`.
// IM, CNAE, telefone e e-mail NÃO bloqueiam (não são obrigatórios à operação).
const OBRIGATORIOS_NFCE = [
  { chave: "razaoSocial", rotulo: "Razão Social" },
  { chave: "documento", rotulo: "CNPJ/CPF", externo: true },
  { chave: "inscricaoEstadual", rotulo: "Inscrição Estadual" },
  { chave: "crt", rotulo: "Regime Tributário (CRT)" },
  { chave: "cep", rotulo: "CEP" },
  { chave: "logradouro", rotulo: "Logradouro" },
  { chave: "numero", rotulo: "Número" },
  { chave: "bairro", rotulo: "Bairro" },
  { chave: "municipio", rotulo: "Município" },
  { chave: "codigoMunicipioIbge", rotulo: "Código IBGE do Município" },
  { chave: "uf", rotulo: "UF" },
  { chave: "nfceSerie", rotulo: "Série NFC-e" },
];

function valorCampo(emitente, documento, chave, externo) {
  // Documento fiscal: normaliza SEM apagar letras (compatível com CNPJ alfanumérico).
  if (externo && chave === "documento") return normalizarDocumentoFiscal(documento);
  const v = emitente?.[chave];
  return v == null ? "" : String(v).trim();
}

/**
 * Lista de pendências (rótulos) que faltam para uma NFC-e.
 * @param emitente  objeto do emitente (form ou normalizado)
 * @param documento CNPJ/CPF da loja (tab_lojas.documento)
 */
export function pendenciasEmitenteNfce(emitente, documento = "") {
  const pend = [];
  for (const c of OBRIGATORIOS_NFCE) {
    let ok = !!valorCampo(emitente, documento, c.chave, c.externo);
    if (ok && c.chave === "crt") ok = crtValido(emitente.crt);
    if (ok && c.chave === "uf") ok = ufValida(emitente.uf);
    if (ok && c.chave === "cep") ok = cepValido(emitente.cep);
    if (ok && c.chave === "codigoMunicipioIbge") ok = codigoMunicipioIbgeValido(emitente.codigoMunicipioIbge);
    if (ok && c.chave === "nfceSerie") ok = serieNfceValida(emitente.nfceSerie);
    if (!ok) pend.push(c.rotulo);
  }
  return pend;
}

// Percentual de preenchimento (0–100) sobre os campos mínimos de NFC-e.
export function percentualCadastroFiscal(emitente, documento = "") {
  const total = OBRIGATORIOS_NFCE.length;
  const pend = pendenciasEmitenteNfce(emitente, documento).length;
  return Math.round(((total - pend) / total) * 100);
}

// Homologação só é liberada quando não há pendências mínimas do emitente.
export function podeUsarHomologacao(emitente, documento = "") {
  return pendenciasEmitenteNfce(emitente, documento).length === 0;
}

// Produção fica BLOQUEADA nesta fase (após homologação validada, no futuro).
export const PRODUCAO_BLOQUEADA = true;
export function podeUsarProducao() {
  return !PRODUCAO_BLOQUEADA;
}

// Validação geral do cadastro para persistência (simulação sempre pode salvar;
// homologação exige campos mínimos). Retorna { ok, erros[] }.
export function validarEmitenteFiscal(emitente, documento = "") {
  const erros = [];
  const amb = String(emitente?.nfceAmbiente ?? "simulacao");
  if (emitente?.crt && !crtValido(emitente.crt)) erros.push("CRT inválido.");
  if (emitente?.uf && !ufValida(emitente.uf)) erros.push("UF inválida.");
  if (emitente?.cep && !cepValido(emitente.cep)) erros.push("CEP deve ter 8 dígitos.");
  if (emitente?.codigoMunicipioIbge && !codigoMunicipioIbgeValido(emitente.codigoMunicipioIbge)) erros.push("Código IBGE do município deve ter 7 dígitos.");
  if (emitente?.nfceSerie != null && String(emitente.nfceSerie) !== "" && !serieNfceValida(emitente.nfceSerie)) {
    erros.push(`Série NFC-e deve estar entre ${SERIE_NFCE_MIN} e ${SERIE_NFCE_MAX}.`);
  }
  if (amb === "producao") erros.push("Produção indisponível nesta fase.");
  if (amb === "homologacao" && !podeUsarHomologacao(emitente, documento)) {
    erros.push("Homologação exige o cadastro fiscal mínimo completo.");
  }
  return { ok: erros.length === 0, erros };
}
