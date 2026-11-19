// ════════════════════════════════════════════════════════════
//  Tributos aproximados (Lei 12.741/2012) — tabela IBPT "De Olho no Imposto".
//  Puro e testável. Calcula, por item e no total, o valor aproximado dos
//  tributos (federal + estadual + municipal) a partir das alíquotas por NCM.
//  As alíquotas vêm da tabela oficial do IBPT da UF da loja (CSV baixado do
//  portal do IBPT e convertido por ferramentas/importar-ibpt.mjs). O projeto
//  NÃO inventa alíquotas: sem tabela ou sem o NCM, o valor não é informado.
//  Formato da tabela: { meta:{ uf, versao, fonte, chave, vigenciaFim }, ncm:{ "21069090":{ nf, imp, est, mun } } }
//  (nf = nacional federal, imp = importado federal, est = estadual, mun = municipal; em %)
// ════════════════════════════════════════════════════════════

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

/** Converte o CSV do IBPT (colunas: codigo;ex;tipo;descricao;nacionalfederal;importadosfederal;estadual;municipal;vigenciainicio;vigenciafim;chave;versao;fonte). */
export function parseCsvIbpt(texto, uf = "") {
  const linhas = String(texto || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const cab = linhas.shift()?.split(";").map((c) => c.trim().toLowerCase().replace(/^"|"$/g, "")) || [];
  const col = (n) => cab.indexOf(n);
  const ic = { cod: col("codigo"), ex: col("ex"), tipo: col("tipo"), nf: col("nacionalfederal"), imp: col("importadosfederal"), est: col("estadual"), mun: col("municipal"), fim: col("vigenciafim"), chave: col("chave"), versao: col("versao"), fonte: col("fonte") };
  if (Object.values(ic).some((i) => i < 0)) throw new Error("CSV do IBPT fora do formato esperado (colunas ausentes).");
  const ncm = {};
  const meta = { uf: String(uf || "").toUpperCase(), versao: "", fonte: "", chave: "", vigenciaFim: "" };
  for (const l of linhas) {
    const c = l.split(";").map((x) => x.trim().replace(/^"|"$/g, ""));
    // tipo 0 = mercadoria (NCM); ignora serviços (NBS/LC 116) e linhas com exceção (ex)
    if (String(c[ic.tipo]) !== "0" || (c[ic.ex] && c[ic.ex] !== "0")) continue;
    const cod = String(c[ic.cod]).replace(/\D/g, "");
    if (!/^\d{8}$/.test(cod)) continue;
    ncm[cod] = { nf: num(c[ic.nf]), imp: num(c[ic.imp]), est: num(c[ic.est]), mun: num(c[ic.mun]) };
    meta.versao ||= c[ic.versao]; meta.fonte ||= c[ic.fonte]; meta.chave ||= c[ic.chave]; meta.vigenciaFim ||= c[ic.fim];
  }
  return { meta, ncm };
}

/** Origem da mercadoria importada (1, 2, 3, 8) usa a alíquota de importados. */
const importada = (orig) => ["1", "2", "3", "8"].includes(String(orig ?? "0"));

/**
 * @param {Array<{ NCM:string, base:number, orig?:string }>} itens  base = valor do item já com desconto
 * @param {object} tabela     tabela IBPT da UF (ver cabeçalho) ou null
 * @returns {{ aplicavel:boolean, itens:number[], semNcm:string[], federal:number, estadual:number, municipal:number, total:number, percentual:number, texto:string }}
 */
export function tributosAproximados(itens = [], tabela = null) {
  const vazio = { aplicavel: false, itens: [], semNcm: [], federal: 0, estadual: 0, municipal: 0, total: 0, percentual: 0, texto: "" };
  if (!tabela?.ncm || !itens.length) return vazio;
  const semNcm = [];
  let fed = 0, est = 0, mun = 0, base = 0;
  const porItem = itens.map((it) => {
    const a = tabela.ncm[String(it.NCM)];
    if (!a) { semNcm.push(String(it.NCM)); return null; }
    const b = Math.max(0, Number(it.base) || 0);
    const f = r2((b * (importada(it.orig) ? a.imp : a.nf)) / 100), e = r2((b * a.est) / 100), m = r2((b * a.mun) / 100);
    fed += f; est += e; mun += m; base += b;
    return r2(f + e + m);
  });
  // Só informa quando TODOS os itens têm alíquota (valor parcial seria enganoso).
  if (semNcm.length) return { ...vazio, semNcm: [...new Set(semNcm)] };
  const total = r2(fed + est + mun);
  const br = (v) => v.toFixed(2).replace(".", ",");
  const m = tabela.meta || {};
  const texto = `Trib aprox R$: ${br(r2(fed))} Federal, ${br(r2(est))} Estadual e ${br(r2(mun))} Municipal. Fonte: ${m.fonte || "IBPT"}${m.versao ? ` ${m.versao}` : ""}${m.chave ? ` ${m.chave}` : ""}`;
  return { aplicavel: true, itens: porItem, semNcm: [], federal: r2(fed), estadual: r2(est), municipal: r2(mun), total, percentual: base > 0 ? r2((total / base) * 100) : 0, texto };
}
