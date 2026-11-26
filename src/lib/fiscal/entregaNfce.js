// ════════════════════════════════════════════════════════════
//  NFC-e de ENTREGA A DOMICÍLIO — parâmetros por loja. Desligado por padrão.
//  Venda não presencial leva o endereço do cliente (Ajuste SINIEF 19/16, cl. 4ª, VII, c, redação do Ajuste 9/26). Na NFC-e:
//  indPres = 4, destinatário identificado (rejeição 787) com endereço (788) e dados do transportador (786).
//  Quem entrega: a própria loja (modFrete 3) ou um terceiro contratado por ela (modFrete 0).
//  Venda por marketplace/plataforma (iFood e outros): identifica o intermediador (Ajuste SINIEF 19/16, cl. 4ª, XII;
//  RC SEFAZ-SP 23979/2021): indIntermed = 1 e grupo infIntermed. Documento 27 (Fiscal), seções 9 e 11.
// ════════════════════════════════════════════════════════════
import { normalizarDocumentoFiscal, validarDocumentoFiscal, UFS } from "../emitenteFiscalService.js";

export const MODALIDADES_FRETE = [
  ["3", "A própria loja"],
  ["0", "Um terceiro contratado pela loja"],
];
export const TERCEIRO_VAZIO = Object.freeze({ documento: "", nome: "", ie: "", endereco: "", municipio: "", uf: "" });
export const MARKETPLACE_VAZIO = Object.freeze({ nome: "", cnpj: "", idCadIntTran: "" });

const texto = (v) => String(v ?? "").trim();
const so = (v) => String(v ?? "").replace(/\D/g, "");

export function normalizarEntregaNfce(config) {
  const c = config || {};
  const t = c.terceiro || {};
  return {
    ativo: c.ativo === true,
    // Quem entrega normalmente (o caixa pode trocar quando há terceiro cadastrado). Valor antigo "9" vira própria loja.
    modFrete: String(c.modFrete) === "0" ? "0" : "3",
    // A SEFAZ exige o transportador na entrega (786). Mantido sempre verdadeiro: a função do banco (206) espera o campo.
    informarTransportador: true,
    // O cardápio público pede o endereço na entrega (migration 207). Desligado por padrão.
    pedirNoCardapio: c.pedirNoCardapio === true,
    terceiro: Object.fromEntries(Object.keys(TERCEIRO_VAZIO).map((k) => [k, texto(t[k])])),
    marketplaces: (Array.isArray(c.marketplaces) ? c.marketplaces : []).map((m) => ({ nome: texto(m?.nome), cnpj: texto(m?.cnpj), idCadIntTran: texto(m?.idCadIntTran) })),
  };
}

/** O que falta nos dados do transportador terceiro, ou null. */
export function problemaTerceiro(terceiro = TERCEIRO_VAZIO) {
  const t = { ...TERCEIRO_VAZIO, ...terceiro };
  const doc = normalizarDocumentoFiscal(t.documento);
  if (!doc || !validarDocumentoFiscal(doc).valido) return "informe o CNPJ ou CPF válido do transportador";
  if (texto(t.nome).length < 2) return "informe o nome do transportador";
  if (t.uf && !UFS.includes(texto(t.uf).toUpperCase())) return "UF do transportador inválida";
  const ie = texto(t.ie).toUpperCase();
  if (ie && ie !== "ISENTO" && !/^\d{2,14}$/.test(so(ie))) return "inscrição estadual do transportador inválida";
  if (ie && !texto(t.uf)) return "informe a UF do transportador junto com a inscrição estadual";
  return null;
}

/** O que falta em um marketplace, ou null. */
export function problemaMarketplace(m = MARKETPLACE_VAZIO) {
  if (texto(m.nome).length < 2) return "informe o nome do marketplace";
  const doc = normalizarDocumentoFiscal(m.cnpj);
  const r = doc ? validarDocumentoFiscal(doc) : null;
  if (!r?.valido || r.tipo === "cpf") return `informe o CNPJ válido de ${texto(m.nome)}`;
  const id = texto(m.idCadIntTran);
  if (id.length < 2 || id.length > 60) return `informe o identificador da loja em ${texto(m.nome)} (2 a 60 letras)`;
  return null;
}

export const temTerceiro = (config) => !problemaTerceiro(normalizarEntregaNfce(config).terceiro);

/** Pendências para salvar com a entrega ligada. */
export function pendenciasDaEntrega(config) {
  const c = normalizarEntregaNfce(config);
  const faltas = [];
  const preencheuTerceiro = Object.values(c.terceiro).some(Boolean);
  if (c.modFrete === "0" || preencheuTerceiro) { const p = problemaTerceiro(c.terceiro); if (p) faltas.push(p); }
  for (const m of c.marketplaces) { const p = problemaMarketplace(m); if (p) faltas.push(p); }
  const cnpjs = c.marketplaces.map((m) => normalizarDocumentoFiscal(m.cnpj));
  if (new Set(cnpjs).size !== cnpjs.length) faltas.push("há marketplace com CNPJ repetido");
  return faltas;
}

/**
 * Grupo transp da nota de entrega. `quem`: "propria" | "terceiro" | "" (vale o padrão da loja).
 * @returns {{ modFrete:string, transporta:object } | { erro:string }}
 */
export function transporteDaEntrega(config, { documento = "", emitente = {}, quem = "" } = {}) {
  const c = normalizarEntregaNfce(config);
  const terceiro = quem ? quem === "terceiro" : c.modFrete === "0";
  const grupoDoc = (d) => (d.length === 11 ? { CPF: d } : { CNPJ: d });
  if (!terceiro) return { modFrete: "3", transporta: { ...grupoDoc(String(documento)), xNome: emitente.razaoSocial, UF: emitente.uf } };
  const falta = problemaTerceiro(c.terceiro);
  if (falta) return { erro: `Transportador terceiro incompleto: ${falta}.` };
  const t = c.terceiro;
  const ie = t.ie.toUpperCase() === "ISENTO" ? "ISENTO" : so(t.ie);
  return {
    modFrete: "0",
    transporta: {
      ...grupoDoc(normalizarDocumentoFiscal(t.documento)), xNome: t.nome,
      ...(ie ? { IE: ie } : {}), ...(t.endereco ? { xEnder: t.endereco } : {}), ...(t.municipio ? { xMun: t.municipio } : {}),
      ...(t.uf ? { UF: t.uf.toUpperCase() } : {}),
    },
  };
}

/**
 * Intermediador da venda (marketplace). Sem `cnpj` = venda direta (null). O CNPJ precisa estar cadastrado na loja.
 * @returns {null | { CNPJ:string, idCadIntTran:string } | { erro:string }}
 */
export function intermediadorDaEntrega(config, cnpj = "") {
  const alvo = normalizarDocumentoFiscal(cnpj);
  if (!alvo) return null;
  const m = normalizarEntregaNfce(config).marketplaces.find((x) => normalizarDocumentoFiscal(x.cnpj) === alvo);
  if (!m) return { erro: "O marketplace escolhido não está cadastrado nesta loja." };
  const falta = problemaMarketplace(m);
  if (falta) return { erro: `Marketplace incompleto: ${falta}.` };
  return { CNPJ: alvo, idCadIntTran: m.idCadIntTran };
}
