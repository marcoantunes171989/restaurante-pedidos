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
import { CATEGORIA_TODOS, agruparProdutosPorCategoria, montarListaCategorias, escolherCategoriaAtiva, calcularDestinoScroll } from "./lib/cardapioCategorias";
import SatisfactionSurvey from "./components/SatisfactionSurvey";
import {
  ProdutoModal, formatCurrency, fallbackImage, isValidCommand,
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
// Respeita prefers-reduced-motion nas rolagens programáticas (clique em
// categoria/"Todos"/oferta e centralização do chip) — usa "auto" (instantâneo)
// em vez de "smooth" quando o usuário pediu menos movimento no sistema.
function motionOk() {
  try { return !window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; }
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
// Modo de recebimento REAL de um pedido específico — não basta saber se o
// canal é "externo" (link) ou "mesa" (QR): dentro do canal externo, "Consumir
// no local" e "Retirada no balcão" são fluxos diferentes (o rótulo já vem
// gravado em o.table, ver enviar(): "Externo · Consumo no local" / "Externo ·
// Retirada" / "Externo · Entrega") e não podem usar o mesmo texto de
// "pronto"/"entregue" — mesa e consumo no local são sempre "servidos".
function modoEntregaPedido(pedido, modoExterno) {
  if (!modoExterno) return "mesa";
  const t = pedido.table || "";
  if (/retirada/i.test(t)) return "retirada";
  if (/entrega/i.test(t)) return "entrega";
  return "local"; // "Externo · Consumo no local" e qualquer formato antigo/desconhecido
}
// Rótulo do status operacional (enum oficial STATUS_DB_PARA_APP/STATUS_APP_PARA_DB
// — nunca um valor inventado) em linguagem amigável pro cliente, sem confundir
// consumo local/mesa ("Entregue") com retirada ("Retirado") ou entrega ("Entregue").
function statusClienteLabel(pedido, modo) {
  if (pedido.status === "cancelled") return "Cancelado";
  if (pedido.status === "delivered") return modo === "retirada" ? "Retirado" : "Entregue";
  if (pedido.status === "ready") return modo === "retirada" ? "Pronto para retirada" : modo === "entrega" ? "Pronto para entrega" : "Pronto para servir";
  if (pedido.status === "preparing") return "Em preparação";
  return "Recebido";
}
// Chip de status do pedido — paleta própria do cliente (--client-*), local a
// esta tela: NÃO reaproveita o statusMap de App.jsx (esse é compartilhado com
// cozinha/painel, fora do escopo desta padronização). Cada estágio com sua
// própria cor semântica (nunca duas etapas com significados diferentes
// dividindo a mesma cor): recebido = azul (informativo/aguardando), em
// preparo = âmbar (em andamento), pronto = verde (concluído de fato),
// entregue = neutro (arquivado, sem destaque), cancelado = crimson.
function estiloStatusCliente(status) {
  switch (status) {
    case "received":
      return { chip: "bg-[var(--client-info-soft)] text-[var(--client-info)] border-[var(--client-info-border)]", dot: "bg-[var(--client-info)]" };
    case "preparing":
      return { chip: "bg-[var(--client-warning-soft)] text-[var(--client-warning)] border-[var(--client-warning-border)]", dot: "bg-[var(--client-warning)]" };
    case "ready":
      return { chip: "bg-[var(--client-success-soft)] text-[var(--client-success)] border-[var(--client-success-border)]", dot: "bg-[var(--client-success)]" };
    case "delivered":
      return { chip: "bg-[var(--client-status-neutral-soft)] text-[var(--client-status-neutral)] border-[var(--client-status-neutral-border)]", dot: "bg-[var(--client-status-neutral)]" };
    case "cancelled":
      return { chip: "bg-[var(--client-error-soft)] text-[var(--client-error)] border-[var(--client-error-border)]", dot: "bg-[var(--client-error)]" };
    default:
      return { chip: "bg-[var(--client-status-neutral-soft)] text-[var(--client-status-neutral)] border-[var(--client-status-neutral-border)]", dot: "bg-[var(--client-status-neutral)]" };
  }
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
  const [pedidosOffline, setPedidosOffline] = useState(false); // true quando a atualização em tempo real dos pedidos está falhando (polling/realtime)
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
  const [enviando, setEnviando]   = useState(false);
  const enviandoRef = useRef(false); // trava síncrona contra clique duplo (ver enviar())
  const [msg, setMsg]             = useState(null);
  const [etapa, setEtapa]         = useState(mesaURL ? "welcome" : "cardapio"); // welcome | cardapio
  const [tipoPedido, setTipoPedido] = useState(""); // pedido externo: local | retirada | entrega (config_externo)
  const [formaPagto, setFormaPagto] = useState(""); // forma de pagamento: pix | cartao | dinheiro (config_externo)
  const [agora, setAgora] = useState(() => new Date()); // relógio p/ reavaliar aberto/fechado ao vivo
  const [comboRemover, setComboRemover] = useState(null); // item de combo aguardando confirmação de remoção
  const [itemRemover, setItemRemover] = useState(null); // item avulso (não-combo) aguardando confirmação de remoção
  const [confirmarLimpar, setConfirmarLimpar] = useState(false); // confirmação obrigatória antes de esvaziar o carrinho todo
  const [trocoResposta, setTrocoResposta] = useState(""); // "" | "sim" | "nao" — só perguntado com pagamento em Dinheiro
  const [trocoValor, setTrocoValor] = useState(""); // valor (texto) que o cliente vai usar para pagar em espécie
  const [confirmarFechamento, setConfirmarFechamento] = useState(false); // confirmação obrigatória antes de solicitar/reenviar o fechamento da conta
  const [solicitando, setSolicitando] = useState(false);
  const solicitandoRef = useRef(false); // trava síncrona contra clique duplo (mesmo padrão de enviandoRef)
  const [chamando, setChamando] = useState(""); // tipo do chamado (garcom|ajuda|limpeza) em andamento, "" se nenhum
  const chamandoRef = useRef(false); // trava síncrona contra clique duplo (mesmo padrão de enviandoRef/solicitandoRef)
  const [pedidoRecolhido, setPedidoRecolhido] = useState({}); // { [id]: true } — cartão de pedido recolhido pelo cliente (padrão: expandido)

  // Confirmação obrigatória de "mesa ocupada" (QR por mesa) — status vem do
  // backend (pub_status_mesa, migration 067), nunca de cache/estado local.
  // statusMesa: null = ainda checando · { ocupada, numero, nome } = resolvido.
  const [statusMesa, setStatusMesa] = useState(null);
  const [ocupacaoConfirmada, setOcupacaoConfirmada] = useState(false); // cliente respondeu "Sim" pra ocupação já vista
  const [ocupacaoRecusada, setOcupacaoRecusada] = useState(false);     // cliente respondeu "Não" → bloqueia

  // Toda abertura/atualização da tela começa no topo, com "Todos" ativo —
  // nunca restaura a última categoria/posição de rolagem. Desliga a
  // restauração nativa do navegador (senão um F5 poderia reabrir no meio do
  // scroll, brigando com o catAtivaId=CATEGORIA_TODOS inicial) e força o
  // topo uma única vez.
  useEffect(() => {
    try { if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual"; } catch {}
    // Quem rola de verdade nesta tela é #root (não a window — html/body/#root
    // têm overflow-x:hidden global em index.css, e o CSS converte o eixo Y
    // ausente para "auto" nesse caso, virando o container de scroll real);
    // nesse momento (mount) a raiz da tela do cardápio ainda pode nem ter
    // renderizado (primeiro paint é o skeleton), então zera direto pelo id.
    try { document.getElementById("root")?.scrollTo(0, 0); } catch {}
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
          if (!vivo) return;
          setOrders(lista);
          setPedidosOffline(false); // poll respondeu — conexão OK
        } catch { if (vivo) setPedidosOffline(true); } // poll falhou (rede/RLS) — mantém os últimos dados válidos, só sinaliza
      };
      buscar();
      const iv = setInterval(buscar, 4000);
      return () => { vivo = false; clearInterval(iv); };
    }
    const off = escutarPedidos(
      (all) => { setOrders(all.filter((o) => o.lojaId === loja.id)); setPedidosOffline(false); },
      (status) => setPedidosOffline(status === "TIMED_OUT" || status === "CHANNEL_ERROR" || status === "CLOSED"),
    );
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
      // Migration 068: compara por ID quando o produto já tem categoriaId
      // (vínculo real, imune a categoria renomeada); nome como fallback para
      // produto ainda não migrado.
      // String(): bigint pode ir e vir como number OU string dependendo da
      // origem do dado — compara sempre normalizado, nunca por === direto.
      const alvoCategoria = p.categoriaId != null && (item.categoriaId != null ? String(item.categoriaId) === String(p.categoriaId) : catNomePorId[p.categoriaId] === item.category);
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
  // Remoção sempre pede confirmação antes de tirar o item do carrinho — se o
  // item faz parte de um combo, o aviso é o de "desfazer o combo" (demais
  // itens voltam ao preço normal); senão, confirmação simples de remoção.
  function pedirRemover(item) {
    if (item.comboId) { setComboRemover(item); return; }
    setItemRemover(item);
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
    : tipoPedido === "local"    ? "Após o consumo, no fechamento da conta"
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
  // Troca entre "como deseja receber" (ex.: local ↔ retirada) — chamado direto
  // pelo clique no radiogroup (não por efeito): consumo no local não pede
  // pagamento agora, então limpa a forma escolhida (e o troco, que depende
  // dela) na hora, pra não ficar uma seleção "fantasma" caso o cliente volte
  // para retirada/entrega depois (troca imediata e previsível).
  function escolherTipoPedido(id) {
    setTipoPedido(id);
    if (modoExterno && id === "local") { setFormaPagto(""); setTrocoResposta(""); setTrocoValor(""); }
  }
  // Troca de forma de pagamento — troco só faz sentido com Dinheiro: limpa a
  // pergunta e o valor na hora, direto no clique (não via efeito).
  function escolherFormaPagto(id) {
    setFormaPagto(id);
    if (id !== "dinheiro") { setTrocoResposta(""); setTrocoValor(""); }
  }
  // Agrupamento/lista de categorias — lógica pura extraída para
  // src/lib/cardapioCategorias.js (testável isoladamente, sem depender de
  // DOM/scroll; ver cardapioCategorias.test.js).
  const grupos = useMemo(() => agruparProdutosPorCategoria(produtos, categorias), [produtos, categorias]);
  const cats = useMemo(() => montarListaCategorias(grupos).filter((c) => c.id !== CATEGORIA_TODOS), [grupos]); // sem o chip "Todos"

  const secRefs = useRef({});      // uma ref por seção de categoria — alvo do clique e do IntersectionObserver
  const chipRefs = useRef({});
  const topoRef = useRef(null);    // sentinela no topo — "Todos" rola até aqui
  const headerRef = useRef(null);  // cabeçalho fixo — sua altura REAL vira o offset "top" do carrossel
  const catBarRef = useRef(null); // barra sticky de categorias (div externa) — usada p/ medir a altura/offset real
  const catScrollRef = useRef(null); // div INTERNA que realmente rola no eixo X (overflow-x-auto) — alvo do auto-scroll do chip ativo
  // Raiz da tela — quem realmente rola NÃO é a window: html/body/#root têm
  // overflow-x:hidden global (index.css), e o CSS converte automaticamente o
  // eixo Y ausente para "auto" nesse caso — #root vira o container de scroll
  // de verdade (altura travada em 100%/100dvh). raizRef.current.parentElement
  // resolve esse elemento em runtime, sem fixar o id.
  const raizRef = useRef(null);
  const scrollEl = () => raizRef.current?.parentElement || null;
  // Alturas medidas de verdade (não um px fixo "no chute") — sem isso, o
  // carrossel ficava com top-[64px] fixo, mas a altura real do cabeçalho varia
  // por aparelho (env(safe-area-inset-top) do notch/Dynamic Island) e por modo
  // (linha de "Garçom/Ajuda/Limpeza" só aparece no QR de mesa). Em celulares
  // com notch, o cabeçalho real passava dos 64px assumidos e cobria o
  // carrossel (mesmo z-index mais baixo) — por isso "sumia" só no mobile.
  const [headerH, setHeaderH] = useState(0);
  const [catBarH, setCatBarH] = useState(0);
  // Dependência [loja, etapa] (não []) — CAUSA RAIZ confirmada com teste real
  // de navegador: este componente mostra árvores JSX TOTALMENTE diferentes,
  // sem headerRef/catBarRef, tanto enquanto `loja` ainda não carregou
  // (<CardapioSkeleton/>) quanto — só no modo QR de mesa — na tela de
  // boas-vindas (etapa==="welcome", `loja` já carregado). Um efeito com deps
  // [] roda UMA VEZ, na primeira montagem — se essa primeira montagem cair
  // numa dessas árvores "sem header real", headerRef.current/catBarRef.current
  // são `null` nesse instante, medir() calcula 0 pra ambos, e o efeito NUNCA
  // roda de novo — mesmo depois da árvore real (com os refs de verdade)
  // finalmente montar. Resultado: catBarH fica 0 pra sempre, a barra de
  // categorias gruda no top:0 (por cima do cabeçalho) — invisível antes de
  // rolar (a posição em fluxo normal já bate com a real), mas some atrás do
  // cabeçalho assim que a rolagem começa a "grudar" o sticky. Recriar o
  // efeito quando `loja` resolve (undefined -> objeto) OU `etapa` muda
  // (welcome -> cardapio) garante medir de novo exatamente no instante em que
  // a árvore real (com os refs corretos) acabou de montar.
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
  }, [loja, etapa]);
  const [catAtivaId, setCatAtivaId] = useState(CATEGORIA_TODOS);
  // Enquanto true, um clique (categoria ou "Todos") disparou uma rolagem suave
  // programática — a sincronização abaixo ignora as seções que cruzam a linha
  // até ela assentar, pra não "brigar" com o clique piscando por categorias
  // intermediárias no caminho (evita o loop rolagem automática ⇄ clique ⇄
  // estado). Libera sozinha depois de um tempo generoso; um novo clique já
  // reseta o timeout normalmente.
  const rolandoPorCliqueRef = useRef(false);
  const cliqueTimeoutRef = useRef(null);
  useEffect(() => () => clearTimeout(cliqueTimeoutRef.current), []);
  // Sincronização categoria ↔ rolagem: um único IntersectionObserver observa
  // todas as seções contra uma FAIXA logo abaixo do cabeçalho+barra fixos
  // ("linha de referência" — rootMargin negativo no topo reduz a área
  // observável do root a essa faixa). A categoria ativa é a primeira seção
  // (na ordem do cardápio) que ainda estiver visível abaixo da linha — dispara
  // só quando uma seção realmente entra/sai dela, não a cada pixel rolado
  // (sem listener pesado de scroll). Isso também resolve sozinho o caso de
  // categorias curtas empilhadas no fim de um cardápio pequeno: se
  // Acompanhamentos/Sobremesas/Bebidas aparecem juntas na tela no scroll
  // máximo, só a primeira delas (a que está de fato fixa sob a barra) conta —
  // as seguintes, mesmo visíveis, ainda não "chegaram" na linha.
  // root = o elemento que REALMENTE rola (`scrollEl`) — sem isso, o
  // IntersectionObserver usa a viewport como referência por padrão, que
  // nesta tela não é quem rola.
  useEffect(() => {
    if (!grupos.length) return;
    const el = scrollEl();
    if (!el) return; // raiz ainda não montada — o efeito roda de novo quando grupos mudar
    // Fallback generoso (~130px) antes das alturas reais serem medidas.
    const linha = (headerH + catBarH) || 130;
    const primeira = grupos[0]?.id ?? CATEGORIA_TODOS; // sem "Todos": a 1ª categoria é a ativa no topo

    if (typeof IntersectionObserver === "undefined") {
      // Fallback sem IntersectionObserver: geometria a cada scroll, com
      // throttle por requestAnimationFrame + debounce curto (evita trocar de
      // categoria a cada pixel ao rolar rápido por seções próximas/curtas).
      // Algoritmo deliberadamente diferente do observer abaixo: aqui vence a
      // ÚLTIMA seção cujo topo já passou da linha vence (varredura simples) —
      // é a mesma seção cujo cabeçalho sticky está "fixo no topo" agora: se
      // várias seções curtas ficam empilhadas visualmente no fim do cardápio
      // (sem espaço pra rolar cada uma até o fim), a que está fixa é sempre a
      // primeira delas (as seguintes ainda não "chegaram" na linha), nunca
      // necessariamente a última categoria do cardápio.
      let raf = 0, debounce = 0;
      const calc = () => {
        if (rolandoPorCliqueRef.current) return;
        if (el.scrollTop <= 0) { setCatAtivaId((cur) => (cur === primeira ? cur : primeira)); return; }
        let atual = primeira;
        for (const g of grupos) {
          const secEl = secRefs.current[g.id];
          if (secEl && secEl.getBoundingClientRect().top - linha <= 0) atual = g.id;
        }
        setCatAtivaId((cur) => (cur === atual ? cur : atual));
      };
      const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; clearTimeout(debounce); debounce = setTimeout(calc, 60); }); };
      calc();
      el.addEventListener("scroll", onScroll, { passive: true });
      return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); clearTimeout(debounce); };
    }

    // ids das seções com QUALQUER parte visível abaixo da linha de referência
    // agora (não uma faixa fina — da linha até o fim do container). A
    // categoria ativa é a PRIMEIRA dessas na ordem do cardápio: entre as
    // seções ainda visíveis abaixo da linha, é sempre a mais "de cima" delas
    // que já cruzou a linha e está com o cabeçalho sticky fixo ali — as
    // seguintes (mesmo já parcialmente visíveis, empilhadas por falta de
    // espaço pra rolar mais, como no fim de um cardápio com categorias
    // curtas) ainda não "chegaram". Ex. real: Acompanhamentos(4)/
    // Sobremesas(1)/Bebidas(2) no fim de um cardápio curto — no scroll
    // máximo as 3 aparecem juntas na tela, mas só Acompanhamentos está de
    // fato fixa sob a barra; as outras duas ainda estão no fluxo normal,
    // abaixo dela.
    const visiveisAbaixoDaLinha = new Set();
    // Debounce curto: evita a categoria "piscar" entre vizinhas durante uma
    // rolagem rápida (arrastar/fling) — só assenta no valor final depois que
    // as intersecções param de mudar por um instante.
    let debounceEscolha = 0;
    const escolher = () => {
      if (rolandoPorCliqueRef.current) return;
      clearTimeout(debounceEscolha);
      debounceEscolha = setTimeout(() => {
        let alvo;
        if (el.scrollTop <= 0) alvo = primeira;
        else if (grupos.length && el.scrollHeight - el.scrollTop - el.clientHeight <= 120) alvo = grupos[grupos.length - 1].id; // fim da rolagem → última categoria
        else alvo = escolherCategoriaAtiva(grupos, visiveisAbaixoDaLinha);
        setCatAtivaId((cur) => (cur === alvo ? cur : alvo));
      }, 80);
    };
    // obsSecoes é recriado (não só reposicionado) sempre que o CONTAINER DE
    // ROLAGEM muda de tamanho — não apenas quando grupos/headerH/catBarH
    // mudam. O rootMargin abaixo usa el.clientHeight capturado no instante da
    // criação; se essa altura mudar depois (ex.: iframe embutido num site
    // externo redimensionado pelo script de auto-resize do host DEPOIS do
    // primeiro paint, ou teclado virtual/barra do navegador mobile
    // recolhendo), o observer antigo ficaria com uma faixa de detecção
    // errada pro resto da sessão — a categoria ativa parava de acompanhar a
    // rolagem exatamente nesses casos (mesmo código, mesmo comportamento no
    // acesso direto — onde o viewport raramente muda de tamanho depois do
    // mount).
    let obsSecoes;
    const criarObservers = () => {
      obsSecoes?.disconnect();
      visiveisAbaixoDaLinha.clear();
      obsSecoes = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const id = entry.target.dataset.catId;
          if (entry.isIntersecting) visiveisAbaixoDaLinha.add(id); else visiveisAbaixoDaLinha.delete(id);
        });
        escolher();
      }, { root: el, rootMargin: `-${linha}px 0px 0px 0px`, threshold: 0 });
      Object.values(secRefs.current).forEach((secEl) => secEl && obsSecoes.observe(secEl));
      escolher();
    };
    criarObservers();

    // ResizeObserver no container de rolagem em si (não no header/barra —
    // esses já têm o próprio ResizeObserver acima, que atualiza headerH/
    // catBarH e por tabela recria este efeito). Debounce curto: um
    // redimensionamento real dispara várias entradas seguidas (ex.: iframe
    // ajustando altura em passos).
    let debounceResize = 0;
    const roEl = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      clearTimeout(debounceResize);
      debounceResize = setTimeout(criarObservers, 120);
    }) : null;
    roEl?.observe(el);

    // Backstop por GEOMETRIA (sempre ligado, além do observer): em webviews/
    // navegadores in-app (Safari iOS, WhatsApp/Instagram in-app browser) o
    // IntersectionObserver com root+rootMargin às vezes não dispara direito e a
    // categoria ativa "congela". Este recálculo a cada rolagem (throttle rAF)
    // é barato, determinístico e funciona em todo lugar: a categoria ativa é a
    // ÚLTIMA seção cujo topo já passou da linha de referência (a que está fixa
    // sob a barra agora). Só re-renderiza quando o valor realmente muda.
    let rafGeom = 0;
    const calcGeom = () => {
      if (rolandoPorCliqueRef.current) return;
      let atual;
      if (el.scrollTop <= 0) {
        atual = primeira;
      } else if (grupos.length && el.scrollHeight - el.scrollTop - el.clientHeight <= 120) {
        // Fim da rolagem: a última categoria é a ativa assim que seus produtos
        // aparecem — sem precisar de espaço vazio para "empurrá-la" até o topo.
        atual = grupos[grupos.length - 1].id;
      } else {
        atual = primeira;
        for (const g of grupos) {
          const secEl = secRefs.current[g.id];
          if (secEl && secEl.getBoundingClientRect().top - linha <= 0) atual = g.id;
        }
      }
      setCatAtivaId((cur) => (cur === atual ? cur : atual));
    };
    const onScrollGeom = () => { if (rafGeom) return; rafGeom = requestAnimationFrame(() => { rafGeom = 0; calcGeom(); }); };
    el.addEventListener("scroll", onScrollGeom, { passive: true });
    calcGeom();

    return () => {
      obsSecoes?.disconnect();
      clearTimeout(debounceEscolha);
      roEl?.disconnect();
      clearTimeout(debounceResize);
      el.removeEventListener("scroll", onScrollGeom);
      cancelAnimationFrame(rafGeom);
    };
  }, [grupos, headerH, catBarH]);
  // Mantém o chip ativo visível (e centralizado) na barra horizontal — rola
  // SÓ a barra (catBarRef.scrollTo no eixo X), calculado na mão, em vez de
  // chip.scrollIntoView(). Causa raiz confirmada com teste real de navegador
  // (Playwright): scrollIntoView() sobe por TODOS os ancestrais roláveis do
  // chip — inclusive #root, o scroll VERTICAL real da tela — e mesmo pedindo
  // block:"nearest" ele podia emitir um ajuste vertical em #root que
  // colidia com o scrollTo({top,...}) do clique na categoria (ver
  // `selecionarCategoria`), cancelando a rolagem suave no meio do caminho
  // (ela parava sempre por volta de 200-240px, o ponto em que a 1ª seção
  // cruzava a faixa de detecção e a categoria ativa mudava). Rolar só a
  // barra, sem tocar em #root, elimina esse conflito de vez.
  useEffect(() => {
    // A rolagem horizontal acontece na div INTERNA (overflow-x-auto), não na
    // externa (catBarRef, que só mede altura). Rolar a externa não fazia nada —
    // por isso o chip ativo (ex.: a última categoria) nunca aparecia na barra.
    const barra = catScrollRef.current;
    const chip = chipRefs.current[catAtivaId];
    if (!barra || !chip) return;
    const rectBarra = barra.getBoundingClientRect();
    const rectChip = chip.getBoundingClientRect();
    const delta = (rectChip.left + rectChip.width / 2) - (rectBarra.left + rectBarra.width / 2);
    const alvoLeft = Math.max(0, barra.scrollLeft + delta);
    barra.scrollTo({ left: alvoLeft, behavior: motionOk() ? "smooth" : "auto" });
  }, [catAtivaId]);
  const selecionarCategoria = (id) => {
    setCatAtivaId(id);
    const el = scrollEl();
    // Trava a sincronização durante a rolagem programática — sem isso, o
    // clique em "Sobremesas" (por ex.) piscaria pelas categorias que ficam no
    // caminho até chegar lá. Destrava assim que a rolagem realmente ACABAR
    // (evento nativo "scrollend", quando suportado) — o timeout abaixo existe
    // só como rede de segurança pros navegadores sem esse evento, não é a
    // solução principal.
    clearTimeout(cliqueTimeoutRef.current);
    rolandoPorCliqueRef.current = true;
    const destravar = () => { rolandoPorCliqueRef.current = false; };
    if (el && "onscrollend" in el) {
      el.addEventListener("scrollend", destravar, { once: true });
      cliqueTimeoutRef.current = setTimeout(destravar, 1500);
    } else {
      cliqueTimeoutRef.current = setTimeout(destravar, 700);
    }
    // Destino calculado explicitamente (getBoundingClientRect().top + rolagem
    // atual - offset fixo) em vez de confiar só em scrollIntoView(): o
    // comportamento dele ao respeitar scroll-margin-top dentro de um
    // container de rolagem que não é a window (aqui é #root — ver `scrollEl`)
    // é inconsistente entre navegadores. scroll-margin-top continua no CSS de
    // cada seção como proteção complementar (ex.: navegação nativa por
    // âncora/foco), não como o mecanismo principal.
    const comportamento = motionOk() ? "smooth" : "auto";
    const rolarAte = (elAlvo, stickyOffset) => {
      if (!el || !elAlvo) return;
      const destino = calcularDestinoScroll({ rectTop: elAlvo.getBoundingClientRect().top, scrollAtual: el.scrollTop, stickyOffset });
      el.scrollTo({ top: destino, behavior: comportamento });
    };
    if (id === CATEGORIA_TODOS) { rolarAte(topoRef.current, 0); return; }
    rolarAte(secRefs.current[id], headerH + catBarH + 8);
  };
  // Ofertas: ícone/resumo/validade por tipo + clique leva ao combo/categoria
  const combosRef = useRef(null);
  const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const fmtHora = (h) => { if (!h) return ""; const hh = h.slice(0, 2), mm = h.slice(3, 5); return mm === "00" ? `${hh}h` : `${hh}h${mm}`; };
  // Ícone da oferta por tipo — SVG inline (não emoji: renderização consistente
  // entre iOS/Android/Windows, mesmo icon-set do resto do app).
  const iconeOferta = (p) => p.tipo === "combo" ? CkIconSacola : p.tipo === "horario" ? CkIconRelogio : p.tipo === "destaque" ? CkIconEstrela : p.tipo === "valor" ? CkIconCarteira : CkIconTag;
  const validadeOferta = (p) => {
    const partes = [];
    if (Array.isArray(p.diasSemana) && p.diasSemana.length > 0 && p.diasSemana.length < 7) partes.push(p.diasSemana.map((d) => DIAS_CURTOS[d]).join(", "));
    if (p.horaInicio || p.horaFim) partes.push(`${fmtHora(p.horaInicio) || "…"}–${fmtHora(p.horaFim) || "…"}`);
    return partes.join(" · ");
  };
  const clicarOferta = (p) => {
    if (p.tipo === "combo") { combosRef.current?.scrollIntoView({ behavior: motionOk() ? "smooth" : "auto", block: "center" }); return; }
    const catNome = p.categoriaId != null ? catNomePorId[p.categoriaId] : null;
    const grupoAlvo = catNome ? grupos.find((g) => g.nome === catNome) : null;
    // Sempre passa por selecionarCategoria (mesmo no fallback pro topo) —
    // única fonte de verdade da categoria ativa, sem caminho paralelo que
    // rola a tela sem atualizar catAtivaId.
    selecionarCategoria(grupoAlvo ? grupoAlvo.id : CATEGORIA_TODOS);
  };
  // Favoritos do cliente (mesma chave/persistência do ProdutoModal). Recomputa
  // quando o modal (detalhe) abre/fecha — assim o coração marcado lá reflete
  // no card sem precisar recarregar. É o "payoff" do favoritar: o produto fica
  // sinalizado na lista, em vez de o coração ser um beco sem saída.
  const favSet = useMemo(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`pedidoPrime:favoritos:${loja?.id || "geral"}`) || "[]")); }
    catch { return new Set(); }
  }, [loja?.id, detalhe]);
  const renderProduto = (item) => {
    const indisponivel = item.disponivel === false;
    const personalizavel = (item.ingredients || []).length > 0;
    const promo = promoDoProduto(item);
    const favorito = favSet.has(item.id);
    // lojaId garante que a chave de favoritos do ProdutoModal case com a lida
    // aqui (mesma loja) — o coração marcado no modal reflete no card.
    // Abre o modal com o produto já no preço promocional (carrinho/total refletem o desconto)
    const abrir = () => setDetalhe(promo
      ? { ...item, lojaId: item.lojaId ?? loja?.id, price: promo.preco, precoOriginal: promo.original, economiaUnit: promo.original - promo.preco }
      : { ...item, lojaId: item.lojaId ?? loja?.id });
    const destaque = promo || (item.isFeatured && !indisponivel);
    return (
      <article key={item.id} className={`flex h-full gap-3 rounded-[1.25rem] border bg-[var(--client-surface)] p-3 shadow-[var(--client-shadow-sm)] ${destaque ? "border-[var(--client-offer-border)]" : "border-[var(--client-border)]"}`}>
        {/* Imagem — alvo de toque que abre a personalização. */}
        <button type="button" onClick={() => !indisponivel && abrir()} disabled={indisponivel}
          aria-label={indisponivel ? `${item.name} — indisponível` : `Ver ${item.name}`}
          className="relative shrink-0 transition active:scale-[0.98] disabled:cursor-not-allowed">
          <span className="block h-[84px] w-[84px] overflow-hidden rounded-2xl bg-[var(--client-surface-secondary)]">
            <img src={item.imageUrl || fallbackImage} alt={item.name} loading="lazy" decoding="async"
              onError={(e) => { if (e.currentTarget.src !== fallbackImage) e.currentTarget.src = fallbackImage; }}
              className={`h-full w-full object-cover ${indisponivel ? "grayscale opacity-50" : ""}`} />
          </span>
          {personalizavel && !indisponivel && (
            <span aria-hidden="true" title="Personalizável" className="pointer-events-none absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--client-border)] bg-[var(--client-surface)] text-[var(--client-text-secondary)] shadow-[var(--client-shadow-sm)]">
              <CkIconAjustes width={14} height={14} strokeWidth={2.2} />
            </span>
          )}
          {promo && !indisponivel && <span className="absolute right-1.5 top-1.5 rounded-full bg-[var(--client-offer-hover)] px-1.5 py-0.5 text-[9px] font-black text-white shadow-[var(--client-shadow-sm)]">{promo.label}</span>}
          {indisponivel && <span className="absolute left-1/2 top-1/2 w-max -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--client-border)] bg-white/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[var(--client-text-secondary)]">Indisponível</span>}
          {favorito && !indisponivel && (
            <span aria-label="Favorito" title="Favorito" className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--client-surface)] text-[var(--client-primary-hover)] shadow-[var(--client-shadow-sm)]">
              <CkIconCoracao width={13} height={13} />
            </span>
          )}
        </button>

        {/* Conteúdo — nome/descrição/tempo e, embaixo, preço + "+". */}
        <div className="flex min-w-0 flex-1 flex-col">
          <button type="button" onClick={() => !indisponivel && abrir()} disabled={indisponivel}
            aria-label={indisponivel ? `${item.name} — indisponível` : `Ver ${item.name}`}
            className="text-left transition disabled:cursor-not-allowed">
            {item.isFeatured && !indisponivel && (
              <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[var(--client-primary-soft)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--client-primary-hover)]">
                <CkIconEstrela width={10} height={10} /> {item.featuredLabel || "Mais vendido"}
              </span>
            )}
            <h3 className="text-[15px] font-black leading-tight text-[var(--client-text-primary)] line-clamp-2">{item.name}</h3>
            {item.description && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--client-text-secondary)]">{item.description}</p>}
            {item.time && (
              <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--client-text-muted)]">
                <CkIconRelogio width={11} height={11} /> {item.time}
              </p>
            )}
          </button>

          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            {promo
              ? <span className="flex flex-col gap-0.5 leading-none">
                  <span className="text-[11px] font-bold text-[var(--client-text-muted)] line-through">{formatCurrency(promo.original)}</span>
                  <span className="text-base font-black text-[var(--client-offer-hover)]">{formatCurrency(promo.preco)}</span>
                  <span className="mt-0.5 inline-flex w-max items-center rounded-md bg-[var(--client-offer-soft)] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-[var(--client-offer-hover)]">Economize {formatCurrency(promo.original - promo.preco)}</span>
                </span>
              : <span className="text-base font-black text-[var(--client-text-primary)]">{formatCurrency(item.price)}</span>}
            {indisponivel
              ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--client-border)] bg-[var(--client-surface-secondary)] text-[var(--client-text-muted)]">✕</span>
              : <button onClick={abrir} aria-label={`Adicionar ${item.name}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full btn-laranja bg-[var(--client-primary-hover)] text-lg font-black text-white shadow-[var(--client-shadow-sm)] transition active:scale-90 hover:bg-[var(--client-primary)]">+</button>}
          </div>
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
  // Guarda os pedidos pendentes vistos AINDA ATIVOS nesta sessão — só eles podem
  // abrir a pesquisa ao concluir (evita disparar por um pedido antigo já concluído
  // carregado do banco ao digitar a comanda). É um ref (não reinicia por re-render).
  const pendVistosAtivosRef = useRef(new Set());
  useEffect(() => {
    // A pesquisa NÃO deve abrir para um pedido que já chegou concluído (ex.: ao
    // DIGITAR A COMANDA, `orders` recarrega e pode trazer um pedido antigo, de
    // outra sessão, já pago+entregue). Só pesquisamos um pedido cujo CICLO
    // acompanhamos NESTA sessão: registramos os pendentes vistos ainda ATIVOS e
    // só disparamos quando um deles TRANSICIONA para concluído sob nossos olhos.
    // (+ não interromper: adia enquanto gaveta/modal aberto — aba/detalhe.)
    if (survey || aba || detalhe) return;
    const pend = lerSetLS(SURVEY_PEND_KEY);
    if (pend.size === 0) return;
    const done = lerSetLS(SURVEY_DONE_KEY);
    const concl = (o) => o.paymentStatus === "paid" && o.status === "delivered";
    for (const o of orders) {
      if (pend.has(o.id) && !done.has(o.id) && !concl(o)) pendVistosAtivosRef.current.add(o.id);
    }
    const alvo = orders.find((o) => pend.has(o.id) && !done.has(o.id) && concl(o) && pendVistosAtivosRef.current.has(o.id));
    if (alvo) setSurvey({ pedidoId: alvo.id, mesa: alvo.table, origem: (alvo.table === "Externo" || /^EXT-/.test(alvo.command || "")) ? "externo" : "mesa" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, survey, aba, detalhe]);
  const subtotal = meusPedidos.reduce((s, o) => s + o.items.reduce((a, i) => a + i.price * i.quantity, 0), 0);
  const totalMesa = subtotal * 1.1;
  const totalCart = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const economiaCart = cart.reduce((s, i) => s + (Number(i.economiaUnit) || 0) * i.quantity, 0);
  const qtdCart = cart.reduce((s, i) => s + i.quantity, 0);
  const podeFechar = meusPedidos.length > 0 && meusPedidos.every((o) => o.status === "delivered");
  const contaSolicitada = meusPedidos.some((o) => o.paymentStatus === "requested");
  const contaPaga = meusPedidos.length > 0 && meusPedidos.every((o) => o.paymentStatus === "paid");
  // Conta "paga só depois do consumo": nenhum pedido desta conta declarou
  // forma de pagamento no ato (ver regra do checkout — consumo no local e
  // mesa/QR sempre ficam assim; retirada/entrega com forma escolhida, não).
  // Dado real por pedido (pagamentoForma), não um palpite pelo tipoPedido atual.
  const pagamentoPosteriorConta = meusPedidos.length > 0 && meusPedidos.every((o) => !o.pagamentoForma);
  // Status geral do atendimento (só combina os 3 status oficiais já existentes
  // — status operacional e status_pagamento — nunca um valor inventado).
  const statusGeralConta = meusPedidos.length === 0 ? null
    : contaSolicitada ? "Fechamento solicitado"
    : contaPaga ? "Pagamento confirmado"
    : podeFechar ? "Pedidos entregues"
    : meusPedidos.some((o) => o.status === "ready") ? "Pedido pronto"
    : meusPedidos.some((o) => o.status === "preparing") ? "Em preparação"
    : "Pedido recebido";
  // Cor do selo "visão geral" — deriva das MESMAS condições acima (nunca
  // reinterpreta o texto): aguardando ação (solicitado/em preparação) fica
  // âmbar; concluído (pago/entregues/pronto) fica verde; recebido fica azul.
  const tomStatusGeral = contaSolicitada ? "warning"
    : contaPaga || podeFechar || meusPedidos.some((o) => o.status === "ready") ? "success"
    : meusPedidos.some((o) => o.status === "preparing") ? "warning"
    : "info";
  // meusPedidos vem ordenado do mais recente pro mais antigo (mesma ordem de
  // `orders`, já ordenado pelo backend) — o último da lista é o mais antigo,
  // ou seja, o horário de abertura da conta.
  const contaAbertaEm = meusPedidos.length > 0 ? meusPedidos[meusPedidos.length - 1].createdAt : null;

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
    if (!loja || chamandoRef.current) return;
    chamandoRef.current = true;
    setChamando(tipo);
    const args = { lojaId: loja.id, mesa: mesa ? `Mesa ${String(mesa).padStart(2, "0")}` : "", comanda: comanda || "", tipo };
    try { await (cardapioViaRpc() ? rpcCriarChamadoPublico(args) : criarChamado(args)); setMsg({ t: "success", m: `${rotulo} — a equipe foi avisada.` }); }
    catch { setMsg({ t: "error", m: "Não foi possível enviar o chamado agora." }); }
    finally { chamandoRef.current = false; setChamando(""); }
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
      // Forma de pagamento (aba "Pagamento" — vale para pedido interno e
      // externo, EXCETO consumo no local: nesse caso o pagamento acontece só
      // no fechamento da conta, então não exige escolha nenhuma agora —
      // formaSel fica null, e o pedido é criado sem forma/momento de
      // pagamento definidos (pagamento_forma/pagamento_momento aceitam null
      // em todo o caminho: coluna, RPC pub_criar_pedido e inserirPedido —
      // conferido nas migrations 061/065/066, nenhuma mudança de banco
      // necessária).
      let formaSel = null;
      let trocoParaNum = null;
      if (exigePagamentoAgora) {
        if (formasPagto.length === 0) return setMsg({ t: "error", m: "Nenhuma forma de pagamento está disponível no momento." });
        formaSel = formasPagto.find((f) => f.id === formaPagto);
        if (!formaSel) return setMsg({ t: "error", m: "Escolha a forma de pagamento." });
        // Troco (só relevante em Dinheiro): se o cliente disse que precisa,
        // exige um valor válido e maior ou igual ao total do pedido — não faz
        // sentido "pagar com" menos do que se deve.
        if (formaSel.id === "dinheiro") {
          if (!trocoResposta) return setMsg({ t: "error", m: "Informe se precisa de troco." });
          if (trocoResposta === "sim") {
            trocoParaNum = parseMoedaBR(trocoValor);
            if (!(trocoParaNum > 0)) return setMsg({ t: "error", m: "Informe o valor que vai usar para pagar." });
            if (trocoParaNum < totalCart) return setMsg({ t: "error", m: `O valor deve ser de pelo menos ${formatCurrency(totalCart)} (total do pedido).` });
          }
        }
      }
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
        pagamentoForma: formaSel?.label ?? null, pagamentoMomento: momentoPagto, pagamentoTrocoPara: trocoParaNum,
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
        pagamentoForma: formaSel?.label ?? null, pagamentoMomento: momentoPagto, pagamentoTrocoPara: trocoParaNum,
      };
    }
    try {
      let pedidoId = novo.id;
      const mesaNumero = modoExterno ? null : (Number(mesa) || null);
      const mesaId = modoExterno ? null : (mesaCadastrada?.id ?? null);
      if (cardapioViaRpc()) { const r = await rpcCriarPedidoPublico({ lojaId: loja.id, mesa: novo.table, comanda: novo.command, cliente: novo.customer, telefone: novo.clienteTelefone || "", itens, pagForma: formaSel?.label ?? null, pagMomento: momentoPagto, mesaNumero, mesaId, trocoPara: trocoParaNum }); if (r) pedidoId = r; }
      else await inserirPedido(novo);
      // A Pesquisa de Satisfação NÃO aparece agora — só quando o pedido CONCLUIR
      // (pago + retirado/entregue). Registra o pedido como pendente de pesquisa.
      try { const pend = lerSetLS(SURVEY_PEND_KEY); pend.add(pedidoId); salvarSetLS(SURVEY_PEND_KEY, pend); } catch {}
      setCart([]); setTrocoResposta(""); setTrocoValor(""); setAba("conta");
      setMsg({ t: "success", m: modoExterno && tipoPedido === "local"
        ? "Pedido enviado com sucesso. Foi encaminhado para preparação — o pagamento será feito no fechamento da conta."
        : "Pedido enviado com sucesso. Foi encaminhado para preparação." });
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

  // Confirma (2º passo, após o diálogo) a solicitação — ou o reenvio — do
  // fechamento ao caixa. Trava síncrona (solicitandoRef) contra clique duplo,
  // mesmo padrão já usado em enviar()/enviandoRef: sem ela, dois toques
  // rápidos no botão de confirmação do diálogo poderiam disparar duas
  // solicitações antes do estado "solicitando" refletir no botão.
  async function confirmarSolicitarConta() {
    setConfirmarFechamento(false);
    if (!podeFechar || solicitandoRef.current) return;
    solicitandoRef.current = true;
    setSolicitando(true);
    const reenvio = contaSolicitada;
    try {
      if (cardapioViaRpc()) {
        const comandas = [...new Set(meusPedidos.map((o) => o.command).filter(Boolean))];
        await Promise.all(comandas.map((c) => rpcSolicitarContaPublico({ lojaId: loja.id, comanda: c })));
      } else {
        await Promise.all(meusPedidos.map((o) => atualizarPedido(o.id, { status_pagamento: "solicitado" })));
      }
      setMsg({ t: "success", m: reenvio ? "Solicitação reenviada ao caixa." : "Fechamento solicitado ao caixa." });
    } catch { setMsg({ t: "error", m: "Erro ao solicitar a conta. Tente novamente." }); }
    finally { setSolicitando(false); solicitandoRef.current = false; }
  }

  // ── Estados de carregamento/erro ───────────────────────────
  if (loja === undefined) return <CardapioSkeleton />;
  if (loja === null) return <Centro><span className="text-5xl">🔍</span><p className="mt-3 font-black text-[var(--client-text-primary)]">Empresa não encontrada</p><p className="mt-1 text-sm text-[var(--client-text-secondary)]">Verifique o link/QR do cardápio.</p></Centro>;
  if (!canalPermitido) return mesaURL
    ? <Centro><span className="text-5xl">📵</span><p className="mt-3 font-black text-[var(--client-text-primary)]">QR por mesa indisponível</p><p className="mt-1 text-sm text-[var(--client-text-secondary)]">O QR Code por mesa está disponível nos modos Interno ou Ambos.</p></Centro>
    : <Centro><span className="text-5xl">📵</span><p className="mt-3 font-black text-[var(--client-text-primary)]">Cardápio externo indisponível</p><p className="mt-1 text-sm text-[var(--client-text-secondary)]">Esta empresa não habilitou o cardápio digital para o cliente.</p></Centro>;
  if (mesaURL && !mesaValida) return <Centro><span className="text-5xl">🚫</span><p className="mt-3 font-black text-[var(--client-text-primary)]">QR Code inválido</p><p className="mt-1 text-sm text-[var(--client-text-secondary)]">Esta mesa não foi encontrada ou está inativa. Fale com a equipe do estabelecimento.</p></Centro>;
  // Nunca libera o cardápio antes de saber se a mesa está ocupada — evita
  // qualquer flash do cardápio antes do modal de confirmação aparecer.
  if (mesaURL && podeMesa && mesaCadastrada && statusMesa === null) return <Centro><Spinner /><p className="mt-3 text-sm text-[var(--client-text-secondary)]">Verificando a mesa…</p></Centro>;
  // Cliente recusou a confirmação de mesa ocupada — bloqueia e orienta a
  // escanear o QR certo (não deixa seguir para o cardápio).
  if (mesaURL && ocupacaoRecusada) return <Centro><span className="text-5xl">🔍</span><p className="mt-3 font-black text-[var(--client-text-primary)]">Confira o QR Code</p><p className="mt-1 text-sm text-[var(--client-text-secondary)]">Escaneie o QR Code afixado na sua mesa para continuar.</p></Centro>;
  // Confirmação OBRIGATÓRIA de mesa ocupada — status vem sempre do backend
  // (pub_status_mesa, migration 067), nunca de cache. Só aparece quando
  // realmente ocupada (nunca para mesa disponível) e bloqueia o cardápio até
  // o cliente responder.
  if (mesaURL && statusMesa?.ocupada && !ocupacaoConfirmada) {
    const numeroFmt = String(statusMesa.numero ?? mesaURL).padStart(2, "0");
    return (
      <div data-theme="light" className="tema-claro-area fixed inset-0 z-[130] flex min-h-screen w-full max-w-[100vw] items-center justify-center overflow-x-hidden bg-black/60 p-6 backdrop-blur-sm" style={{ minHeight: "100dvh" }}>
        <div role="alertdialog" aria-modal="true" aria-labelledby="msg-mesa-ocupada" className="w-full max-w-sm rounded-3xl border border-[var(--client-border)] bg-[var(--client-surface)] p-5 text-center shadow-[var(--client-shadow-floating)]">
          <p className="text-3xl">🍽️</p>
          <p id="msg-mesa-ocupada" className="mt-2 text-base font-black text-[var(--client-text-primary)]">Esta mesa já está ocupada.</p>
          <p className="mt-1 text-sm text-[var(--client-text-secondary)]">
            Você está realmente na <b className="text-[var(--client-text-primary)]">Mesa {numeroFmt}{statusMesa.nome ? ` — ${statusMesa.nome}` : ""}</b>?
          </p>
          <p className="mt-2 text-xs text-[var(--client-text-muted)]">Ao continuar, seu pedido será adicionado aos pedidos já existentes desta mesa.</p>
          <div className="mt-4 flex flex-col gap-2">
            <button onClick={() => setOcupacaoConfirmada(true)} type="button" className="min-h-[44px] w-full rounded-2xl btn-laranja bg-[var(--client-primary-hover)] py-3 text-sm font-black text-white transition active:scale-95 hover:bg-[var(--client-primary)]">
              Sim, estou na Mesa {numeroFmt}
            </button>
            <button onClick={() => setOcupacaoRecusada(true)} type="button" className="min-h-[44px] w-full rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] py-3 text-sm font-black text-[var(--client-text-secondary)] transition active:scale-95 hover:bg-[var(--client-surface-secondary)]">
              Não, cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Tela de boas-vindas (somente no modo mesa via QR) ──────────
  if (etapa === "welcome") {
    // Status de funcionamento só aparece quando HÁ horário cadastrado para hoje
    // (sem configuração não há o que informar — evita "Fechado" enganoso).
    const temHorarioHoje = diaTemHorario(cfgExt.horarios, agora, cfgExt.fusoHorario);
    const lojaStatus = abertoAgora ? "aberto" : temHorarioHoje ? "fechado" : null;
    return (
      <div data-theme="light" className="tema-claro-area flex min-h-screen w-full max-w-[100vw] flex-col overflow-x-hidden bg-[var(--client-background)] px-6 text-[var(--client-text-primary)]"
        style={{ minHeight: "100dvh", paddingTop: "calc(env(safe-area-inset-top) + 2rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
          {loja.logoUrl ? <img src={loja.logoUrl} alt="" className="h-20 w-20 rounded-3xl border border-[var(--client-border)] object-cover shadow-[var(--client-shadow-sm)]" /> : <LogoPP size={80} />}
          <h1 className="page-title mt-5 text-2xl font-bold tracking-tight text-[var(--client-text-primary)]">{loja.nome}</h1>
          {(currentTable || lojaStatus) && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {currentTable && <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] px-4 py-1.5 text-sm font-bold text-[var(--client-primary-hover)]"><CkIconMesa width={14} height={14} /> {currentTable}</span>}
              {lojaStatus === "aberto" && <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--client-success-border)] bg-[var(--client-success-soft)] px-3.5 py-1.5 text-sm font-bold text-[var(--client-success)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--client-success)]" aria-hidden="true" /> Aberto agora</span>}
              {lojaStatus === "fechado" && <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--client-status-neutral-border)] bg-[var(--client-status-neutral-soft)] px-3.5 py-1.5 text-sm font-bold text-[var(--client-status-neutral)]"><CkIconRelogio width={13} height={13} /> Fechado no momento</span>}
            </div>
          )}
          <p className="mt-6 text-lg font-bold text-[var(--client-text-primary)]">Bem-vindo!</p>
          <p className="mt-1 text-sm leading-6 text-[var(--client-text-secondary)]">Faça seu pedido de forma rápida e prática direto pelo celular.</p>
          <div className="mt-8 flex w-full flex-col items-center">
            <button onClick={() => setEtapa("cardapio")} className="w-full min-h-[52px] rounded-2xl btn-laranja bg-[var(--client-primary-hover)] py-4 text-base font-black text-white shadow-[var(--client-shadow-sm)] transition active:scale-95 hover:bg-[var(--client-primary)]">Ver cardápio</button>
            {meusPedidos.length > 0 && (
              <button onClick={() => { setEtapa("cardapio"); setAba("conta"); }} className="mt-4 inline-flex min-h-11 items-center gap-1.5 px-3 text-sm font-bold text-[var(--client-info)] transition hover:text-[var(--client-info-hover)]">
                <CkIconRecibo width={15} height={15} /> Acompanhar meu pedido ({meusPedidos.length})
              </button>
            )}
          </div>
          {!modoExterno && mesa && (
            <div className="mt-8 w-full">
              {/* Chamados SÓ-ÍCONE — mesmo padrão do header do cardápio (grafite
                  neutro sobre superfície secundária = ação secundária). aria-label
                  + title para clareza/acessibilidade; a legenda "Precisa de algo?"
                  dá o contexto do grupo. */}
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--client-text-secondary)]">Precisa de algo?</p>
              <div className="mt-2 flex justify-center gap-1.5">
                {[["garcom", CkIconSino, "Garçom", "Chamar garçom"], ["ajuda", CkIconAjuda, "Ajuda", "Pedir ajuda"], ["limpeza", CkIconLimpeza, "Limpeza", "Solicitar limpeza"]].map(([t, Icone, rotulo, aria]) => {
                  const emAndamento = chamando === t;
                  return (
                    <button key={t} onClick={() => chamar(t, rotulo)} disabled={!!chamando} aria-busy={emAndamento} aria-label={aria} title={aria}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--client-border)] bg-[var(--client-surface-secondary)] text-[var(--client-text-primary)] transition active:scale-90 hover:bg-[var(--client-border)] disabled:cursor-not-allowed disabled:opacity-60">
                      {emAndamento ? <CkIconSpinner /> : <Icone width={18} height={18} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {msg && <div className="mx-auto w-full max-w-md"><div role={msg.t === "error" ? "alert" : "status"} aria-live={msg.t === "error" ? "assertive" : "polite"} className={`rounded-2xl border px-4 py-2.5 text-center text-sm font-bold ${msg.t === "error" ? "border-[var(--client-error-border)] bg-[var(--client-error-soft)] text-[var(--client-error)]" : "border-[var(--client-success-border)] bg-[var(--client-success-soft)] text-[var(--client-success)]"}`}>{msg.m}</div></div>}
      </div>
    );
  }

  const minimoFalta = modoExterno && minimoExterno > 0 ? Math.max(0, minimoExterno - totalCart) : 0;
  // Consumo no local (pedido externo, tipoPedido "local"): o cliente paga só
  // no fechamento da conta — não faz sentido exigir PIX/cartão/dinheiro no
  // ato do pedido (o pedido nem está "pago", só fica em aberto até o caixa
  // fechar). Vale só para modoExterno+local; mesa (QR) e retirada/entrega
  // continuam exigindo a escolha normalmente, sem mudança de comportamento.
  // Acesso interno (mesa/QR) paga no caixa — não escolhe forma no app. Só o
  // canal externo (entrega/retirada) pede a forma de pagamento agora; consumo
  // no local também paga só no fechamento.
  const exigePagamentoAgora = modoExterno && tipoPedido !== "local";
  const pagtoOk = !exigePagamentoAgora || (formasPagto.length > 0 && formasPagto.some((f) => f.id === formaPagto));
  const podeEnviar = cart.length > 0 && pagtoOk && !bloqueioHorario && (!modoExterno || (
    aceitaExterno && opcoesEntrega.length > 0 && opcoesEntrega.some((o) => o.id === tipoPedido) && minimoFalta <= 0
  ));
  // Indicador de progresso do checkout (Pedido → Identificação → Confirmação —
  // nunca "Pagamento" como etapa obrigatória, ver regra do consumo no local).
  const identificacaoOk = modoExterno
    ? (cliente.trim().length > 0 && telDig.length >= 10 && !!tipoPedido && opcoesEntrega.some((o) => o.id === tipoPedido))
    : (!!mesa && Number(mesa) > 0 && mesaValida && (!!comURL || (isValidCommand(comanda) && comanda.split("-")[0] === loja.prefixo)));
  const etapasCheckout = [
    { label: "Pedido", feito: cart.length > 0 },
    { label: "Identificação", feito: identificacaoOk },
    { label: "Confirmação", feito: pagtoOk },
  ];
  const etapaAtualIdx = cart.length === 0 ? 0 : !identificacaoOk ? 1 : 2;
  const ICONES_ENTREGA = { local: CkIconGarfo, retirada: CkIconLoja, entrega: CkIconMoto };
  const ICONES_PAGTO = { pix: CkIconPix, cartao: CkIconCartao, dinheiro: CkIconDinheiro };
  const DESC_ENTREGA = {
    local: "Envie o pedido agora e pague somente no fechamento da conta.",
    retirada: "Retire o pedido diretamente no balcão do estabelecimento.",
    entrega: "Receba o pedido no endereço combinado com a equipe.",
  };
  return (
    <div ref={raizRef} data-theme="light" className="tema-claro-area min-h-screen w-full max-w-[100vw] bg-[var(--client-background)] text-[var(--client-text-primary)]" style={{ minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom) + 92px)" }}>
      {/* Cabeçalho */}
      {/* Cabeçalho + categorias num ÚNICO container sticky (top-0): grudam
          JUNTOS no topo por CSS nativo, sem depender do valor MEDIDO do header
          para posicionar a barra (o antigo top:headerH era frágil — soltava a
          barra quando a medição chegava errada). A medição (headerH/catBarH)
          continua só para o scroll-margin e o realce da categoria ativa. */}
      <div className="sticky top-0 z-30">
      <header ref={headerRef} className="border-b border-[var(--client-border)] bg-[var(--client-surface)] px-4 pb-3 backdrop-blur-xl" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
        {/* Header em UMA linha: logo + nome + ações SÓ-ÍCONE (garçom/ajuda/
            limpeza/QR). Antes eram 2 linhas (a de chamados ocupava ~50px); só
            ícones colapsa tudo numa linha e libera altura para os produtos.
            Cada ícone tem aria-label + title (a11y/desktop). Cor dos ícones =
            grafite (neutro/apoio) sobre superfície secundária — padrão da paleta
            para AÇÃO SECUNDÁRIA (o laranja fica reservado às ações primárias). */}
        <div className="mx-auto flex max-w-3xl items-center gap-2.5">
          {loja.logoUrl ? <img src={loja.logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-2xl object-cover" /> : <LogoPP size={44} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black leading-tight text-[var(--client-text-primary)] sm:text-lg">{loja.nome}</p>
            <p className="truncate text-xs text-[var(--client-text-secondary)] sm:text-sm">{currentTable ? `${currentTable}${comanda ? " · " + comanda : ""}` : "Cardápio digital"}</p>
          </div>
          {!modoExterno && mesa && (
            <div className="flex shrink-0 items-center gap-1.5">
              {[["garcom", CkIconSino, "Garçom", "Chamar garçom"], ["ajuda", CkIconAjuda, "Ajuda", "Pedir ajuda"], ["limpeza", CkIconLimpeza, "Limpeza", "Solicitar limpeza"]].map(([t, Icone, rotulo, aria]) => {
                const emAndamento = chamando === t;
                return (
                  <button key={t} onClick={() => chamar(t, rotulo)} disabled={!!chamando} aria-busy={emAndamento} aria-label={aria} title={aria}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--client-border)] bg-[var(--client-surface-secondary)] text-[var(--client-text-primary)] transition active:scale-90 hover:bg-[var(--client-border)] disabled:cursor-not-allowed disabled:opacity-60">
                    {emAndamento ? <CkIconSpinner /> : <Icone width={18} height={18} />}
                  </button>
                );
              })}
              <button onClick={abrirQr} aria-label="Ver QR Code da mesa" title="Ver QR Code"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--client-border)] bg-[var(--client-surface-secondary)] text-[var(--client-text-primary)] transition active:scale-90 hover:bg-[var(--client-primary-soft)]">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="18" y1="14" x2="18" y2="18"/><line x1="21" y1="14" x2="21" y2="21"/></svg>
              </button>
            </div>
          )}
        </div>
      </header>

      {bloqueioHorario && (
        <div className="mx-auto max-w-3xl px-4 pt-3">
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--client-error-border)] bg-[var(--client-error-soft)] px-4 py-2.5 text-center text-sm font-bold text-[var(--client-error)]">
            <CkIconAlerta width={16} height={16} /> Fechado no momento — pedidos indisponíveis fora do horário de funcionamento.
          </div>
        </div>
      )}

        {/* Categorias — fazem parte do container sticky acima (grudam junto com
            o cabeçalho). Fonte/altura compactas (text-sm, py-2): mais clean e
            libera altura para os produtos, sem perder legibilidade. Selecionada
            no laranja padrão da marca (--client-primary), sem ícone. */}
        <div ref={catBarRef} className="border-b border-[var(--client-border)] bg-[var(--client-surface)] shadow-[var(--client-shadow-sm)]">
          <div ref={catScrollRef} className="pp-noscrollbar mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-2">
          {cats.map((c) => { const ativo = catAtivaId === c.id;
            return (
              <button key={c.id} type="button" ref={(el) => (chipRefs.current[c.id] = el)} onClick={() => selecionarCategoria(c.id)}
                aria-current={ativo ? "true" : undefined} aria-pressed={ativo}
                className={`flex min-h-[34px] shrink-0 items-center rounded-full border px-3.5 text-sm font-bold transition duration-200 ${ativo ? "border-[var(--client-primary)] bg-[var(--client-primary-soft)] text-[var(--client-primary)]" : "border-[var(--client-border)] bg-[var(--client-surface)] text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]"}`}>
                {c.nome}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4">
        {/* Sentinela do topo — "Todos" rola até aqui (scrollIntoView); quem rola
            é #root, não a window. */}
        <div ref={topoRef} aria-hidden="true" style={{ scrollMarginTop: 0 }} />

        {/* Ofertas vigentes */}
        {promosVigentes.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[var(--client-offer-hover)]"><CkIconTag width={13} height={13} /> Ofertas de hoje</p>
            <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
              {promosVigentes.map((p) => {
                const ehCombo = p.tipo === "combo";
                const val = validadeOferta(p);
                return (
                  <button key={p.id} type="button" onClick={() => clicarOferta(p)}
                    className="group flex min-w-[200px] shrink-0 items-center gap-3 rounded-2xl border border-[var(--client-offer-border)] bg-[var(--client-offer-soft)] px-3.5 py-3 text-left shadow-[var(--client-shadow-sm)] transition active:scale-[0.97]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--client-offer-hover)]">{(() => { const Icone = iconeOferta(p); return <Icone width={17} height={17} />; })()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-[var(--client-text-primary)]">{p.nome}</p>
                      <p className="truncate text-xs font-black text-[var(--client-offer-hover)]">{promoResumoDesconto(p)}{ehCombo ? " · combo" : ""}</p>
                      {val && <p className="flex items-center gap-1 truncate text-[10px] font-bold text-[var(--client-text-secondary)]"><CkIconCalendario width={11} height={11} className="shrink-0" /> {val}</p>}
                    </div>
                    <span className="shrink-0 text-[var(--client-text-muted)] transition group-hover:translate-x-0.5">›</span>
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
              <div key={c.promo.id} className="rounded-2xl border border-[var(--client-offer-border)] bg-[var(--client-offer-soft)] p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-black text-[var(--client-text-primary)]"><CkIconSacola width={15} height={15} className="shrink-0 text-[var(--client-offer-hover)]" /> {c.promo.nome} <span className="rounded-full bg-[var(--client-offer-hover)] px-1.5 py-0.5 text-[9px] font-black text-white">COMBO</span></p>
                    {c.promo.descricao && <p className="mt-0.5 text-[11px] text-[var(--client-text-secondary)]">{c.promo.descricao}</p>}
                    <p className="mt-1 text-[11px] text-[var(--client-text-secondary)]">{c.itens.map((i) => i.name).join(" + ")}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {c.precoCombo < c.somaOriginal && <p className="text-[11px] font-bold text-[var(--client-text-muted)] line-through">{formatCurrency(c.somaOriginal)}</p>}
                    <p className="text-lg font-black text-[var(--client-text-primary)]">{formatCurrency(c.precoCombo)}</p>
                  </div>
                </div>
                <button onClick={() => adicionarCombo(c)} className="mt-2.5 w-full min-h-[44px] rounded-xl bg-[var(--client-offer-hover)] py-2.5 text-sm font-black text-white transition active:scale-95 hover:bg-[var(--client-offer)]">+ Adicionar combo</button>
              </div>
            ))}
          </div>
        )}

        {/* Cardápio dividido por grupo — cada seção é âncora do clique e da
            sincronização de rolagem (todas ficam visíveis ao mesmo tempo). */}
        <div className="pb-6">
          {grupos.length === 0 && <p className="py-10 text-center text-sm text-[var(--client-text-secondary)]">Nenhum produto disponível.</p>}
          {grupos.map((g) => (
            <section key={g.id} ref={(el) => (secRefs.current[g.id] = el)} id={`cat-${g.id}`} data-cat-id={g.id} style={{ scrollMarginTop: headerH + catBarH + 8 }}>
              <div className="sticky z-10 -mx-4 mb-3 mt-1 flex items-center gap-2 bg-[#F8F5F1]/95 px-4 py-1.5 backdrop-blur" style={{ top: headerH + catBarH }}>
                <span className="h-4 w-1 rounded-full bg-[var(--client-primary-hover)]" />
                <h2 className="text-sm font-black uppercase tracking-wide text-[var(--client-text-primary)]">{g.nome}</h2>
                <span className="text-[11px] font-bold text-[var(--client-text-muted)]">{g.produtos.length} {g.produtos.length === 1 ? "item" : "itens"}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {g.produtos.map(renderProduto)}
              </div>
            </section>
          ))}
        </div>
      </main>


      {/* Barra inferior fixa — resumo/Finalizar + Acompanhar/Carrinho.
          OCULTA quando qualquer overlay está aberto (gaveta carrinho/conta,
          modal de produto ou pesquisa): no iOS, um elemento position:fixed
          bottom-0 flutua ACIMA do teclado, reaparecendo sobre a gaveta e
          duplicando os botões ao focar um campo (ex.: comanda). Esconder na
          raiz resolve em iOS, Android e desktop. */}
      <div className={`fixed inset-x-0 bottom-0 z-40 border-t border-[var(--client-border)] bg-[var(--client-surface)] shadow-[0_-6px_24px_rgba(45,52,54,0.10)] ${(aba || detalhe || survey) ? "hidden" : ""}`} style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {/* Barra SÓLIDA full-width, colada na base (borda superior + sombra p/
            cima). Antes era um card flutuante (rounded + margens px-3/pb-2), que
            deixava o produto atrás VAZAR pelas laterais e por baixo. Agora ocupa
            toda a largura e a base, cobrindo o fundo. Conteúdo em UMA linha:
            carrinho + Acompanhar (ícone com contador de pedidos, petróleo) +
            Finalizar (laranja). */}
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2.5">
            <button onClick={() => setAba("carrinho")} disabled={cart.length === 0} aria-label={cart.length > 0 ? "Ver carrinho" : "Carrinho vazio"}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left disabled:cursor-default">
              <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${cart.length > 0 ? "bg-[var(--client-primary-soft)] text-[var(--client-primary-hover)]" : "bg-[var(--client-surface-secondary)] text-[var(--client-text-muted)]"}`}>
                <CkIconCarrinho width={20} height={20} />
                {qtdCart > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--client-primary-hover)] px-1 text-[11px] font-black text-white">{qtdCart}</span>}
              </span>
              <span className="min-w-0">
                {cart.length > 0 ? (
                  <><span className="block text-sm font-black text-[var(--client-text-primary)]">Ver carrinho</span><span className="block truncate text-xs text-[var(--client-text-secondary)]">{qtdCart} {qtdCart === 1 ? "item" : "itens"} · {formatCurrency(totalCart)}</span></>
                ) : meusPedidos.length > 0 ? (
                  // Com pedido ativo, o acompanhamento divide a barra: mensagem
                  // concisa (1 linha) p/ caber sem cortar nem espremer o texto.
                  <span className="block truncate text-sm font-black text-[var(--client-text-secondary)]">Carrinho vazio</span>
                ) : (
                  <><span className="block text-sm font-black text-[var(--client-text-secondary)]">Seu carrinho está vazio</span><span className="block truncate text-xs text-[var(--client-text-muted)]">Toque num produto para começar</span></>
                )}
              </span>
            </button>
            {meusPedidos.length > 0 && (() => {
              // Linha de processo AGRUPADA: um único mini-stepper que reflete a
              // etapa MAIS AVANÇADA já alcançada por qualquer pedido (= o último
              // status atualizado, já que o fluxo só avança), sempre atual. O
              // detalhe por pedido abre ao tocar (aba "conta"). Rótulo curto +
              // botão compacto p/ não espremer a mensagem do carrinho vazio.
              const TOM_CLS = {
                info:    "border-[var(--client-info-border)] bg-[var(--client-info-soft)] text-[var(--client-info)]",
                warning: "border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] text-[var(--client-warning)]",
                success: "border-[var(--client-success-border)] bg-[var(--client-success-soft)] text-[var(--client-success)]",
              };
              const DOT_CLS = { info: "bg-[var(--client-info)]", warning: "bg-[var(--client-warning)]", success: "bg-[var(--client-success)]" };
              const ORDEM = ["received", "preparing", "ready", "delivered"];
              const CURTO = ["Recebido", "Em preparo", "Pronto", "Entregue"];
              const stepIdx = Math.max(0, ...meusPedidos.map((o) => ORDEM.indexOf(o.status)));
              const tom = stepIdx >= 2 ? "success" : stepIdx === 1 ? "warning" : "info";
              return (
                <button onClick={() => setAba("conta")} aria-label={`Acompanhar pedidos — ${CURTO[stepIdx]}`} title="Acompanhar pedidos"
                  className={`relative flex h-12 shrink-0 items-center gap-2 rounded-2xl border px-3 transition active:scale-90 hover:brightness-95 ${TOM_CLS[tom]}`}>
                  <CkIconRecibo width={20} height={20} className="shrink-0" />
                  {cart.length === 0 && (
                    <span className="min-w-0 leading-tight">
                      <span className="block text-[10px] font-bold uppercase tracking-wide opacity-70">Meu pedido</span>
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden="true" className="flex shrink-0 gap-0.5">
                          {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 w-2.5 rounded-full bg-current ${i <= stepIdx ? "" : "opacity-25"}`} />)}
                        </span>
                        <span className="whitespace-nowrap text-xs font-black">{CURTO[stepIdx]}</span>
                      </span>
                    </span>
                  )}
                  <span className={`absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-black text-white ${DOT_CLS[tom]}`}>{meusPedidos.length}</span>
                </button>
              );
            })()}
            {cart.length > 0 && (
              <button onClick={() => setAba("carrinho")}
                className="flex h-12 shrink-0 items-center gap-1 rounded-2xl btn-laranja bg-[var(--client-primary-hover)] px-4 text-sm font-black text-white transition active:scale-95 hover:bg-[var(--client-primary)]">Finalizar&nbsp;›</button>
            )}
        </div>
      </div>

      {/* Mensagem */}
      {msg && (
        <div className={`fixed inset-x-0 z-[120] flex justify-center px-4`} style={{ bottom: "96px" }}>
          <div role={msg.t === "error" ? "alert" : "status"} aria-live={msg.t === "error" ? "assertive" : "polite"} className={`rounded-2xl border px-4 py-2.5 text-sm font-bold shadow-xl ${msg.t === "error" ? "border-[var(--client-error-border)] bg-[var(--client-error-soft)] text-[var(--client-error)]" : "border-[var(--client-success-border)] bg-[var(--client-success-soft)] text-[var(--client-success)]"}`}>{msg.m}</div>
        </div>
      )}

      {/* Pesquisa de Satisfação (na finalização do pedido) */}
      {survey && <SatisfactionSurvey onEnviar={finalizarComPesquisa} onPular={finalizarSemPesquisa} />}

      {/* Modal de produto (reutilizado) */}
      {detalhe && <ProdutoModal produto={detalhe} grupos={gruposOpcoes} opcoes={opcoes} onFechar={() => setDetalhe(null)} onAdicionar={addConfigurado} />}

      {/* Confirmação ao remover item avulso (não-combo) do carrinho */}
      {itemRemover && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => setItemRemover(null)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="msg-remover-item" className="w-full max-w-sm rounded-3xl border border-[var(--client-border)] bg-[var(--client-surface)] p-5 text-center shadow-[var(--client-shadow-floating)]" onClick={(e) => e.stopPropagation()}>
            <p className="text-3xl">🗑️</p>
            <p id="msg-remover-item" className="mt-2 text-base font-black text-[var(--client-text-primary)]">Remover item?</p>
            <p className="mt-1 text-sm text-[var(--client-text-secondary)]"><b className="text-[var(--client-text-primary)]">{itemRemover.quantity}× {itemRemover.name}</b> será removido do seu pedido.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setItemRemover(null)} type="button" className="min-h-[44px] flex-1 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] py-3 text-sm font-black text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]">Manter item</button>
              <button onClick={() => { removerItem(itemRemover._uid); setItemRemover(null); }} type="button" className="min-h-[44px] flex-1 rounded-2xl bg-[var(--client-error)] py-3 text-sm font-black text-white hover:bg-[var(--client-error-hover)]">Remover</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação ao remover item de combo */}
      {comboRemover && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => setComboRemover(null)}>
          <div className="w-full max-w-sm rounded-3xl border border-[var(--client-border)] bg-[var(--client-surface)] p-5 text-center shadow-[var(--client-shadow-floating)]" onClick={(e) => e.stopPropagation()}>
            <p className="text-3xl">🍔</p>
            <p className="mt-2 text-base font-black text-[var(--client-text-primary)]">Sair do combo?</p>
            <p className="mt-1 text-sm text-[var(--client-text-secondary)]">Ao remover <b className="text-[var(--client-text-primary)]">{comboRemover.name}</b>, o combo <b className="text-[var(--client-offer-hover)]">{comboRemover.comboNome}</b> será desfeito. Os demais itens deixam a regra do combo e <b className="text-[var(--client-text-primary)]">voltam ao preço normal</b>.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setComboRemover(null)} className="flex-1 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] py-3 text-sm font-black text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]">Manter combo</button>
              <button onClick={() => desfazerCombo(comboRemover)} className="flex-1 rounded-2xl bg-[var(--client-error)] py-3 text-sm font-black text-white hover:bg-[var(--client-error-hover)]">Remover assim mesmo</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação obrigatória antes de esvaziar o carrinho inteiro */}
      {confirmarLimpar && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => setConfirmarLimpar(false)}>
          <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-3xl border border-[var(--client-border)] bg-[var(--client-surface)] p-5 text-center shadow-[var(--client-shadow-floating)]" onClick={(e) => e.stopPropagation()}>
            <p className="text-3xl">🗑️</p>
            <p className="mt-2 text-base font-black text-[var(--client-text-primary)]">Limpar o carrinho?</p>
            <p className="mt-1 text-sm text-[var(--client-text-secondary)]">Todos os {qtdCart} {qtdCart === 1 ? "item" : "itens"} do seu pedido serão removidos.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmarLimpar(false)} type="button" className="min-h-[44px] flex-1 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] py-3 text-sm font-black text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]">Manter itens</button>
              <button onClick={limparCarrinho} type="button" className="min-h-[44px] flex-1 rounded-2xl bg-[var(--client-error)] py-3 text-sm font-black text-white hover:bg-[var(--client-error-hover)]">Limpar tudo</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação ao solicitar (ou reenviar) o fechamento da conta ao caixa —
          esta ação só AVISA o caixa; não marca a conta como paga nem gera
          baixa financeira (isso só acontece de verdade no caixa). */}
      {confirmarFechamento && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => setConfirmarFechamento(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="msg-fechar-conta" className="w-full max-w-sm rounded-3xl border border-[var(--client-border)] bg-[var(--client-surface)] p-5 text-center shadow-[var(--client-shadow-floating)]" onClick={(e) => e.stopPropagation()}>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--client-primary-soft)] text-[var(--client-primary-hover)]"><CkIconRecibo width={22} height={22} /></span>
            <p id="msg-fechar-conta" className="mt-3 text-base font-black text-[var(--client-text-primary)]">{contaSolicitada ? "Reenviar solicitação ao caixa?" : "Solicitar fechamento da conta?"}</p>
            <p className="mt-1 text-sm text-[var(--client-text-secondary)]">{contaSolicitada ? "Confirme para avisar novamente o caixa sobre o fechamento da sua conta." : "Confirme para avisar o caixa que você deseja finalizar o atendimento."}</p>
            <p className="mt-3 rounded-2xl bg-[var(--client-surface-secondary)] py-2.5 text-lg font-black text-[var(--client-text-primary)]">{formatCurrency(totalMesa)}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmarFechamento(false)} type="button" className="min-h-[44px] flex-1 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] py-3 text-sm font-black text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]">Continuar consumindo</button>
              <button onClick={confirmarSolicitarConta} type="button" className="min-h-[44px] flex-1 rounded-2xl btn-laranja bg-[var(--client-primary-hover)] py-3 text-sm font-black text-white hover:bg-[var(--client-primary)]">{contaSolicitada ? "Reenviar" : "Solicitar fechamento"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal "Ver QR" — QR do link deste cardápio */}
      {qrModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => setQrModal(null)}>
          <div className="w-full max-w-xs rounded-3xl border border-[var(--client-border)] bg-[var(--client-surface)] p-5 text-center shadow-[var(--client-shadow-floating)]" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-black text-[var(--client-text-primary)]">{currentTable || loja.nome}</p>
            <img src={qrModal} alt="QR do cardápio" className="mx-auto w-full rounded-2xl bg-white p-2" />
            <p className="mt-3 text-xs text-[var(--client-text-secondary)]">Aponte a câmera para abrir este cardápio</p>
            <button onClick={() => setQrModal(null)} className="mt-4 w-full rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] py-2.5 text-sm font-black text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]">Fechar</button>
          </div>
        </div>
      )}

      {/* Gaveta: Carrinho */}
      {aba === "carrinho" && (
        <Gaveta titulo="Finalizar pedido" subtitulo={cart.length > 0 ? "Revise os dados antes de confirmar" : undefined} onFechar={() => setAba(null)}
          rodape={cart.length === 0 ? undefined : (
            <>
              {modoExterno && minimoExterno > 0 && (
                <p className={`mb-2 text-xs font-bold ${minimoFalta > 0 ? "text-[var(--client-warning)]" : "text-[var(--client-success)]"}`}>
                  {minimoFalta > 0 ? `Pedido mínimo de ${formatCurrency(minimoExterno)} — faltam ${formatCurrency(minimoFalta)}.` : `Pedido mínimo de ${formatCurrency(minimoExterno)} atingido.`}
                </p>
              )}
              <button onClick={enviar} disabled={!podeEnviar || enviando} type="button"
                className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black transition active:scale-95 ${(!podeEnviar || enviando) ? "bg-[var(--client-disabled-background)] text-[var(--client-disabled-text)]" : "btn-laranja bg-[var(--client-primary-hover)] text-white hover:bg-[var(--client-primary)]"}`}>
                {enviando && <CkIconSpinner />}
                {enviando ? "Enviando…" : bloqueioHorario ? "Pedido indisponível no momento" : "Confirmar e enviar pedido"}
              </button>
              {!enviando && !bloqueioHorario && (
                <p className="mt-2 text-center text-[11px] text-[var(--client-text-secondary)]">
                  {modoExterno && tipoPedido === "local" ? "Você pagará somente após o consumo." : `Pagamento: ${momentoPagto}.`}
                </p>
              )}
            </>
          )}>
          {bloqueioHorario && (
            <div className="mb-3 flex items-center gap-2.5 rounded-2xl border border-[var(--client-error-border)] bg-[var(--client-error-soft)] px-4 py-3">
              <CkIconAlerta className="shrink-0 text-[var(--client-error)]" />
              <div>
                <p className="text-sm font-bold text-[var(--client-error)]">Estabelecimento fechado no momento</p>
                <p className="mt-0.5 text-xs font-medium text-[var(--client-error-hover)]">Consulte os horários de atendimento.</p>
              </div>
            </div>
          )}

          {cart.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-[var(--client-text-secondary)]">Seu carrinho está vazio.</p>
              <button onClick={() => setAba(null)} type="button" className="mt-4 min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-5 py-2.5 text-sm font-black text-[var(--client-text-secondary)] transition hover:bg-[var(--client-surface-secondary)]">Voltar ao cardápio</button>
            </div>
          ) : (
            <>
              <EtapaProgresso etapas={etapasCheckout} atualIdx={etapaAtualIdx} />

              {/* Itens do pedido */}
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--client-text-secondary)]">Seu pedido</h3>
                  <button onClick={() => setConfirmarLimpar(true)} type="button" className="min-h-8 rounded-lg px-2 text-xs font-bold text-[var(--client-text-muted)] transition hover:bg-[var(--client-error-soft)] hover:text-[var(--client-error)]">Limpar carrinho</button>
                </div>
                <div className="space-y-2.5">
                  {cart.map((i) => <CardItemCarrinho key={i._uid} item={i} onRemover={pedirRemover} />)}
                </div>
              </div>

              {/* Forma de recebimento (externo) / mesa+comanda (interno) */}
              {modoExterno ? (
                <div className="mt-5 space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--client-text-secondary)]">Como deseja receber?</h3>
                  {!aceitaExterno ? (
                    <div className="rounded-2xl border border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] px-4 py-3 text-sm font-bold text-[var(--client-warning)]">Esta empresa não está aceitando pedidos pelo cardápio no momento.</div>
                  ) : opcoesEntrega.length === 0 ? (
                    <div className="rounded-2xl border border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] px-4 py-3 text-sm font-bold text-[var(--client-warning)]">Nenhuma forma de pedido disponível no momento.</div>
                  ) : (
                    <div role="radiogroup" aria-label="Como deseja receber o pedido" className="space-y-2">
                      {opcoesEntrega.map((o) => {
                        const Icone = ICONES_ENTREGA[o.id] || CkIconLoja;
                        const sel = tipoPedido === o.id;
                        return (
                          <button key={o.id} type="button" role="radio" aria-checked={sel} onClick={() => escolherTipoPedido(o.id)}
                            className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition ${sel ? "border-[var(--client-primary)] bg-[var(--client-primary-soft)]" : "border-[var(--client-border)] bg-[var(--client-surface)] hover:bg-[var(--client-surface-secondary)]"}`}>
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${sel ? "bg-[var(--client-primary-hover)] text-white" : "bg-[var(--client-surface-secondary)] text-[var(--client-text-secondary)]"}`}><Icone width={17} height={17} /></span>
                            <span className="min-w-0 flex-1">
                              <span className={`block text-sm font-black ${sel ? "text-[var(--client-primary-active)]" : "text-[var(--client-text-primary)]"}`}>{o.label}</span>
                              <span className="mt-0.5 block text-xs text-[var(--client-text-secondary)]">{DESC_ENTREGA[o.id]}</span>
                            </span>
                            <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${sel ? "border-[var(--client-primary)]" : "border-[var(--client-border-strong)]"}`}>{sel && <span className="h-2.5 w-2.5 rounded-full bg-[var(--client-primary-hover)]" />}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--client-text-secondary)]">Telefone (WhatsApp) <span className="text-[var(--client-error)]">*</span></span>
                      <input type="tel" inputMode="numeric" autoComplete="tel" value={mascararTelefone(telefone)} onChange={(e) => setTelefone(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="(11) 98765-4321" maxLength={16}
                        className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-sm font-black text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:font-normal placeholder:text-[var(--client-text-muted)]" /></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--client-text-secondary)]">Seu nome <span className="text-[var(--client-error)]">*</span></span>
                      <input autoComplete="name" value={cliente} onChange={(e) => setCliente(capitalizarNome(e.target.value))} placeholder="Nome completo"
                        className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-sm text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:text-[var(--client-text-muted)]" /></label>
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--client-text-secondary)]">Confirme sua mesa</h3>
                  {mesaURL ? (
                    <>
                      {/* Mesa confirmada pelo QR — selo elegante em vez de campo desabilitado */}
                      <div className="flex items-center gap-3 rounded-2xl border border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] px-4 py-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--client-primary-hover)] text-white"><CkIconMesa width={18} height={18} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--client-text-secondary)]">Sua mesa</p>
                          <p className="text-base font-black leading-tight text-[var(--client-text-primary)]">Mesa {mesa}</p>
                        </div>
                        <span className="flex items-center gap-1 rounded-full bg-[var(--client-surface)] px-2.5 py-1 text-[11px] font-black text-[var(--client-primary-active)]"><CkIconCheck width={12} height={12} /> Confirmada</span>
                      </div>
                      <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--client-text-secondary)]">Seu nome (opcional)</span>
                        <input value={cliente} onChange={(e) => setCliente(capitalizarNome(e.target.value))} placeholder="Nome" className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-sm text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:text-[var(--client-text-muted)]" /></label>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--client-text-secondary)]">Mesa <span className="text-[var(--client-error)]">*</span></span>
                        <input type="tel" inputMode="numeric" value={mesa} onChange={(e) => setMesa(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Nº"
                          className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-sm font-black text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)]" /></label>
                      <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--client-text-secondary)]">Seu nome (opcional)</span>
                        <input value={cliente} onChange={(e) => setCliente(capitalizarNome(e.target.value))} placeholder="Nome" className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-sm text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:text-[var(--client-text-muted)]" /></label>
                    </div>
                  )}
                  {!comURL && (
                    <div><span className="mb-1.5 block text-xs font-bold text-[var(--client-text-secondary)]">Comanda <span className="text-[var(--client-error)]">*</span></span>
                      <input value={comanda} onChange={(e) => setComanda(e.target.value.toUpperCase())} placeholder={`Ex.: ${loja.prefixo}-000001`}
                        autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false} inputMode="text" enterKeyHint="done" name="comanda"
                        className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 font-mono text-sm font-black tracking-widest text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:font-sans placeholder:font-normal placeholder:text-[var(--client-text-muted)]" />
                      <p className="mt-1 text-[11px] text-[var(--client-text-secondary)]">Escaneie o QR Code da mesa ou digite a comanda.</p></div>
                  )}
                </div>
              )}

              {/* Pagamento — só no canal externo. No acesso interno (mesa/QR) o
                  pagamento é no caixa, então a tela não pede forma alguma. */}
              {modoExterno && (
              <div className="mt-5">
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-[var(--client-text-secondary)]">Pagamento</h3>
                {!exigePagamentoAgora ? (
                  <div className="rounded-2xl border border-[var(--client-info-border)] bg-[var(--client-info-soft)] p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--client-info)] text-white"><CkIconRelogio width={17} height={17} /></span>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-[var(--client-text-primary)]">Pagamento após o consumo</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--client-text-secondary)]">Seu pedido será enviado agora. A forma de pagamento será escolhida no fechamento da conta.</p>
                      </div>
                    </div>
                  </div>
                ) : formasPagto.length === 0 ? (
                  <div className="rounded-2xl border border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] px-4 py-3 text-sm font-bold text-[var(--client-warning)]">Nenhuma forma de pagamento está disponível no momento.</div>
                ) : (
                  <>
                    <fieldset>
                      <legend className="sr-only">Forma de pagamento</legend>
                      <div role="radiogroup" aria-label="Forma de pagamento" className="grid grid-cols-3 gap-2">
                        {formasPagto.map((f) => {
                          const Icone = ICONES_PAGTO[f.id] || CkIconCartao;
                          const sel = formaPagto === f.id;
                          return (
                            <button key={f.id} type="button" role="radio" aria-checked={sel} onClick={() => escolherFormaPagto(f.id)}
                              className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-3 text-xs font-black transition ${sel ? "border-[var(--client-primary)] bg-[var(--client-primary-soft)] text-[var(--client-primary-active)]" : "border-[var(--client-border)] bg-[var(--client-surface)] text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]"}`}>
                              <Icone width={18} height={18} />
                              {f.label}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                    <p className="mt-2 text-[11px] text-[var(--client-text-secondary)]">Pagamento: <span className="font-bold text-[var(--client-text-secondary)]">{momentoPagto}</span>.</p>

                    {formaPagto === "dinheiro" && (
                      <div className="mt-3 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface-secondary)] p-3.5">
                        <p className="mb-2 text-xs font-bold text-[var(--client-text-primary)]">Precisa de troco?</p>
                        <div role="radiogroup" aria-label="Precisa de troco?" className="flex gap-2">
                          {[["sim", "Sim"], ["nao", "Não"]].map(([id, l]) => {
                            const sel = trocoResposta === id;
                            return (
                              <button key={id} type="button" role="radio" aria-checked={sel}
                                onClick={() => { setTrocoResposta(id); if (id === "nao") setTrocoValor(""); }}
                                className={`min-h-11 flex-1 rounded-xl border text-sm font-black transition ${sel ? "border-[var(--client-primary)] bg-[var(--client-primary-soft)] text-[var(--client-primary-active)]" : "border-[var(--client-border)] bg-[var(--client-surface)] text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]"}`}>{l}</button>
                            );
                          })}
                        </div>
                        {trocoResposta === "sim" && (
                          <div className="mt-3">
                            <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--client-text-secondary)]">Vai pagar com quanto?</span>
                              <input type="text" inputMode="decimal" value={trocoValor} onChange={(e) => setTrocoValor(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={formatCurrency(totalCart)}
                                className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-sm font-black text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:font-normal placeholder:text-[var(--client-text-muted)]" /></label>
                            {trocoValor && parseMoedaBR(trocoValor) > 0 && parseMoedaBR(trocoValor) < totalCart && (
                              <p className="mt-1.5 text-xs font-bold text-[var(--client-error)]">O valor deve ser de pelo menos {formatCurrency(totalCart)} (total do pedido).</p>
                            )}
                            {trocoValor && parseMoedaBR(trocoValor) >= totalCart && (
                              <p className="mt-1.5 text-xs font-bold text-[var(--client-success)]">Troco: {formatCurrency(parseMoedaBR(trocoValor) - totalCart)}.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              )}

              {economiaCart > 0 && (
                <div className="mt-4 flex items-center justify-center gap-1.5 rounded-2xl border border-[var(--client-offer-border)] bg-[var(--client-offer-soft)] px-3 py-2 text-sm font-black text-[var(--client-offer-hover)]">
                  <CkIconCheck width={16} height={16} /> Você economizou {formatCurrency(economiaCart)} nesta compra!
                </div>
              )}

              {/* Resumo financeiro */}
              <div className="mt-4 space-y-1.5 border-t border-[var(--client-border)] pt-3.5">
                {economiaCart > 0 && (
                  <>
                    <div className="flex items-center justify-between text-sm"><span className="text-[var(--client-text-secondary)]">Subtotal</span><span className="text-[var(--client-text-secondary)]">{formatCurrency(totalCart + economiaCart)}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-[var(--client-text-secondary)]">Desconto</span><span className="font-bold text-[var(--client-offer-hover)]">-{formatCurrency(economiaCart)}</span></div>
                  </>
                )}
                <div className="flex items-center justify-between"><span className="text-sm font-bold text-[var(--client-text-secondary)]">Total do pedido</span><span className="text-xl font-black text-[var(--client-text-primary)]">{formatCurrency(totalCart)}</span></div>
                {modoExterno && tipoPedido === "local" && <p className="text-[11px] text-[var(--client-text-secondary)]">Pagamento realizado no fechamento da conta.</p>}
              </div>
            </>
          )}
        </Gaveta>
      )}

      {/* Gaveta: Acompanhar / Conta */}
      {aba === "conta" && (
        <Gaveta titulo={modoExterno ? "Meus pedidos" : (currentTable || "Meus pedidos")} subtitulo="Acompanhe o preparo e o fechamento da sua conta." onFechar={() => setAba(null)} fecharLabel="Fechar acompanhamento dos pedidos">
          {meusPedidos.length > 0 && pedidosOffline && (
            <div className="mb-3 flex items-center gap-2 rounded-2xl border border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] px-3.5 py-2.5 text-xs font-bold text-[var(--client-warning)]">
              <CkIconWifiOff width={15} height={15} className="shrink-0" /> Atualização em tempo real indisponível — tentando reconectar…
            </div>
          )}

          {meusPedidos.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-[var(--client-text-secondary)]">Nenhum pedido para acompanhar ainda.</p>
              <p className="mt-1 text-xs text-[var(--client-text-muted)]">Seus pedidos aparecerão aqui assim que forem enviados.</p>
              <button onClick={() => setAba(null)} type="button" className="mt-4 min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-5 py-2.5 text-sm font-black text-[var(--client-text-secondary)] transition hover:bg-[var(--client-surface-secondary)]">Voltar ao cardápio</button>
            </div>
          ) : (
            <>
              {/* Resumo geral da conta */}
              <div className="rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] p-4 shadow-[var(--client-shadow-sm)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--client-info-soft)] text-[var(--client-info)]"><CkIconRecibo width={17} height={17} /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[var(--client-text-primary)]">{!modoExterno && currentTable ? currentTable : "Seu pedido"}</p>
                      {!modoExterno && comanda && <p className="truncate text-[11px] text-[var(--client-text-secondary)]">Comanda {comanda}</p>}
                    </div>
                  </div>
                  {statusGeralConta && (
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black ${
                      tomStatusGeral === "success" ? "border-[var(--client-success-border)] bg-[var(--client-success-soft)] text-[var(--client-success)]"
                        : tomStatusGeral === "warning" ? "border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] text-[var(--client-warning)]"
                        : "border-[var(--client-info-border)] bg-[var(--client-info-soft)] text-[var(--client-info)]"
                    }`}>{statusGeralConta}</span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--client-border)] pt-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-widest text-[var(--client-text-muted)]">Pedidos</p><p className="text-sm font-black text-[var(--client-text-primary)]">{meusPedidos.length}</p></div>
                  <div><p className="text-[10px] font-bold uppercase tracking-widest text-[var(--client-text-muted)]">Aberta às</p><p className="text-sm font-black text-[var(--client-text-primary)]">{contaAbertaEm || "—"}</p></div>
                  <div className="col-span-2"><p className="text-[10px] font-bold uppercase tracking-widest text-[var(--client-text-muted)]">Valor atual da conta</p><p className="text-lg font-black text-[var(--client-text-primary)]">{formatCurrency(totalMesa)}</p></div>
                </div>
                {pagamentoPosteriorConta && (
                  <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-[var(--client-info-soft)] px-3 py-2 text-[11px] font-bold text-[var(--client-info)]"><CkIconRelogio width={13} height={13} /> Pagamento após o consumo</p>
                )}
              </div>

              {/* Lista de pedidos + acompanhamento operacional de cada um */}
              <div className="mt-3 space-y-2.5">
                {meusPedidos.map((o) => {
                  const recolhido = !!pedidoRecolhido[o.id];
                  const modoPedido = modoEntregaPedido(o, modoExterno);
                  const s = estiloStatusCliente(o.status);
                  return (
                    <div key={o.id} className="rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] p-3.5 shadow-[var(--client-shadow-sm)]">
                      <button type="button" disabled={meusPedidos.length <= 1} aria-expanded={!recolhido}
                        onClick={() => setPedidoRecolhido((p) => ({ ...p, [o.id]: !p[o.id] }))}
                        className="flex w-full items-center justify-between gap-2 text-left disabled:cursor-default">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-[var(--client-text-primary)]">Pedido nº {String(o.id || "").replace(/\D/g, "").slice(-4)}</p>
                          <p className="text-[11px] text-[var(--client-text-secondary)]">Realizado às {o.createdAt}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span role="status" aria-live="polite" className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${s.chip}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />{statusClienteLabel(o, modoPedido)}
                          </span>
                          {meusPedidos.length > 1 && <CkIconChevron width={16} height={16} className={`shrink-0 text-[var(--client-text-muted)] transition-transform motion-reduce:transition-none ${recolhido ? "" : "rotate-180"}`} />}
                        </div>
                      </button>
                      {!recolhido && (
                        <>
                          <div className="mt-3 border-t border-[var(--client-border)] pt-3">
                            <LinhaTempoOperacional status={o.status} setorStatus={o.setorStatus} setoresPedido={setoresDoPedido(o)} modo={modoPedido} />
                          </div>
                          <div className="mt-3 space-y-1 border-t border-[var(--client-border)] pt-3">
                            {o.items.map((it, idx) => (
                              <div key={idx} className="flex justify-between gap-3 text-sm">
                                <span className="text-[var(--client-text-secondary)]"><b className="text-[var(--client-text-primary)]">{it.quantity}×</b> {it.name}</span>
                                <span className="shrink-0 font-bold text-[var(--client-text-primary)]">{formatCurrency(it.price * it.quantity)}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Status financeiro — sempre separado da timeline operacional acima */}
              <div className={`mt-3 flex items-start gap-3 rounded-2xl border p-3.5 ${
                contaSolicitada ? "border-[var(--client-warning-border)] bg-[var(--client-warning-soft)]" : contaPaga ? "border-[var(--client-success-border)] bg-[var(--client-success-soft)]" : "border-[var(--client-info-border)] bg-[var(--client-info-soft)]"
              }`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${
                  contaSolicitada ? "bg-[var(--client-warning)]" : contaPaga ? "bg-[var(--client-success)]" : "bg-[var(--client-info)]"
                }`}><CkIconCarteira width={17} height={17} /></span>
                <div className="min-w-0">
                  <p className={`text-sm font-black ${contaSolicitada ? "text-[var(--client-warning)]" : contaPaga ? "text-[var(--client-success)]" : "text-[var(--client-text-primary)]"}`}>
                    {contaSolicitada ? "Fechamento solicitado" : contaPaga ? "Pagamento confirmado" : podeFechar ? "Fechamento disponível" : "Conta em aberto"}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-[var(--client-text-secondary)]">
                    {contaSolicitada ? "O caixa foi notificado e dará continuidade ao pagamento."
                      : contaPaga ? "O pagamento desta conta já foi confirmado pelo caixa."
                      : podeFechar ? "Todos os pedidos foram entregues — você já pode solicitar o fechamento."
                      : pagamentoPosteriorConta ? "Você pagará somente após o consumo, no fechamento da conta."
                      : "Acompanhe o preparo — o fechamento fica disponível quando todos os pedidos forem entregues."}
                  </p>
                </div>
              </div>

              {/* Resumo financeiro */}
              <div className="mt-3 space-y-1.5 border-t border-[var(--client-border)] pt-3.5">
                <div className="flex items-center justify-between text-sm"><span className="text-[var(--client-text-secondary)]">Subtotal</span><span className="text-[var(--client-text-secondary)]">{formatCurrency(subtotal)}</span></div>
                <div className="flex items-center justify-between text-sm"><span className="text-[var(--client-text-secondary)]">Taxa de serviço (10%)</span><span className="text-[var(--client-text-secondary)]">{formatCurrency(subtotal * 0.1)}</span></div>
                <div className="flex items-center justify-between pt-1">
                  <span className={`text-sm font-bold ${contaPaga ? "text-[var(--client-success)]" : "text-[var(--client-text-secondary)]"}`}>{contaPaga ? "Total pago" : "Total em aberto"}</span>
                  <span className={`text-xl font-black ${contaPaga ? "text-[var(--client-success)]" : "text-[var(--client-text-primary)]"}`}>{formatCurrency(totalMesa)}</span>
                </div>
              </div>

              {/* Solicitar/reenviar fechamento — nunca finaliza o pagamento sozinho, só avisa o caixa */}
              {!contaPaga && (
                <>
                  <button onClick={() => setConfirmarFechamento(true)} disabled={!podeFechar || solicitando} aria-disabled={!podeFechar || solicitando} aria-busy={solicitando} type="button"
                    className={`mt-4 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black transition active:scale-95 ${
                      (!podeFechar || solicitando) ? "bg-[var(--client-disabled-background)] text-[var(--client-disabled-text)]" : "btn-laranja bg-[var(--client-primary-hover)] text-white hover:bg-[var(--client-primary)]"
                    }`}>
                    {solicitando && <CkIconSpinner />}
                    {solicitando ? "Enviando…" : contaSolicitada ? "Reenviar solicitação ao caixa" : "Solicitar fechamento da conta"}
                  </button>
                  {!podeFechar && <p className="mt-2 text-center text-xs text-[var(--client-text-secondary)]">Disponível quando todos os pedidos forem entregues.</p>}
                </>
              )}
            </>
          )}
        </Gaveta>
      )}
    </div>
  );
}

function Centro({ children }) {
  return <div data-theme="light" className="tema-claro-area flex min-h-screen w-full max-w-[100vw] flex-col items-center justify-center overflow-x-hidden bg-[var(--client-background)] px-6 text-center text-[var(--client-text-primary)]" style={{ minHeight: "100dvh" }}>{children}</div>;
}
function Spinner() { return <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--client-primary-border)] border-t-[var(--client-primary)]" />; }

// Skeleton do primeiro carregamento — repete o formato real (cabeçalho +
// categorias + grade de cards) em vez de um spinner solto, pra reduzir a
// sensação de espera. Mesmo padrão já usado no projeto (animate-pulse +
// blocos cinza claro), sem CSS novo.
function BlocoSkeleton({ className }) { return <div className={`animate-pulse rounded-full bg-[var(--client-surface-secondary)] ${className}`} />; }
function CardapioSkeleton() {
  return (
    <div data-theme="light" className="tema-claro-area min-h-screen w-full max-w-[100vw] bg-[var(--client-background)]" style={{ minHeight: "100dvh" }} aria-busy="true" aria-label="Carregando cardápio">
      <header className="sticky top-0 z-30 border-b border-[var(--client-border)] bg-[var(--client-surface)] px-4 pb-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-[var(--client-surface-secondary)]" />
          <div className="min-w-0 flex-1 space-y-2">
            <BlocoSkeleton className="h-4 w-32" />
            <BlocoSkeleton className="h-3 w-20" />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4">
        <div className="flex gap-2 border-b border-[var(--client-border)] py-4">
          {[76, 60, 92, 68].map((w, i) => <div key={i} className="h-8 shrink-0 animate-pulse rounded-full bg-[var(--client-surface-secondary)]" style={{ width: w }} />)}
        </div>
        <div className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 rounded-[1.25rem] border border-[var(--client-border)] bg-[var(--client-surface)] p-3">
              <div className="h-[88px] w-[88px] shrink-0 animate-pulse rounded-2xl bg-[var(--client-surface-secondary)]" />
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
// Linha do tempo — SÓ o operacional (preparo dos produtos). O status
// financeiro (pagamento/fechamento) é um bloco totalmente separado
// (StatusFinanceiroConta, abaixo), nunca uma etapa desta timeline — evita
// confundir "pedido pronto" com "conta paga", que são coisas independentes.
function LinhaTempoOperacional({ status, setorStatus = {}, setoresPedido = [], modo = "mesa" }) {
  if (status === "cancelled") return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--client-error-border)] bg-[var(--client-error-soft)] px-3 py-2 text-xs font-bold text-[var(--client-error)]">
      <CkIconAlerta width={14} height={14} /> Pedido cancelado.
    </div>
  );
  const ordem = ["received", "preparing", "ready", "delivered"];
  const idx = Math.max(0, ordem.indexOf(status));
  const passos = [
    // "recebido" só fica "feito" (check verde) a partir do próximo estágio —
    // enquanto status === "received" ele é a etapa ATUAL, em azul (informativo),
    // nunca verde: verde ali daria a entender "concluído" para um pedido que
    // acabou de chegar, contradizendo o selo azul "Recebido" mostrado junto.
    { key: "recebido", feito: idx >= 1, atual: status === "received", atualTom: "info", Icone: CkIconCaixaEntrada, label: "Pedido recebido" },
    ...(setoresPedido.length ? setoresPedido : ["Cozinha"]).map((s) => {
      const pronto = setorStatus?.[s] === "ready";
      const emPreparo = status === "preparing" && !pronto;
      const subTexto = pronto || idx >= 2 ? "Pronto" : emPreparo ? "Em preparo" : "Na fila";
      return { key: `setor-${s}`, feito: pronto || idx >= 2, atual: emPreparo, Icone: CkIconPanela, label: `Preparo · ${s}`, sub: subTexto,
        // "Na fila" é espera operacional (ainda não começou) — azul informativo,
        // nunca neutro/cinza (perderia o significado) nem âmbar (isso é reservado
        // para "em preparo", que é uma etapa distinta e já ativa).
        subTom: subTexto === "Pronto" ? "border-[var(--client-success-border)] bg-[var(--client-success-soft)] text-[var(--client-success)]"
          : subTexto === "Em preparo" ? "border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] text-[var(--client-warning)]"
          : "border-[var(--client-info-border)] bg-[var(--client-info-soft)] text-[var(--client-info)]" };
    }),
    { key: "pronto", feito: idx >= 2, atual: status === "ready", Icone: modo === "retirada" ? CkIconSacola : CkIconSino,
      label: modo === "retirada" ? "Pronto para retirada" : modo === "entrega" ? "Pronto para entrega" : "Pronto para servir" },
    { key: "entregue", feito: idx >= 3, atual: status === "delivered", Icone: modo === "retirada" ? CkIconSacola : CkIconGarfo,
      label: modo === "retirada" ? "Retirado" : modo === "entrega" ? "Entregue" : "Entregue na mesa" },
  ];
  return (
    <ol className="space-y-0">
      {passos.map((p, i) => {
        // Cor do estágio "atual" não é sempre âmbar: "recebido" em andamento é
        // azul/informativo (ver comentário acima); os demais ("em preparo" etc.)
        // seguem âmbar. Nunca as duas semânticas dividindo a mesma cor.
        const atualInfo = p.atualTom === "info";
        return (
        <li key={p.key} aria-current={p.atual ? "step" : undefined} className="relative flex gap-3 pb-4 last:pb-0">
          {i < passos.length - 1 && <span className={`absolute left-[13px] top-[26px] h-full w-px ${p.feito ? "bg-[var(--client-success-border)]" : "bg-[var(--client-border)]"}`} aria-hidden="true" />}
          <span className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full ${
            p.feito ? "bg-[var(--client-success)] text-white"
              : p.atual ? (atualInfo ? "border-2 border-[var(--client-info)] bg-[var(--client-info-soft)] text-[var(--client-info)]" : "border-2 border-[var(--client-warning)] bg-[var(--client-warning-soft)] text-[var(--client-warning)]")
              : "border border-[var(--client-border)] bg-[var(--client-surface)] text-[var(--client-text-muted)]"
          }`}>
            {p.feito ? <CkIconCheck width={13} height={13} strokeWidth={3} /> : <p.Icone width={13} height={13} />}
          </span>
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2 pt-0.5">
            {/* feito vence atual (mesma prioridade do ícone acima) — sem isso,
                o passo "pronto" (feito=true E atual=true no instante exato em
                que status vira "ready") mostrava ícone verde de concluído com
                o texto ainda âmbar de "em andamento", uma contradição visual. */}
            <span className={`text-xs font-bold ${p.feito ? "text-[var(--client-text-primary)]" : p.atual ? (atualInfo ? "text-[var(--client-info)]" : "text-[var(--client-warning)]") : "text-[var(--client-text-muted)]"}`}>{p.label}</span>
            {p.sub && <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${p.subTom || "border-[var(--client-border)] bg-[var(--client-surface-secondary)] text-[var(--client-text-secondary)]"}`}>{p.sub}</span>}
          </span>
        </li>
        );
      })}
    </ol>
  );
}
// ════════════════════════════════════════════════════════════
//  Finalização do pedido — ícones inline (sem emoji, sem lib externa —
//  mesma convenção de src/App.jsx ProdutoModal: stroke=currentColor).
// ════════════════════════════════════════════════════════════
const ckIconBase = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
const CkIconCheck    = (p) => (<svg {...ckIconBase} {...p}><path d="M20 6 9 17l-5-5" /></svg>);
const CkIconCoracao  = (p) => (<svg {...ckIconBase} fill="currentColor" {...p}><path d="M12 20.5s-7.5-4.6-10-9.3C.4 7.8 2 4.5 5.4 4A5 5 0 0 1 12 7a5 5 0 0 1 6.6-3c3.4.5 5 3.8 3.4 7.2-2.5 4.7-10 9.3-10 9.3Z" /></svg>);
const CkIconTag      = (p) => (<svg {...ckIconBase} {...p}><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0l-6.2-6.2A2 2 0 0 1 3.8 13V6a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l6.4 6.4a2 2 0 0 1 0 2.4Z" /><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" /></svg>);
const CkIconEstrela  = (p) => (<svg {...ckIconBase} {...p}><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" /></svg>);
const CkIconCalendario = (p) => (<svg {...ckIconBase} {...p}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>);
const CkIconAlerta   = (p) => (<svg {...ckIconBase} {...p}><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 2 18a1.5 1.5 0 0 0 1.3 2.3h17.4A1.5 1.5 0 0 0 22 18L13.7 3.9a1.7 1.7 0 0 0-3.4 0Z" /></svg>);
const CkIconLixeira  = (p) => (<svg {...ckIconBase} {...p}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-.9 13.2A2 2 0 0 1 16.1 21H7.9a2 2 0 0 1-2-1.8L5 6" /><path d="M10 11v6M14 11v6" /></svg>);
const CkIconRelogio  = (p) => (<svg {...ckIconBase} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
const CkIconLoja     = (p) => (<svg {...ckIconBase} {...p}><path d="M4 9 5.2 4.5A1 1 0 0 1 6.2 4h11.6a1 1 0 0 1 1 .5L20 9" /><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Z" /><path d="M9 20v-5h6v5" /></svg>);
const CkIconMoto     = (p) => (<svg {...ckIconBase} {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M9 18h6l3-6h-4l-2-4H8l-2 3" /><path d="M13 8h4" /></svg>);
const CkIconGarfo    = (p) => (<svg {...ckIconBase} {...p}><path d="M7 3v7a2 2 0 0 0 4 0V3" /><path d="M9 10v11" /><path d="M16 3c-1.1 0-2 1.3-2 4s.9 4 2 4 2-1.3 2-4-.9-4-2-4Z" /><path d="M16 11v10" /></svg>);
const CkIconCartao   = (p) => (<svg {...ckIconBase} {...p}><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19" /><path d="M6 14.5h4" /></svg>);
const CkIconPix      = (p) => (<svg {...ckIconBase} {...p}><path d="M9.5 4.5 4.5 9.5a2 2 0 0 0 0 2.8l6.7 6.7a2 2 0 0 0 2.8 0l6.7-6.7a2 2 0 0 0 0-2.8L14.5 3a2 2 0 0 0-2 0" /><path d="m8.3 8.3 2.2 2.2a2 2 0 0 0 2.8 0l2.2-2.2M8.3 15.7l2.2-2.2a2 2 0 0 1 2.8 0l2.2 2.2" /></svg>);
const CkIconDinheiro = (p) => (<svg {...ckIconBase} {...p}><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v0M18 15v0" /></svg>);
const CkIconSpinner  = () => (<svg className="animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>);
const CkIconRecibo   = (p) => (<svg {...ckIconBase} {...p}><path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>);
const CkIconCarteira = (p) => (<svg {...ckIconBase} {...p}><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" /><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M16 13.5h3" /></svg>);
const CkIconChevron  = (p) => (<svg {...ckIconBase} {...p}><path d="m6 9 6 6 6-6" /></svg>);
const CkIconWifiOff  = (p) => (<svg {...ckIconBase} {...p}><path d="M2 8.5a17 17 0 0 1 5-3M22 8.5a17 17 0 0 0-8.5-4.4M6.3 12a11 11 0 0 1 4-2M17.7 12a11 11 0 0 0-2.7-1.8" /><path d="M9 16a5.5 5.5 0 0 1 6 0" /><circle cx="12" cy="19.5" r="0.6" fill="currentColor" stroke="none" /><path d="M2 2l20 20" /></svg>);
const CkIconPanela   = (p) => (<svg {...ckIconBase} {...p}><path d="M3 11h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3Z" /><path d="M1 11h22" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
const CkIconCaixaEntrada = (p) => (<svg {...ckIconBase} {...p}><path d="M3 12h4.5l1.5 3h6l1.5-3H21" /><path d="M5.5 5h13l2.5 7v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6l2.5-7Z" /></svg>);
const CkIconSino     = (p) => (<svg {...ckIconBase} {...p}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>);
const CkIconSacola   = (p) => (<svg {...ckIconBase} {...p}><path d="M6 8h12l1 12.5a1 1 0 0 1-1 1.5H6a1 1 0 0 1-1-1.5L6 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>);
// Carrinho de compras — mesmo traço dos demais Ck* e igual ao ShoppingCart do
// tablet (lucide), para o ícone de CARRINHO ficar idêntico em todas as telas.
const CkIconCarrinho = (p) => (<svg {...ckIconBase} {...p}><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>);
const CkIconMesa     = (p) => (<svg {...ckIconBase} {...p}><path d="M12 21s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>);
const CkIconAjuda    = (p) => (<svg {...ckIconBase} {...p}><circle cx="12" cy="12" r="9" /><path d="M9.2 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.6 1.9-2.6 3.6" /><path d="M12 17.2h.01" /></svg>);
const CkIconLimpeza  = (p) => (<svg {...ckIconBase} {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.3 6.3l2 2M15.7 15.7l2 2M17.7 6.3l-2 2M8.3 15.7l-2 2" /><circle cx="12" cy="12" r="2.2" /></svg>);
// Mesmo desenho do selo "Personalizável" sobre a imagem do produto — promovido
// a componente para reuso também no aviso "Personalize do seu jeito!".
const CkIconAjustes  = (p) => (<svg {...ckIconBase} {...p}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="8" cy="17" r="2" fill="currentColor" stroke="none" /></svg>);

// Indicador compacto de progresso — Pedido → Identificação → Confirmação
// (nunca "Pagamento": ele pode nem existir, ver regra do consumo local).
// Não depende só de cor: número/check + rótulo sempre visíveis.
function EtapaProgresso({ etapas, atualIdx }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progresso do pedido">
      {etapas.map((e, i) => {
        // A etapa ATUAL nunca fica verde antes de ser passada: verde = etapa já
        // concluída (i < atualIdx); a atual fica laranja (ação, harmoniza com o
        // botão "Confirmar"). Verde = já fiz · laranja = fazer agora.
        const feita = i < atualIdx;
        const atual = i === atualIdx;
        return (
          <li key={e.label} className="flex flex-1 items-center gap-1.5">
            {/* Concluído = VERDE (sucesso/confirmação, igual à timeline de
                acompanhamento) · Atual = laranja (ação/foco) · Pendente = cinza.
                Cada estado em uma cor no seu papel (não laranja para os dois). */}
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black transition-colors ${
              feita ? "bg-[var(--client-success)] text-white" : atual ? "border-2 border-[var(--client-primary)] text-[var(--client-primary-hover)]" : "border border-[var(--client-border)] text-[var(--client-text-muted)]"
            }`} aria-current={atual ? "step" : undefined}>
              {feita ? <CkIconCheck width={12} height={12} strokeWidth={3} /> : i + 1}
            </span>
            <span className={`truncate text-[11px] font-bold ${atual || feita ? "text-[var(--client-text-primary)]" : "text-[var(--client-text-muted)]"}`}>{e.label}</span>
            {i < etapas.length - 1 && <span className={`h-px flex-1 ${feita ? "bg-[var(--client-success-border)]" : "bg-[var(--client-border)]"}`} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

// Card de item do carrinho — hierarquia clara (nome/qtd → personalização →
// preço), "Remover" como ação secundária discreta (só ícone + aria-label,
// nunca compete visualmente com o preço).
function CardItemCarrinho({ item, onRemover }) {
  const personalizado = item.removedIngredients?.length > 0 || item.extraIngredients?.length > 0 || item.observation;
  return (
    <div className={`flex items-start justify-between gap-3 rounded-2xl border bg-[var(--client-surface)] p-3.5 shadow-[var(--client-shadow-sm)] ${item.comboId ? "border-[var(--client-offer-border)]" : "border-[var(--client-border)]"}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black leading-snug text-[var(--client-text-primary)]">
          <span className="text-[var(--client-text-secondary)]">{item.quantity}×</span> {item.name}
        </p>
        {item.comboId && <p className="mt-0.5 truncate text-[11px] font-bold text-[var(--client-offer-hover)]">Combo: {item.comboNome}</p>}
        {personalizado && (
          <p className="mt-1 text-[11px] leading-4 text-[var(--client-text-secondary)]">
            {item.removedIngredients?.length > 0 && <>Sem: {item.removedIngredients.join(", ")}<br /></>}
            {item.extraIngredients?.length > 0 && <>Com: {item.extraIngredients.join(", ")}<br /></>}
            {item.observation}
          </p>
        )}
        <p className="mt-1.5 text-sm font-bold text-[var(--client-text-primary)]">{formatCurrency(item.price * item.quantity)}</p>
      </div>
      <button onClick={() => onRemover(item)} type="button" aria-label={`Remover ${item.name} do pedido`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--client-text-muted)] transition hover:bg-[var(--client-error-soft)] hover:text-[var(--client-error)] active:scale-90">
        <CkIconLixeira />
      </button>
    </div>
  );
}

// `rodape` (opcional): conteúdo fixo ABAIXO da área rolável (ex.: total +
// CTA de "Finalizar pedido") — fica sempre visível, nunca precisa rolar até
// o fim pra alcançar o botão principal. Sem essa prop, a gaveta se comporta
// exatamente como antes (usado por aba "conta"/acompanhar pedido).
function Gaveta({ titulo, subtitulo, onFechar, children, rodape, fecharLabel = "Fechar" }) {
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
  const sheetMax = vp ? `${vp.h}px` : "92dvh";
  return (
    <div data-theme="light" className="tema-claro-area fixed inset-x-0 top-0 z-[110] flex w-full max-w-[100vw] items-end justify-center overflow-x-hidden bg-black/60 backdrop-blur-sm" style={overlayStyle} onClick={onFechar}>
      {/* flex-col + min-h-0 no corpo: o rodapé (quando existe) reserva sua
          própria altura de verdade (medida pelo navegador), e o corpo rolável
          ocupa exatamente o resto — sem precisar "chutar" um px fixo de
          desconto pra altura do cabeçalho/rodapé em cada gaveta. */}
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-3xl flex-col rounded-t-[24px] border border-[var(--client-border)] bg-[var(--client-surface)] shadow-[var(--client-shadow-floating)]" style={{ maxHeight: sheetMax, paddingBottom: rodape ? undefined : "env(safe-area-inset-bottom)" }}>
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 rounded-t-[24px] border-b border-[var(--client-border)] bg-[var(--client-surface)] px-5 pb-4" style={{ paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.5rem))" }}>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-[var(--client-text-primary)]">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-xs text-[var(--client-text-secondary)]">{subtitulo}</p>}
          </div>
          <button onClick={onFechar} aria-label={fecharLabel} title={fecharLabel} type="button"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--client-border)] bg-[var(--client-surface)] text-[var(--client-text-secondary)] shadow-[var(--client-shadow-sm)] transition duration-200 hover:border-[var(--client-error-border)] hover:bg-[var(--client-error-soft)] hover:text-[var(--client-error)] active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--client-error)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="pp-overscroll-contain min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && (
          <div className="shrink-0 border-t border-[var(--client-border)] bg-[var(--client-surface)] px-5 py-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}
