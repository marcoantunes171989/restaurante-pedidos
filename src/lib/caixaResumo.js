// Contas da tela de Fechamento de Caixa a partir das movimentações da sessão. O estorno desfaz a venda.
const somar = (lista) => Math.round(lista.reduce((s, m) => s + (Number(m.valor) || 0), 0) * 100) / 100;

/** Forma de pagamento gravada na descrição: "Venda PIX · Mesa 1" → "PIX". */
export const formaDoMovimento = (m) => (m?.descricao || "").replace(/^(Venda|Estorno)\s*/i, "").split(" · ")[0] || "—";

/** Movimentos que tiram dinheiro do caixa (aparecem com sinal de menos). */
export const saiDoCaixa = (m) => m?.tipo === "sangria" || m?.tipo === "estorno";

/**
 * Quanto de cada parcela fica no caixa, descontado o troco: sai das formas que dão troco (dinheiro primeiro), a mesma
 * conta do banco (migration 227). Parcela toda devolvida em troco não aparece. Usada no banco sem a 218.
 */
export function parcelasNoCaixa(parcelas = [], total = 0, formas = []) {
  const centavos = (v) => Math.round((Number(v) || 0) * 100);
  const daTroco = (f) => !/pontos/i.test(f) && (/dinheiro/i.test(f) || formas.some((g) => g.permiteTroco && g.nome === f));
  const lista = parcelas.map((p) => ({ forma: p.forma || "", centavos: centavos(p.valor) }));
  let troco = Math.max(0, lista.reduce((s, p) => s + p.centavos, 0) - centavos(total));
  const naOrdem = lista.filter((p) => daTroco(p.forma))
    .sort((a, b) => /dinheiro/i.test(b.forma) - /dinheiro/i.test(a.forma) || a.forma.trim().localeCompare(b.forma.trim(), "pt-BR"));
  for (const p of naOrdem) {
    const sai = Math.min(p.centavos, troco);
    p.centavos -= sai;
    troco -= sai;
  }
  return lista.filter((p) => p.centavos > 0).map((p) => ({ forma: p.forma, valor: p.centavos / 100 }));
}

export function resumoDoCaixa(movimentos = [], valorAbertura = 0) {
  const de = (tipo) => movimentos.filter((m) => m.tipo === tipo);
  const vendas = de("venda");
  const estornos = de("estorno");
  const suprimentos = somar(de("suprimento"));
  const sangrias = somar(de("sangria"));
  const totalEstornado = somar(estornos);

  const porForma = {};
  for (const m of [...vendas, ...estornos]) {
    const forma = formaDoMovimento(m);
    const sinal = m.tipo === "estorno" ? -1 : 1;
    porForma[forma] = Math.round(((porForma[forma] || 0) + sinal * (Number(m.valor) || 0)) * 100) / 100;
  }
  const dinheiro = Object.entries(porForma).filter(([f]) => /dinheiro/i.test(f)).reduce((s, [, v]) => s + v, 0);

  return {
    suprimentos, sangrias, porForma,
    quantidadeDeVendas: vendas.length,
    totalEstornado,
    totalVendido: Math.round((somar(vendas) - totalEstornado) * 100) / 100,
    esperadoEmDinheiro: Math.round(((Number(valorAbertura) || 0) + suprimentos - sangrias + dinheiro) * 100) / 100,
  };
}
