// Regras puras da lista de produtos (filtros, avisos e paginação), separadas da tela para poderem ser testadas.

export const POR_PAGINA = 12;

const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim(); // sem acentos

export const semFoto = (p, imagemPadrao = "") => !p.imageUrl || (!!imagemPadrao && p.imageUrl === imagemPadrao);
export const semParametroFiscal = (p) => p.lojaFiscalRegraId == null;

/** Estoque só interessa a quem controla ou já tem quantidade. */
export function situacaoEstoque(p) {
  const qtd = Number(p.estoque) || 0;
  if (p.controlaEstoque) return { texto: `Estoque ${qtd}`, baixo: qtd <= (Number(p.estoqueMinimo) || 5) };
  return qtd > 0 ? { texto: `Estoque ${qtd}`, baixo: false } : null;
}

export function margemDoProduto(p) {
  const preco = Number(p.price) || 0, custo = Number(p.cost) || 0;
  return preco > 0 && custo > 0 ? Math.round(((preco - custo) / preco) * 100) : null;
}

export function canaisOcultos(p) {
  return [p.visivelTablet === false && "tablet", p.visivelQr === false && "QR", p.visivelExterno === false && "externo"].filter(Boolean);
}

/** Atalhos de situação, com a contagem. "Sem parâmetro fiscal" só aparece em loja que já usa parâmetros. */
export function filtrosDeSituacao(produtos = [], { imagemPadrao = "", usaParametroFiscal = false } = {}) {
  const lista = [
    { id: "todos", rotulo: "Todos", passa: () => true },
    { id: "ativos", rotulo: "Ativos", passa: (p) => !!p.active },
    { id: "inativos", rotulo: "Inativos", passa: (p) => !p.active },
    { id: "sem-foto", rotulo: "Sem foto", passa: (p) => semFoto(p, imagemPadrao) },
    ...(usaParametroFiscal ? [{ id: "sem-fiscal", rotulo: "Sem parâmetro fiscal", passa: semParametroFiscal }] : []),
  ];
  return lista.map((f) => ({ ...f, total: produtos.filter(f.passa).length }));
}

/** Busca sem diferenciar acento nem maiúscula, por nome ou categoria; junta com a categoria e a situação. */
export function filtrarProdutos(produtos = [], { busca = "", categoria = "Todas", situacao = null } = {}) {
  const termo = normalizar(busca);
  return produtos.filter((p) => (!termo || normalizar(`${p.name} ${p.category}`).includes(termo))
    && (categoria === "Todas" || p.category === categoria)
    && (!situacao || situacao.passa(p)));
}

export function paginar(lista = [], pagina = 1, porPagina = POR_PAGINA) {
  const total = Math.max(1, Math.ceil(lista.length / porPagina));
  const atual = Math.min(Math.max(1, pagina), total);
  return { itens: lista.slice((atual - 1) * porPagina, atual * porPagina), atual, total };
}
