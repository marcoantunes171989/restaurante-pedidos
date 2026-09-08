/**
 * Fonte única de verdade da navegação do módulo Relatórios (7 telas: Visão
 * geral + 6 subseções). A rota raiz representa a Visão geral — não existe
 * /admin/relatorios/geral. Nenhuma outra função do app pode gerar
 * /admin/relatorios/<valor-livre>; somente os slugs desta allowlist são
 * válidos.
 *
 * Sem componentes React, sem consultas Supabase, sem estado — apenas o
 * contrato puro de ids, slugs e paths.
 */

const ENTRADAS_RELATORIOS = [
  { id: "geral", slug: null, path: "/admin/relatorios" },
  { id: "vendas", slug: "vendas", path: "/admin/relatorios/vendas" },
  { id: "cupom", slug: "cupom-mesa-comanda", path: "/admin/relatorios/cupom-mesa-comanda" },
  { id: "estoque", slug: "estoque", path: "/admin/relatorios/estoque" },
  { id: "clientes", slug: "clientes", path: "/admin/relatorios/clientes" },
  { id: "permanencia", slug: "permanencia", path: "/admin/relatorios/permanencia" },
  { id: "satisfacao", slug: "satisfacao", path: "/admin/relatorios/satisfacao" },
];

/** Mapa imutável id → { id, slug, path }. Congelado em dois níveis. */
export const RELATORIOS_NAV = Object.freeze(
  Object.fromEntries(ENTRADAS_RELATORIOS.map((entrada) => [entrada.id, Object.freeze({ ...entrada })])),
);

/** Lista estável dos 7 ids internos, na ordem canônica das telas. */
export const RELATORIOS_IDS = Object.freeze(ENTRADAS_RELATORIOS.map((entrada) => entrada.id));

const ID_POR_SLUG = new Map(
  ENTRADAS_RELATORIOS.filter((entrada) => entrada.slug).map((entrada) => [entrada.slug, entrada.id]),
);

/** Allowlist explícita dos slugs de URL válidos (não inclui "geral" — sem slug). */
export const RELATORIOS_SLUGS_PERMITIDOS = Object.freeze(
  ENTRADAS_RELATORIOS.filter((entrada) => entrada.slug).map((entrada) => entrada.slug),
);

/** Path canônico pelo id interno; id desconhecido → null (nunca gera path arbitrário). */
export function rotaRelatorioPorId(id) {
  const entrada = RELATORIOS_NAV[id];
  return entrada ? entrada.path : null;
}

/** Id interno pelo slug de URL (subseção); slug desconhecido/"geral" → null. */
export function idRelatorioPorSlug(slug) {
  if (typeof slug !== "string" || !slug) return null;
  return ID_POR_SLUG.get(slug) || null;
}

/** Id interno pelo path canônico completo; path desconhecido → null. */
export function idRelatorioPorPath(path) {
  const entrada = ENTRADAS_RELATORIOS.find((e) => e.path === path);
  return entrada ? entrada.id : null;
}

/** true somente para um dos 7 ids internos reconhecidos. */
export function ehIdRelatorioValido(id) {
  return Object.prototype.hasOwnProperty.call(RELATORIOS_NAV, id);
}

/** true somente para um slug de URL presente na allowlist (exclui "geral"). */
export function ehSlugRelatorioValido(slug) {
  return typeof slug === "string" && ID_POR_SLUG.has(slug);
}

/** Lista explícita (cópia) dos slugs de URL permitidos. */
export function slugsRelatoriosPermitidos() {
  return [...RELATORIOS_SLUGS_PERMITIDOS];
}
