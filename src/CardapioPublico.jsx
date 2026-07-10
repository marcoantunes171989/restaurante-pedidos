import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchLojas, fetchProdutos, fetchCategorias, fetchPromocoes, fetchGruposOpcoes, fetchOpcoes, fetchSetoresCozinha,
  escutarLojas, inserirPedido, atualizarPedido, escutarPedidos,
  buscarClientePorTelefone, upsertCliente, criarChamado,
  rpcCriarPedidoPublico, rpcUpsertClientePublico, rpcBuscarClientePublico, rpcPedidosComanda, rpcPedidosCliente, rpcSolicitarContaPublico, rpcCriarChamadoPublico,
  rpcPesquisaSatisfacao, inserirPesquisaSatisfacao,
} from "./lib/supabase";
import { cardapioViaRpc } from "./lib/authMode";
import { useScrollLock } from "./lib/scrollLock";
import SatisfactionSurvey from "./components/SatisfactionSurvey";
import {
  ProdutoModal, formatCurrency, fallbackImage, statusMap, STATUS_TABLET_LABEL, isValidCommand,
  promocaoVigente, promoResumoDesconto,
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
// Verdadeiro se a loja está aberta AGORA conforme os horários { seg..dom: "HH:MM–HH:MM" }.
// Trata faixa que vira a meia-noite (ex.: "18:00–02:00"). Dia sem faixa = fechado.
function lojaAbertaAgora(horarios, agora = new Date()) {
  const dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  const faixa = (horarios || {})[dias[agora.getDay()]];
  if (!faixa || !/\d/.test(String(faixa))) return false;
  const [abre, fecha] = String(faixa).split("–").map((s) => (s || "").trim());
  if (!/^\d{1,2}:\d{2}$/.test(abre || "") || !/^\d{1,2}:\d{2}$/.test(fecha || "")) return false;
  const min = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + (m || 0); };
  const nowMin = agora.getHours() * 60 + agora.getMinutes();
  const aMin = min(abre), fMin = min(fecha);
  return fMin > aMin ? (nowMin >= aMin && nowMin < fMin) : (nowMin >= aMin || nowMin < fMin);
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
  const comURL   = (params.get("c") || "").toUpperCase();

  const [loja, setLoja]           = useState(undefined); // undefined=carregando, null=não achou
  const [produtos, setProdutos]   = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [promocoes, setPromocoes] = useState([]);
  const [gruposOpcoes, setGruposOpcoes] = useState([]);
  const [opcoes, setOpcoes] = useState([]);
  const [setores, setSetores] = useState([]);
  const [orders, setOrders]       = useState([]);
  const [busca, setBusca]         = useState("");
  const [cart, setCart]           = useState([]);
  const [detalhe, setDetalhe]     = useState(null);
  const [mesa, setMesa]           = useState(mesaURL);
  const [comanda, setComanda]     = useState(comURL);
  const [cliente, setCliente]     = useState("");
  const [telefone, setTelefone]   = useState("");
  const [clienteSalvo, setClienteSalvo] = useState(false); // telefone já tem cadastro
  const modoExterno = !mesaURL; // link geral (divulgação) → pedido externo (delivery/retirada)
  const [aba, setAba]             = useState(null); // null | 'carrinho' | 'conta'
  const [qrModal, setQrModal]     = useState(null); // dataURL do QR do cardápio (botão "Ver QR")
  const [survey, setSurvey]       = useState(null); // pesquisa de satisfação na finalização: { pedidoId, mesa, origem }
  const [ocultarIndisp, setOcultarIndisp] = useState(false); // botão "Filtros": ocultar indisponíveis
  const [enviando, setEnviando]   = useState(false);
  const [msg, setMsg]             = useState(null);
  // Restyle app-mesa: tela de boas-vindas + sugestão de bebida
  const [etapa, setEtapa]         = useState(mesaURL ? "welcome" : "cardapio"); // welcome | cardapio
  const [sugBebida, setSugBebida] = useState(false);  // mostra sugestão de bebida
  const [sugFechada, setSugFechada] = useState(false); // usuário dispensou a sugestão
  const [tipoPedido, setTipoPedido] = useState(""); // pedido externo: local | retirada | entrega (config_externo)
  const [formaPagto, setFormaPagto] = useState(""); // forma de pagamento: pix | cartao | dinheiro (config_externo)
  const [agora, setAgora] = useState(() => new Date()); // relógio p/ reavaliar aberto/fechado ao vivo
  const [comboRemover, setComboRemover] = useState(null); // item de combo aguardando confirmação de remoção

  // Carrega empresa (por prefixo) + produtos + categorias
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [lojas, prods, cats, promos, grps, ops, sets] = await Promise.all([fetchLojas(), fetchProdutos(), fetchCategorias(), fetchPromocoes().catch(() => []), fetchGruposOpcoes().catch(() => []), fetchOpcoes().catch(() => []), fetchSetoresCozinha().catch(() => [])]);
        if (!vivo) return;
        const l = lojas.find((x) => x.prefixo === prefixo) || null;
        setLoja(l);
        if (l) {
          setGruposOpcoes((grps || []).filter((g) => g.lojaId === l.id));
          setOpcoes((ops || []).filter((o) => o.lojaId === l.id));
          setSetores((sets || []).filter((s) => s.lojaId == null || s.lojaId === l.id));
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

  const podeExterno = loja && (loja.modoUso === "externo" || loja.modoUso === "ambos");
  // Configurações do pedido externo (aba "Pedido externo" — config_externo)
  const cfgExt = loja?.configExterno || {};
  const aceitaExterno = cfgExt.aceitaPedidoExterno !== false; // padrão: aceita
  const opcoesEntrega = [
    cfgExt.consumoLocal !== false && { id: "local",    label: "Consumir no local", icon: "🍽️" },
    cfgExt.retirada     !== false && { id: "retirada", label: "Retirada no balcão", icon: "🛍️" },
    cfgExt.entrega      === true  && { id: "entrega",  label: "Entrega (delivery)", icon: "🛵" },
  ].filter(Boolean);
  const minimoExterno = parseMoedaBR(cfgExt.pedidoMinimo); // número em reais (0 = sem mínimo)
  // Horários de funcionamento (aba "Horários") — reavaliado ao vivo via `agora`
  const abertoAgora = lojaAbertaAgora(cfgExt.horarios, agora);
  const bloqueioHorario = cfgExt.bloquearForaHorario === true && !abertoAgora; // fechado e bloqueando
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
  const catBarRef = useRef(null); // barra sticky de categorias — usada p/ calcular offset real
  const [catAtiva, setCatAtiva] = useState("Todos");
  // Espaçador dinâmico ao fim: exatamente o necessário para o ÚLTIMO grupo encostar
  // no topo ao rolar — sem sobra extra (não deixa "passar do topo").
  const [spacerH, setSpacerH] = useState(0);
  useEffect(() => {
    if (busca || !grupos.length) return;
    // Calcula o grupo atual: o último cujo cabeçalho passou da "linha" (abaixo dos
    // headers fixos). Determinístico e correto mesmo com seções curtas.
    const calc = () => {
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
      let atual = grupos[0]?.nome;
      for (const g of grupos) {
        const el = secRefs.current[g.nome];
        if (el && el.getBoundingClientRect().top - linha <= 0) atual = g.nome;
      }
      setCatAtiva((cur) => (cur === atual ? cur : atual));
    };
    // rAF-throttle: o destaque acompanha a rolagem sem travar (mais fluido em iOS/Android).
    let raf = 0;
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; calc(); }); };
    const obs = new IntersectionObserver(onScroll, { threshold: [0, 0.5, 1], rootMargin: "-100px 0px 0px 0px" });
    Object.values(secRefs.current).forEach((el) => el && obs.observe(el));
    calc();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { obs.disconnect(); cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [busca, grupos]);
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
              <img src={item.imageUrl || fallbackImage} alt={item.name} className={`h-full w-full object-cover ${indisponivel ? "grayscale opacity-50" : ""}`} />
            </button>
            {personalizavel && !indisponivel && (
              <button onClick={abrir} aria-label="Personalizar" title="Personalizar" className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-[#F4D27A] bg-white text-[#9A6A00] shadow-[0_4px_12px_rgba(16,24,40,.1)]">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="2" fill="currentColor" stroke="none"/></svg>
              </button>
            )}
            {promo && !indisponivel && <span className="absolute right-1.5 top-1.5 rounded-full bg-[#16A34A] px-1.5 py-0.5 text-[9px] font-black text-white shadow-[0_4px_12px_rgba(16,24,40,.1)]">{promo.label}</span>}
            {indisponivel && <span className="absolute left-1/2 top-1/2 w-max -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#E5E7EB] bg-white/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#667085]">Indisponível</span>}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-black leading-tight text-[#182230] line-clamp-2">{item.name}</h3>
            <p className="mt-1 text-[11px] leading-4 text-[#667085]">{item.description}</p>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between px-3 pb-3">
          {promo
            ? <span className="flex flex-col leading-none"><span className="text-[11px] font-bold text-[#98A2B3] line-through">{formatCurrency(promo.original)}</span><span className="text-base font-black text-[#147A4A]">{formatCurrency(promo.preco)}</span></span>
            : <span className="text-base font-black text-[#9A6A00]">{formatCurrency(item.price)}</span>}
          {indisponivel
            ? <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E5E7EB] bg-[#F3F4F6] text-[#98A2B3]">✕</span>
            : <button onClick={abrir} aria-label="Adicionar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#D9A441] text-xl font-black text-[#182230] shadow-[0_4px_12px_rgba(16,24,40,.1)] transition active:scale-90 hover:bg-[#C7922F]">+</button>}
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
    if (!modoExterno || !loja || telDig.length < 10) { setClienteSalvo(false); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      const c = cardapioViaRpc()
        ? await rpcBuscarClientePublico({ lojaId: loja.id, telefone: telDig })
        : await buscarClientePorTelefone(loja.id, telDig);
      if (!vivo) return;
      if (c && c.nome) { setCliente(capitalizarNome(c.nome)); setClienteSalvo(true); } else { setClienteSalvo(false); }
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
      if (vivo) setClienteSalvo(true);
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

  // Categoria de bebidas (para a sugestão automática "complete com uma bebida")
  const nomeCatBebida = useMemo(() => (categorias.find((c) => /bebida|drink|suco/i.test(c.nome))?.nome) || "Bebidas", [categorias]);
  const bebidas = useMemo(() => produtos.filter((p) => p.category === nomeCatBebida && p.disponivel !== false).slice(0, 6), [produtos, nomeCatBebida]);
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
  const ehBebida = (item) => item?.category === nomeCatBebida || bebidas.some((b) => b.name === item?.name);
  const carrinhoTemBebida = cart.some(ehBebida);

  function addConfigurado(item) {
    setCart((c) => [...c, { ...item, _uid: Date.now() + Math.random() }]);
    setDetalhe(null);
    // Sugere bebida ao adicionar comida (não repete se já dispensou ou já há bebida no carrinho)
    if (!ehBebida(item) && !carrinhoTemBebida && !sugFechada && bebidas.length > 0) setSugBebida(true);
  }
  function addBebida(b) {
    const pb = promoDoProduto(b);
    setCart((c) => [...c, { name: b.name, price: pb ? pb.preco : b.price, economiaUnit: pb ? (pb.original - pb.preco) : 0, quantity: 1, category: b.category, removedIngredients: [], extraIngredients: [], selectedOptions: [], observation: "", _uid: Date.now() + Math.random() }]);
    setSugBebida(false);
  }
  function removerItem(uid) { setCart((c) => c.filter((i) => i._uid !== uid)); }

  // Chamados de mesa (garçom/ajuda/limpeza) — só no modo mesa (QR na mesa)
  async function chamar(tipo, rotulo) {
    if (!loja) return;
    const args = { lojaId: loja.id, mesa: mesa ? `Mesa ${String(mesa).padStart(2, "0")}` : "", comanda: comanda || "", tipo };
    try { await (cardapioViaRpc() ? rpcCriarChamadoPublico(args) : criarChamado(args)); setMsg({ t: "success", m: `${rotulo} — a equipe foi avisada.` }); }
    catch { setMsg({ t: "error", m: "Não foi possível enviar o chamado agora." }); }
  }

  async function enviar() {
    if (cart.length === 0) return;
    if (bloqueioHorario) return setMsg({ t: "error", m: "Estabelecimento fechado no momento. Confira os horários de funcionamento." });
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
      if (!mesa || Number(mesa) <= 0) return setMsg({ t: "error", m: "Informe o número da mesa." });
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
      if (cardapioViaRpc()) { const r = await rpcCriarPedidoPublico({ lojaId: loja.id, mesa: novo.table, comanda: novo.command, cliente: novo.customer, telefone: novo.clienteTelefone || "", itens, pagForma: formaSel.label, pagMomento: momentoPagto }); if (r) pedidoId = r; }
      else await inserirPedido(novo);
      // A Pesquisa de Satisfação NÃO aparece agora — só quando o pedido CONCLUIR
      // (pago + retirado/entregue). Registra o pedido como pendente de pesquisa.
      try { const pend = lerSetLS(SURVEY_PEND_KEY); pend.add(pedidoId); salvarSetLS(SURVEY_PEND_KEY, pend); } catch {}
      setCart([]); setAba("conta"); setMsg({ t: "success", m: "✅ Pedido enviado para a cozinha!" });
    } catch (e) { console.error("Erro ao criar pedido:", e); setMsg({ t: "error", m: "Erro ao enviar o pedido. Tente novamente." }); }
    finally { setEnviando(false); }
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
  if (loja === undefined) return <Centro><Spinner /><p className="mt-3 text-sm text-slate-400">Carregando cardápio…</p></Centro>;
  if (loja === null) return <Centro><span className="text-5xl">🔍</span><p className="mt-3 font-black text-white">Empresa não encontrada</p><p className="mt-1 text-sm text-slate-500">Verifique o link/QR do cardápio.</p></Centro>;
  if (!podeExterno) return <Centro><span className="text-5xl">📵</span><p className="mt-3 font-black text-white">Cardápio externo indisponível</p><p className="mt-1 text-sm text-slate-500">Esta empresa não habilitou o cardápio digital para o cliente.</p></Centro>;

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
      <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-white px-4 pb-3 backdrop-blur-xl" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
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
        <div ref={catBarRef} className="sticky top-[64px] z-20 -mx-4 flex gap-2 overflow-x-auto border-b border-[#E5E7EB] bg-white/96 px-4 py-4 backdrop-blur">
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
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produtos..."
                className="w-full rounded-2xl border border-[#E5E7EB] bg-white py-3 pl-11 pr-4 text-sm text-[#182230] outline-none focus:border-[#D9A441] placeholder:text-[#98A2B3]" />
            </div>
            <button onClick={() => setOcultarIndisp((v) => !v)} title="Ocultar indisponíveis"
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
          <div className="grid grid-cols-2 gap-3 pb-6">
            {itensBusca.length === 0 && <p className="col-span-full py-10 text-center text-sm text-[#667085]">Nenhum produto encontrado.</p>}
            {itensBusca.map(renderProduto)}
          </div>
        ) : (
          /* Cardápio dividido por grupo — cada seção é âncora do scroll-spy */
          <div className="pb-6">
            {grupos.length === 0 && <p className="py-10 text-center text-sm text-[#667085]">Nenhum produto disponível.</p>}
            {grupos.map((g) => (
              <section key={g.nome} ref={(el) => (secRefs.current[g.nome] = el)} data-cat={g.nome} className="scroll-mt-28">
                <div className="sticky top-[116px] z-10 -mx-4 mb-3 mt-1 flex items-center gap-2 bg-[#F7F8FA]/95 px-4 py-1.5 backdrop-blur">
                  <span className="h-4 w-1 rounded-full bg-[#D9A441]" />
                  <h2 className="text-sm font-black uppercase tracking-wide text-[#182230]">{g.nome}</h2>
                  <span className="text-[11px] font-bold text-[#98A2B3]">{g.produtos.length} {g.produtos.length === 1 ? "item" : "itens"}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
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
              <p className="mt-0.5 text-xs font-medium text-[#7F1D1D]">Pedidos só podem ser enviados dentro do horário de funcionamento.</p>
            </div>
          )}
          {cart.length === 0 ? <p className="py-8 text-center text-sm text-[#667085]">Carrinho vazio.</p> : (
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
          )}
          {modoExterno ? (
            // Pedido externo (link de divulgação) — regras da empresa + nome + telefone
            <div className="mt-4 space-y-3">
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
              <div className="mt-4 grid grid-cols-2 gap-3">
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
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-[#667085]">Forma de pagamento <span className="text-[#B45309]">*</span></span>
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
