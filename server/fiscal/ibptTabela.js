// Tabela IBPT da UF da loja (somente servidor). Arquivo: server/fiscal/ibpt/<UF>.json,
// gerado por ferramentas/importar-ibpt.mjs a partir do CSV oficial do IBPT.
// Sem arquivo → null (a nota sai sem o valor aproximado dos tributos, com aviso).
import { readFileSync } from "node:fs";

const cache = new Map();

export function tabelaIbpt(uf) {
  const u = String(uf || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(u)) return null;
  if (cache.has(u)) return cache.get(u);
  let t = null;
  try {
    const j = JSON.parse(readFileSync(new URL(`./ibpt/${u}.json`, import.meta.url), "utf8"));
    if (j && typeof j === "object" && j.ncm && typeof j.ncm === "object") t = j;
  } catch { /* sem tabela para esta UF */ }
  cache.set(u, t);
  return t;
}

/**
 * Leitor com o banco (migration 190) e reserva em arquivo. Cache curto por UF.
 * @param {(uf:string)=>Promise<{meta,ncm}|null>} doBanco  chama app_fiscal_ibpt_da_uf (service_role)
 */
export function criarLeitorTabelaIbpt(doBanco, { ttlMs = 5 * 60 * 1000, agora = () => Date.now() } = {}) {
  const cache = new Map();
  return async (uf) => {
    const u = String(uf || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(u)) return null;
    const hit = cache.get(u);
    if (hit && agora() - hit.t < ttlMs) return hit.v;
    let v = null;
    try {
      const r = await doBanco(u);
      if (r && typeof r === "object" && r.ncm && typeof r.ncm === "object") v = r;
    } catch { /* migration 190 pendente ou banco indisponível: usa o arquivo de reserva */ }
    if (!v) v = tabelaIbpt(u);
    cache.set(u, { t: agora(), v });
    return v;
  };
}
