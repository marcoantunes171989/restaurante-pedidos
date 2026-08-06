/**
 * Roteamento de impressão da cozinha por setor.
 *
 * Prioridade do setor do item:
 *   1) produto.setorId
 *   2) categoria.setorId
 *   3) null (sem roteamento cadastrado)
 *
 * A fila `tab_impressoes_cozinha` registra cada comanda por setor para
 * monitoramento e intervenção manual no administrativo.
 */

/** Resolve o setor do item: produto > categoria. */
export function resolverSetorDoItem(item, { products = [], categories = [], setores = [] } = {}) {
  const produto = products.find((p) =>
    (item?.productId != null && String(p.id) === String(item.productId))
    || (item?.name && p.name === item.name),
  ) || null;

  let setorId = produto?.setorId ?? item?.setorId ?? null;
  let origem = setorId != null ? "produto" : null;

  if (setorId == null) {
    const catId = produto?.categoriaId ?? item?.categoriaId ?? null;
    const catNome = produto?.category || produto?.categoria || item?.category || "";
    const cat = categories.find((c) =>
      (catId != null && String(c.id) === String(catId))
      || (catNome && c.nome === catNome),
    );
    if (cat?.setorId != null) {
      setorId = cat.setorId;
      origem = "categoria";
    }
  }

  if (setorId == null) {
    return { setorId: null, setor: null, origem: null, produto };
  }

  const setor = setores.find((s) => String(s.id) === String(setorId)) || null;
  return { setorId, setor, origem, produto };
}

/** Agrupa itens do pedido por setor cadastrado (ignora itens sem setor). */
export function agruparItensPorSetorCadastro(itens = [], ctx = {}) {
  const mapa = new Map();
  const semSetor = [];

  itens.forEach((it, idx) => {
    const r = resolverSetorDoItem(it, ctx);
    if (!r.setorId || !r.setor) {
      semSetor.push({ ...it, _idx: idx });
      return;
    }
    const key = String(r.setorId);
    if (!mapa.has(key)) {
      mapa.set(key, {
        setorId: r.setor.id,
        setorNome: r.setor.nome,
        impressoraNome: r.setor.impressoraNome || r.setor.nome,
        impressoraDestino: r.setor.impressoraDestino || "",
        impressaoAuto: r.setor.impressaoAuto !== false,
        origemVinculo: r.origem,
        itens: [],
      });
    }
    mapa.get(key).itens.push({ ...it, _idx: idx, _origemVinculo: r.origem });
  });

  const ordem = (ctx.setores || [])
    .filter((s) => s.ativo !== false)
    .map((s) => String(s.id));
  const grupos = [
    ...ordem.filter((id) => mapa.has(id)).map((id) => mapa.get(id)),
    ...[...mapa.keys()].filter((id) => !ordem.includes(id)).map((id) => mapa.get(id)),
  ];

  return { grupos, semSetor };
}

/** Monta o payload das filas de impressão a partir de um pedido. */
export function montarFilasImpressaoPedido(pedido, ctx = {}, origem = "sistema") {
  const itens = Array.isArray(pedido?.items) ? pedido.items : [];
  const { grupos, semSetor } = agruparItensPorSetorCadastro(itens, ctx);
  const mesa = pedido?.table || "";
  const comanda = pedido?.command || "";
  const atendimento = /externo|entreg|retir/i.test(mesa) ? "Delivery" : "Salão";

  const filas = grupos.map((g) => ({
    lojaId: pedido?.lojaId ?? ctx.lojaId ?? null,
    pedidoId: String(pedido?.id || ""),
    setorId: g.setorId,
    setorNome: g.setorNome,
    impressoraNome: g.impressoraNome,
    impressoraDestino: g.impressoraDestino,
    impressaoAuto: g.impressaoAuto !== false,
    mesa,
    comanda,
    atendimento,
    garcom: pedido?.garcom || ctx.garcom || "",
    itens: g.itens.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      observation: it.observation || "",
      removedIngredients: it.removedIngredients || [],
      extraIngredients: it.extraIngredients || [],
      selectedOptions: it.selectedOptions || [],
      origemVinculo: it._origemVinculo || g.origemVinculo,
    })),
    status: "pendente",
    origem,
    precisaIntervencao: !g.impressoraNome,
    tentativas: 0,
  }));

  return { filas, semSetor, grupos };
}

export function rotuloStatusImpressao(status) {
  const mapa = {
    pendente: { label: "Pendente", chip: "bg-[#FBEFC4] text-[#8D6708]" },
    impresso: { label: "Impresso", chip: "bg-[#DFF3E6] text-[#1F7A3D]" },
    erro: { label: "Erro", chip: "bg-[#FDE8E8] text-[#B42318]" },
    cancelado: { label: "Cancelado", chip: "bg-[#EDF0F4] text-[#52606D]" },
    reimpresso: { label: "Reimpresso", chip: "bg-[#E0F0F4] text-[#0F4C5C]" },
  };
  return mapa[status] || { label: status || "—", chip: "bg-[#EDF0F4] text-[#52606D]" };
}
