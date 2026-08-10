/**
 * Roteamento de impressão da cozinha.
 *
 * Setor (painel da cozinha / comanda por área):
 *   1) produto.setorId
 *   2) categoria.setorId
 *
 * Impressora (driver / rede / compartilhamento):
 *   1) produto.impressoraId
 *   2) categoria.impressoraId
 *   3) legado: campos de impressora no setor (migration 077)
 *
 * A fila `tab_impressoes_cozinha` registra cada comanda para
 * monitoramento e intervenção manual no administrativo.
 */

function acharProduto(item, products = []) {
  return products.find((p) =>
    (item?.productId != null && String(p.id) === String(item.productId))
    || (item?.name && p.name === item.name),
  ) || null;
}

function acharCategoria(produto, item, categories = []) {
  const catId = produto?.categoriaId ?? item?.categoriaId ?? null;
  const catNome = produto?.category || produto?.categoria || item?.category || "";
  return categories.find((c) =>
    (catId != null && String(c.id) === String(catId))
    || (catNome && c.nome === catNome),
  ) || null;
}

/** Resolve o setor do item: produto > categoria. */
export function resolverSetorDoItem(item, { products = [], categories = [], setores = [] } = {}) {
  const produto = acharProduto(item, products);
  let setorId = produto?.setorId ?? item?.setorId ?? null;
  let origem = setorId != null ? "produto" : null;

  if (setorId == null) {
    const cat = acharCategoria(produto, item, categories);
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

/**
 * Resolve a impressora do item: produto > categoria > legado do setor.
 * Retorna também o setor resolvido para montar a comanda.
 */
export function resolverImpressoraDoItem(item, ctx = {}) {
  const { products = [], categories = [], impressoras = [] } = ctx;
  const setorRes = resolverSetorDoItem(item, ctx);
  const produto = setorRes.produto;
  const cat = acharCategoria(produto, item, categories);

  let impressoraId = produto?.impressoraId ?? item?.impressoraId ?? null;
  let origemImp = impressoraId != null ? "produto" : null;

  if (impressoraId == null && cat?.impressoraId != null) {
    impressoraId = cat.impressoraId;
    origemImp = "categoria";
  }

  let impressora = impressoraId != null
    ? (impressoras.find((i) => String(i.id) === String(impressoraId)) || null)
    : null;

  // Legado: impressora ainda apontada no setor (antes do cadastro dedicado).
  if (!impressora && setorRes.setor && (setorRes.setor.impressoraNome || "").trim()) {
    impressora = {
      id: null,
      nome: setorRes.setor.impressoraNome,
      destino: setorRes.setor.impressoraDestino || "",
      impressaoAuto: setorRes.setor.impressaoAuto !== false,
      ativo: true,
    };
    impressoraId = null;
    origemImp = "setor-legado";
  }

  return {
    ...setorRes,
    impressoraId: impressora?.id ?? impressoraId,
    impressora,
    origemImpressora: origemImp,
    categoria: cat,
  };
}

/**
 * Agrupa itens por setor + impressora (ignora itens sem setor).
 * Assim cada driver recebe só os itens corretos daquele setor.
 */
export function agruparItensPorSetorCadastro(itens = [], ctx = {}) {
  const mapa = new Map();
  const semSetor = [];

  itens.forEach((it, idx) => {
    const r = resolverImpressoraDoItem(it, ctx);
    if (!r.setorId || !r.setor) {
      semSetor.push({ ...it, _idx: idx });
      return;
    }
    const impKey = r.impressoraId != null
      ? `id:${r.impressoraId}`
      : `nome:${(r.impressora?.nome || "").trim().toLowerCase() || "sem"}`;
    const key = `${r.setorId}::${impKey}`;
    if (!mapa.has(key)) {
      mapa.set(key, {
        setorId: r.setor.id,
        setorNome: r.setor.nome,
        impressoraId: r.impressora?.id ?? r.impressoraId ?? null,
        impressoraNome: r.impressora?.nome || "",
        impressoraDestino: r.impressora?.destino || "",
        impressaoAuto: r.impressora ? r.impressora.impressaoAuto !== false : true,
        origemVinculo: r.origem,
        origemImpressora: r.origemImpressora,
        itens: [],
      });
    }
    mapa.get(key).itens.push({
      ...it,
      _idx: idx,
      _origemVinculo: r.origem,
      _origemImpressora: r.origemImpressora,
    });
  });

  const ordemSetores = (ctx.setores || [])
    .filter((s) => s.ativo !== false)
    .map((s) => String(s.id));

  const grupos = [...mapa.values()].sort((a, b) => {
    const ia = ordemSetores.indexOf(String(a.setorId));
    const ib = ordemSetores.indexOf(String(b.setorId));
    const oa = ia === -1 ? 999 : ia;
    const ob = ib === -1 ? 999 : ib;
    if (oa !== ob) return oa - ob;
    return String(a.impressoraNome || "").localeCompare(String(b.impressoraNome || ""), "pt-BR");
  });

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
    impressoraId: g.impressoraId ?? null,
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
      origemImpressora: it._origemImpressora || g.origemImpressora,
    })),
    status: "pendente",
    origem,
    precisaIntervencao: !(g.impressoraNome || "").trim(),
    tentativas: 0,
  }));

  return { filas, semSetor, grupos };
}

export function rotuloStatusImpressao(status) {
  const mapa = {
    pendente: { label: "Pendente", chip: "bg-[#FBEFC4] text-[#012E46]" },
    impresso: { label: "Impresso", chip: "bg-[#DFF3E6] text-[#1F7A3D]" },
    erro: { label: "Erro", chip: "bg-[#FDE8E8] text-[#B42318]" },
    cancelado: { label: "Cancelado", chip: "bg-[#EDF0F4] text-[#52606D]" },
    reimpresso: { label: "Reimpresso", chip: "bg-[#E0F0F4] text-[#012E46]" },
  };
  return mapa[status] || { label: status || "—", chip: "bg-[#EDF0F4] text-[#52606D]" };
}

export const TIPOS_IMPRESSORA = [
  { id: "local", label: "Local (driver instalado)" },
  { id: "rede", label: "Rede (IP / porta)" },
  { id: "compartilhada", label: "Compartilhamento Windows" },
];

export function rotuloTipoImpressora(tipo) {
  return TIPOS_IMPRESSORA.find((t) => t.id === tipo)?.label || tipo || "Local";
}

/** HTML simples de teste de impressão térmica. */
export function htmlTesteImpressora(impressora, lojaInfo = null) {
  const nomeLoja = lojaInfo?.nome || "Pedido Prime";
  const agora = new Date().toLocaleString("pt-BR");
  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `
<div class="c" style="font-family:'Inter', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;width:72mm;padding:4mm;color:#000">
  <div style="text-align:center;font-weight:800;font-size:14px">${esc(nomeLoja)}</div>
  <div style="text-align:center;font-size:11px;margin:4px 0 8px">TESTE DE IMPRESSORA</div>
  <div style="border-top:1px dashed #000;margin:6px 0"></div>
  <div style="font-size:12px;font-weight:700">${esc(impressora?.nome || "Impressora")}</div>
  <div style="font-size:11px;margin-top:4px">Tipo: ${esc(rotuloTipoImpressora(impressora?.tipo))}</div>
  <div style="font-size:11px;margin-top:2px">Destino: ${esc(impressora?.destino || "—")}</div>
  <div style="font-size:11px;margin-top:2px">Auto: ${impressora?.impressaoAuto === false ? "manual" : "ativa"}</div>
  <div style="border-top:1px dashed #000;margin:8px 0"></div>
  <div style="font-size:10px;text-align:center">${esc(agora)}</div>
  <div style="font-size:10px;text-align:center;margin-top:6px">Se este cupom saiu na impressora correta,<br/>o apontamento está OK.</div>
</div>`;
}
