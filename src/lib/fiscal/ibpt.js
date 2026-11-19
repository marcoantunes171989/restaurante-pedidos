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
  const bruto = String(texto || "");
  const linhas = (bruto.charCodeAt(0) === 0xfeff ? bruto.slice(1) : bruto).split(/\r?\n/).filter((l) => l.trim());
  const cab = linhas.shift()?.split(";").map((c) => c.trim().toLowerCase().replace(/^"|"$/g, "")) || [];
  const col = (n) => cab.indexOf(n);
  const ic = { cod: col("codigo"), ex: col("ex"), tipo: col("tipo"), ini: col("vigenciainicio"), nf: col("nacionalfederal"), imp: col("importadosfederal"), est: col("estadual"), mun: col("municipal"), fim: col("vigenciafim"), chave: col("chave"), versao: col("versao"), fonte: col("fonte") };
  if (Object.values(ic).some((i) => i < 0)) throw new Error("CSV do IBPT fora do formato esperado (colunas ausentes).");
  const ncm = {};
  const meta = { uf: String(uf || "").toUpperCase(), versao: "", fonte: "", chave: "", vigenciaInicio: "", vigenciaFim: "" };
  for (const l of linhas) {
    const c = l.split(";").map((x) => x.trim().replace(/^"|"$/g, ""));
    // tipo 0 = mercadoria (NCM); ignora serviços (NBS/LC 116) e linhas com exceção (ex)
    if (String(c[ic.tipo]) !== "0" || (c[ic.ex] && c[ic.ex] !== "0")) continue;
    const cod = String(c[ic.cod]).replace(/\D/g, "");
    if (!/^\d{8}$/.test(cod)) continue;
    if (ncm[cod]) continue; // 1ª ocorrência (sem exceção) vence
    ncm[cod] = { nf: num(c[ic.nf]), imp: num(c[ic.imp]), est: num(c[ic.est]), mun: num(c[ic.mun]) };
    meta.versao ||= c[ic.versao]; meta.fonte ||= c[ic.fonte]; meta.chave ||= c[ic.chave]; meta.vigenciaFim ||= c[ic.fim]; meta.vigenciaInicio ||= c[ic.ini];
  }
  return { meta, ncm };
}

/** Data (fim do dia) de uma vigência "dd/mm/aaaa"; null se inválida. */
export function dataVigencia(txt) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(txt || "").trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59, 59);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const DIAS_ALERTA_IBPT = 15;
/** Situação da tabela pela vigência: vigente | vencendo | vencida | sem_data. */
export function situacaoTabelaIbpt(meta, agora = new Date()) {
  const fim = dataVigencia(meta?.vigenciaFim);
  if (!fim) return { estado: "sem_data", dias: null };
  const dias = Math.floor((fim.getTime() - agora.getTime()) / 86400000);
  if (fim.getTime() < agora.getTime()) return { estado: "vencida", dias };
  return { estado: dias <= DIAS_ALERTA_IBPT ? "vencendo" : "vigente", dias };
}

/** Origem da mercadoria importada (1, 2, 3, 8) usa a alíquota de importados. */
const importada = (orig) => ["1", "2", "3", "8"].includes(String(orig ?? "0"));

/**
 * @param {Array<{ NCM:string, base:number, orig?:string }>} itens  base = valor do item já com desconto
 * @param {object} tabela     tabela IBPT da UF (ver cabeçalho) ou null
 * @returns {{ aplicavel:boolean, itens:number[], semNcm:string[], vencida:string, federal:number, estadual:number, municipal:number, total:number, percentual:number, texto:string }}
 */
export function tributosAproximados(itens = [], tabela = null, { agora = new Date() } = {}) {
  const vazio = { aplicavel: false, itens: [], semNcm: [], vencida: "", federal: 0, estadual: 0, municipal: 0, total: 0, percentual: 0, texto: "" };
  if (!tabela?.ncm || !itens.length) return vazio;
  // Tabela fora da vigência não é usada: os valores seriam de outro período.
  if (situacaoTabelaIbpt(tabela.meta, agora).estado === "vencida") return { ...vazio, vencida: tabela.meta.vigenciaFim };
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

// ════════════════════════════════════════════════════════════
//  Importação pela tela (Configuração Fiscal → Tributos IBPT)
// ════════════════════════════════════════════════════════════

export const UFS_BR = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
export const MIN_NCM_TABELA = 1000;
export const NCMS_EXEMPLO = ["21069090", "22021000", "22030000", "19059090", "16041411"];

/** O CSV do IBPT vem em Windows-1252: decodifica sem corromper os acentos. */
export function decodificarCsvIbpt(bytes) {
  return new TextDecoder("windows-1252").decode(bytes);
}

/** UF sugerida pelo nome do arquivo (ex.: TabelaIBPTaxSP24.2.B.csv → SP). Vazio se não achar. */
export function ufDoNomeArquivo(nome) {
  const m = /IBPTax([A-Za-z]{2})/i.exec(String(nome || ""));
  const uf = m ? m[1].toUpperCase() : "";
  return UFS_BR.includes(uf) ? uf : "";
}

/** "30/09/2024" → "2024-09-30" (vazio se inválida). */
export function vigenciaParaIso(txt) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(txt || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/**
 * Conferência ANTES de gravar.
 * @param {{ tabela:{meta,ncm}, uf:string, ufLoja?:string, existente?:object|null, ehSuper?:boolean, agora?:Date }} p
 * @returns {{ ok:boolean, bloqueios:string[], avisos:string[], resumo:object }}
 */
export function conferirTabelaIbpt({ tabela, uf = "", ufLoja = "", existente = null, ehSuper = false, agora = new Date() } = {}) {
  const bloqueios = [], avisos = [];
  const meta = tabela?.meta || {};
  const qtd = Object.keys(tabela?.ncm || {}).length;
  const sit = situacaoTabelaIbpt(meta, agora);
  if (!UFS_BR.includes(String(uf).toUpperCase())) bloqueios.push("Escolha a UF da tabela.");
  if (qtd < MIN_NCM_TABELA) bloqueios.push(`Só ${qtd} NCMs foram lidos (mínimo ${MIN_NCM_TABELA}). Confira se é o CSV de mercadorias do IBPT.`);
  if (!meta.versao) bloqueios.push("O arquivo não informa a versão da tabela.");
  if (sit.estado === "sem_data") bloqueios.push("O arquivo não informa uma vigência válida.");
  if (sit.estado === "vencida") bloqueios.push(`Tabela vencida em ${meta.vigenciaFim}. Baixe a tabela vigente no portal do IBPT.`);
  if (!ehSuper && ufLoja && String(uf).toUpperCase() !== String(ufLoja).toUpperCase()) {
    bloqueios.push(`Você só pode importar a tabela da UF da sua loja (${ufLoja}).`);
  }
  if (ehSuper && ufLoja && String(uf).toUpperCase() !== String(ufLoja).toUpperCase()) {
    avisos.push(`A UF escolhida (${uf}) é diferente da UF da loja atual (${ufLoja}).`);
  }
  if (sit.estado === "vencendo") avisos.push(`A tabela vence em ${sit.dias} dia(s) (${meta.vigenciaFim}): providencie a próxima.`);
  if (existente?.vigenciaFim) {
    const fimNovo = dataVigencia(meta.vigenciaFim), fimAtual = dataVigencia(existente.vigenciaFim);
    if (fimNovo && fimAtual && fimNovo.getTime() < fimAtual.getTime()) bloqueios.push(`Já existe uma tabela mais nova para ${uf} (vigência até ${existente.vigenciaFim}).`);
    else if (existente.versao === meta.versao && existente.chave === meta.chave) avisos.push("Esta mesma versão já está importada: a importação apenas a reaplica.");
  }
  const exemplos = NCMS_EXEMPLO.filter((n) => tabela?.ncm?.[n]).slice(0, 5).map((n) => ({ ncm: n, ...tabela.ncm[n] }));
  return { ok: bloqueios.length === 0, bloqueios, avisos, resumo: { uf: String(uf).toUpperCase(), versao: meta.versao || "", chave: meta.chave || "", fonte: meta.fonte || "", vigenciaInicio: meta.vigenciaInicio || "", vigenciaFim: meta.vigenciaFim || "", qtdNcm: qtd, situacao: sit, exemplos } };
}

/** Corpo para a função do banco (datas em ISO). */
export function tabelaParaEnvio(tabela, uf) {
  const m = tabela.meta || {};
  return {
    p_uf: String(uf).toUpperCase(),
    p_meta: { versao: m.versao || "", chave: m.chave || "", fonte: m.fonte || "", vigencia_inicio: vigenciaParaIso(m.vigenciaInicio), vigencia_fim: vigenciaParaIso(m.vigenciaFim) },
    p_ncm: tabela.ncm,
  };
}
