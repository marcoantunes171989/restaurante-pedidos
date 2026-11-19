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
