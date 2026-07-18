import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  fetchLojas, fetchProdutos, fetchCategorias, fetchPromocoes, fetchGruposOpcoes, fetchOpcoes, fetchSetoresCozinha, fetchMesas,
  escutarLojas, inserirPedido, atualizarPedido, escutarPedidos,
  buscarClientePorTelefone, upsertCliente, criarChamado,
  rpcCriarPedidoPublico, rpcUpsertClientePublico, rpcBuscarClientePublico, rpcPedidosComanda, rpcPedidosCliente, rpcSolicitarContaPublico, rpcCriarChamadoPublico,
  rpcPesquisaSatisfacao, inserirPesquisaSatisfacao, rpcStatusMesa,
} from "./lib/supabase";
import { cardapioViaRpc } from "./lib/authMode";
import { useScrollLock } from "./lib/scrollLock";
import SatisfactionSurvey from "./components/SatisfactionSurvey";
import {
  ProdutoModal, formatCurrency, fallbackImage, statusMap, STATUS_TABLET_LABEL, isValidCommand,
  promocaoVigente, promoResumoDesconto, qrMesaEnabled, externalOrderingEnabled,
} from "./App";
import { LogoPP } from "./components/BrandLogo";

// ════════════════════════════════════════════════════════════
//  Cardápio digital PÚBLICO (cliente, externo) — ver + pedir + acompanhar
//  URL: /cardapio?e=PREFIXO[&mesa=NN][&c=COMANDA]
// ════════════════════════════════════════════════════════════
// Máscara de WhatsApp: 11987654321 → (11) 98765-4321 (progressiva, até 11 dígitos)
function mascararTelefone(valor) {
  const n = String(valor || "").replace(/\D/g, "").slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}
// Primeira letra de cada palavra do nome em maiúscula (preserva acentos/espaços)
function capitalizarNome(valor) {
  return String(valor || "").replace(/(^|\s)([\p{L}])/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

// Pesquisa de satisfação: controle por localStorage (sobrevive a reload, evita repetição).
//  - PEND: pedidos feitos pelo cliente, aguardando CONCLUSÃO (pago + retirado) p/ pesquisar.
//  - DONE: pedidos já pesquisados/dispensados → nunca mais aparecem.
const SURVEY_PEND_KEY = "pp_survey_pend";
const SURVEY_DONE_KEY = "pp_survey_done";
function lerSetLS(k) { try { return new Set(JSON.parse(localStorage.getItem(k) || "[]")); } catch { return new Set(); } }
function salvarSetLS(k, set) { try { localStorage.setItem(k, JSON.stringify([...set].slice(-200))); } catch {} }
// Dia da semana + minutos-do-dia "agora", já convertidos para o fuso horário
// do estabelecimento (não o fuso do navegador do cliente — um cliente
// acessando de outro estado/fuso precisa ver o horário REAL da loja).
// Sem fuso configurado, cai em America/Sao_Paulo (único fuso usado hoje em
// todo o app — mesma referência da formatação pt-BR já usada no projeto).
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
function diaEHoraNoFuso(fuso, base = new Date()) {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso || "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const partes = {}; fmt.formatToParts(base).forEach((p) => (partes[p.type] = p.value));
    const idx = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[partes.weekday];
    // Intl pode formatar meia-noite como "24:00" com hour12:false — normaliza para 0.
    return { dia: DIAS_SEMANA[idx], minutos: (Number(partes.hour) % 24) * 60 + Number(partes.minute) };
  } catch {
    return { dia: DIAS_SEMANA[base.getDay()], minutos: base.getHours() * 60 + base.getMinutes() };
  }
}
// Verdadeiro se a loja está aberta AGORA conforme os horários { seg..dom: "HH:MM–HH:MM" }.
// Trata faixa que vira a meia-noite (ex.: "18:00–02:00"). Dia sem faixa = fechado.
function lojaAbertaAgora(horarios, agora = new Date(), fuso) {
  const { dia, minutos: nowMin } = diaEHoraNoFuso(fuso, agora);
  const faixa = (horarios || {})[dia];
  if (!faixa || !/\d/.test(String(faixa))) return false;
  const [abre, fecha] = String(faixa).split("–").map((s) => (s || "").trim());
  if (!/^\d{1,2}:\d{2}$/.test(abre || "") || !/^\d{1,2}:\d{2}$/.test(fecha || "")) return false;
  const min = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + (m || 0); };
  const aMin = min(abre), fMin = min(fecha);
  return fMin > aMin ? (nowMin >= aMin && nowMin < fMin) : (nowMin >= aMin || nowMin < fMin);
}
// Verdadeiro se HÁ horário cadastrado para o dia de hoje (independente de
// estar aberto ou fechado agora) — usado para só exigir o bloqueio de
// horário da mesa quando a empresa realmente configurou os dias/horários
// (não usa horário fixo/simulado; sem configuração, não há o que respeitar).
function diaTemHorario(horarios, agora = new Date(), fuso) {
  const { dia } = diaEHoraNoFuso(fuso, agora);
  return /\d/.test(String((horarios || {})[dia] || ""));
}
// Converte o pedido mínimo salvo ("20,00" / "20" / "20.00") em número de reais.
function parseMoedaBR(v) {
  if (v == null || v === "") return 0;
  let s = String(v).replace(/[^\d.,]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

export default function CardapioPublico() {
  const params = new URLSearchParams(window.location.search);
  const prefixo  = (params.get("e") || "").toUpperCase();
  const mesaURL  = (params.get("mesa") || "").replace(/\D/g, "").slice(0, 2);
  // `mid` (mesa id, migration 066) — identificador persistente da mesa, imune
  // a renumeração. QR Codes gerados a partir de agora levam os dois; QR Codes
  // antigos (só `mesa=NN`) continuam funcionando via fallback por número.
  const midURL   = (params.get("mid") || "").replace(/\D/g, "");
  const comURL   = (params.get("c") || "").toUpperCase();

  const [loja, setLoja]           = useState(undefined); // undefined=carregando, null=não achou
  const [produtos, setProdutos]   = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [promocoes, setPromocoes] = useState([]);
  const [gruposOpcoes, setGruposOpcoes] = useState([]);
  const [opcoes, setOpcoes] = useState([]);
  const [setores, setSetores] = useState([]);
  // Mesas cadastradas da empresa — valida "mesa existente e ativa". `null` =
  // ainda não carregou ou a consulta falhou (nunca trava o acesso por causa
  // disso: a autoridade real é o backend em pub_validar_pedido_mesa, que roda
  // como security definer e não depende desta leitura do cliente).
  const [mesasLoja, setMesasLoja] = useState(null);
  const [orders, setOrders]       = useState([]);
  const [busca, setBusca]         = useState("");
  // Carrinho sobrevive a navegação/F5: por empresa+mesa (link externo cai em
  // "ext"), pra não vazar carrinho entre mesas/empresas diferentes no mesmo
  // navegador. sessionStorage (não localStorage) — some quando a aba fecha,
  // certo pra um QR físico que muitos clientes diferentes escaneiam.
  const cartKey = `pp_cart_${prefixo}_${mesaURL || "ext"}`;
  const [cart, setCart] = useState(() => {
    try { const s = JSON.parse(sessionStorage.getItem(cartKey) || "[]"); return Array.isArray(s) ? s : []; } catch { return []; }
  });
  useEffect(() => { try { sessionStorage.setItem(cartKey, JSON.stringify(cart)); } catch {} }, [cart, cartKey]);
  const [detalhe, setDetalhe]     = useState(null);
  const [mesa, setMesa]           = useState(mesaURL);
  const [comanda, setComanda]     = useState(comURL);
  const [cliente, setCliente]     = useState("");
  const [telefone, setTelefone]   = useState("");
  const clienteSalvoRef = useRef(false); // telefone já tem cadastro (write-only, não usado na renderização)
  const modoExterno = !mesaURL; // link geral (divulgação) → pedido externo (delivery/retirada)
  const [aba, setAba]             = useState(null); // null | 'carrinho' | 'conta'
  const [qrModal, setQrModal]     = useState(null); // dataURL do QR do cardápio (botão "Ver QR")
  const [survey, setSurvey]       = useState(null); // pesquisa de satisfação na finalização: { pedidoId, mesa, origem }
  const [ocultarIndisp, setOcultarIndisp] = useState(false); // botão "Filtros": ocultar indisponíveis
  const [enviando, setEnviando]   = useState(false);
  const enviandoRef = useRef(false); // trava síncrona contra clique duplo (ver enviar())
  const [msg, setMsg]             = useState(null);
  const [etapa, setEtapa]         = useState(mesaURL ? "welcome" : "cardapio"); // welcome | cardapio
  const [tipoPedido, setTipoPedido] = useState(""); // pedido externo: local | retirada | entrega (config_externo)
  const [formaPagto, setFormaPagto] = useState(""); // forma de pagamento: pix | cartao | dinheiro (config_externo)
  const [agora, setAgora] = useState(() => new Date()); // relógio p/ reavaliar aberto/fechado ao vivo
  const [comboRemover, setComboRemover] = useState(null); // item de combo aguardando confirmação de remoção
  const [confirmarLimpar, setConfirmarLimpar] = useState(false); // confirmação obrigatória antes de esvaziar o carrinho todo

  // Confirmação obrigatória de "mesa ocupada" (QR por mesa) — status vem do
  // backend (pub_status_mesa, migration 067), nunca de cache/estado local.
  // statusMesa: null = ainda checando · { ocupada, numero, nome } = resolvido.
  const [statusMesa, setStatusMesa] = useState(null);
  const [ocupacaoConfirmada, setOcupacaoConfirmada] = useState(false); // cliente respondeu "Sim" pra ocupação já vista
  const [ocupacaoRecusada, setOcupacaoRecusada] = useState(false);     // cliente respondeu "Não" → bloqueia

  // Toda abertura/atualização da tela começa no topo, com "Todos" ativo — nunca
  // restaura a última categoria/posição de rolagem. Desliga a restauração
  // nativa do navegador (senão um F5 poderia reabrir no meio do scroll,
  // brigando com o catAtiva="Todos" inicial) e força o topo uma única vez.
  useEffect(() => {
    try { if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual"; } catch {}
    window.scrollTo(0, 0);
  }, []);

  // Carrega empresa (por prefixo) + produtos + categorias
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // fetchMesas() pode falhar (rede/RLS) — não derruba o carregamento do
        // resto do cardápio; nesse caso mesasTodas fica null (ver mesasLoja).
        const [lojas, prods, cats, promos, grps, ops, sets, mesasTodas] = await Promise.all([fetchLojas(), fetchProdutos(), fetchCategorias(), fetchPromocoes().catch(() => []), fetchGruposOpcoes().catch(() => []), fetchOpcoes().catch(() => []), fetchSetoresCozinha().catch(() => []), fetchMesas().catch(() => null)]);
        if (!vivo) return;
        const l = lojas.find((x) => x.prefixo === prefixo) || null;
        setLoja(l);
        if (l) {
          setGruposOpcoes((grps || []).filter((g) => g.lojaId === l.id));
          setOpcoes((ops || []).filter((o) => o.lojaId === l.id));
          setSetores((sets || []).filter((s) => s.lojaId == null || s.lojaId === l.id));
          setMesasLoja(mesasTodas === null ? null : (mesasTodas || []).filter((m) => m.lojaId === l.id));
          // Modo mesa (QR) respeita visivelQr; link geral respeita visivelExterno (migration 034)
          const canalOk = (p) => mesaURL ? (p.visivelQr !== false) : (p.visivelExterno !== false);
          setProdutos(prods.filter((p) => (p.lojaId == null || p.lojaId === l.id) && p.active && canalOk(p)));
          setCategorias(cats.filter((c) => (c.lojaId == null || c.lojaId === l.id) && c.active !== false));
          setPromocoes((promos || []).filter((p) => p.lojaId === l.id && p.ativo && p.mostrarCardapio));
        }
      } catch { if (vivo) setLoja(null); }
    })();
    return () => { vivo = false; };
  }, [prefixo]);

  // Relógio: reavalia aberto/fechado a cada 30s (fecha sozinho quando passa do horário).
  useEffect(() => { const iv = setInterval(() => setAgora(new Date()), 30000); return () => clearInterval(iv); }, []);

  // Atualização AO VIVO da config da empresa (modo de uso, horários, pagamento, etc.):
  // se o admin alterar e salvar, o cardápio do cliente reflete sem recarregar.
  useEffect(() => {
    if (!prefixo) return;
    let off;
    try { off = escutarLojas((lojas) => { const l = (lojas || []).find((x) => x.prefixo === prefixo); if (l) setLoja(l); }); } catch {}
    return () => { try { off && off(); } catch {} };
  }, [prefixo]);

  // Acompanhamento dos pedidos.
  //  • Modo legacy: realtime direto (atual).
  //  • Modo RPC (RLS estrita): polling via RPC security definer, por comanda
  //    (mesa) ou por telefone (externo).
  useEffect(() => {
    if (!loja) return;
    if (cardapioViaRpc()) {
      let vivo = true;
      const tel = (telefone || "").replace(/\D/g, "");
      const buscar = async () => {
        try {
          const lista = modoExterno
            ? (tel.length >= 10 ? await rpcPedidosCliente({ lojaId: loja.id, telefone: tel }) : [])
            : (comanda ? await rpcPedidosComanda({ lojaId: loja.id, comanda }) : []);
          if (vivo) setOrders(lista);
        } catch {}
      };
      buscar();
      const iv = setInterval(buscar, 4000);
      return () => { vivo = false; clearInterval(iv); };
    }
    const off = escutarPedidos((all) => setOrders(all.filter((o) => o.lojaId === loja.id)));
    return () => off && off();
  }, [loja?.id, modoExterno, comanda, telefone]);

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); }, [msg]);

  // QR por mesa (recurso local: Interno/Ambos) e link/pedido externo
  // (Externo/Ambos) são regras INDEPENDENTES — QR de mesa nunca depende do
  // cardápio externo estar habilitado (mesma regra centralizada em App.jsx,
  // usada também pelo admin em CardapioExternoAdmin e pelo backend em
  // pub_validar_pedido_mesa, migration 065).
  const podeMesa = loja && qrMesaEnabled(loja.modoUso);
  const podeExterno = loja && externalOrderingEnabled(loja.modoUso);
  const canalPermitido = loja && (mesaURL ? podeMesa : podeExterno);
  // "Mesa existente e ativa" (tab_mesas) — protege contra QR obsoleto/mesa
  // removida ou um `?mesa=NN` digitado manualmente sem corresponder a
  // nenhuma mesa cadastrada. Sem mesaURL, não se aplica (canal externo).
  // Prefere resolver por `mid` (id persistente, migration 066) quando presente
  // — imune a renumeração; sem `mid` (QR antigo), cai no número (compatível
  // com todo QR já impresso). `mesasLoja === null` = não deu pra confirmar
  // (RLS/rede) → nunca bloqueia por causa disso, só quando a lista carregou
  // e a mesa realmente não está nela.
  const mesaCadastrada = mesasLoja === null ? null
    : mesasLoja.find((m) => midURL ? String(m.id) === midURL : m.numero === Number(mesaURL));
  const mesaValida = !mesaURL || mesasLoja === null || (!!mesaCadastrada && mesaCadastrada.active !== false && mesaCadastrada.permiteQr !== false);

  // Status ao vivo da mesa (ocupada = tem pedido aberto não pago/cancelado
  // nela, migration 067) — direto do backend, nunca de cache. Só se aplica
  // ao canal mesa, com mesa real confirmada (mesaValida) e modo permitido.
  useEffect(() => {
    let vivo = true;
    if (!mesaURL || !loja || !podeMesa || !mesaValida || !mesaCadastrada) return;
    rpcStatusMesa({ lojaId: loja.id, mesaNumero: Number(mesaURL), mesaId: mesaCadastrada.id })
      .then((s) => { if (vivo) setStatusMesa(s); });
    return () => { vivo = false; };
  }, [mesaURL, loja, podeMesa, mesaValida, mesaCadastrada]);

  // Configurações do pedido externo (aba "Pedido externo" — config_externo)
  const cfgExt = loja?.configExterno || {};
  const aceitaExterno = cfgExt.aceitaPedidoExterno !== false; // padrão: aceita
  const opcoesEntrega = [
    cfgExt.consumoLocal !== false && { id: "local",    label: "Consumir no local", icon: "🍽️" },
    cfgExt.retirada     !== false && { id: "retirada", label: "Retirada no balcão", icon: "🛍️" },
    cfgExt.entrega      === true  && { id: "entrega",  label: "Entrega (delivery)", icon: "🛵" },
  ].filter(Boolean);
  const minimoExterno = parseMoedaBR(cfgExt.pedidoMinimo); // número em reais (0 = sem mínimo)
  // Horários de funcionamento (aba "Horários") — reavaliado ao vivo via `agora`,
  // no fuso do estabelecimento (cfgExt.fusoHorario, padrão America/Sao_Paulo).
  const abertoAgora = lojaAbertaAgora(cfgExt.horarios, agora, cfgExt.fusoHorario);
  // QR por mesa: recurso local — respeita os horários cadastrados sempre que
  // a empresa configurou o dia de hoje, independente do toggle abaixo (que é
  // do fluxo externo). Pedido externo: comportamento preservado, só bloqueia
  // fora do horário quando a empresa liga "Bloquear pedidos fora do horário".
  const bloqueioHorario = !modoExterno
    ? (diaTemHorario(cfgExt.horarios, agora, cfgExt.fusoHorario) && !abertoAgora)
    : (cfgExt.bloquearForaHorario === true && !abertoAgora);
  // Promoções vigentes AGORA (reavaliado pelo relógio — happy hour ativa/desativa sozinho)
  const promosVigentes = useMemo(() => promocoes.filter((p) => promocaoVigente(p, agora)), [promocoes, agora]);
  const catNomePorId = useMemo(() => { const m = {}; categorias.forEach((c) => (m[c.id] = c.nome)); return m; }, [categorias]);
  // Melhor desconto aplicável a um produto (via produtos vinculados, categoria, ou geral).
  // Retorna { preco, original, label, nome } ou null.
  const promoDoProduto = (item) => {
    const base = Number(item?.price) || 0;
    if (!base) return null;
    let melhor = null;
    for (const p of promosVigentes) {
      if (p.tipo === "combo") continue; // combos são tratados como pacote (ver combosVigentes)
      const ids = Array.isArray(p.produtoIds) && p.produtoIds.length ? p.produtoIds : (p.produtoId ? [p.produtoId] : []);
      const temAlvo = ids.length > 0 || p.categoriaId != null;
      const alvoProduto = ids.includes(item.id);
      const alvoCategoria = p.categoriaId != null && catNomePorId[p.categoriaId] === item.category;
      if (temAlvo ? !(alvoProduto || alvoCategoria) : false) continue; // tem alvo mas não bate → pula; sem alvo → geral
      let preco = base, label = null;
      if (p.descontoPercent != null && p.descontoPercent > 0) { preco = base * (1 - p.descontoPercent / 100); label = `-${p.descontoPercent}%`; }
      else if (p.descontoValor != null && p.descontoValor > 0) { preco = Math.max(0, base - p.descontoValor); label = `-${formatCurrency(p.descontoValor)}`; }
      else continue; // promo sem desconto numérico (combo/destaque) não altera preço
      preco = Math.round(preco * 100) / 100;
      if (preco < base && (melhor == null || preco < melhor.preco)) melhor = { preco, original: base, label, nome: p.nome };
    }
    return melhor;
  };
  // Combos vigentes (tipo "combo" com preço fechado e produtos definidos).
  // Cada combo vira um conjunto de produtos com preço distribuído proporcionalmente.
  const combosVigentes = useMemo(() => promosVigentes
    .filter((p) => p.tipo === "combo" && Number(p.descontoValor) > 0)
    .map((p) => {
      const ids = Array.isArray(p.produtoIds) && p.produtoIds.length ? p.produtoIds : (p.produtoId ? [p.produtoId] : []);
      const itens = ids.map((id) => produtos.find((x) => x.id === id)).filter(Boolean);
      const somaOriginal = itens.reduce((s, it) => s + (Number(it.price) || 0), 0);
      return { promo: p, itens, somaOriginal, precoCombo: Number(p.descontoValor) };
    })
    .filter((c) => c.itens.length >= 1 && c.somaOriginal > 0), [promosVigentes, produtos]);

  function adicionarCombo(combo) {
    const inst = `${combo.promo.id}-${Date.now()}`;
    const fator = combo.precoCombo / combo.somaOriginal; // distribui o preço fechado proporcionalmente
    const nItens = combo.itens.length;
    let acumulado = 0;
    const novos = combo.itens.map((it, idx) => {
      const original = Number(it.price) || 0;
      // último item ajusta o arredondamento para a soma bater exatamente no preço do combo
      let preco = idx === nItens - 1 ? Math.round((combo.precoCombo - acumulado) * 100) / 100 : Math.round(original * fator * 100) / 100;
      acumulado += preco;
      return { name: it.name, price: preco, precoOriginal: original, economiaUnit: Math.max(0, original - preco), quantity: 1, category: it.category,
        comboId: inst, comboNome: combo.promo.nome, removedIngredients: [], extraIngredients: [], selectedOptions: [], observation: "", _uid: Date.now() + Math.random() + idx };
    });
    setCart((c) => [...c, ...novos]);
    setMsg({ t: "success", m: `🍔 Combo "${combo.promo.nome}" adicionado!` });
  }
  // Remoção: se o item faz parte de um combo, avisa e desfaz o combo (demais itens voltam ao preço normal).
  function pedirRemover(item) {
    if (item.comboId) { setComboRemover(item); return; }
    removerItem(item._uid);
  }
  function desfazerCombo(item) {
    setCart((c) => c
      .filter((i) => i._uid !== item._uid) // remove o item escolhido
      .map((i) => i.comboId === item.comboId
        ? { ...i, price: Number(i.precoOriginal) || i.price, economiaUnit: 0, comboId: undefined, comboNome: undefined } // demais voltam ao normal
        : i));
    setComboRemover(null);
    setMsg({ t: "success", m: "Combo desfeito — itens restantes voltaram ao preço normal." });
  }
  // Formas de pagamento permitidas (aba "Pagamento" — config_externo)
  const formasPagto = [
    cfgExt.pagPix      !== false && { id: "pix",      label: "PIX",      icon: "📱" },
    cfgExt.pagCartao   !== false && { id: "cartao",   label: "Cartão",   icon: "💳" },
    cfgExt.pagDinheiro !== false && { id: "dinheiro", label: "Dinheiro", icon: "💵" },
  ].filter(Boolean);
  // Momento do pagamento conforme o tipo de pedido + toggles da empresa
  const momentoPagto = !modoExterno ? "No caixa"
    : tipoPedido === "entrega"  ? "Na entrega"
    : tipoPedido === "retirada" ? "Na retirada"
    : tipoPedido === "local"    ? "No local"
    : (cfgExt.pagOnline ? "Online" : "No atendimento");
  // Tipo de pedido externo: garante uma opção válida selecionada
  useEffect(() => {
    if (!modoExterno) return;
    if (opcoesEntrega.length === 0) { if (tipoPedido) setTipoPedido(""); return; }
    if (!opcoesEntrega.some((o) => o.id === tipoPedido)) setTipoPedido(opcoesEntrega[0].id);
    /* eslint-disable-next-line */
  }, [loja?.id, modoExterno, cfgExt.consumoLocal, cfgExt.retirada, cfgExt.entrega]);
  // Forma de pagamento: garante uma opção válida selecionada
  useEffect(() => {
    if (formasPagto.length === 0) { if (formaPagto) setFormaPagto(""); return; }
    if (!formasPagto.some((f) => f.id === formaPagto)) setFormaPagto(formasPagto[0].id);
    /* eslint-disable-next-line */
  }, [loja?.id, cfgExt.pagPix, cfgExt.pagCartao, cfgExt.pagDinheiro]);
  // Durante a busca, lista achatada (filtrada). Sem busca, agrupamos por categoria
  // para dividir os grupos e permitir o "scroll-spy" (header acompanha o grupo na tela).
  const visiveis = useMemo(() => ocultarIndisp ? produtos.filter((p) => p.disponivel !== false) : produtos, [produtos, ocultarIndisp]);
  const itensBusca = useMemo(() => {
    const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const termo = norm(busca);
    if (!termo) return [];
    return visiveis.filter((p) => norm(`${p.name} ${p.description} ${p.category} ${(p.ingredients || []).join(" ")}`).includes(termo));
  }, [visiveis, busca]);
  const grupos = useMemo(() => {
    const porCat = {};
    visiveis.forEach((p) => { const c = p.category || "Outros"; (porCat[c] = porCat[c] || []).push(p); });
    const ordem = categorias.map((c) => c.nome);
    const nomes = [...ordem.filter((n) => porCat[n]?.length), ...Object.keys(porCat).filter((n) => !ordem.includes(n))];
    return nomes.map((nome) => ({ nome, produtos: porCat[nome] }));
  }, [visiveis, categorias]);
  const cats = useMemo(() => ["Todos", ...grupos.map((g) => g.nome)], [grupos]);

  // Scroll-spy: destaca no header o grupo atualmente visível na tela.
  const secRefs = useRef({});
  const chipRefs = useRef({});
  const headerRef = useRef(null);  // cabeçalho fixo — sua altura REAL vira o offset "top" do carrossel
  const catBarRef = useRef(null); // barra sticky de categorias — usada p/ calcular offset real
  // Alturas medidas de verdade (não um px fixo "no chute") — sem isso, o
  // carrossel ficava com top-[64px] fixo, mas a altura real do cabeçalho varia
  // por aparelho (env(safe-area-inset-top) do notch/Dynamic Island) e por modo
  // (linha de "Garçom/Ajuda/Limpeza" só aparece no QR de mesa). Em celulares
  // com notch, o cabeçalho real passava dos 64px assumidos e cobria o
  // carrossel (mesmo z-index mais baixo) — por isso "sumia" só no mobile.
  const [headerH, setHeaderH] = useState(0);
  const [catBarH, setCatBarH] = useState(0);
  useLayoutEffect(() => {
    const medir = () => {
      setHeaderH(Math.ceil(headerRef.current?.getBoundingClientRect().height || 0));
      setCatBarH(Math.ceil(catBarRef.current?.getBoundingClientRect().height || 0));
    };
    medir();
    const t = setTimeout(medir, 300); // reajusta depois de fontes/imagens do cabeçalho carregarem
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    if (ro) {
      if (headerRef.current) ro.observe(headerRef.current);
      if (catBarRef.current) ro.observe(catBarRef.current);
    }
    window.addEventListener("resize", medir);
    window.addEventListener("orientationchange", medir);
    return () => {
      clearTimeout(t);
      ro?.disconnect();
      window.removeEventListener("resize", medir);
      window.removeEventListener("orientationchange", medir);
    };
  }, []);
  const [catAtiva, setCatAtiva] = useState("Todos");
  // Enquanto true, um clique (categoria ou "Todos") disparou uma rolagem suave
  // programática — o scroll-spy ignora o scroll até ela assentar, pra não
  // "brigar" com o clique piscando por categorias intermediárias no caminho
  // (evita o loop rolagem automática ⇄ clique ⇄ estado).
  const rolandoPorCliqueRef = useRef(false);
  const cliqueTimeoutRef = useRef(null);
  // Espaçador dinâmico ao fim: exatamente o necessário para o ÚLTIMO grupo encostar
  // no topo ao rolar — sem sobra extra (não deixa "passar do topo").
  const [spacerH, setSpacerH] = useState(0);
  useEffect(() => {
    if (busca || !grupos.length) return;
    // Calcula o grupo atual: o último cujo cabeçalho passou da "linha" (abaixo dos
    // headers fixos). Determinístico e correto mesmo com seções curtas.
    const calc = () => {
      if (rolandoPorCliqueRef.current) return; // rolagem de clique em andamento — não interfere
      // Perto do fim da página: força o ÚLTIMO grupo, mesmo que o cabeçalho dele
      // não tenha alcançado a "linha" (seção curta / cardápio pequeno).
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const scrollHeight = doc.scrollHeight;
      const clientHeight = window.innerHeight;
      if (scrollTop + clientHeight >= scrollHeight - 80) {
        const ultimo = grupos[grupos.length - 1]?.nome;
        setCatAtiva((cur) => (cur === ultimo ? cur : ultimo));
        return;
      }
      // Linha de deteção = base real da barra sticky de categorias (fallback 140px).
      const linha = (catBarRef.current?.getBoundingClientRect().bottom || 140) + 8;
      // Padrão "Todos": só troca quando o cabeçalho de algum grupo realmente
      // cruza a linha (entrou visualmente na seção). No topo, antes da
      // primeira seção, nada cruza — permanece "Todos".
      let atual = "Todos";
      for (const g of grupos) {
        const el = secRefs.current[g.nome];
        if (el && el.getBoundingClientRect().top - linha <= 0) atual = g.nome;
      }
      setCatAtiva((cur) => (cur === atual ? cur : atual));
    };
    // rAF-throttle: o destaque acompanha a rolagem sem travar (mais fluido em iOS/Android).
    // Some ao debounce curto abaixo: evita trocar de categoria a cada pixel
    // quando o usuário rola rápido por seções próximas/curtas.
    let raf = 0;
    let debounce = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        clearTimeout(debounce);
        debounce = setTimeout(calc, 60);
      });
    };
    // rootMargin dinâmico = altura real do cabeçalho + carrossel de categorias
    // (não um valor fixo "no chute") — recalculado sempre que os grupos mudam
    // (cardápio carregado dinamicamente pode alterar a altura da barra).
    const topoReal = Math.round((catBarRef.current?.getBoundingClientRect().bottom || 140) + 8);
    const obs = new IntersectionObserver(onScroll, { threshold: [0, 0.5, 1], rootMargin: `-${topoReal}px 0px 0px 0px` });
    Object.values(secRefs.current).forEach((el) => el && obs.observe(el));
    calc();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(debounce);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [busca, grupos]);
  // Limpa o timeout do "clique em andamento" ao desmontar.
  useEffect(() => () => clearTimeout(cliqueTimeoutRef.current), []);
  // Mede a altura do último grupo p/ dimensionar o espaçador (recalcula ao carregar imagens/redimensionar).
  useEffect(() => {
    if (busca || !grupos.length) { setSpacerH(0); return; }
    const ultimo = grupos[grupos.length - 1].nome;
    // Altura de referência ESTÁVEL: não acompanha o toggle da barra do navegador
    // (que muda só a altura). Assim o scrollHeight não encolhe ao rolar e a tela
    // não "volta" para um grupo anterior. Só atualiza em rotação (muda a largura).
    let vh = window.innerHeight;
    let lastW = window.innerWidth;
    // Desconta a barra de categorias + a folga das barras do carrinho, para o último
    // grupo pousar logo abaixo do header — sem vazio extra.
    const medir = () => { const el = secRefs.current[ultimo]; if (el) setSpacerH(Math.max(0, Math.round(vh - el.getBoundingClientRect().height - 200))); };
    const onResize = () => { if (window.innerWidth === lastW) return; lastW = window.innerWidth; vh = window.innerHeight; medir(); };
    medir();
    const t = setTimeout(medir, 350);
    const el = secRefs.current[ultimo];
    const ro = (typeof ResizeObserver !== "undefined" && el) ? new ResizeObserver(medir) : null;
    if (ro && el) ro.observe(el);
    window.addEventListener("resize", onResize);
    window.addEventListener("load", medir);
    return () => { clearTimeout(t); if (ro) ro.disconnect(); window.removeEventListener("resize", onResize); window.removeEventListener("load", medir); };
  }, [busca, grupos]);
  // Mantém o chip ativo visível na barra horizontal
  useEffect(() => {
    const el = chipRefs.current[catAtiva];
    if (el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [catAtiva]);
  const irParaCategoria = (nome) => {
    setBusca("");
    setCatAtiva(nome);
    // Trava o scroll-spy durante a rolagem programática — sem isso, o
    // clique em "Sobremesas" (por ex.) piscaria pelas categorias que ficam
    // no caminho até chegar lá. Libera sozinha depois que a rolagem suave
    // termina (tempo generoso; se o usuário rolar de novo por conta própria
    // antes disso, o clique seguinte já reseta o timeout normalmente).
    clearTimeout(cliqueTimeoutRef.current);
    rolandoPorCliqueRef.current = true;
    cliqueTimeoutRef.current = setTimeout(() => { rolandoPorCliqueRef.current = false; }, 700);
    if (nome === "Todos") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const alvo = secRefs.current[nome];
    if (!alvo) return;
    // Offset = altura real da barra sticky (header + categorias) + folga, para o
    // título do agrupamento não ficar escondido atrás dela.
    const offset = (catBarRef.current?.getBoundingClientRect().bottom || 108) + 12;
    window.scrollTo({ top: alvo.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" });
  };
  // Ofertas: ícone/resumo/validade por tipo + clique leva ao combo/categoria
  const combosRef = useRef(null);
  const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const fmtHora = (h) => { if (!h) return ""; const hh = h.slice(0, 2), mm = h.slice(3, 5); return mm === "00" ? `${hh}h` : `${hh}h${mm}`; };
  const iconeOferta = (p) => p.tipo === "combo" ? "🍔" : p.tipo === "horario" ? "⏰" : p.tipo === "destaque" ? "⭐" : p.tipo === "valor" ? "💰" : "🏷️";
  const validadeOferta = (p) => {
    const partes = [];
    if (Array.isArray(p.diasSemana) && p.diasSemana.length > 0 && p.diasSemana.length < 7) partes.push(p.diasSemana.map((d) => DIAS_CURTOS[d]).join(", "));
    if (p.horaInicio || p.horaFim) partes.push(`${fmtHora(p.horaInicio) || "…"}–${fmtHora(p.horaFim) || "…"}`);
    return partes.join(" · ");
  };
  const clicarOferta = (p) => {
    if (p.tipo === "combo") { combosRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const catNome = p.categoriaId != null ? catNomePorId[p.categoriaId] : null;
    if (catNome && secRefs.current[catNome]) { irParaCategoria(catNome); return; }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const renderProduto = (item) => {
    const indisponivel = item.disponivel === false;
    const personalizavel = (item.ingredients || []).length > 0;
    const promo = promoDoProduto(item);
    // Abre o modal com o produto já no preço promocional (carrinho/total refletem o desconto)
    const abrir = () => setDetalhe(promo ? { ...item, price: promo.preco, precoOriginal: promo.original, economiaUnit: promo.original - promo.preco } : item);
    return (
      <article key={item.id} className={`flex h-full flex-col rounded-[1.25rem] border bg-white shadow-[0_8px_24px_rgba(16,24,40,.06)] ${promo ? "border-[#B7E4C7]" : item.isFeatured && !indisponivel ? "border-[#F4D27A]" : "border-[#E5E7EB]"}`}>
        <div className="flex gap-3 p-3">
          <div className="relative shrink-0">
            <button onClick={() => !indisponivel && abrir()} disabled={indisponivel} className="block h-[88px] w-[88px] overflow-hidden rounded-2xl bg-[#F3F4F6]">
              <img src={item.imageUrl || fallbackImage} alt={item.name} loading="lazy" decoding="async"
                onError={(e) => { if (e.currentTarget.src !== fallbackImage) e.currentTarget.src = fallbackImage; }}
                className={`h-full w-full object-cover ${indisponivel ? "grayscale opacity-50" : ""}`} />
            </button>
            {/* Selo decorativo (não é um controle independente — tocar na imagem já abre a personalização) */}
            {personalizavel && !indisponivel && (
              <span aria-hidden="true" title="Personalizável" className="pointer-events-none absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-[#F4D27A] bg-white text-[#9A6A00] shadow-[0_4px_12px_rgba(16,24,40,.1)]">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="2" fill="currentColor" stroke="none"/></svg>
              </span>
            )}
            {promo && !indisponivel && <span className="absolute right-1.5 top-1.5 rounded-full bg-[#16A34A] px-1.5 py-0.5 text-[9px] font-black text-white shadow-[0_4px_12px_rgba(16,24,40,.1)]">{promo.label}</span>}
            {indisponivel && <span className="absolute left-1/2 top-1/2 w-max -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#E5E7EB] bg-white/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#667085]">Indisponível</span>}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-black leading-tight text-[#182230] line-clamp-2">{item.name}</h3>
            {item.description && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#667085]">{item.description}</p>}
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between px-3 pb-3">
          {promo
            ? <span className="flex flex-col leading-none"><span className="text-[11px] font-bold text-[#98A2B3] line-through">{formatCurrency(promo.original)}</span><span className="text-base font-black text-[#147A4A]">{formatCurrency(promo.preco)}</span></span>
            : <span className="text-base font-black text-[#9A6A00]">{formatCurrency(item.price)}</span>}
          {indisponivel
            ? <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E5E7EB] bg-[#F3F4F6] text-[#98A2B3]">✕</span>
            : <button onClick={abrir} aria-label={`Adicionar ${item.name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#D9A441] text-xl font-black text-[#182230] shadow-[0_4px_12px_rgba(16,24,40,.1)] transition active:scale-90 hover:bg-[#C7922F]">+</button>}
        </div>
      </article>
    );
  };
  // "Ver QR": gera o QR do link deste cardápio (para o cliente compartilhar a mesa).
  const abrirQr = async () => {
    try { const QRCode = (await import("qrcode")).default; const u = await QRCode.toDataURL(window.location.href, { width: 600, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } }); setQrModal(u); } catch {}
  };

  const telDig = telefone.replace(/\D/g, "");
  // Identifica o cliente pelo telefone e auto-carrega o nome (via RPC no modo
  // RLS estrito; SELECT direto no modo legacy).
  useEffect(() => {
    if (!modoExterno || !loja || telDig.length < 10) { clienteSalvoRef.current = false; return; }
    let vivo = true;
    const t = setTimeout(async () => {
      const c = cardapioViaRpc()
        ? await rpcBuscarClientePublico({ lojaId: loja.id, telefone: telDig })
        : await buscarClientePorTelefone(loja.id, telDig);
      if (!vivo) return;
      if (c && c.nome) { setCliente(capitalizarNome(c.nome)); clienteSalvoRef.current = true; } else { clienteSalvoRef.current = false; }
    }, 500);
    return () => { vivo = false; clearTimeout(t); };
  }, [telDig, modoExterno, loja?.id]);

  // Cadastra/atualiza o cliente do estabelecimento assim que NOME + TELEFONE
  // forem informados (sem esperar o pedido) — alimenta o CRM da empresa.
  useEffect(() => {
    if (!modoExterno || !loja || telDig.length < 10 || cliente.trim().length < 2) return;
    let vivo = true;
    const t = setTimeout(async () => {
      try { await (cardapioViaRpc() ? rpcUpsertClientePublico({ lojaId: loja.id, nome: cliente.trim(), telefone: telDig }) : upsertCliente({ nome: cliente.trim(), telefone: telDig, lojaId: loja.id })); }
      catch {}
      if (vivo) clienteSalvoRef.current = true;
    }, 900);
    return () => { vivo = false; clearTimeout(t); };
  }, [telDig, cliente, modoExterno, loja?.id]);

  const currentTable = mesa ? `Mesa ${String(mesa).padStart(2, "0")}` : "";
  // O pedido só deixa de ser acompanhado quando estiver CONCLUÍDO: pago E entregue/retirado.
  // Enquanto faltar uma das duas, continua aparecendo com o status do estágio atual.
  const concluido = (o) => o.paymentStatus === "paid" && o.status === "delivered";
  const meusPedidos = modoExterno
    ? orders.filter((o) => telDig && o.clienteTelefone === telDig && o.status !== "cancelled" && !concluido(o))
    : orders.filter((o) => o.table === currentTable && o.command === comanda && o.status !== "cancelled" && !concluido(o));
  // Pesquisa de Satisfação SÓ no fim: quando um pedido feito por este aparelho CONCLUIR
  // (pago + retirado/entregue). Mostra uma vez por pedido.
  useEffect(() => {
    if (survey) return;
    const pend = lerSetLS(SURVEY_PEND_KEY);
    if (pend.size === 0) return;
    const done = lerSetLS(SURVEY_DONE_KEY);
    const alvo = orders.find((o) => pend.has(o.id) && !done.has(o.id) && o.paymentStatus === "paid" && o.status === "delivered");
    if (alvo) setSurvey({ pedidoId: alvo.id, mesa: alvo.table, origem: (alvo.table === "Externo" || /^EXT-/.test(alvo.command || "")) ? "externo" : "mesa" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, survey]);
  const subtotal = meusPedidos.reduce((s, o) => s + o.items.reduce((a, i) => a + i.price * i.quantity, 0), 0);
  const totalMesa = subtotal * 1.1;
  const totalCart = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const economiaCart = cart.reduce((s, i) => s + (Number(i.economiaUnit) || 0) * i.quantity, 0);
  const qtdCart = cart.reduce((s, i) => s + i.quantity, 0);
  const podeFechar = meusPedidos.length > 0 && meusPedidos.every((o) => o.status === "delivered");
  const contaSolicitada = meusPedidos.some((o) => o.paymentStatus === "requested");

  // Roteamento por setor (cozinha/bar) — para o acompanhamento por setor
  const setorPorNomeProd = useMemo(() => { const m = {}; produtos.forEach((p) => { if (p.setorId != null) m[p.name] = p.setorId; }); return m; }, [produtos]);
  const setorNomePorId = useMemo(() => { const m = {}; setores.forEach((s) => { if (s.id != null) m[s.id] = s.nome; }); return m; }, [setores]);
  // Setor REAL do item: o setor CADASTRADO vinculado ao produto (mesma regra da operação).
  // Sem vínculo, cai na heurística por categoria.
  const setorDoItemCli = (it) => {
    const sid = setorPorNomeProd[it.name];
    const nome = sid != null ? (setorNomePorId[sid] || "") : "";
    if (nome) return nome;
    const cat = produtos.find((p) => p.name === it.name)?.category || "";
    if (/bebida|drink|suco|refri/i.test(cat)) return "Bar";
    if (/sobremesa|doce|bolo|sweet/i.test(cat)) return "Sobremesa";
    return "Cozinha";
  };
  const ordemSetoresCli = useMemo(() => setores.filter((s) => s.ativo !== false).map((s) => s.nome), [setores]);
  const setoresDoPedido = (o) => {
    const pres = [...new Set((o.items || []).map(setorDoItemCli))];
    return [...ordemSetoresCli.filter((n) => pres.includes(n)), ...pres.filter((n) => !ordemSetoresCli.includes(n))];
  };
  function addConfigurado(item) {
    setCart((c) => [...c, { ...item, _uid: Date.now() + Math.random() }]);
    setDetalhe(null);
  }
  function removerItem(uid) { setCart((c) => c.filter((i) => i._uid !== uid)); }
  function limparCarrinho() { setCart([]); setConfirmarLimpar(false); }

  // Chamados de mesa (garçom/ajuda/limpeza) — só no modo mesa (QR na mesa)
  async function chamar(tipo, rotulo) {
    if (!loja) return;
    const args = { lojaId: loja.id, mesa: mesa ? `Mesa ${String(mesa).padStart(2, "0")}` : "", comanda: comanda || "", tipo };
    try { await (cardapioViaRpc() ? rpcCriarChamadoPublico(args) : criarChamado(args)); setMsg({ t: "success", m: `${rotulo} — a equipe foi avisada.` }); }
    catch { setMsg({ t: "error", m: "Não foi possível enviar o chamado agora." }); }
  }

  async function enviar() {
    if (cart.length === 0) return;
    // Trava síncrona contra duplo clique/toque: "enviando" (estado) só reflete
    // no botão depois de um re-render, e o recheque de ocupação acima é
    // assíncrono — sem isso, dois toques rápidos poderiam disparar dois
    // pedidos antes do botão desabilitar.
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    try {
      if (bloqueioHorario) return setMsg({ t: "error", m: "O estabelecimento está fechado no momento. Consulte os horários de atendimento." });
      // Revalida a ocupação da mesa direto no backend antes de concluir — evita
      // cache/concorrência: se a mesa ficou ocupada durante a navegação e o
      // cliente ainda não confirmou essa ocupação, pede confirmação agora e
      // NÃO envia o pedido ainda (o cliente confirma e clica em enviar de novo).
      if (!modoExterno && mesaCadastrada && !ocupacaoConfirmada) {
        const fresco = await rpcStatusMesa({ lojaId: loja.id, mesaNumero: Number(mesa), mesaId: mesaCadastrada.id });
        if (fresco?.ocupada) { setStatusMesa(fresco); return; }
      }
      const itens = cart.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, selectedIngredients: i.selectedIngredients, removedIngredients: i.removedIngredients, extraIngredients: i.extraIngredients, selectedOptions: i.selectedOptions || [], observation: i.observation }));
      // Forma de pagamento (aba "Pagamento" — vale para pedido interno e externo)
      if (formasPagto.length === 0) return setMsg({ t: "error", m: "Nenhuma forma de pagamento está disponível no momento." });
      const formaSel = formasPagto.find((f) => f.id === formaPagto);
      if (!formaSel) return setMsg({ t: "error", m: "Escolha a forma de pagamento." });
      let novo;
      if (modoExterno) {
      // Aplica as regras configuradas pela empresa (aba "Pedido externo")
      if (!aceitaExterno) return setMsg({ t: "error", m: "Esta empresa não está aceitando pedidos pelo cardápio no momento." });
      if (opcoesEntrega.length === 0) return setMsg({ t: "error", m: "Nenhuma forma de pedido (consumo, retirada ou entrega) está disponível no momento." });
      const opc = opcoesEntrega.find((o) => o.id === tipoPedido);
      if (!opc) return setMsg({ t: "error", m: "Escolha como deseja receber o pedido." });
      if (minimoExterno > 0 && totalCart < minimoExterno) return setMsg({ t: "error", m: `Pedido mínimo de ${formatCurrency(minimoExterno)}. Faltam ${formatCurrency(minimoExterno - totalCart)}.` });
      // Pedido externo (link de divulgação): exige NOME + TELEFONE
      if (!cliente.trim()) return setMsg({ t: "error", m: "Informe o seu nome." });
      if (telDig.length < 10) return setMsg({ t: "error", m: "Informe um telefone válido (com DDD)." });
      setEnviando(true);
      try { await (cardapioViaRpc() ? rpcUpsertClientePublico({ lojaId: loja.id, nome: cliente.trim(), telefone: telDig }) : upsertCliente({ nome: cliente.trim(), telefone: telDig, lojaId: loja.id })); } catch {}
      const rotuloTipo = { local: "Consumo no local", retirada: "Retirada", entrega: "Entrega" }[opc.id] || "Externo";
      novo = {
        id: `PED-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`,
        table: `Externo · ${rotuloTipo}`, command: `EXT-${telDig.slice(-6)}`, customer: cliente.trim(), clienteTelefone: telDig,
        status: "received", paymentStatus: "open",
        createdAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        items: itens, lojaId: loja.id,
        pagamentoForma: formaSel.label, pagamentoMomento: momentoPagto,
      };
    } else {
      // Pedido na mesa (QR da mesa): exige mesa + comanda
      if (!podeMesa) return setMsg({ t: "error", m: "O QR Code por mesa está disponível nos modos Interno ou Ambos." });
      if (!mesa || Number(mesa) <= 0) return setMsg({ t: "error", m: "Informe o número da mesa." });
      if (!mesaValida) return setMsg({ t: "error", m: "Mesa não encontrada ou inativa. Verifique o QR Code." });
      if (!isValidCommand(comanda)) return setMsg({ t: "error", m: "Escaneie o QR Code da mesa (comanda) para pedir." });
      if (comanda.split("-")[0] !== loja.prefixo) return setMsg({ t: "error", m: `Comanda de outra empresa (${comanda.split("-")[0]}).` });
      setEnviando(true);
      novo = {
        id: `PED-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`,
        table: currentTable, command: comanda, customer: cliente.trim() || "Cliente",
        status: "received", paymentStatus: "open",
        createdAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        items: itens, lojaId: loja.id,
        pagamentoForma: formaSel.label, pagamentoMomento: momentoPagto,
      };
    }
    try {
      let pedidoId = novo.id;
      const mesaNumero = modoExterno ? null : (Number(mesa) || null);
      const mesaId = modoExterno ? null : (mesaCadastrada?.id ?? null);
      if (cardapioViaRpc()) { const r = await rpcCriarPedidoPublico({ lojaId: loja.id, mesa: novo.table, comanda: novo.command, cliente: novo.customer, telefone: novo.clienteTelefone || "", itens, pagForma: formaSel.label, pagMomento: momentoPagto, mesaNumero, mesaId }); if (r) pedidoId = r; }
      else await inserirPedido(novo);
      // A Pesquisa de Satisfação NÃO aparece agora — só quando o pedido CONCLUIR
      // (pago + retirado/entregue). Registra o pedido como pendente de pesquisa.
      try { const pend = lerSetLS(SURVEY_PEND_KEY); pend.add(pedidoId); salvarSetLS(SURVEY_PEND_KEY, pend); } catch {}
      setCart([]); setAba("conta"); setMsg({ t: "success", m: "✅ Pedido enviado para a cozinha!" });
    } catch (e) {
      console.error("Erro ao criar pedido:", e);
      // Mensagens conhecidas vindas da validação no servidor (pub_validar_pedido_mesa,
      // migration 065) — mostradas como vieram; qualquer outra cai no texto genérico
      // (evita expor erro técnico/bruto do Postgres ao cliente final).
      const MSGS_BACKEND = new Set([
        "Estabelecimento indisponível no momento.",
        "Mesa não encontrada ou inativa. Verifique o QR Code.",
        "O QR Code por mesa está disponível nos modos Interno ou Ambos.",
        "O estabelecimento está fechado no momento. Consulte os horários de atendimento.",
      ]);
      setMsg({ t: "error", m: MSGS_BACKEND.has(e?.message) ? e.message : "Erro ao enviar o pedido. Tente novamente." });
    }
    finally { setEnviando(false); }
    } finally { enviandoRef.current = false; }
  }

  // Grava a pesquisa de satisfação (tolerante: falha NÃO impede a finalização).
  async function salvarPesquisa({ notas, comentario }) {
    if (!survey) return;
    const dados = { pedidoId: survey.pedidoId, lojaId: loja.id, telefone: telDig || "", mesa: survey.mesa, origem: survey.origem, notas, comentario: (comentario || "").trim() };
    try { await (cardapioViaRpc() ? rpcPesquisaSatisfacao(dados) : inserirPesquisaSatisfacao(dados)); }
    catch (e) { console.error("Falha ao salvar a pesquisa de satisfação (pedido finalizado mesmo assim):", e); }
  }
  function marcarPesquisaConcluida(id) {
    if (!id) return;
    const pend = lerSetLS(SURVEY_PEND_KEY); pend.delete(id); salvarSetLS(SURVEY_PEND_KEY, pend);
    const done = lerSetLS(SURVEY_DONE_KEY); done.add(id); salvarSetLS(SURVEY_DONE_KEY, done);
  }
  // "Enviar avaliação": grava se houver nota/comentário; senão trata como sem avaliação.
  async function finalizarComPesquisa({ notas, comentario }) {
    const temNota = Object.values(notas || {}).some((v) => Number(v) > 0);
    const temComentario = (comentario || "").trim().length > 0;
    if (temNota || temComentario) await salvarPesquisa({ notas, comentario });
    marcarPesquisaConcluida(survey?.pedidoId);
    setSurvey(null);
    setMsg({ t: "success", m: (temNota || temComentario) ? "Obrigado pela sua avaliação! 💛" : "Tudo certo, obrigado!" });
  }
  // "Finalizar sem avaliar"
  function finalizarSemPesquisa() {
    marcarPesquisaConcluida(survey?.pedidoId);
    setSurvey(null);
    setMsg({ t: "success", m: "Tudo certo, obrigado! 👋" });
  }

  async function solicitarConta() {
    if (!podeFechar) return setMsg({ t: "error", m: "Aguarde a entrega de todos os pedidos para solicitar a conta." });
    try {
      if (cardapioViaRpc()) {
        const comandas = [...new Set(meusPedidos.map((o) => o.command).filter(Boolean))];
        await Promise.all(comandas.map((c) => rpcSolicitarContaPublico({ lojaId: loja.id, comanda: c })));
      } else {
        await Promise.all(meusPedidos.map((o) => atualizarPedido(o.id, { status_pagamento: "solicitado" })));
      }
      setMsg({ t: "success", m: "🧾 Conta solicitada ao caixa." });
    } catch { setMsg({ t: "error", m: "Erro ao solicitar a conta." }); }
  }

  // ── Estados de carregamento/erro ───────────────────────────
  if (loja === undefined) return <CardapioSkeleton />;
  if (loja === null) return <Centro><span className="text-5xl">🔍</span><p className="mt-3 font-black text-white">Empresa não encontrada</p><p className="mt-1 text-sm text-slate-500">Verifique o link/QR do cardápio.</p></Centro>;
  if (!canalPermitido) return mesaURL
    ? <Centro><span className="text-5xl">📵</span><p className="mt-3 font-black text-white">QR por mesa indisponível</p><p className="mt-1 text-sm text-slate-500">O QR Code por mesa está disponível nos modos Interno ou Ambos.</p></Centro>
    : <Centro><span className="text-5xl">📵</span><p className="mt-3 font-black text-white">Cardápio externo indisponível</p><p className="mt-1 text-sm text-slate-500">Esta empresa não habilitou o cardápio digital para o cliente.</p></Centro>;
  if (mesaURL && !mesaValida) return <Centro><span className="text-5xl">🚫</span><p className="mt-3 font-black text-white">QR Code inválido</p><p className="mt-1 text-sm text-slate-500">Esta mesa não foi encontrada ou está inativa. Fale com a equipe do estabelecimento.</p></Centro>;
  // Nunca libera o cardápio antes de saber se a mesa está ocupada — evita
  // qualquer flash do cardápio antes do modal de confirmação aparecer.
  if (mesaURL && podeMesa && mesaCadastrada && statusMesa === null) return <Centro><Spinner /><p className="mt-3 text-sm text-slate-400">Verificando a mesa…</p></Centro>;
  // Cliente recusou a confirmação de mesa ocupada — bloqueia e orienta a
  // escanear o QR certo (não deixa seguir para o cardápio).
  if (mesaURL && ocupacaoRecusada) return <Centro><span className="text-5xl">🔍</span><p className="mt-3 font-black text-white">Confira o QR Code</p><p className="mt-1 text-sm text-slate-500">Escaneie o QR Code afixado na sua mesa para continuar.</p></Centro>;
  // Confirmação OBRIGATÓRIA de mesa ocupada — status vem sempre do backend
  // (pub_status_mesa, migration 067), nunca de cache. Só aparece quando
  // realmente ocupada (nunca para mesa disponível) e bloqueia o cardápio até
  // o cliente responder.
  if (mesaURL && statusMesa?.ocupada && !ocupacaoConfirmada) {
    const numeroFmt = String(statusMesa.numero ?? mesaURL).padStart(2, "0");
    return (
      <div data-theme="light" className="tema-claro-area fixed inset-0 z-[130] flex min-h-screen w-full max-w-[100vw] items-center justify-center overflow-x-hidden bg-black/75 p-6 backdrop-blur-sm" style={{ minHeight: "100dvh" }}>
        <div role="alertdialog" aria-modal="true" aria-labelledby="msg-mesa-ocupada" className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-5 text-center">
          <p className="text-3xl">🍽️</p>
          <p id="msg-mesa-ocupada" className="mt-2 text-base font-black text-white">Esta mesa já está ocupada.</p>
          <p className="mt-1 text-sm text-slate-400">
            Você está realmente na <b className="text-white">Mesa {numeroFmt}{statusMesa.nome ? ` — ${statusMesa.nome}` : ""}</b>?
          </p>
          <p className="mt-2 text-xs text-slate-500">Ao continuar, seu pedido será adicionado aos pedidos já existentes desta mesa.</p>
          <div className="mt-4 flex flex-col gap-2">
            <button onClick={() => setOcupacaoConfirmada(true)} type="button" className="min-h-[44px] w-full rounded-2xl bg-[#D9A441] py-3 text-sm font-black text-[#182230] transition active:scale-95 hover:bg-[#C7922F]">
              Sim, estou na Mesa {numeroFmt}
            </button>
            <button onClick={() => setOcupacaoRecusada(true)} type="button" className="min-h-[44px] w-full rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 transition active:scale-95 hover:bg-white/10">
              Não, cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Tela de boas-vindas (somente no modo mesa via QR) ──────────
  if (etapa === "welcome") {
    return (
      <div data-theme="light" className="tema-claro-area flex min-h-screen w-full max-w-[100vw] flex-col overflow-x-hidden bg-[#F7F8FA] px-6 text-[#182230]"
        style={{ minHeight: "100dvh", paddingTop: "calc(env(safe-area-inset-top) + 2rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
          {loja.logoUrl ? <img src={loja.logoUrl} alt="" className="h-20 w-20 rounded-3xl border border-[#E5E7EB] object-cover shadow-[0_8px_24px_rgba(16,24,40,.08)]" /> : <LogoPP size={80} />}
          <h1 className="page-title mt-5 text-2xl font-bold tracking-tight text-[#182230]">{loja.nome}</h1>
          {currentTable && <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#F4D27A] bg-[#FFF7E0] px-4 py-1.5 text-sm font-bold text-[#9A6A00]">📍 {currentTable}</span>}
          <p className="mt-6 text-lg font-bold text-[#182230]">Bem-vindo! 👋</p>
          <p className="mt-1 text-sm leading-6 text-[#667085]">Faça seu pedido de forma rápida e prática direto pelo celular.</p>
          <div className="mt-8 w-full space-y-3">
            <button onClick={() => setEtapa("cardapio")} className="w-full min-h-[44px] rounded-2xl bg-[#D9A441] py-4 text-base font-black text-[#182230] shadow-[0_8px_24px_rgba(16,24,40,.08)] transition active:scale-95 hover:bg-[#C7922F]">Iniciar pedido</button>
            <button onClick={() => setEtapa("cardapio")} className="w-full min-h-[44px] rounded-2xl border border-[#E5E7EB] bg-white py-4 text-base font-bold text-[#475467] transition active:scale-95 hover:bg-[#F9FAFB]">Ver cardápio</button>
          </div>
          {!modoExterno && mesa && (
            <div className="mt-8 w-full">
              <p className="text-xs font-bold uppercase tracking-widest text-[#667085]">Precisa de algo?</p>
              <div className="mt-2 flex justify-center gap-2">
                {[["garcom", "🔔 Garçom"], ["ajuda", "🆘 Ajuda"], ["limpeza", "🧹 Limpeza"]].map(([t, l]) => (
                  <button key={t} onClick={() => chamar(t, l.replace(/^\S+\s/, ""))}
                    className="min-h-[44px] flex-1 rounded-2xl border border-[#F4D27A] bg-[#FFF7E0] py-2.5 text-xs font-black text-[#9A6A00] transition active:scale-95 hover:bg-[#FDECC8]">{l}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        {msg && <div className="mx-auto w-full max-w-md"><div className={`rounded-2xl border px-4 py-2.5 text-center text-sm font-bold ${msg.t === "error" ? "border-[#FDA4AF] bg-[#FFF1F2] text-[#B42318]" : "border-[#B7E4C7] bg-[#ECFDF3] text-[#147A4A]"}`}>{msg.m}</div></div>}
      </div>
    );
  }

  const minimoFalta = modoExterno && minimoExterno > 0 ? Math.max(0, minimoExterno - totalCart) : 0;
  const pagtoOk = formasPagto.length > 0 && formasPagto.some((f) => f.id === formaPagto);
  const podeEnviar = cart.length > 0 && pagtoOk && !bloqueioHorario && (!modoExterno || (
    aceitaExterno && opcoesEntrega.length > 0 && opcoesEntrega.some((o) => o.id === tipoPedido) && minimoFalta <= 0
  ));
  return (
    <div data-theme="light" className="tema-claro-area min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#F7F8FA] text-[#182230]" style={{ minHeight: "100dvh", paddingBottom: `calc(env(safe-area-inset-bottom) + ${cart.length > 0 ? 150 : 92}px)` }}>
      {/* Cabeçalho */}
      <header ref={headerRef} className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-white px-4 pb-3 backdrop-blur-xl" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {loja.logoUrl ? <img src={loja.logoUrl} alt="" className="h-12 w-12 rounded-2xl object-cover" /> : <LogoPP size={48} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-black text-[#182230] leading-tight">{loja.nome}</p>
            <p className="text-sm text-[#667085]">{currentTable ? `${currentTable}${comanda ? " · " + comanda : ""}` : "Cardápio digital"}</p>
          </div>
          {!modoExterno && mesa && (
            <button onClick={abrirQr} className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border border-[#F4D27A] bg-[#FFF7E0] px-3.5 py-2 text-xs font-black text-[#9A6A00] transition active:scale-95 hover:bg-[#FDECC8]">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="18" y1="14" x2="18" y2="18"/><line x1="21" y1="14" x2="21" y2="21"/></svg>
              Ver QR
            </button>
          )}
        </div>
        {/* Chamados — só no modo mesa (QR na mesa) */}
        {!modoExterno && mesa && (
          <div className="mx-auto mt-3 flex max-w-3xl gap-2">
            {[["garcom", "🔔", "Garçom"], ["ajuda", "🆘", "Ajuda"], ["limpeza", "🧹", "Limpeza"]].map(([t, ic, l]) => (
              <button key={t} onClick={() => chamar(t, l)}
                className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-2xl border border-[#F4D27A] bg-[#FFF7E0] py-2.5 text-sm font-black text-[#9A6A00] transition active:scale-95 hover:bg-[#FDECC8]"><span className="text-base">{ic}</span>{l}</button>
            ))}
          </div>
        )}
      </header>

      {bloqueioHorario && (
        <div className="mx-auto max-w-3xl px-4 pt-3">
          <div className="rounded-2xl border border-[#FDA4AF] bg-[#FFF1F2] px-4 py-2.5 text-center text-sm font-bold text-[#B42318]">🌙 Fechado no momento — pedidos indisponíveis fora do horário de funcionamento.</div>
        </div>
      )}

      <main className="mx-auto max-w-3xl px-4">
        {/* Categorias — clique rola até o grupo; ao rolar, o grupo atual é destacado */}
        <div ref={catBarRef} className="pp-noscrollbar sticky z-20 -mx-4 flex gap-2 overflow-x-auto border-b border-[#E5E7EB] bg-white/96 px-4 py-4 backdrop-blur" style={{ top: headerH }}>
          {cats.map((c) => { const ativo = !busca && catAtiva === c;
            return (
              <button key={c} ref={(el) => (chipRefs.current[c] = el)} onClick={() => irParaCategoria(c)} className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold transition ${ativo ? "border-[#D9A441] bg-[#FFF7E0] text-[#182230]" : "border-[#E5E7EB] bg-white text-[#475467] hover:bg-[#F9FAFB]"}`}>{ativo ? "★ " : ""}{c}</button>
            );
          })}
        </div>

        {/* Busca + Filtros — oculta no cardápio de acesso por link externo */}
        {!modoExterno && (
          <div className="flex items-center gap-2 py-3">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#98A2B3]">🔍</span>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produtos..." aria-label="Buscar produtos" type="search"
                className="w-full rounded-2xl border border-[#E5E7EB] bg-white py-3 pl-11 pr-4 text-sm text-[#182230] outline-none focus:border-[#D9A441] placeholder:text-[#98A2B3]" />
            </div>
            <button onClick={() => setOcultarIndisp((v) => !v)} type="button" title="Ocultar indisponíveis" aria-pressed={ocultarIndisp}
              className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-2xl border px-4 py-3 text-sm font-bold transition ${ocultarIndisp ? "border-[#D9A441] bg-[#D9A441] text-[#182230]" : "border-[#E5E7EB] bg-white text-[#475467]"}`}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>
              Filtros
            </button>
          </div>
        )}

        {/* Ofertas vigentes */}
        {promosVigentes.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#9A6A00]">🔥 Ofertas de hoje</p>
            <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
              {promosVigentes.map((p) => {
                const ehCombo = p.tipo === "combo";
                const val = validadeOferta(p);
                return (
                  <button key={p.id} type="button" onClick={() => clicarOferta(p)}
                    className={`group flex min-w-[200px] shrink-0 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left shadow-[0_8px_24px_rgba(16,24,40,.06)] transition active:scale-[0.97] ${ehCombo ? "border-[#B7E4C7] bg-[#ECFDF3]" : "border-[#F4D27A] bg-[#FFF7E0]"}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${ehCombo ? "bg-white" : "bg-white"}`}>{iconeOferta(p)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-[#182230]">{p.nome}</p>
                      <p className={`truncate text-xs font-black ${ehCombo ? "text-[#147A4A]" : "text-[#9A6A00]"}`}>{promoResumoDesconto(p)}</p>
                      {val && <p className="truncate text-[10px] font-bold text-[#667085]">📅 {val}</p>}
                    </div>
                    <span className="shrink-0 text-[#98A2B3] transition group-hover:translate-x-0.5">›</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Combos — pacotes com preço fechado (adiciona todos os produtos de uma vez) */}
        {combosVigentes.length > 0 && (
          <div ref={combosRef} className="mb-4 space-y-2 scroll-mt-28">
            {combosVigentes.map((c) => (
              <div key={c.promo.id} className="rounded-2xl border border-[#B7E4C7] bg-[#ECFDF3] p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-black text-[#182230]">🍔 {c.promo.nome} <span className="rounded-full bg-[#16A34A] px-1.5 py-0.5 text-[9px] font-black text-white">COMBO</span></p>
                    {c.promo.descricao && <p className="mt-0.5 text-[11px] text-[#667085]">{c.promo.descricao}</p>}
                    <p className="mt-1 text-[11px] text-[#475467]">{c.itens.map((i) => i.name).join(" + ")}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {c.precoCombo < c.somaOriginal && <p className="text-[11px] font-bold text-[#98A2B3] line-through">{formatCurrency(c.somaOriginal)}</p>}
                    <p className="text-lg font-black text-[#147A4A]">{formatCurrency(c.precoCombo)}</p>
                  </div>
                </div>
                <button onClick={() => adicionarCombo(c)} className="mt-2.5 w-full min-h-[44px] rounded-xl bg-[#16A34A] py-2.5 text-sm font-black text-white transition active:scale-95 hover:bg-[#128A3E]">+ Adicionar combo</button>
              </div>
            ))}
          </div>
        )}

        {/* Aviso de personalização */}
        <div className="mb-3 mt-4 flex items-center gap-2 rounded-2xl border border-[#F4D27A] bg-[#FFF7E0] px-4 py-2.5">
          <span className="text-lg">✨</span>
          <p className="text-xs font-bold text-[#9A6A00]">Personalize do seu jeito! <span className="font-normal text-[#475467]">Adicione ou remova ingredientes.</span></p>
        </div>

        {/* Resultados da busca — lista achatada (sem divisão por grupo) */}
        {busca ? (
          <div className="grid grid-cols-1 gap-3 pb-6 sm:grid-cols-2">
            {itensBusca.length === 0 && <p className="col-span-full py-10 text-center text-sm text-[#667085]">Nenhum produto encontrado.</p>}
            {itensBusca.map(renderProduto)}
          </div>
        ) : (
          /* Cardápio dividido por grupo — cada seção é âncora do scroll-spy */
          <div className="pb-6">
            {grupos.length === 0 && <p className="py-10 text-center text-sm text-[#667085]">Nenhum produto disponível.</p>}
            {grupos.map((g) => (
              <section key={g.nome} ref={(el) => (secRefs.current[g.nome] = el)} data-cat={g.nome} className="scroll-mt-28">
                <div className="sticky z-10 -mx-4 mb-3 mt-1 flex items-center gap-2 bg-[#F7F8FA]/95 px-4 py-1.5 backdrop-blur" style={{ top: headerH + catBarH }}>
                  <span className="h-4 w-1 rounded-full bg-[#D9A441]" />
                  <h2 className="text-sm font-black uppercase tracking-wide text-[#182230]">{g.nome}</h2>
                  <span className="text-[11px] font-bold text-[#98A2B3]">{g.produtos.length} {g.produtos.length === 1 ? "item" : "itens"}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {g.produtos.map(renderProduto)}
                </div>
              </section>
            ))}
            {/* Espaçador mínimo: deixa o último grupo encostar no topo ao rolar, sem sobra. */}
            <div aria-hidden style={{ height: spacerH }} />
          </div>
        )}
      </main>


      {/* Barra inferior fixa — resumo/Finalizar + Acompanhar/Carrinho */}
      <div className="fixed inset-x-0 bottom-0 z-40" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto max-w-3xl space-y-2 px-3 pb-2 pt-1">
          {cart.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-3xl border border-[#F4D27A] bg-white p-3 shadow-[0_8px_24px_rgba(16,24,40,.1)] backdrop-blur-xl">
              <button onClick={() => setAba("carrinho")} className="flex min-w-0 items-center gap-3 text-left">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFF7E0] text-lg text-[#9A6A00]">🛒<span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#D9A441] px-1 text-[11px] font-black text-[#182230]">{qtdCart}</span></span>
                <span className="min-w-0"><span className="block text-sm font-black text-[#182230]">Ver carrinho</span><span className="block text-xs text-[#667085]">{qtdCart} {qtdCart === 1 ? "item" : "itens"} · {formatCurrency(totalCart)}</span></span>
              </button>
              <button onClick={() => setAba("carrinho")} className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-2xl bg-[#D9A441] px-4 py-3 text-sm font-black text-[#182230] transition active:scale-95 hover:bg-[#C7922F]">Finalizar pedido ›</button>
            </div>
          )}
          {cart.length === 0 ? (
            // Carrinho vazio: dá acesso direto ao carrinho + acompanhar
            <div className="flex items-stretch gap-2 rounded-3xl border border-[#E5E7EB] bg-white p-2 shadow-[0_8px_24px_rgba(16,24,40,.1)] backdrop-blur-xl">
              <button onClick={() => setAba("conta")} disabled={meusPedidos.length === 0}
                className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] py-3 text-sm font-black transition active:scale-95 ${meusPedidos.length === 0 ? "bg-[#F3F4F6] text-[#98A2B3]" : "bg-white text-[#2563EB]"}`}>👁️ Acompanhar pedido</button>
              <button onClick={() => setAba("carrinho")}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F3F4F6] py-3 text-sm font-black text-[#98A2B3] transition active:scale-95">🛒 Carrinho vazio</button>
            </div>
          ) : (
            // Com itens: o carrinho já está na barra dourada acima — aqui só acompanhar
            <button onClick={() => setAba("conta")} disabled={meusPedidos.length === 0}
              className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-3xl border border-[#E5E7EB] py-3.5 text-sm font-black shadow-[0_8px_24px_rgba(16,24,40,.1)] backdrop-blur-xl transition active:scale-95 ${meusPedidos.length === 0 ? "bg-[#F3F4F6] text-[#98A2B3]" : "bg-white text-[#2563EB]"}`}>👁️ Acompanhar pedido</button>
          )}
        </div>
      </div>

      {/* Mensagem */}
      {msg && (
        <div className={`fixed inset-x-0 z-[120] flex justify-center px-4`} style={{ bottom: "96px" }}>
          <div className={`rounded-2xl border px-4 py-2.5 text-sm font-bold shadow-xl ${msg.t === "error" ? "border-[#FDA4AF] bg-[#FFF1F2] text-[#B42318]" : "border-[#B7E4C7] bg-[#ECFDF3] text-[#147A4A]"}`}>{msg.m}</div>
        </div>
      )}

      {/* Pesquisa de Satisfação (na finalização do pedido) */}
      {survey && <SatisfactionSurvey onEnviar={finalizarComPesquisa} onPular={finalizarSemPesquisa} />}

      {/* Modal de produto (reutilizado) */}
      {detalhe && <ProdutoModal produto={detalhe} grupos={gruposOpcoes} opcoes={opcoes} onFechar={() => setDetalhe(null)} onAdicionar={addConfigurado} />}

      {/* Confirmação ao remover item de combo */}
      {comboRemover && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm" onClick={() => setComboRemover(null)}>
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-3xl">🍔</p>
            <p className="mt-2 text-base font-black text-white">Sair do combo?</p>
            <p className="mt-1 text-sm text-slate-400">Ao remover <b className="text-white">{comboRemover.name}</b>, o combo <b className="text-emerald-300">{comboRemover.comboNome}</b> será desfeito. Os demais itens deixam a regra do combo e <b className="text-amber-300">voltam ao preço normal</b>.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setComboRemover(null)} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10">Manter combo</button>
              <button onClick={() => desfazerCombo(comboRemover)} className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-black text-white hover:bg-red-400">Remover assim mesmo</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação obrigatória antes de esvaziar o carrinho inteiro */}
      {confirmarLimpar && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm" onClick={() => setConfirmarLimpar(false)}>
          <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-3xl">🗑️</p>
            <p className="mt-2 text-base font-black text-white">Limpar o carrinho?</p>
            <p className="mt-1 text-sm text-slate-400">Todos os {qtdCart} {qtdCart === 1 ? "item" : "itens"} do seu pedido serão removidos.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmarLimpar(false)} type="button" className="min-h-[44px] flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10">Manter itens</button>
              <button onClick={limparCarrinho} type="button" className="min-h-[44px] flex-1 rounded-2xl bg-red-500 py-3 text-sm font-black text-white hover:bg-red-400">Limpar tudo</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal "Ver QR" — QR do link deste cardápio */}
      {qrModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm" onClick={() => setQrModal(null)}>
          <div className="w-full max-w-xs rounded-3xl border border-white/10 bg-slate-900 p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-black text-white">{currentTable || loja.nome}</p>
            <img src={qrModal} alt="QR do cardápio" className="mx-auto w-full rounded-2xl bg-white p-2" />
            <p className="mt-3 text-xs text-slate-400">Aponte a câmera para abrir este cardápio</p>
            <button onClick={() => setQrModal(null)} className="mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.06] py-2.5 text-sm font-black text-slate-300">Fechar</button>
          </div>
        </div>
      )}

      {/* Gaveta: Carrinho */}
      {aba === "carrinho" && (
        <Gaveta titulo="🛒 Seu pedido" onFechar={() => setAba(null)}>
          {bloqueioHorario && (
            <div className="mb-3 rounded-2xl border border-[#FDA4AF] bg-[#FFF1F2] px-4 py-3 text-center">
              <p className="text-sm font-bold text-[#B42318]">🌙 Estabelecimento fechado no momento</p>
              <p className="mt-0.5 text-xs font-medium text-[#7F1D1D]">Consulte os horários de atendimento.</p>
            </div>
          )}
          {cart.length === 0 ? <p className="py-8 text-center text-sm text-[#667085]">Carrinho vazio.</p> : (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-[#9A6A00]">1. Revise seu pedido</p>
                <button onClick={() => setConfirmarLimpar(true)} type="button" className="min-h-[32px] rounded-lg px-2 text-xs font-bold text-[#B42318] transition hover:bg-[#FFF1F2]">Limpar carrinho</button>
              </div>
              <div className="space-y-2.5">
              {cart.map((i) => (
                <div key={i._uid} className={`flex items-center justify-between gap-3 rounded-2xl border bg-white p-3.5 shadow-[0_8px_24px_rgba(16,24,40,.06)] ${i.comboId ? "border-[#B7E4C7]" : "border-[#E5E7EB]"}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-black leading-snug text-[#182230]">{i.quantity}× {i.name}</p>
                    {i.comboId && <p className="mt-0.5 truncate text-[11px] font-bold text-[#147A4A]">🍔 Combo: {i.comboNome}</p>}
                    {(i.removedIngredients?.length > 0 || i.extraIngredients?.length > 0 || i.observation) && (
                      <p className="mt-1 text-[11px] leading-4 text-[#9A6A00]">
                        {i.removedIngredients?.length > 0 && <>Sem: {i.removedIngredients.join(", ")}<br /></>}
                        {i.extraIngredients?.length > 0 && <>Com: {i.extraIngredients.join(", ")}<br /></>}
                        {i.observation}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-sm font-bold text-[#182230]">{formatCurrency(i.price * i.quantity)}</span>
                    <button onClick={() => pedirRemover(i)} className="min-h-[32px] rounded-lg border border-[#FDA4AF] bg-[#FFF1F2] px-2.5 py-1 text-xs font-black text-[#B42318] transition hover:bg-[#FEE2E2]">Remover</button>
                  </div>
                </div>
              ))}
              </div>
            </>
          )}
          {modoExterno ? (
            // Pedido externo (link de divulgação) — regras da empresa + nome + telefone
            <div className="mt-4 space-y-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-[#9A6A00]">2. Identifique-se e confirme a entrega</p>
              {!aceitaExterno ? (
                <div className="rounded-2xl border border-[#FDE1B0] bg-[#FFF4E5] px-4 py-3 text-sm font-bold text-[#B45309]">
                  🚫 Esta empresa não está aceitando pedidos pelo cardápio no momento.
                </div>
              ) : opcoesEntrega.length === 0 ? (
                <div className="rounded-2xl border border-[#FDE1B0] bg-[#FFF4E5] px-4 py-3 text-sm font-bold text-[#B45309]">
                  Nenhuma forma de pedido disponível no momento.
                </div>
              ) : (
                <div>
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-[#667085]">Como deseja receber? <span className="text-[#B45309]">*</span></span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {opcoesEntrega.map((o) => (
                      <button key={o.id} type="button" onClick={() => setTipoPedido(o.id)}
                        className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-black transition ${tipoPedido === o.id ? "border-[#16A34A] bg-[#ECFDF3] text-[#047857]" : "border-[#E5E7EB] bg-white text-[#475467] hover:bg-[#F8FAFC]"}`}>
                        <span>{o.icon}</span><span>{o.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-[#667085]">Telefone (WhatsApp) <span className="text-[#B45309]">*</span></span>
                  <input type="tel" inputMode="numeric" autoComplete="tel" value={mascararTelefone(telefone)} onChange={(e) => setTelefone(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="(11) 98765-4321" maxLength={16}
                    className="w-full min-h-[44px] rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm font-black text-[#182230] outline-none transition focus:border-[#D9A441] placeholder:font-normal placeholder:text-[#98A2B3]" /></label>
                <label><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-[#667085]">Seu nome <span className="text-[#B45309]">*</span></span>
                  <input autoComplete="name" value={cliente} onChange={(e) => setCliente(capitalizarNome(e.target.value))} placeholder="Nome completo"
                    className="w-full min-h-[44px] rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm text-[#182230] outline-none transition focus:border-[#D9A441] placeholder:text-[#98A2B3]" /></label>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-4 text-[11px] font-black uppercase tracking-widest text-[#9A6A00]">2. Confirme sua mesa</p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-[#667085]">Mesa <span className="text-[#B45309]">*</span></span>
                  <input type="tel" inputMode="numeric" value={mesa} onChange={(e) => setMesa(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Nº" disabled={!!mesaURL}
                    className="w-full min-h-[44px] rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm font-black text-[#182230] outline-none transition focus:border-[#D9A441] disabled:bg-[#F8FAFC] disabled:text-[#667085]" /></label>
                <label><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-[#667085]">Seu nome (opcional)</span>
                  <input value={cliente} onChange={(e) => setCliente(capitalizarNome(e.target.value))} placeholder="Nome" className="w-full min-h-[44px] rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm text-[#182230] outline-none transition focus:border-[#D9A441] placeholder:text-[#98A2B3]" /></label>
              </div>
              {!comURL && (
                <div className="mt-3"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-[#667085]">Comanda <span className="text-[#B45309]">*</span></span>
                  <input value={comanda} onChange={(e) => setComanda(e.target.value.toUpperCase())} placeholder={`Ex.: ${loja.prefixo}-000001`}
                    className="w-full min-h-[44px] rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2.5 font-mono text-sm font-black tracking-widest text-[#182230] outline-none transition focus:border-[#D9A441] placeholder:font-sans placeholder:font-normal placeholder:text-[#98A2B3]" />
                  <p className="mt-1 text-[11px] text-[#667085]">Escaneie o QR Code da mesa ou digite a comanda.</p></div>
              )}
            </>
          )}
          {/* Forma de pagamento (aba "Pagamento") — pedido interno e externo */}
          {formasPagto.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[11px] font-black uppercase tracking-widest text-[#9A6A00]">3. Forma de pagamento <span className="font-bold normal-case text-[#B45309]">*</span></p>
              <div className="grid grid-cols-3 gap-2">
                {formasPagto.map((f) => (
                  <button key={f.id} type="button" onClick={() => setFormaPagto(f.id)}
                    className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl border px-2 py-2.5 text-sm font-black transition ${formaPagto === f.id ? "border-[#16A34A] bg-[#ECFDF3] text-[#047857]" : "border-[#E5E7EB] bg-white text-[#475467] hover:bg-[#F8FAFC]"}`}>
                    <span>{f.icon}</span><span>{f.label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-[#667085]">Pagamento: <span className="font-bold text-[#475467]">{momentoPagto}</span>.</p>
            </div>
          )}
          {economiaCart > 0 && (
            <div className="mt-3 flex items-center justify-center gap-1.5 rounded-2xl border border-[#B7E4C7] bg-[#ECFDF3] px-3 py-2 text-sm font-black text-[#147A4A]">💚 Você economizou {formatCurrency(economiaCart)} nesta compra!</div>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-[#E5E7EB] pt-3"><span className="text-sm text-[#475467]">Total</span><span className="text-xl font-black text-[#9A6A00]">{formatCurrency(totalCart)}</span></div>
          {modoExterno && minimoExterno > 0 && (
            <p className={`mt-2 text-xs font-bold ${minimoFalta > 0 ? "text-[#B45309]" : "text-[#147A4A]"}`}>
              {minimoFalta > 0 ? `Pedido mínimo de ${formatCurrency(minimoExterno)} — faltam ${formatCurrency(minimoFalta)}.` : `✓ Pedido mínimo de ${formatCurrency(minimoExterno)} atingido.`}
            </p>
          )}
          <button onClick={enviar} disabled={!podeEnviar || enviando}
            className={`mt-3 w-full min-h-[44px] rounded-2xl py-4 text-sm font-black transition active:scale-95 ${(!podeEnviar || enviando) ? "bg-[#F3F4F6] text-[#98A2B3]" : "bg-[#D9A441] text-[#182230] hover:bg-[#C7922F]"}`}>
            {enviando ? "Enviando…" : bloqueioHorario ? "Pedido indisponível no momento" : "🚀 Enviar pedido"}
          </button>
        </Gaveta>
      )}

      {/* Gaveta: Acompanhar / Conta */}
      {aba === "conta" && (
        <Gaveta titulo={`🧾 ${modoExterno ? "Meus pedidos" : (currentTable || "Conta")}`} onFechar={() => setAba(null)}>
          {meusPedidos.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Nenhum pedido para acompanhar ainda.</p> : (
            <div className="space-y-2">
              {meusPedidos.map((o) => (
                <div key={o.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-widest text-slate-500">Pedido nº {String(o.id || "").replace(/\D/g, "").slice(-4)} • {o.createdAt}</span>
                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusMap[o.status]?.chip}`}>{STATUS_TABLET_LABEL[o.status] || statusMap[o.status]?.label}</span></div>
                  <TimelinePedido status={o.status} paymentStatus={o.paymentStatus} setorStatus={o.setorStatus} setoresPedido={setoresDoPedido(o)} externo={modoExterno || o.table === "Externo"} />
                  <div className="mt-2 border-t border-white/10 pt-2">
                    {o.items.map((it, idx) => <div key={idx} className="flex justify-between text-sm py-0.5"><span className="text-slate-300"><b className="text-white">{it.quantity}×</b> {it.name}</span><span className="font-bold text-white">{formatCurrency(it.price * it.quantity)}</span></div>)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {meusPedidos.length > 0 && (
            <>
              <div className="mt-4 space-y-1 border-t border-white/10 pt-3">
                <div className="flex justify-between text-sm text-slate-400"><span>Subtotal</span><span className="text-white">{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-sm text-slate-400"><span>Taxa de serviço (10%)</span><span className="text-white">{formatCurrency(subtotal * 0.1)}</span></div>
                <div className="flex justify-between text-lg font-black text-white"><span>Total</span><span className="text-emerald-400">{formatCurrency(totalMesa)}</span></div>
              </div>
              <button onClick={solicitarConta} disabled={!podeFechar}
                className={`mt-3 w-full rounded-2xl py-4 text-sm font-black text-white transition active:scale-95 disabled:opacity-40 ${contaSolicitada ? "bg-amber-500" : "bg-gold-500 hover:bg-gold-400"}`}>
                {contaSolicitada ? "🔁 Reenviar conta ao caixa" : "🧾 Solicitar fechamento da conta"}
              </button>
              {!podeFechar && <p className="mt-2 text-center text-xs text-slate-500">Disponível quando todos os pedidos forem entregues.</p>}
            </>
          )}
        </Gaveta>
      )}
    </div>
  );
}

function Centro({ children }) {
  return <div data-theme="light" className="tema-claro-area flex min-h-screen w-full max-w-[100vw] flex-col items-center justify-center overflow-x-hidden bg-[#F7F8FA] px-6 text-center text-[#182230]" style={{ minHeight: "100dvh" }}>{children}</div>;
}
function Spinner() { return <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-500" />; }

// Skeleton do primeiro carregamento — repete o formato real (cabeçalho +
// categorias + grade de cards) em vez de um spinner solto, pra reduzir a
// sensação de espera. Mesmo padrão já usado no projeto (animate-pulse +
// blocos cinza claro), sem CSS novo.
function BlocoSkeleton({ className }) { return <div className={`animate-pulse rounded-full bg-[#F1F5F9] ${className}`} />; }
function CardapioSkeleton() {
  return (
    <div data-theme="light" className="tema-claro-area min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#F7F8FA]" style={{ minHeight: "100dvh" }} aria-busy="true" aria-label="Carregando cardápio">
      <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-white px-4 pb-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-[#F1F5F9]" />
          <div className="min-w-0 flex-1 space-y-2">
            <BlocoSkeleton className="h-4 w-32" />
            <BlocoSkeleton className="h-3 w-20" />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4">
        <div className="flex gap-2 border-b border-[#E5E7EB] py-4">
          {[76, 60, 92, 68].map((w, i) => <div key={i} className="h-8 shrink-0 animate-pulse rounded-full bg-[#F1F5F9]" style={{ width: w }} />)}
        </div>
        <div className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 rounded-[1.25rem] border border-[#E5E7EB] bg-white p-3">
              <div className="h-[88px] w-[88px] shrink-0 animate-pulse rounded-2xl bg-[#F1F5F9]" />
              <div className="min-w-0 flex-1 space-y-2 py-1">
                <BlocoSkeleton className="h-3.5 w-4/5" />
                <BlocoSkeleton className="h-2.5 w-full" />
                <BlocoSkeleton className="h-2.5 w-3/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Linha do tempo do status do pedido — recebido → (cozinha / bar) → mesa → entregue
function TimelinePedido({ status, paymentStatus = "open", setorStatus = {}, setoresPedido = [], externo = false }) {
  if (status === "cancelled") return <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300">Pedido cancelado.</p>;
  const ordem = ["received", "preparing", "ready", "delivered"];
  const idx = Math.max(0, ordem.indexOf(status));
  const linha = ({ feito, ativo, ic, l, sub }) => (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${feito ? "bg-emerald-500/20 text-emerald-300" : "bg-white/[0.06] text-slate-600"}`}>{feito ? ic : "•"}</span>
      <span className={`text-xs font-bold ${ativo ? "text-gold-300" : feito ? "text-slate-200" : "text-slate-600"}`}>{l}</span>
      {sub && <span className="ml-auto rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-slate-300">{sub}</span>}
    </div>
  );
  // Status de um setor: pronto (setorStatus) → senão deriva do status geral
  const stSetor = (s) => {
    if (setorStatus?.[s] === "ready") return { feito: true, ativo: false, sub: "Pronto" };
    if (status === "received") return { feito: false, ativo: false, sub: "Na fila" };
    if (status === "preparing") return { feito: false, ativo: true, sub: "Em preparo" };
    return { feito: true, ativo: false, sub: "Pronto" }; // ready/delivered
  };
  const presentes = setoresPedido.length ? setoresPedido : ["Cozinha"];
  const iconeSetor = (s) => /bar|bebida|drink/i.test(s) ? "🍹" : /sobremesa|doce|sweet|confeit/i.test(s) ? "🍰" : "👨‍🍳";
  return (
    <div className="space-y-1.5">
      {linha({ feito: idx >= 0, ativo: status === "received", ic: "✅", l: "Pedido recebido" })}
      {presentes.map((s) => <div key={s}>{linha({ ...stSetor(s), ic: iconeSetor(s), l: `Preparo · ${s}` })}</div>)}
      {linha({ feito: idx >= 2, ativo: status === "ready", ic: externo ? "🛍️" : "🛎️", l: externo ? "Pronto — liberado para retirada no balcão" : "Pronto — saindo para a mesa" })}
      {linha({ feito: idx >= 3, ativo: status === "delivered", ic: externo ? "🛍️" : "🍽️", l: externo ? "Retirado" : "Entregue" })}
      {linha({ feito: paymentStatus === "paid", ativo: paymentStatus === "requested", ic: "💳", l: paymentStatus === "paid" ? "Pagamento confirmado" : paymentStatus === "requested" ? "Pagamento — aguardando no caixa" : "Pagamento pendente" })}
    </div>
  );
}
function Gaveta({ titulo, onFechar, children }) {
  useScrollLock(); // trava a rolagem do fundo enquanto a gaveta está aberta
  // Acompanha o "visual viewport" (área visível) para a gaveta sentar ACIMA do teclado
  // do celular — assim o campo focado nunca fica escondido.
  const [vp, setVp] = useState(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const upd = () => setVp({ h: Math.round(vv.height), top: Math.round(vv.offsetTop) });
    upd();
    vv.addEventListener("resize", upd);
    vv.addEventListener("scroll", upd);
    return () => { vv.removeEventListener("resize", upd); vv.removeEventListener("scroll", upd); };
  }, []);
  const overlayStyle = vp ? { top: vp.top, height: vp.h, bottom: "auto" } : undefined;
  const sheetMax = vp ? `${vp.h - 8}px` : "88dvh";
  const bodyMax = vp ? `${vp.h - 72}px` : "calc(88dvh - 64px)";
  return (
    <div data-theme="light" className="tema-claro-area fixed inset-x-0 top-0 z-[110] flex w-full max-w-[100vw] items-end justify-center overflow-x-hidden bg-black/60 backdrop-blur-sm" style={overlayStyle} onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl rounded-t-[24px] border border-[#E5E7EB] bg-white shadow-[0_8px_24px_rgba(16,24,40,.08)]" style={{ maxHeight: sheetMax, paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-[24px] border-b border-[#E5E7EB] bg-white px-5 py-4"><h2 className="text-lg font-black text-[#182230]">{titulo}</h2><button onClick={onFechar} className="min-h-[44px] rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-2 text-sm font-black text-[#475467] transition hover:bg-[#F3F4F6]">Fechar ✕</button></div>
        <div className="pp-overscroll-contain overflow-y-auto px-4 py-4 sm:px-5" style={{ maxHeight: bodyMax }}>{children}</div>
      </div>
    </div>
  );
}
