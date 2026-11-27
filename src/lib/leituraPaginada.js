// A API do banco entrega no máximo 1.000 linhas por pedido. Sem paginar, listas maiores chegavam CORTADAS e
// relatórios de uma loja movimentada somavam só os registros mais recentes.
export const PAGINA = 1000;
const MAXIMO_PADRAO = 100000; // trava de segurança contra laço sem fim

// Continua uma lista a partir da primeira página. `buscarPagina(de, ate)` devolve { data, error }.
// Só faz pedidos extras quando a primeira página veio cheia.
export async function completarPaginas(primeira, buscarPagina, maximo = MAXIMO_PADRAO) {
  if (!Array.isArray(primeira) || primeira.length !== PAGINA) return primeira;
  const todas = [...primeira];
  const vistos = new Set(primeira.map((r) => r?.id).filter((id) => id != null));
  while (todas.length < maximo) {
    const de = todas.length;
    const { data, error } = await buscarPagina(de, Math.min(de + PAGINA, maximo) - 1);
    if (error) throw error;
    // Linha que entrou entre uma página e outra empurra as demais: não repete a mesma.
    const novas = (data || []).filter((r) => r?.id == null || !vistos.has(r.id));
    novas.forEach((r) => { if (r?.id != null) vistos.add(r.id); });
    todas.push(...novas);
    if (!data || data.length < PAGINA || novas.length === 0) break;
  }
  return todas;
}

// Consulta direta em tabela com teto maior que uma página. `montar()` cria uma consulta nova a cada página.
export async function lerAte(montar, maximo) {
  const { data, error } = await montar().range(0, Math.min(PAGINA, maximo) - 1);
  if (error) return { data: null, error };
  try {
    return { data: await completarPaginas(data || [], (de, ate) => montar().range(de, ate), maximo), error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}
