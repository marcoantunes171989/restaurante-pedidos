// ════════════════════════════════════════════════════════════
//  IBS/CBS do Simples Nacional (CRT 1, SEM regime regular de IBS/CBS) — NT 2026.005.
//  Parâmetros POR LOJA (migration 205), DESLIGADOS por padrão: os códigos e as alíquotas efetivas vêm do contador.
//  Cada item leva cAtivSN e o grupo IBSCBS com CST, cClassTrib e gTribSN; os totais levam gTribSN.
//  MEI (CRT 4) não informa o grupo. CRT 2 e opção pelo regime regular NÃO são atendidos aqui.
//
//  PREMISSAS A CONFIRMAR (norma oficial não lida; ver Documentacao/Fiscal/27, seção 7):
//   • base de cálculo do item = valor do produto − desconto + outras despesas;
//   • vBCIBSCBS dos totais = 0,00 quando só há o detalhamento do Simples;
//   • data de início padrão 01/03/2027 (editável por loja). Em homologação, ligado já envia, para testar antes.
// ════════════════════════════════════════════════════════════

export const ATIVIDADES_SN = [
  ["01", "Revenda ou venda de mercadoria industrializada pela loja (Anexo I)"],
  ["02", "Outros bens materiais, sem incidência de ICMS (Anexo I)"],
  ["03", "Industrialização incentivada na Zona Franca de Manaus (Anexo II)"],
  ["04", "Outros bens com industrialização incentivada na ZFM, sem ICMS (Anexo II)"],
  ["90", "Operações não tributáveis"],
];
export const INICIO_PADRAO = "2027-03-01";

const texto = (v) => String(v ?? "").trim();
// Alíquota digitada ("1,2345" ou número) → número com até 4 casas; vazio/inválido → null.
export function aliquota(v) {
  const s = texto(v).replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(s)) return null;
  const n = Number(s);
  return n <= 100 ? n : null;
}

/** Formato único dos parâmetros (o que a tela edita e o banco guarda). */
export function normalizarIbsCbsSn(c) {
  const x = c && typeof c === "object" ? c : {};
  return {
    ativo: x.ativo === true,
    inicio: /^\d{4}-\d{2}-\d{2}$/.test(texto(x.inicio)) ? texto(x.inicio) : INICIO_PADRAO,
    cst: texto(x.cst), cClassTrib: texto(x.cClassTrib), cAtivSN: texto(x.cAtivSN),
    pIBSSN: texto(x.pIBSSN).replace(",", "."), pCBSSN: texto(x.pCBSSN).replace(",", "."),
  };
}

/** O que falta para os parâmetros da loja gerarem o grupo (lista vazia = completo). */
export function pendenciasIbsCbsSn(c) {
  const x = normalizarIbsCbsSn(c);
  const p = [];
  if (!/^\d{3}$/.test(x.cst)) p.push("CST de IBS/CBS (3 números)");
  if (!/^\d{6}$/.test(x.cClassTrib)) p.push("classificação tributária cClassTrib (6 números)");
  if (!ATIVIDADES_SN.some(([cod]) => cod === x.cAtivSN)) p.push("código de atividade do Simples");
  if (aliquota(x.pIBSSN) === null) p.push("alíquota efetiva do IBS (%)");
  if (aliquota(x.pCBSSN) === null) p.push("alíquota efetiva da CBS (%)");
  return p;
}

/** O grupo entra nesta nota? Só CRT 1, ligado e: homologação, ou produção a partir da data de início (Brasília). */
export function aplicaIbsCbsSn({ config, crt, ambiente, data = new Date() } = {}) {
  const x = normalizarIbsCbsSn(config);
  if (String(crt) !== "1" || !x.ativo) return false;
  if (ambiente !== "producao") return true;
  return new Date(data).getTime() >= Date.parse(`${x.inicio}T00:00:00-03:00`);
}

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Acrescenta cAtivSN e ibscbs a um item já montado do XML. CST e cClassTrib do PRODUTO (quando válidos) valem sobre os da loja.
 * @param {object} item    item do XML ({ vProd, vDesc?, vOutro?, … })
 * @param {object} config  parâmetros da loja (já sem pendências)
 * @param {object} fiscal  fiscal resolvido do produto
 */
export function itemComIbsCbsSn(item, config, fiscal = {}) {
  const x = normalizarIbsCbsSn(config);
  const base = r2(Number(item.vProd || 0) - Number(item.vDesc || 0) + Number(item.vOutro || 0));
  const pIBSSN = aliquota(x.pIBSSN), pCBSSN = aliquota(x.pCBSSN);
  const doProduto = (v, re) => (re.test(texto(v)) ? texto(v) : "");
  return {
    ...item,
    cAtivSN: x.cAtivSN,
    ibscbs: {
      CST: doProduto(fiscal.cstIbsCbs, /^\d{3}$/) || x.cst,
      cClassTrib: doProduto(fiscal.cClassTrib, /^\d{6}$/) || x.cClassTrib,
      sn: { pIBSSN, vIBSSN: r2(base * pIBSSN / 100), pCBSSN, vCBSSN: r2(base * pCBSSN / 100) },
    },
  };
}
