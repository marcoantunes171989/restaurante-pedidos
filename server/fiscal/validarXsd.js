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
  const tiposEvento = arquivos["Evento/tiposBasico_v1.03.xsd"];
  cache = {
    pacote: m.pacote, principal: nfe.find((f) => f.fileName === "nfe_v4.00.xsd"), demais: nfe.filter((f) => f.fileName !== "nfe_v4.00.xsd"),
    tiposEvento: tiposEvento ? { fileName: "tiposBasico_v1.03.xsd", contents: tiposEvento } : null,
  };
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

// ── Mensagens de comunicação (PL 9q) ───────────────────────
// Cada mensagem usa o próprio conjunto de schemas. Leiaute da NF-e, tipos
// básicos e assinatura vêm SEMPRE do pacote vigente (010h); do 9q entram
// só os arquivos das mensagens (MANIFESTO em PL_009q_mensagens).
function lerPasta(pasta) {
  const dir = join(DIR_SCHEMAS, pasta);
  const m = JSON.parse(readFileSync(join(dir, "MANIFESTO.json"), "utf8"));
  const arq = {};
  for (const [nome, sha] of Object.entries(m.arquivos)) {
    const bytes = readFileSync(join(dir, nome));
    if (createHash("sha256").update(bytes).digest("hex") !== sha) throw new Error(`Schema alterado ou corrompido: ${nome} (SHA-256 diferente do manifesto).`);
    arq[nome] = { fileName: nome, contents: bytes.toString("utf8") };
  }
  return arq;
}

let cacheMsg = null;
function carregarMensagens() {
  if (cacheMsg) return cacheMsg;
  const arq = lerPasta("PL_009q_mensagens");
  // Consulta e eventos: versões do PL 010d (CNPJ alfanumérico), mais novas que as do 9q.
  const ev = lerPasta("PL_eventos_e_consulta");
  const nfe = carregarSchemas();
  const de010h = (nome) => [nfe.principal, ...nfe.demais].find((f) => f.fileName === nome);
  const todos010h = [nfe.principal, ...nfe.demais];
  cacheMsg = {
    enviNFe: { principal: arq["enviNFe_v4.00.xsd"], preload: todos010h },
    retEnviNFe: { principal: arq["retEnviNFe_v4.00.xsd"], preload: todos010h },
    procNFe: { principal: arq["procNFe_v4.00.xsd"], preload: todos010h },
    consStatServ: { principal: arq["consStatServ_v4.00.xsd"], preload: [arq["leiauteConsStatServ_v4.00.xsd"], de010h("tiposBasico_v4.00.xsd")] },
    retConsStatServ: { principal: arq["retConsStatServ_v4.00.xsd"], preload: [arq["leiauteConsStatServ_v4.00.xsd"], de010h("tiposBasico_v4.00.xsd")] },
    consSitNFe: { principal: ev["consSitNFe_v4.00.xsd"], preload: [ev["leiauteConsSitNFe_v4.00.xsd"], de010h("tiposBasico_v4.00.xsd"), de010h("xmldsig-core-schema_v1.01.xsd")] },
    retConsSitNFe: { principal: ev["retConsSitNFe_v4.00.xsd"], preload: [ev["leiauteConsSitNFe_v4.00.xsd"], de010h("tiposBasico_v4.00.xsd"), de010h("xmldsig-core-schema_v1.01.xsd")] },
  };
  // Eventos: envelope genérico (detEvento livre) + conteúdo validado à parte.
  const baseEvento = [ev["leiauteEvento_v1.00.xsd"], nfe.tiposEvento, de010h("xmldsig-core-schema_v1.01.xsd")];
  cacheMsg.envEvento = { principal: ev["envEvento_v1.00.xsd"], preload: baseEvento };
  cacheMsg.retEnvEvento = { principal: ev["retEnvEvento_v1.00.xsd"], preload: baseEvento };
  cacheMsg.procEventoNFe = { principal: ev["procEventoNFe_v1.00.xsd"], preload: baseEvento };
  cacheMsg["det110111"] = { principal: ev["e110111_v1.00.xsd"], preload: [nfe.tiposEvento] };
  cacheMsg["det110112"] = { principal: ev["e110112_v1.00.xsd"], preload: [nfe.tiposEvento] };
  cacheMsg["det110110"] = { principal: ev["e110110_v1.00.xsd"], preload: [] };
  return cacheMsg;
}

/** Texto legal obrigatório da CC-e (xCondUso), lido do XSD oficial — sem redigitar. */
export function textoCondicaoUsoCCe() {
  const xsd = carregarMensagens()["det110110"].principal.contents;
  const m = /<xs:enumeration value="(A Carta de Correcao e disciplinada[^"]*)"/.exec(xsd);
  if (!m) throw new Error("Texto de condição de uso da CC-e não encontrado no schema oficial.");
  return m[1];
}

/**
 * Valida uma mensagem de comunicação com a SEFAZ.
 * @param {string} xml
 * @param {'enviNFe'|'retEnviNFe'|'procNFe'|'consStatServ'|'retConsStatServ'|'consSitNFe'|'retConsSitNFe'} tipo
 */
export async function validarMensagemXsd(xml, tipo) {
  const c = carregarMensagens()[tipo];
  if (!c) throw new Error(`Tipo de mensagem desconhecido: ${tipo}`);
  const r = await validateXML({ xml: [{ fileName: `${tipo}.xml`, contents: xml }], schema: [c.principal], preload: c.preload });
  const erros = (r.errors || []).map((e) => String(e.message || e.rawMessage || e).trim());
  return { valido: !!r.valid, erros };
}
