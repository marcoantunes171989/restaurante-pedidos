// ════════════════════════════════════════════════════════════
//  PDB-I3-DOC1 — utilitários PUROS da ajuda contextual (sem React, sem rede).
//
//  Busca 100% local: normaliza (sem acento/caixa), quebra a consulta em termos e
//  exige que TODOS apareçam no título, resumo, conteúdo ou keywords da seção.
//  Aceita variações simples de plural do português (versão ↔ versões, sessão ↔
//  sessões) para que "sessão" encontre "sessões" e vice-versa.
// ════════════════════════════════════════════════════════════

const MARCAS_DE_ACENTO = /[̀-ͯ]/g;

export function normalizeText(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(MARCAS_DE_ACENTO, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeQuery(consulta) {
  const normalizada = normalizeText(consulta);
  return normalizada ? normalizada.split(" ") : [];
}

// Variações simples de plural (já sem acento): ão ↔ ões e "s" final.
function variantesDoTermo(termo) {
  const variantes = new Set([termo]);
  if (termo.length > 3 && termo.endsWith("ao")) variantes.add(`${termo.slice(0, -2)}oes`);
  if (termo.length > 4 && termo.endsWith("oes")) variantes.add(`${termo.slice(0, -3)}ao`);
  if (termo.length > 3 && termo.endsWith("s")) variantes.add(termo.slice(0, -1));
  return [...variantes];
}

const contemTermo = (texto, termo) => variantesDoTermo(termo).some((v) => texto.includes(v));

/** Texto corrido de um bloco de conteúdo (para busca). */
function textoDoBloco(bloco) {
  switch (bloco.type) {
    case "list":
    case "steps":
      return bloco.items.join(" ");
    case "terms":
      return bloco.items.map((i) => `${i.term} ${i.text}`).join(" ");
    case "faq":
      return bloco.items.map((i) => `${i.q} ${i.a}`).join(" ");
    case "note":
      return `${bloco.title ?? ""} ${bloco.text}`;
    default:
      return bloco.text ?? "";
  }
}

export function flattenBlocks(blocos = []) {
  return blocos.map(textoDoBloco).join(" ");
}

// Cache do texto normalizado por seção (o conteúdo é constante em runtime).
const INDICE = new WeakMap();

function indiceDaSecao(secao) {
  let entrada = INDICE.get(secao);
  if (!entrada) {
    entrada = {
      titulo: normalizeText(`${secao.title} ${(secao.keywords ?? []).join(" ")}`),
      tudo: normalizeText([
        secao.title,
        secao.summary,
        flattenBlocks(secao.content),
        (secao.keywords ?? []).join(" "),
      ].join(" ")),
    };
    INDICE.set(secao, entrada);
  }
  return entrada;
}

/**
 * Filtra as seções de uma documentação.
 * Retorna { query, tokens, results: [{ section, titleMatch }], total }.
 * Consulta vazia devolve todas as seções, na ordem original.
 */
export function searchDoc(doc, consulta) {
  const tokens = tokenizeQuery(consulta);
  const secoes = doc.sections;
  if (tokens.length === 0) {
    return { query: "", tokens, results: secoes.map((section) => ({ section, titleMatch: false })), total: secoes.length };
  }
  const results = [];
  for (const section of secoes) {
    const { titulo, tudo } = indiceDaSecao(section);
    if (tokens.every((t) => contemTermo(tudo, t))) {
      results.push({ section, titleMatch: tokens.every((t) => contemTermo(titulo, t)) });
    }
  }
  return { query: tokens.join(" "), tokens, results, total: secoes.length };
}

/** Id da seção a priorizar para uma aba (ou null se não houver mapeamento válido). */
export function resolveContextSection(doc, mapaDeAbas, abaId) {
  const alvo = mapaDeAbas?.[abaId];
  return alvo && doc.sections.some((s) => s.id === alvo) ? alvo : null;
}
