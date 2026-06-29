import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchLojas, fetchProdutos, fetchCategorias, fetchPromocoes, fetchGruposOpcoes, fetchOpcoes, fetchSetoresCozinha,
  inserirPedido, atualizarPedido, escutarPedidos,
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
          setPromocoes((promos || []).filter((p) => p.lojaId === l.id && p.ativo && p.mostrarCardapio && promocaoVigente(p)));
        }
      } catch { if (vivo) setLoja(null); }
    })();
    return () => { vivo = false; };
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
  const [catAtiva, setCatAtiva] = useState("Todos");
  // Espaçador dinâmico ao fim: exatamente o necessário para o ÚLTIMO grupo encostar
  // no topo ao rolar — sem sobra extra (não deixa "passar do topo").
  const [spacerH, setSpacerH] = useState(0);
  useEffect(() => {
    if (busca || !grupos.length) return;
    // Calcula o grupo atual: o último cujo cabeçalho passou da "linha" (abaixo dos
    // headers fixos). Determinístico e correto mesmo com seções curtas.
    const calc = () => {
      const linha = 140;
      let atual = grupos[0]?.nome;
      for (const g of grupos) {
        const el = secRefs.current[g.nome];
        if (el && el.getBoundingClientRect().top - linha <= 0) atual = g.nome;
      }
      // (sem override por "fim de página" — dependia de innerHeight e fazia o grupo
      //  "voltar" quando a barra do navegador aparecia/sumia ao rolar. O espaçador
      //  dinâmico já garante que o último grupo alcance a linha.)
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
    if (alvo) window.scrollTo({ top: alvo.getBoundingClientRect().top + window.scrollY - 108, behavior: "smooth" });
  };
  const renderProduto = (item) => {
    const indisponivel = item.disponivel === false;
    const personalizavel = (item.ingredients || []).length > 0;
    return (
      <article key={item.id} className={`flex h-full flex-col rounded-[1.5rem] border bg-slate-900/70 ${item.isFeatured && !indisponivel ? "border-gold-400/50" : "border-white/10"}`}>
        <div className="flex gap-3 p-3">
          <div className="relative shrink-0">
            <button onClick={() => !indisponivel && setDetalhe(item)} disabled={indisponivel} className="block h-[88px] w-[88px] overflow-hidden rounded-2xl bg-slate-800">
              <img src={item.imageUrl || fallbackImage} alt={item.name} className={`h-full w-full object-cover ${indisponivel ? "grayscale opacity-50" : ""}`} />
            </button>
            {personalizavel && !indisponivel && (
              <button onClick={() => setDetalhe(item)} aria-label="Personalizar" title="Personalizar" className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-gold-400/40 bg-slate-950/85 text-gold-300 shadow-lg">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="2" fill="currentColor" stroke="none"/></svg>
              </button>
            )}
            {indisponivel && <span className="absolute left-1/2 top-1/2 w-max -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/75 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-200">Indisponível</span>}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-black leading-tight text-white line-clamp-1">{item.name}</h3>
            <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-slate-400">{item.description}</p>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between px-3 pb-3">
          <span className="text-base font-black text-gold-400">{formatCurrency(item.price)}</span>
          {indisponivel
            ? <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-600">✕</span>
            : <button onClick={() => setDetalhe(item)} aria-label="Adicionar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-400 text-xl font-black text-blue-950 shadow-lg shadow-gold-900/30 transition active:scale-90 hover:bg-gold-300">+</button>}
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
    setCart((c) => [...c, { name: b.name, price: b.price, quantity: 1, category: b.category, removedIngredients: [], extraIngredients: [], selectedOptions: [], observation: "", _uid: Date.now() + Math.random() }]);
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
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-blue-950 via-slate-950 to-black px-6 text-slate-100"
        style={{ minHeight: "100dvh", paddingTop: "calc(env(safe-area-inset-top) + 2rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
          {loja.logoUrl ? <img src={loja.logoUrl} alt="" className="h-20 w-20 rounded-3xl object-cover shadow-2xl shadow-black/50" /> : <LogoPP size={80} />}
          <h1 className="page-title mt-5 text-2xl font-bold tracking-tight text-white">{loja.nome}</h1>
          {currentTable && <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-gold-400/40 bg-gold-400/10 px-4 py-1.5 text-sm font-bold text-gold-300">📍 {currentTable}</span>}
          <p className="mt-6 text-lg font-bold text-white">Bem-vindo! 👋</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">Faça seu pedido de forma rápida e prática direto pelo celular.</p>
          <div className="mt-8 w-full space-y-3">
            <button onClick={() => setEtapa("cardapio")} className="w-full rounded-2xl bg-gold-400 py-4 text-base font-black text-blue-950 shadow-lg shadow-gold-900/30 transition active:scale-95 hover:bg-gold-300">Iniciar pedido</button>
            <button onClick={() => setEtapa("cardapio")} className="w-full rounded-2xl border border-white/15 bg-white/[0.06] py-4 text-base font-bold text-slate-200 transition active:scale-95 hover:bg-white/10">Ver cardápio</button>
          </div>
          {!modoExterno && mesa && (
            <div className="mt-8 w-full">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Precisa de algo?</p>
              <div className="mt-2 flex justify-center gap-2">
                {[["garcom", "🔔 Garçom"], ["ajuda", "🆘 Ajuda"], ["limpeza", "🧹 Limpeza"]].map(([t, l]) => (
                  <button key={t} onClick={() => chamar(t, l.replace(/^\S+\s/, ""))}
                    className="flex-1 rounded-2xl border border-gold-400/30 bg-gold-400/10 py-2.5 text-xs font-black text-gold-200 transition active:scale-95 hover:bg-gold-400/20">{l}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        {msg && <div className="mx-auto w-full max-w-md"><div className={`rounded-2xl border px-4 py-2.5 text-center text-sm font-bold ${msg.t === "error" ? "border-red-400/30 bg-red-500/15 text-red-200" : "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"}`}>{msg.m}</div></div>}
      </div>
    );
  }

  const minimoFalta = modoExterno && minimoExterno > 0 ? Math.max(0, minimoExterno - totalCart) : 0;
  const pagtoOk = formasPagto.length > 0 && formasPagto.some((f) => f.id === formaPagto);
  const podeEnviar = cart.length > 0 && pagtoOk && (!modoExterno || (
    aceitaExterno && opcoesEntrega.length > 0 && opcoesEntrega.some((o) => o.id === tipoPedido) && minimoFalta <= 0
  ));
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" style={{ minHeight: "100dvh", paddingBottom: `calc(env(safe-area-inset-bottom) + ${cart.length > 0 ? 150 : 92}px)` }}>
      {/* Cabeçalho */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-900/95 px-4 pb-3 backdrop-blur-xl" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {loja.logoUrl ? <img src={loja.logoUrl} alt="" className="h-12 w-12 rounded-2xl object-cover" /> : <LogoPP size={48} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-black text-white leading-tight">{loja.nome}</p>
            <p className="text-sm text-slate-400">{currentTable ? `${currentTable}${comanda ? " · " + comanda : ""}` : "Cardápio digital"}</p>
          </div>
          {!modoExterno && mesa && (
            <button onClick={abrirQr} className="flex shrink-0 items-center gap-1.5 rounded-full border border-gold-400/40 bg-gold-400/[0.08] px-3.5 py-2 text-xs font-black text-gold-200 transition active:scale-95 hover:bg-gold-400/15">
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
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-gold-400/30 bg-gold-400/[0.07] py-2.5 text-sm font-black text-gold-200 transition active:scale-95 hover:bg-gold-400/15"><span className="text-base">{ic}</span>{l}</button>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-4">
        {/* Categorias — clique rola até o grupo; ao rolar, o grupo atual é destacado */}
        <div className="sticky top-[64px] z-20 -mx-4 flex gap-2 overflow-x-auto border-b border-white/10 bg-slate-950/90 px-4 py-4 backdrop-blur">
          {cats.map((c) => { const ativo = !busca && catAtiva === c;
            return (
              <button key={c} ref={(el) => (chipRefs.current[c] = el)} onClick={() => irParaCategoria(c)} className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold transition ${ativo ? "border-gold-400 bg-gold-400 text-blue-950 shadow-lg shadow-gold-600/20" : "border-white/10 bg-white/[0.05] text-slate-300"}`}>{ativo ? "★ " : ""}{c}</button>
            );
          })}
        </div>

        {/* Busca + Filtros — oculta no cardápio de acesso por link externo */}
        {!modoExterno && (
          <div className="flex items-center gap-2 py-3">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produtos..."
                className="w-full rounded-2xl border border-white/10 bg-slate-900 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-gold-400/60 placeholder:text-slate-500" />
            </div>
            <button onClick={() => setOcultarIndisp((v) => !v)} title="Ocultar indisponíveis"
              className={`flex shrink-0 items-center gap-1.5 rounded-2xl border px-4 py-3 text-sm font-bold transition ${ocultarIndisp ? "border-gold-400 bg-gold-400 text-blue-950" : "border-white/10 bg-slate-900 text-slate-300"}`}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>
              Filtros
            </button>
          </div>
        )}

        {/* Ofertas vigentes */}
        {promocoes.length > 0 && (
          <div className="mb-4 flex gap-3 overflow-x-auto pb-1">
            {promocoes.map((p) => (
              <div key={p.id} className="flex min-w-[180px] shrink-0 items-center gap-3 rounded-2xl border border-gold-400/40 bg-gradient-to-br from-gold-400/15 to-gold-400/[0.04] px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-400/20 text-gold-300">🏷️</span>
                <div className="min-w-0"><p className="truncate text-sm font-black text-white">{p.nome}</p><p className="text-xs font-black text-gold-400">{promoResumoDesconto(p)}</p></div>
              </div>
            ))}
          </div>
        )}

        {/* Aviso de personalização */}
        <div className="mb-3 mt-4 flex items-center gap-2 rounded-2xl border border-gold-400/25 bg-gold-400/[0.06] px-4 py-2.5">
          <span className="text-lg">✨</span>
          <p className="text-xs font-bold text-gold-200">Personalize do seu jeito! <span className="font-normal text-slate-300">Adicione ou remova ingredientes.</span></p>
        </div>

        {/* Resultados da busca — lista achatada (sem divisão por grupo) */}
        {busca ? (
          <div className="grid grid-cols-2 gap-3 pb-6">
            {itensBusca.length === 0 && <p className="col-span-full py-10 text-center text-sm text-slate-500">Nenhum produto encontrado.</p>}
            {itensBusca.map(renderProduto)}
          </div>
        ) : (
          /* Cardápio dividido por grupo — cada seção é âncora do scroll-spy */
          <div className="pb-6">
            {grupos.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Nenhum produto disponível.</p>}
            {grupos.map((g) => (
              <section key={g.nome} ref={(el) => (secRefs.current[g.nome] = el)} data-cat={g.nome} className="scroll-mt-28">
                <div className="sticky top-[116px] z-10 -mx-4 mb-3 mt-1 flex items-center gap-2 bg-slate-950/85 px-4 py-1.5 backdrop-blur">
                  <span className="h-4 w-1 rounded-full bg-gold-400" />
                  <h2 className="text-sm font-black uppercase tracking-wide text-white">{g.nome}</h2>
                  <span className="text-[11px] font-bold text-slate-500">{g.produtos.length} {g.produtos.length === 1 ? "item" : "itens"}</span>
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
            <div className="flex items-center justify-between gap-3 rounded-3xl border border-gold-400/40 bg-slate-900/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
              <button onClick={() => setAba("carrinho")} className="flex min-w-0 items-center gap-3 text-left">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gold-400/15 text-lg text-gold-300">🛒<span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gold-400 px-1 text-[11px] font-black text-blue-950">{qtdCart}</span></span>
                <span className="min-w-0"><span className="block text-sm font-black text-white">Ver carrinho</span><span className="block text-xs text-slate-400">{qtdCart} {qtdCart === 1 ? "item" : "itens"} · {formatCurrency(totalCart)}</span></span>
              </button>
              <button onClick={() => setAba("carrinho")} className="flex shrink-0 items-center gap-1 rounded-2xl bg-gold-400 px-4 py-3 text-sm font-black text-blue-950 shadow-lg shadow-gold-900/30 transition active:scale-95">Finalizar pedido ›</button>
            </div>
          )}
          {cart.length === 0 ? (
            // Carrinho vazio: dá acesso direto ao carrinho + acompanhar
            <div className="flex items-stretch gap-2 rounded-3xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
              <button onClick={() => setAba("conta")} disabled={meusPedidos.length === 0}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-3 text-sm font-black text-slate-300 transition active:scale-95 disabled:opacity-40">👁️ Acompanhar pedido</button>
              <button onClick={() => setAba("carrinho")}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-3 text-sm font-black text-slate-400 transition active:scale-95">🛒 Carrinho vazio</button>
            </div>
          ) : (
            // Com itens: o carrinho já está na barra dourada acima — aqui só acompanhar
            <button onClick={() => setAba("conta")} disabled={meusPedidos.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-3xl border border-white/10 bg-slate-900/95 py-3.5 text-sm font-black text-slate-300 shadow-2xl shadow-black/50 backdrop-blur-xl transition active:scale-95 disabled:opacity-40">👁️ Acompanhar pedido</button>
          )}
        </div>
      </div>

      {/* Mensagem */}
      {msg && (
        <div className={`fixed inset-x-0 z-[120] flex justify-center px-4`} style={{ bottom: "96px" }}>
          <div className={`rounded-2xl border px-4 py-2.5 text-sm font-bold shadow-xl ${msg.t === "error" ? "border-red-400/30 bg-red-500/15 text-red-200" : "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"}`}>{msg.m}</div>
        </div>
      )}

      {/* Pesquisa de Satisfação (na finalização do pedido) */}
      {survey && <SatisfactionSurvey onEnviar={finalizarComPesquisa} onPular={finalizarSemPesquisa} />}

      {/* Modal de produto (reutilizado) */}
      {detalhe && <ProdutoModal produto={detalhe} grupos={gruposOpcoes} opcoes={opcoes} onFechar={() => setDetalhe(null)} onAdicionar={addConfigurado} />}

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
          {cart.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Carrinho vazio.</p> : (
            <div className="space-y-2">
              {cart.map((i) => (
                <div key={i._uid} className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                  <div className="min-w-0"><p className="truncate text-sm font-black text-white">{i.quantity}× {i.name}</p>{(i.removedIngredients?.length > 0 || i.extraIngredients?.length > 0 || i.observation) && <p className="truncate text-[11px] text-amber-300">{[...(i.removedIngredients || []).map((x) => "− " + x), ...(i.extraIngredients || []).map((x) => "+ " + x), i.observation].filter(Boolean).join(" · ")}</p>}</div>
                  <div className="flex items-center gap-2"><span className="text-sm font-bold text-white">{formatCurrency(i.price * i.quantity)}</span><button onClick={() => removerItem(i._uid)} className="rounded-lg border border-red-400/20 bg-red-500/10 px-2 py-1 text-xs font-black text-red-300">✕</button></div>
                </div>
              ))}
            </div>
          )}
          {modoExterno ? (
            // Pedido externo (link de divulgação) — regras da empresa + nome + telefone
            <div className="mt-4 space-y-3">
              {!aceitaExterno ? (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-200">
                  🚫 Esta empresa não está aceitando pedidos pelo cardápio no momento.
                </div>
              ) : opcoesEntrega.length === 0 ? (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-200">
                  Nenhuma forma de pedido disponível no momento.
                </div>
              ) : (
                <div>
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-amber-500">⚠ Como deseja receber? *</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {opcoesEntrega.map((o) => (
                      <button key={o.id} type="button" onClick={() => setTipoPedido(o.id)}
                        className={`flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-black transition ${tipoPedido === o.id ? "border-emerald-400 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-slate-800 text-slate-300"}`}>
                        <span>{o.icon}</span><span>{o.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label><span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-amber-500">⚠ Telefone (WhatsApp) *</span>
                  <input type="tel" inputMode="numeric" autoComplete="tel" value={mascararTelefone(telefone)} onChange={(e) => setTelefone(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="(11) 98765-4321" maxLength={16}
                    className="w-full rounded-2xl border border-amber-400/40 bg-slate-800 px-3 py-2.5 text-sm font-black text-white outline-none" /></label>
                <label><span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-amber-500">⚠ Seu nome *</span>
                  <input autoComplete="name" value={cliente} onChange={(e) => setCliente(capitalizarNome(e.target.value))} placeholder="Nome completo"
                    className="w-full rounded-2xl border border-amber-400/40 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none" /></label>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label><span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-amber-500">⚠ Mesa *</span>
                  <input type="tel" inputMode="numeric" value={mesa} onChange={(e) => setMesa(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Nº" disabled={!!mesaURL}
                    className="w-full rounded-2xl border border-amber-400/40 bg-slate-800 px-3 py-2.5 text-sm font-black text-white outline-none disabled:opacity-70" /></label>
                <label><span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-slate-500">Seu nome (opcional)</span>
                  <input value={cliente} onChange={(e) => setCliente(capitalizarNome(e.target.value))} placeholder="Nome" className="w-full rounded-2xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none" /></label>
              </div>
              {!comURL && (
                <div className="mt-3"><span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-amber-500">⚠ Comanda *</span>
                  <input value={comanda} onChange={(e) => setComanda(e.target.value.toUpperCase())} placeholder={`Ex.: ${loja.prefixo}-000001`}
                    className="w-full rounded-2xl border border-amber-400/40 bg-slate-800 px-3 py-2.5 font-mono text-sm font-black tracking-widest text-white outline-none" />
                  <p className="mt-1 text-[11px] text-slate-500">Escaneie o QR Code da mesa ou digite a comanda.</p></div>
              )}
            </>
          )}
          {/* Forma de pagamento (aba "Pagamento") — pedido interno e externo */}
          {formasPagto.length > 0 && (
            <div className="mt-4">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-amber-500">⚠ Forma de pagamento *</span>
              <div className="grid grid-cols-3 gap-2">
                {formasPagto.map((f) => (
                  <button key={f.id} type="button" onClick={() => setFormaPagto(f.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-2xl border px-2 py-2.5 text-sm font-black transition ${formaPagto === f.id ? "border-emerald-400 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-slate-800 text-slate-300"}`}>
                    <span>{f.icon}</span><span>{f.label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">Pagamento: <span className="font-bold text-slate-300">{momentoPagto}</span>.</p>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3"><span className="text-sm text-slate-400">Total</span><span className="text-xl font-black text-emerald-400">{formatCurrency(totalCart)}</span></div>
          {modoExterno && minimoExterno > 0 && (
            <p className={`mt-2 text-xs font-bold ${minimoFalta > 0 ? "text-amber-300" : "text-emerald-400"}`}>
              {minimoFalta > 0 ? `Pedido mínimo de ${formatCurrency(minimoExterno)} — faltam ${formatCurrency(minimoFalta)}.` : `✓ Pedido mínimo de ${formatCurrency(minimoExterno)} atingido.`}
            </p>
          )}
          <button onClick={enviar} disabled={!podeEnviar || enviando}
            className="mt-3 w-full rounded-2xl bg-emerald-500 py-4 text-sm font-black text-white hover:bg-emerald-400 transition active:scale-95 disabled:opacity-40">
            {enviando ? "Enviando…" : "🚀 Enviar pedido"}
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
  return <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100" style={{ minHeight: "100dvh" }}>{children}</div>;
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
    <div className="fixed inset-x-0 top-0 z-[110] flex items-end justify-center bg-black/70 backdrop-blur-sm" style={overlayStyle} onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl rounded-t-[2rem] border border-white/10 bg-slate-900 shadow-2xl" style={{ maxHeight: sheetMax }}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><h2 className="text-lg font-black text-white">{titulo}</h2><button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300">Fechar ✕</button></div>
        <div className="pp-overscroll-contain overflow-y-auto px-5 py-4" style={{ maxHeight: bodyMax }}>{children}</div>
      </div>
    </div>
  );
}
