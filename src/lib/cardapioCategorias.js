// ════════════════════════════════════════════════════════════
//  Lógica pura de agrupamento/navegação de categorias do cardápio digital
//  (consumida por src/CardapioPublico.jsx). Sem React, sem DOM — só dados e
//  cálculos, para poder ser testada isoladamente (ver cardapioCategorias.test.js)
//  sem precisar simular scroll/IntersectionObserver reais.
// ════════════════════════════════════════════════════════════

// "Todos" nunca colide com um ID real: categorias vindas do banco viram string
// numérica ("42") e as sem correspondência levam o prefixo "cat-" (slugify).
export const CATEGORIA_TODOS = "todos";

// Identificador estável para uma categoria sem linha correspondente em
// tab_categorias (produto com texto livre em `categoria` que não bate com
// nenhuma cadastrada — cai no grupo "Outros"). tab_produtos.categoria é texto
// livre (sem categoria_id) — não existe um ID de banco para linkar aqui —
// então normalizamos o nome (acentos/espaços/maiúsculas/caracteres especiais)
// para um slug estável, em vez de usar o nome exibido cru como chave de
// refs/estado (evita colisão por acento/espaço/caixa).
export function slugify(nome) {
  const base = String(nome || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `cat-${base || "sem-nome"}`;
}

// Agrupa produtos por categoria — PRIMEIRO pelo vínculo real (produto.
// categoriaId → tab_categorias.id, migration 068); produto sem categoriaId
// (banco ainda sem a migration aplicada, ou produto legado não migrado pelo
// backfill) cai no fallback por texto (produto.category — nunca some do
// cardápio). Ordena por categoria.ordem e, dentro do grupo, por produto.
// ordemExibicao/nome.
//
// Garante IDs únicos no resultado: dois textos livres DIFERENTES que
// normalizam pro MESMO slug (ex.: "Promoções!" e "Promoções?" → ambos
// "cat-promocoes") continuam vindo como grupos separados, mas o segundo (e
// seguintes) recebem um sufixo numérico — sem isso, o React usaria `key`
// duplicada e o DOM teria dois elementos com o mesmo `id`.
export function agruparProdutosPorCategoria(produtos, categorias) {
  const porChave = new Map(); // chave -> { id, nome, ordem, produtos[] }
  (produtos || []).forEach((p) => {
    let chave, id, nome, ordem;
    if (p.categoriaId != null) {
      // String(): bigint pode vir como number OU string — nunca compara por === direto.
      const cat = (categorias || []).find((c) => String(c.id) === String(p.categoriaId));
      chave = `id:${p.categoriaId}`;
      id = String(p.categoriaId);
      nome = cat?.nome || p.category || "Outros";
      ordem = cat?.ordem ?? 9999;
    } else {
      const nomeTxt = p.category || "Outros";
      const cadastrada = (categorias || []).find((c) => c.nome === nomeTxt);
      chave = `nome:${nomeTxt}`;
      id = cadastrada ? String(cadastrada.id) : slugify(nomeTxt);
      nome = nomeTxt;
      ordem = cadastrada?.ordem ?? 9999;
    }
    if (!porChave.has(chave)) porChave.set(chave, { id, nome, ordem, produtos: [] });
    porChave.get(chave).produtos.push(p);
  });
  // Desambigua colisões de id entre chaves DIFERENTES (mesmo slug gerado a
  // partir de textos diferentes) — mantém o primeiro id "puro" e sufixa os
  // seguintes com -2, -3, ... até não colidir mais.
  const idsVistos = new Set();
  for (const g of porChave.values()) {
    let idFinal = g.id, n = 2;
    while (idsVistos.has(idFinal)) idFinal = `${g.id}-${n++}`;
    idsVistos.add(idFinal);
    g.id = idFinal;
  }
  const porOrdemNome = (a, b) => (a.ordemExibicao ?? 9999) - (b.ordemExibicao ?? 9999) || a.name.localeCompare(b.name, "pt-BR");
  return [...porChave.values()]
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((g) => ({ id: g.id, nome: g.nome, produtos: [...g.produtos].sort(porOrdemNome) }));
}

// Lista de categorias pro carrossel: "Todos" sempre primeiro, seguido dos
// grupos na mesma ordem que agruparProdutosPorCategoria já devolveu.
export function montarListaCategorias(grupos) {
  return [{ id: CATEGORIA_TODOS, nome: "Todos" }, ...(grupos || []).map((g) => ({ id: g.id, nome: g.nome }))];
}

// Decide a categoria ativa a partir de QUAIS seções estão cruzando a "linha
// de referência" agora (idsNaFaixa, um Set) — vence a primeira seção NA ORDEM
// do cardápio (não a última inserida no Set), refletindo a seção mais "no
// topo" da tela quando mais de uma cruza a faixa ao mesmo tempo. Sem nenhuma
// seção na faixa (topo da página, antes da primeira categoria) volta "Todos".
export function escolherCategoriaAtiva(grupos, idsNaFaixa) {
  const atual = (grupos || []).find((g) => idsNaFaixa.has(g.id));
  return atual ? atual.id : CATEGORIA_TODOS;
}

// Id do último grupo — usado para forçar a categoria ativa ao chegar no fim
// da página (sentinela após a última seção). null se não houver grupo algum
// (cardápio vazio ou produtos/categorias ainda carregando).
export function idUltimoGrupo(grupos) {
  if (!grupos || !grupos.length) return null;
  return grupos[grupos.length - 1].id;
}

// Ponto de destino da rolagem pra posicionar `rectTop` (getBoundingClientRect().top
// do alvo, relativo ao viewport) logo abaixo dos elementos fixos — cálculo
// explícito (element.getBoundingClientRect().top + scrollAtual - stickyOffset)
// em vez de confiar só em scrollIntoView(), cujo comportamento ao respeitar
// scroll-margin-top dentro de um container de rolagem que não é a window é
// inconsistente entre navegadores. Nunca devolve destino negativo (não existe
// posição de scroll abaixo de 0).
export function calcularDestinoScroll({ rectTop, scrollAtual, stickyOffset }) {
  return Math.max(0, rectTop + scrollAtual - stickyOffset);
}
