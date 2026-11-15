// ════════════════════════════════════════════════════════════
//  Validação do XML da NF-e/NFC-e contra o XSD OFICIAL (somente Node).
//  Usa libxml2 (xmllint) compilado em WebAssembly — sem programa externo.
//  Os schemas ficam versionados em server/fiscal/schemas/<pacote>/ e o
//  MANIFESTO.json guarda o SHA-256 de cada arquivo: se alguém alterar um
//  .xsd, a validação recusa rodar (proteção contra schema adulterado).
// ════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateXML } from "xmllint-wasm";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_SCHEMAS = join(AQUI, "schemas");

export function lerManifesto() {
  return JSON.parse(readFileSync(join(DIR_SCHEMAS, "MANIFESTO.json"), "utf8"));
}

let cache = null;
function carregarSchemas() {
  if (cache) return cache;
  const m = lerManifesto();
  const base = join(DIR_SCHEMAS, m.pacote);
  const arquivos = {};
  for (const [rel, sha] of Object.entries(m.arquivos)) {
    const bytes = readFileSync(join(base, rel));
    const atual = createHash("sha256").update(bytes).digest("hex");
    if (atual !== sha) throw new Error(`Schema alterado ou corrompido: ${rel} (SHA-256 diferente do manifesto).`);
    arquivos[rel] = bytes.toString("utf8");
  }
  // xmllint resolve os includes pelo nome do arquivo (mesma pasta NFe/).
  const nfe = Object.entries(arquivos).filter(([rel]) => rel.startsWith("NFe/")).map(([rel, contents]) => ({ fileName: rel.slice(4), contents }));
  cache = { pacote: m.pacote, principal: nfe.find((f) => f.fileName === "nfe_v4.00.xsd"), demais: nfe.filter((f) => f.fileName !== "nfe_v4.00.xsd") };
  return cache;
}

/**
 * Valida um XML <NFe> completo (com ds:Signature) contra nfe_v4.00.xsd.
 * @returns {Promise<{ valido:boolean, erros:string[], pacote:string }>}
 */
export async function validarNFeXsd(xml) {
  const s = carregarSchemas();
  const r = await validateXML({
    xml: [{ fileName: "nota.xml", contents: xml }],
    schema: [s.principal],
    preload: s.demais,
  });
  const erros = (r.errors || []).map((e) => String(e.message || e.rawMessage || e).trim());
  return { valido: !!r.valid, erros, pacote: s.pacote };
}
