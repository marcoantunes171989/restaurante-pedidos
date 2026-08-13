// ════════════════════════════════════════════════════════════
//  Serviço NFC-e (mod. 65) — PRÉ-VALIDAÇÃO da venda — Pedido Prime
//
//  Passo do roteiro: VENDA → RESOLVER FISCAL PRODUTO → PRÉ-VALIDAÇÃO →
//  NUMERAÇÃO → CHAVE DE ACESSO. Aqui ficam apenas as etapas DETERMINÍSTICAS
//  e SEGURAS: montar o rascunho fiscal da venda, pré-validar a aptidão e
//  compor a chave de acesso (44 dígitos, DV módulo 11).
//
//  NÃO gera XML, NÃO assina, NÃO fala com a SEFAZ, NÃO usa certificado/CSC.
//  Puro e testável. Reutiliza o resolvedor de produto (fiscalService) e o
//  serviço do emitente (emitenteFiscalService) — sem duplicar regra.
// ════════════════════════════════════════════════════════════

import { resolverFiscalProduto, pendenciasFiscais } from "./fiscalService";
import {
  pendenciasEmitenteNfce, codigoUf,
  normalizarDocumentoFiscal, documentoEhAlfanumerico, documentoSuportadoParaChave,
  serieNfceValida,
} from "./emitenteFiscalService";

const soDig = (v) => String(v ?? "").replace(/\D/g, "");
const pad = (v, n) => soDig(v).padStart(n, "0").slice(-n);

// ── Numeração / código numérico ────────────────────────────
export function formatarNumeroNfce(nNF) {
  const n = parseInt(nNF, 10);
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}
// cNF: código numérico de 8 dígitos (aleatório na emissão real). Determinístico
// a partir de uma semente para testes/pré-validação.
export function cnfDeSemente(semente) {
  const s = soDig(semente);
  if (s) return pad(s, 8);
  return "00000000";
}

// ── Chave de acesso NFC-e (44 dígitos) ─────────────────────
// Dígito verificador por módulo 11 (pesos 2..9 da direita p/ esquerda).
export function digitoVerificadorChave(chave43) {
  const d = soDig(chave43);
  if (d.length !== 43) return null;
  let soma = 0, peso = 2;
  for (let i = d.length - 1; i >= 0; i--) {
    soma += parseInt(d[i], 10) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return dv >= 10 ? 0 : dv;
}

/**
 * Compõe a chave de acesso da NFC-e (mod. 65).
 * @returns {{ chave:string|null, dv:number|null, erro:string|null }}
 * Layout: cUF(2) AAMM(4) CNPJ(14) mod(2=65) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
 */
export function montarChaveAcessoNfce({ uf, aamm, cnpj, serie = 1, numero, tpEmis = 1, cNF }) {
  const cUF = codigoUf(uf);
  // Documento fiscal: normaliza SEM apagar letras. Um CNPJ alfanumérico NÃO é
  // corrompido para forçar uma chave — retorna erro controlado (leiaute em
  // evolução; o gerador atual só compõe chave a partir de CNPJ numérico).
  const docN = normalizarDocumentoFiscal(cnpj);
  const aammD = soDig(aamm);
  const nNF = soDig(numero);
  if (!cUF) return { chave: null, dv: null, erro: "UF inválida (sem código IBGE)." };
  if (documentoEhAlfanumerico(docN)) {
    return { chave: null, dv: null, erro: "Formato de CNPJ alfanumérico ainda não suportado pelo gerador de chave desta versão." };
  }
  if (!documentoSuportadoParaChave(docN)) return { chave: null, dv: null, erro: "CNPJ do emitente deve ter 14 dígitos." };
  if (aammD.length !== 4) return { chave: null, dv: null, erro: "AAMM (ano/mês) inválido." };
  if (!nNF || parseInt(nNF, 10) <= 0) return { chave: null, dv: null, erro: "Número da nota inválido." };
  if (!serieNfceValida(serie)) return { chave: null, dv: null, erro: "Série NFC-e inválida (1–999)." };
  const base =
    pad(cUF, 2) + pad(aammD, 4) + pad(docN, 14) + "65" +
    pad(serie, 3) + pad(nNF, 9) + pad(tpEmis, 1) + cnfDeSemente(cNF);
  const dv = digitoVerificadorChave(base);
  if (dv == null) return { chave: null, dv: null, erro: "Falha ao calcular o dígito verificador." };
  return { chave: base + String(dv), dv, erro: null };
}

// AAMM a partir de uma data (default: agora).
export function aammDe(data = new Date()) {
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return "";
  const aa = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return aa + mm;
}

// ── Rascunho fiscal da venda ───────────────────────────────
// venda: { itens: [{ produto, quantidade, valorUnitario }], numero?, dataEmissao? }
// ctxFiscal: repassado ao resolverFiscalProduto (config da loja, cadastros…).
export function montarRascunhoNfce({ emitente = null, documento = "", venda = {}, ctxFiscal = {} } = {}) {
  const itens = (venda.itens || []).map((it, i) => {
    const fiscal = resolverFiscalProduto(it.produto || {}, ctxFiscal);
    const qtd = Number(it.quantidade || 1);
    const vUnit = Number(it.valorUnitario ?? it.produto?.price ?? 0);
    return {
      seq: i + 1,
      nome: it.produto?.name || it.nome || `Item ${i + 1}`,
      quantidade: qtd,
      valorUnitario: vUnit,
      valorTotal: +(qtd * vUnit).toFixed(2),
      fiscal,
      pendencias: pendenciasFiscais(fiscal),
    };
  });
  const totalProdutos = +itens.reduce((s, x) => s + x.valorTotal, 0).toFixed(2);
  return {
    emitente, documento: normalizarDocumentoFiscal(documento),
    ambiente: emitente?.nfceAmbiente || "simulacao",
    serie: emitente?.nfceSerie || 1,
    numero: venda.numero ?? null,
    dataEmissao: venda.dataEmissao || new Date().toISOString(),
    itens,
    totais: { qtdItens: itens.length, totalProdutos },
  };
}

/**
 * Pré-valida um rascunho: aptidão para (futura) emissão de NFC-e.
 * @returns {{ apto:boolean, ambiente:string, pendenciasEmitente:string[],
 *             itensComPendencia: Array<{seq,nome,pendencias}>, resumo:string }}
 */
export function preValidarNfce(rascunho) {
  if (!rascunho) return { apto: false, ambiente: "simulacao", pendenciasEmitente: ["Sem dados"], itensComPendencia: [], resumo: "Rascunho vazio." };
  const pendEmit = pendenciasEmitenteNfce(rascunho.emitente, rascunho.documento);
  const itensPend = (rascunho.itens || [])
    .filter((it) => it.pendencias && it.pendencias.length)
    .map((it) => ({ seq: it.seq, nome: it.nome, pendencias: it.pendencias }));
  const semItens = (rascunho.itens || []).length === 0;
  const apto = pendEmit.length === 0 && itensPend.length === 0 && !semItens;
  const resumo = apto
    ? "Apto para pré-validação (simulação). Emissão real depende de certificado/CSC (fase futura)."
    : `Pendências: ${pendEmit.length} do emitente, ${itensPend.length} item(ns).${semItens ? " Venda sem itens." : ""}`;
  return { apto, ambiente: rascunho.ambiente, pendenciasEmitente: pendEmit, itensComPendencia: itensPend, semItens, resumo };
}
