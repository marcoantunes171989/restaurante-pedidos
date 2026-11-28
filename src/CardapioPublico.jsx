import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  fetchLojaPublica, fetchProdutosPublicos, fetchCategoriasPublicas, fetchGruposOpcoesPublicos, fetchOpcoesPublicas, fetchPromocoesPublicas,
  escutarLojaPublica, escutarPedidos,
  upsertCliente, criarChamado,
  rpcCriarPedidoPublicoV2, rpcSetoresPublico, rpcUpsertClientePublico, rpcPedidosComanda, rpcPedidosCliente, rpcSolicitarContaPublico, rpcSaldoFidelidade, rpcFidelidadeRegra, rpcCriarChamadoPublico,
  rpcPesquisaSatisfacao, inserirPesquisaSatisfacao, rpcStatusMesa, supabase,
} from "./lib/supabase";
import { ENDERECO_VAZIO, problemaDoEndereco, enderecoEmLinha, lojaPedeEndereco, criarPedidoEntrega } from "./lib/enderecoEntrega";
import EnderecoEntregaCampos from "./components/EnderecoEntregaCampos";
import { cardapioViaRpc } from "./lib/authMode";
import { resumoDosPedidos, textoDoPercentual, valorDaTaxa } from "./lib/parametrosCaixa";
import { useTaxaPublica } from "./hooks/useTaxaPublica";
import { pontosPor, reaisDosPontos } from "./lib/fidelidade";
import { nomeLembrado, lembrarNome } from "./lib/nomeNoAparelho";
import { CATEGORIA_TODOS, agruparProdutosPorCategoria, montarListaCategorias, escolherCategoriaAtiva, calcularDestinoScroll } from "./lib/cardapioCategorias";
import SatisfactionSurvey from "./components/SatisfactionSurvey";
import {
  ProdutoModal, formatCurrency, isValidCommand,
  promocaoVigente, promoResumoDesconto, qrMesaEnabled, externalOrderingEnabled,
} from "./App";
import { LogoPP } from "./components/BrandLogo";
import { normalizarFuncionamento, avaliarDisponibilidadeCanal, MOTIVO } from "./lib/horarioFuncionamentoService";
import { criarUrlPedidoWhatsApp, numeroWhatsAppValido } from "./lib/whatsappPedido";
import CardapioBoasVindas from "./pages/cardapio/CardapioBoasVindas.jsx";
import CardapioProdutoCard from "./pages/cardapio/CardapioProdutoCard.jsx";
import Gaveta from "./components/cardapio/Gaveta.jsx";
import EtapaProgresso from "./components/cardapio/EtapaProgresso.jsx";
import CardItemCarrinho from "./components/cardapio/CardItemCarrinho.jsx";
import {
  CkIconCheck, CkIconTag, CkIconEstrela, CkIconCalendario, CkIconAlerta,
  CkIconRelogio, CkIconLoja, CkIconMoto, CkIconGarfo, CkIconCartao, CkIconPix, CkIconDinheiro, CkIconSpinner,
  CkIconRecibo, CkIconCarteira, CkIconChevron, CkIconWifiOff, CkIconPanela, CkIconCaixaEntrada, CkIconSino,
  CkIconSacola, CkIconCarrinho, CkIconMesa, CkIconAjuda, CkIconLimpeza,
} from "./components/cardapio/CkIcons.jsx";

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

// Chave (YYYY-MM-DD) e rótulo legível do DIA de um pedido — usados para separar
// a consulta da comanda por data (mesmo critério do Controle de Comandas).
function diaKeyConsulta(iso) {
  if (!iso) return "sem-data";
  const d = new Date(iso); if (isNaN(d.getTime())) return "sem-data";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function rotuloDiaConsulta(iso) {
  if (!iso) return "Sem data";
  const d = new Date(iso); if (isNaN(d.getTime())) return "Sem data";
  const hoje = new Date(); const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
  const longo = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const rotulo = longo.charAt(0).toUpperCase() + longo.slice(1);
  if (mesmoDia(d, hoje)) return `Hoje · ${rotulo}`;
  if (mesmoDia(d, ontem)) return `Ontem · ${rotulo}`;
  return rotulo;
}

// Pesquisa de satisfação: controle por localStorage (sobrevive a reload, evita repetição).
//  - PEND: pedidos feitos pelo cliente, aguardando CONCLUSÃO (pago + retirado) p/ pesquisar.
//  - DONE: pedidos já pesquisados/dispensados → nunca mais aparecem.
const SURVEY_PEND_KEY = "pp_survey_pend";
const SURVEY_DONE_KEY = "pp_survey_done";
function lerSetLS(k) { try { return new Set(JSON.parse(localStorage.getItem(k) || "[]")); } catch { return new Set(); } }
function salvarSetLS(k, set) { try { localStorage.setItem(k, JSON.stringify([...set].slice(-200))); } catch {} }
// Converte o código de motivo (regra central) em mensagem amigável (a UI traduz).
function mensagemCanalIndisponivel(disp, modoExterno) {
  if (!disp) return "Pedido indisponível no momento.";
  if (disp.motivo === MOTIVO.CANAL_DESABILITADO) {
    return modoExterno
      ? "Cardápio externo desativado pelo Modo de Uso da empresa."
      : "Atendimento interno está desativado para esta empresa.";
  }
  if (disp.motivo === MOTIVO.FORA_HORARIO) {
    const p = disp.proximaAbertura;
    return "Fechado para novos pedidos no momento." + (p ? ` Próxima abertura: ${p.emDias === 0 ? "hoje" : p.diaRotulo} às ${p.hora}.` : "");
  }
  return "Pedido indisponível no momento.";
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
  // Consulta read-only por comanda (QR do relatório da comanda). Flag exclusiva
  // deste fluxo — nenhum link de mesa/externo a usa, então não afeta pedidos.
  const consultaComanda = ((params.get("consulta") || "") === "1") && !!comURL;

  const [loja, setLoja]           = useState(undefined); // undefined=carregando, null=não achou
  const [produtos, setProdutos]   = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [promocoes, setPromocoes] = useState([]);
  const [gruposOpcoes, setGruposOpcoes] = useState([]);
  const [opcoes, setOpcoes] = useState([]);
  const [setores, setSetores] = useState([]);
  const [orders, setOrders]       = useState([]);
  const [pedidosOffline, setPedidosOffline] = useState(false); // true quando a atualização em tempo real dos pedidos está falhando (polling/realtime)
  // Consulta por comanda: só assume "sem pedidos" DEPOIS do 1º poll ter voltado
  // (evita o falso vazio em redes lentas do celular, enquanto a busca ainda corre).
  const [pedidosSync, setPedidosSync] = useState(false);
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
  const [observacaoPedido, setObservacaoPedido] = useState("");
  const modoExterno = !mesaURL; // link geral (divulgação) → pedido externo (delivery/retirada)
  const [aba, setAba]             = useState(null); // null | 'carrinho' | 'conta'
  const taxaPct = useTaxaPublica(supabase, loja?.id ?? null, aba); // taxa de serviço da empresa
  const [qrModal, setQrModal]     = useState(null); // dataURL do QR do cardápio (botão "Ver QR")
  const [survey, setSurvey]       = useState(null); // pesquisa de satisfação na finalização: { pedidoId, mesa, origem }
  const [enviando, setEnviando]   = useState(false);
  const enviandoRef = useRef(false); // trava síncrona contra clique duplo (ver enviar())
  const [msg, setMsg]             = useState(null);
  // Tela de boas-vindas (premium) como ENTRADA tanto no QR da mesa quanto no
  // link geral de divulgação (externo). O cliente vê a apresentação da marca +
  // destaques e toca "Ver cardápio" para entrar. Os blocos exclusivos de mesa
  // (ex.: "Precisa de algo?") já são condicionados a !modoExterno && mesa.
  const [etapa, setEtapa]         = useState("welcome"); // welcome | cardapio
  const [tipoPedido, setTipoPedido] = useState(""); // pedido externo: local | retirada | entrega (config_externo)
  const [formaPagto, setFormaPagto] = useState(""); // forma de pagamento: pix | cartao | dinheiro (config_externo)
  // Endereço de entrega (migration 207): só quando a loja pede. Fica na memória da página, não no aparelho.
  const [endereco, setEndereco] = useState(ENDERECO_VAZIO);
  const [lojaComEndereco, setLojaComEndereco] = useState(null); // id da loja que pede o endereço
  const [agora, setAgora] = useState(() => new Date()); // relógio p/ reavaliar aberto/fechado ao vivo
  const [comboRemover, setComboRemover] = useState(null); // item de combo aguardando confirmação de remoção
  const [itemRemover, setItemRemover] = useState(null); // item avulso (não-combo) aguardando confirmação de remoção
  const [confirmarLimpar, setConfirmarLimpar] = useState(false); // confirmação obrigatória antes de esvaziar o carrinho todo
  const [trocoResposta, setTrocoResposta] = useState(""); // "" | "sim" | "nao" — só perguntado com pagamento em Dinheiro
  const [trocoValor, setTrocoValor] = useState(""); // valor (texto) que o cliente vai usar para pagar em espécie
  const [confirmarFechamento, setConfirmarFechamento] = useState(false); // confirmação obrigatória antes de solicitar/reenviar o fechamento da conta
  const [saldoPontos, setSaldoPontos] = useState(null); // saldo de pontos do cliente identificado (null = desconhecido)
  const [usarPontos, setUsarPontos]   = useState(false); // intenção de pagar com pontos no fechamento (o caixa efetiva)
  const [fidRegraPub, setFidRegraPub] = useState(null); // regra de pontos vigente (leitura pública; null = sem programa/RPC)
  const [solicitando, setSolicitando] = useState(false);
  const solicitandoRef = useRef(false); // trava síncrona contra clique duplo (mesmo padrão de enviandoRef)
  const [chamando, setChamando] = useState(""); // tipo do chamado (garcom|ajuda|limpeza) em andamento, "" se nenhum
  const chamandoRef = useRef(false); // trava síncrona contra clique duplo (mesmo padrão de enviandoRef/solicitandoRef)
  const [pedidoRecolhido, setPedidoRecolhido] = useState({}); // { [id]: true } — cartão de pedido recolhido pelo cliente (padrão: expandido)
  // Acessibilidade "Ajustar tela": escala de texto (1 = normal, 1.1, 1.2) aplicada
  // à raiz do documento (rem escala junto), persistida. Real e segura (largura fica
  // limitada pelo viewport), ajuda quem precisa de fonte maior para ler o cardápio.
  const [escalaA11y, setEscalaA11y] = useState(() => { try { const v = Number(localStorage.getItem("pedidoPrime:a11yEscala")); return v >= 1 && v <= 1.2 ? v : 1; } catch { return 1; } });
  // Notificações do navegador ("Notificações e novidades"): avisamos quando o
  // pedido fica pronto. Estado reflete a permissão real concedida pelo cliente.
  const [notifOn, setNotifOn] = useState(() => typeof Notification !== "undefined" && Notification.permission === "granted");

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
        // Mesas: NÃO usa fetchMesas()/app_listar_mesas aqui — migration 122
        // fechou tab_mesas e essa RPC é authenticated-only (o cardápio público
        // é anônimo). A existência/status real da mesa do QR é resolvida
        // direto por pub_status_mesa (security definer, migration 067) no
        // effect de statusMesa logo abaixo — autoridade única do fluxo mesa,
        // sem pré-checagem via leitura de tabela.
        // Setores: NÃO usa fetchSetoresCozinha()/app_listar_setores_cozinha
        // aqui — aquela RPC devolve a linha completa (incluindo metadados
        // técnicos de impressão) e é destinada ao admin/staff autenticado.
        // O cardápio público usa pub_setores_publico (migration 119),
        // reduzida a id/nome/ordem/ativo, e só pode ser chamada DEPOIS que a
        // loja é resolvida (precisa do lojaId).
        // Loja/Categorias/Produtos/Grupos de opções/Opções/Promoções: migration 123 —
        // RPC-only, tenant-scoped desde a origem (pub_loja_por_prefixo resolve
        // a loja pelo prefixo; as demais recebem loja.id e revalidam contra
        // tab_lojas.ativo). Nenhum SELECT direto nem lerRpcOuSelect aqui —
        // erro de RPC propaga (cai no catch abaixo), nunca vira lista vazia
        // silenciosa — exceto Promoções, que segue tolerante (catch local):
        // é conteúdo não-crítico, uma falha na RPC de ofertas não deve
        // derrubar o cardápio inteiro.
        const l = await fetchLojaPublica(prefixo);
        if (!vivo) return;
        setLoja(l);
        if (l) {
          const [cats, prods, promos, grps, ops] = await Promise.all([
            fetchCategoriasPublicas(l.id), fetchProdutosPublicos(l.id),
            fetchPromocoesPublicas(l.id).catch(() => []), fetchGruposOpcoesPublicos(l.id), fetchOpcoesPublicas(l.id),
          ]);
          if (!vivo) return;
          setGruposOpcoes(grps || []);
          setOpcoes(ops || []);
          rpcSetoresPublico(l.id).then((lista) => { if (vivo) setSetores(lista); });
          // Modo mesa (QR) respeita visivelQr; link geral respeita visivelExterno (migration 034)
          const canalOk = (p) => mesaURL ? (p.visivelQr !== false) : (p.visivelExterno !== false);
          // lojaId/ativo já são garantidos pela RPC (tenant-scoped + só ativos) — não
          // precisa mais re-filtrar por loja/active aqui, só a regra de canal.
          setProdutos((prods || []).filter(canalOk));
          setCategorias(cats || []);
          // loja/ativo/mostrarCardapio já são garantidos pela RPC (pub_promocoes_publico) —
          // nenhum filtro extra necessário aqui.
          setPromocoes(promos || []);
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
    try { off = escutarLojaPublica(prefixo, (l) => { if (l) setLoja(l); }); } catch {}
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
          const lista = consultaComanda
            ? (comanda ? await rpcPedidosComanda({ lojaId: loja.id, comanda }) : [])
            : modoExterno
            ? (tel.length >= 10 ? await rpcPedidosCliente({ lojaId: loja.id, telefone: tel }) : [])
            : (comanda ? await rpcPedidosComanda({ lojaId: loja.id, comanda }) : []);
          if (!vivo) return;
          setOrders(lista);
          setPedidosOffline(false); // poll respondeu — conexão OK
          setPedidosSync(true);     // 1º carregamento concluído (libera o estado vazio)
        } catch { if (vivo) setPedidosOffline(true); } // poll falhou (rede/RLS) — mantém os últimos dados válidos, só sinaliza
      };
      buscar();
      const iv = setInterval(buscar, 4000);
      return () => { vivo = false; clearInterval(iv); };
    }
    const off = escutarPedidos(
      (all) => { setOrders(all.filter((o) => o.lojaId === loja.id)); setPedidosOffline(false); setPedidosSync(true); },
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
  // `mid` (id persistente, migration 066) vem direto da URL do QR impresso e
  // é repassado como p_mesa_id para pub_status_mesa/pub_criar_pedido_v2
  // (security definer) SEM nenhuma leitura de tabela no cliente: quem
  // resolve/confirma se esse id pertence a esta loja é sempre o backend. Sem
  // `mid` (QR antigo), a resolução cai no número (mesaURL). Com `mid`, o
  // NÚMERO fica sujeito a uma renumeração posterior da mesa (app_atualizar_mesa
  // não tem restrição) — por isso `mesa` (estado, ver logo abaixo) é
  // resincronizado com o número CANÔNICO ATUAL devolvido por pub_status_mesa
  // assim que ele resolve, em vez de ficar preso ao número cravado na URL.
  const mesaIdURL = midURL ? Number(midURL) : null;
  // `statusMesa === null` = ainda checando (nunca bloqueia por causa disso);
  // resolvido = autoridade real de existência/ativa vem de pub_status_mesa.
  const mesaValida = !mesaURL || statusMesa === null || (!!statusMesa.existe && !!statusMesa.ativa);

  // Status ao vivo da mesa (ocupada = tem pedido aberto não pago/cancelado
  // nela, migration 067) — direto do backend (pub_status_mesa resolve a mesa
  // por id/número e loja, sem depender de leitura de tab_mesas no cliente).
  // Só se aplica ao canal mesa, com modo permitido.
  useEffect(() => {
    let vivo = true;
    if (!mesaURL || !loja || !podeMesa) return;
    rpcStatusMesa({ lojaId: loja.id, mesaNumero: Number(mesaURL), mesaId: mesaIdURL })
      .then((s) => { if (vivo) setStatusMesa(s); });
    return () => { vivo = false; };
  }, [mesaURL, loja, podeMesa, mesaIdURL]);

  // QR com `mid` + mesa renumerada depois de impresso (hardening final
  // pré-HML): pub_status_mesa resolve por id e já devolve o NÚMERO CANÔNICO
  // ATUAL (`s.numero`) — mas, sem este efeito, `mesa` (estado) ficaria preso
  // ao número antigo cravado na URL para sempre. Isso faria pub_criar_pedido_v2
  // receber p_mesa_id (atual) + p_mesa_numero (antigo da URL) DIVERGENTES, e
  // a própria RPC (119, não alterada) rejeita esse par com "Mesa não
  // encontrada ou inativa" — um cliente legítimo escaneando uma mesa válida,
  // só renumerada, seria bloqueado no envio do pedido sem motivo real. Ao
  // resincronizar `mesa` com o número devolvido assim que pub_status_mesa
  // confirma a mesa, currentTable/chamados/pub_criar_pedido_v2 (todos
  // derivados de `mesa`) passam a usar sempre o número atual — sem precisar
  // reimprimir o QR. Só se aplica quando `mid` está presente: QR sem `mid`
  // não tem "número canônico" separado para resincronizar.
  useEffect(() => {
    if (!mesaIdURL || !statusMesa?.existe || statusMesa.numero == null) return;
    setMesa((atual) => (String(atual) === String(statusMesa.numero) ? atual : String(statusMesa.numero)));
    /* eslint-disable-next-line */
  }, [mesaIdURL, statusMesa]);

  // Configurações do pedido externo (aba "Pedido externo" — config_externo)
  const cfgExt = loja?.configExterno || {};
  const aceitaExterno = cfgExt.aceitaPedidoExterno !== false; // padrão: aceita
  const opcoesEntrega = [
    cfgExt.consumoLocal !== false && { id: "local",    label: "Consumir no local", icon: "🍽️" },
    cfgExt.retirada     !== false && { id: "retirada", label: "Retirada no balcão", icon: "🛍️" },
    cfgExt.entrega      === true  && { id: "entrega",  label: "Entrega (delivery)", icon: "🛵" },
  ].filter(Boolean);
  const minimoExterno = parseMoedaBR(cfgExt.pedidoMinimo); // número em reais (0 = sem mínimo)
  const usarPedidoWhatsapp = modoExterno && cfgExt.pedidoViaWhatsapp === true && numeroWhatsAppValido(cfgExt.whatsappNumero);
  const pedeEnderecoAgora = modoExterno && tipoPedido === "entrega" && loja?.id != null && lojaComEndereco === loja.id;
  const lojaIdEndereco = modoExterno && cfgExt.entrega === true ? loja?.id : null;
  useEffect(() => {
    if (lojaIdEndereco == null) return undefined;
    let vivo = true;
    lojaPedeEndereco(supabase, lojaIdEndereco).then((sim) => { if (vivo) setLojaComEndereco(sim ? lojaIdEndereco : null); });
    return () => { vivo = false; };
  }, [lojaIdEndereco]);
  // Horário de funcionamento — FONTE ÚNICA: loja.funcionamento (migration 110),
  // com fallback do legado config_externo.horarios (canal externo). Avaliado no
  // fuso da loja pelo serviço de domínio (não recalcula aqui). QR de mesa é canal
  // INTERNO; link/divulgação é canal EXTERNO.
  const funcLoja = useMemo(() => normalizarFuncionamento(loja?.funcionamento, cfgExt.horarios), [loja?.funcionamento, cfgExt.horarios]);
  const canalAtual = modoExterno ? "externo" : "interno";
  // REGRA CENTRAL: modo de uso + horário + bloqueio numa única decisão de domínio.
  const disp = useMemo(() => avaliarDisponibilidadeCanal({ modoUso: loja?.modoUso, funcionamento: funcLoja, canal: canalAtual, agora }), [loja?.modoUso, funcLoja, canalAtual, agora]);
  const abertoAgora = disp.abertoPorHorario;
  // Bloqueio de NOVO pedido = canal indisponível (canal-desabilitado, fora-horario…).
  const bloqueioHorario = !disp.disponivel;
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
      return { id: it.id, name: it.name, price: preco, precoOriginal: original, economiaUnit: Math.max(0, original - preco), quantity: 1, category: it.category,
        comboId: inst, comboNome: combo.promo.nome, comboPromoId: combo.promo.id, removedIngredients: [], extraIngredients: [], selectedOptions: [], observation: "", _uid: Date.now() + Math.random() + idx };
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
    const promo = promoDoProduto(item);
    const favorito = favSet.has(item.id);
    // lojaId garante que a chave de favoritos do ProdutoModal case com a lida
    // aqui (mesma loja) — o coração marcado no modal reflete no card.
    // Abre o modal com o produto já no preço promocional (carrinho/total refletem o desconto)
    const abrir = () => setDetalhe(promo
      ? { ...item, lojaId: item.lojaId ?? loja?.id, price: promo.preco, precoOriginal: promo.original, economiaUnit: promo.original - promo.preco }
      : { ...item, lojaId: item.lojaId ?? loja?.id });
    return <CardapioProdutoCard key={item.id} item={item} promo={promo} favorito={favorito} onAbrir={abrir} />;
  };
  // "Ver QR": gera o QR do link deste cardápio (para o cliente compartilhar a mesa).
  const abrirQr = async () => {
    try { const QRCode = (await import("qrcode")).default; const u = await QRCode.toDataURL(window.location.href, { width: 600, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } }); setQrModal(u); } catch {}
  };

  const telDig = telefone.replace(/\D/g, "");
  // Preenche o nome de quem já informou este telefone NESTE aparelho. O banco não
  // devolve nome a partir de telefone para quem não tem login (migration 216).
  useEffect(() => {
    if (!modoExterno || !loja || telDig.length < 10) return;
    const t = setTimeout(() => {
      const nome = nomeLembrado(loja.id, telDig);
      if (nome) setCliente(capitalizarNome(nome));
    }, 500);
    return () => clearTimeout(t);
  }, [telDig, modoExterno, loja?.id]);

  // Fidelidade: saldo de pontos do cliente identificado (leitura pública). Só
  // aparece se a RPC existir (migration 073) e houver saldo. O débito real é
  // efetivado pelo caixa no fechamento (segurança — identidade é só o telefone).
  useEffect(() => {
    if (!loja) return;
    let vivo = true;
    const t = setTimeout(async () => {
      if (telDig.length < 10) { if (vivo) { setSaldoPontos(null); setUsarPontos(false); } return; }
      const s = await rpcSaldoFidelidade({ lojaId: loja.id, telefone: telDig });
      if (vivo) setSaldoPontos(s);
    }, 600);
    return () => { vivo = false; clearTimeout(t); };
  }, [telDig, loja?.id]);

  // Fidelidade: regra de pontos vigente (ganho + resgate), leitura pública. Serve
  // para mostrar ao cliente quantos pontos ele ganha na compra. Tolerante: se a
  // RPC (migration 074) não existir, fica null e a UI de pontos-a-ganhar some.
  useEffect(() => {
    if (!loja) return;
    let vivo = true;
    rpcFidelidadeRegra({ lojaId: loja.id }).then((r) => { if (vivo) setFidRegraPub(r && r.ativo ? r : null); }).catch(() => {});
    return () => { vivo = false; };
  }, [loja?.id]);

  // Mantém a regra de pontos FRESCA enquanto o cliente decide (carrinho/conta):
  // re-lê ao abrir a gaveta e a cada 60s. O cardápio anônimo não recebe realtime
  // da tabela de regras, então este refresh replica em (quase) tempo real as
  // alterações feitas no painel de Fidelidade — afetando os pedidos ainda abertos.
  useEffect(() => {
    if (!loja || (aba !== "carrinho" && aba !== "conta")) return;
    let vivo = true;
    const carregar = () => rpcFidelidadeRegra({ lojaId: loja.id }).then((r) => { if (vivo) setFidRegraPub(r && r.ativo ? r : null); }).catch(() => {});
    carregar();
    const iv = setInterval(carregar, 60000);
    return () => { vivo = false; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, loja?.id]);

  // Cadastra/atualiza o cliente do estabelecimento assim que NOME + TELEFONE
  // forem informados (sem esperar o pedido) — alimenta o CRM da empresa.
  useEffect(() => {
    if (!modoExterno || !loja || telDig.length < 10 || cliente.trim().length < 2) return;
    const t = setTimeout(async () => {
      lembrarNome(loja.id, telDig, cliente);
      try { await (cardapioViaRpc() ? rpcUpsertClientePublico({ lojaId: loja.id, nome: cliente.trim(), telefone: telDig }) : upsertCliente({ nome: cliente.trim(), telefone: telDig, lojaId: loja.id })); }
      catch {}
    }, 900);
    return () => clearTimeout(t);
  }, [telDig, cliente, modoExterno, loja?.id]);

  // Acessibilidade: aplica a escala de texto à raiz do documento (font-size em %),
  // fazendo os textos em rem crescerem junto. Restaura ao desmontar para não
  // "vazar" a escala para outras telas do app. Persiste a escolha do cliente.
  useEffect(() => {
    const html = document.documentElement;
    html.style.fontSize = escalaA11y > 1 ? `${Math.round(escalaA11y * 100)}%` : "";
    try { localStorage.setItem("pedidoPrime:a11yEscala", String(escalaA11y)); } catch { /* storage indisponível */ }
    return () => { html.style.fontSize = ""; };
  }, [escalaA11y]);

  const cicloAcessibilidade = () => {
    setEscalaA11y((v) => {
      const prox = v >= 1.2 ? 1 : Math.round((v + 0.1) * 10) / 10;
      setMsg({ t: "success", m: prox > 1 ? `Texto ampliado (${Math.round(prox * 100)}%) para facilitar a leitura.` : "Tamanho do texto normal." });
      return prox;
    });
  };

  const alternarNotificacoes = async () => {
    if (typeof Notification === "undefined") { setMsg({ t: "error", m: "Seu navegador não suporta notificações." }); return; }
    if (Notification.permission === "granted") { setNotifOn((v) => { setMsg({ t: "success", m: v ? "Notificações pausadas." : "Notificações ativadas — avisaremos quando seu pedido ficar pronto." }); return !v; }); return; }
    if (Notification.permission === "denied") { setMsg({ t: "error", m: "Notificações bloqueadas nas configurações do navegador." }); return; }
    try {
      const p = await Notification.requestPermission();
      if (p === "granted") { setNotifOn(true); setMsg({ t: "success", m: "Notificações ativadas — avisaremos quando seu pedido ficar pronto." }); }
      else setMsg({ t: "error", m: "Sem permissão para notificar. Você pode ativar nas configurações." });
    } catch { setMsg({ t: "error", m: "Não foi possível ativar as notificações agora." }); }
  };

  const currentTable = mesa ? `Mesa ${String(mesa).padStart(2, "0")}` : "";
  // O pedido só deixa de ser acompanhado quando estiver CONCLUÍDO: pago E entregue/retirado.
  // Enquanto faltar uma das duas, continua aparecendo com o status do estágio atual.
  const concluido = (o) => o.paymentStatus === "paid" && o.status === "delivered";
  const meusPedidos = modoExterno
    ? orders.filter((o) => telDig && o.clienteTelefone === telDig && o.status !== "cancelled" && !concluido(o))
    : orders.filter((o) => o.table === currentTable && o.command === comanda && o.status !== "cancelled" && !concluido(o));
  // Notificação do navegador quando um pedido acompanhado fica PRONTO (só se o
  // cliente ativou em "Notificações e novidades"). Dispara uma vez por pedido.
  const prontoNotifRef = useRef(new Set());
  useEffect(() => {
    if (!notifOn || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const o of meusPedidos) {
      if (o.status === "ready" && !prontoNotifRef.current.has(o.id)) {
        prontoNotifRef.current.add(o.id);
        try { new Notification("Seu pedido está pronto! 🍽️", { body: `${loja?.nome || "Pedido"}${currentTable ? " · " + currentTable : ""}`, tag: `pp-pronto-${o.id}` }); } catch { /* notificação indisponível */ }
      }
    }
  }, [meusPedidos, notifOn, loja?.nome, currentTable]);
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
  const resumoMesa = resumoDosPedidos(meusPedidos, taxaPct); // mesma conta do caixa
  const subtotal = resumoMesa.subtotal;
  const totalMesa = resumoMesa.total;
  const totalCart = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const economiaCart = cart.reduce((s, i) => s + (Number(i.economiaUnit) || 0) * i.quantity, 0);
  const qtdCart = cart.reduce((s, i) => s + i.quantity, 0);
  // Fidelidade (incentivo): pontos que o cliente ganha nesta compra e o saldo
  // atual em R$. Só quando há regra ativa (leitura pública, migration 074).
  const valorPorPontoPub = Number(fidRegraPub?.valorPorPonto) || 0;
  const pontosPorRealPub = Number(fidRegraPub?.pontosPorReal) || 100;
  // Pontos sobre o total a pagar: o consumo no local (mesa ou pedido externo "local") soma a taxa de serviço.
  const carrinhoComTaxa = !modoExterno || tipoPedido === "local";
  const pontosGanharCart = pontosPor(totalCart + (carrinhoComTaxa ? valorDaTaxa(totalCart, taxaPct) : 0), valorPorPontoPub);
  // Pontos da CONTA — considera SOMENTE os pedidos ainda NÃO quitados (os já
  // pagos já creditaram). Recalcula a cada item adicionado/cancelado/pago e a
  // cada mudança da regra (fidRegraPub atualiza em tempo real).
  const totalAberto = resumoDosPedidos(meusPedidos.filter((o) => o.paymentStatus !== "paid"), taxaPct).total;
  const pontosGanharConta = pontosPor(totalAberto, valorPorPontoPub);
  const clienteIdentificado = telDig.length >= 10;
  const reaisEmPontosSaldo = reaisDosPontos(saldoPontos, pontosPorRealPub);
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
    let janelaWhatsapp = null;
    try {
      if (bloqueioHorario) return setMsg({ t: "error", m: mensagemCanalIndisponivel(disp, modoExterno) });
      // Revalida a ocupação da mesa direto no backend antes de concluir — evita
      // cache/concorrência: se a mesa ficou ocupada durante a navegação e o
      // cliente ainda não confirmou essa ocupação, pede confirmação agora e
      // NÃO envia o pedido ainda (o cliente confirma e clica em enviar de novo).
      if (!modoExterno && statusMesa?.existe && !ocupacaoConfirmada) {
        const fresco = await rpcStatusMesa({ lojaId: loja.id, mesaNumero: Number(mesa), mesaId: mesaIdURL });
        if (fresco?.ocupada) { setStatusMesa(fresco); return; }
      }
      const obsPedido = observacaoPedido.trim().slice(0, 500);
      const itens = cart.map((i, indice) => ({ name: i.name, quantity: i.quantity, price: i.price, selectedIngredients: i.selectedIngredients, removedIngredients: i.removedIngredients, extraIngredients: i.extraIngredients, selectedOptions: i.selectedOptions || [], observation: i.observation, ...(indice === 0 && obsPedido ? { orderObservation: obsPedido } : {}) }));
      // Contrato PÚBLICO SEGURO V2 (migration 119 — pub_criar_pedido_v2):
      // só identidade/quantidade/observação de cada item. NENHUM valor
      // financeiro (price/subtotal) é enviado — o servidor recalcula tudo a
      // partir do cadastro (preço, promoções, adicionais, opções). optionIds
      // vem de selectedOptions[].optionId (gravado em App.jsx ProdutoModal);
      // itens sem esse campo (carrinho antigo salvo antes desta mudança,
      // restaurado do sessionStorage) simplesmente não enviam opção alguma.
      const itensV2 = cart.map((i) => ({
        productId: i.id,
        quantity: i.quantity,
        optionIds: (i.selectedOptions || []).map((o) => o.optionId).filter((id) => id != null),
        extraIngredients: i.extraIngredients || [],
        removedIngredients: i.removedIngredients || [],
        observation: i.observation || "",
        ...(i.comboPromoId != null ? { comboPromoId: i.comboPromoId } : {}),
      }));
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
      let tipoEntregaSel = null; // 'local'|'retirada'|'entrega' — enviado ao RPC V2 (rótulo de mesa; sem valor financeiro)
      if (modoExterno) {
      // Aplica as regras configuradas pela empresa (aba "Pedido externo")
      if (!aceitaExterno) return setMsg({ t: "error", m: "Esta empresa não está aceitando pedidos pelo cardápio no momento." });
      if (opcoesEntrega.length === 0) return setMsg({ t: "error", m: "Nenhuma forma de pedido (consumo, retirada ou entrega) está disponível no momento." });
      const opc = opcoesEntrega.find((o) => o.id === tipoPedido);
      if (!opc) return setMsg({ t: "error", m: "Escolha como deseja receber o pedido." });
      tipoEntregaSel = opc.id;
      if (minimoExterno > 0 && totalCart < minimoExterno) return setMsg({ t: "error", m: `Pedido mínimo de ${formatCurrency(minimoExterno)}. Faltam ${formatCurrency(minimoExterno - totalCart)}.` });
      // Pedido externo (link de divulgação): exige NOME + TELEFONE
      if (!cliente.trim()) return setMsg({ t: "error", m: "Informe o seu nome." });
      if (telDig.length < 10) return setMsg({ t: "error", m: "Informe um telefone válido (com DDD)." });
      const erroEndereco = pedeEnderecoAgora ? problemaDoEndereco(endereco) : null;
      if (erroEndereco) return setMsg({ t: "error", m: erroEndereco });
      // Reserva a aba ainda dentro do clique do cliente. A URL final só será
      // aplicada depois que o Pedido Prime confirmar a gravação do pedido.
      if (usarPedidoWhatsapp) janelaWhatsapp = window.open("about:blank", "_blank");
      setEnviando(true);
      lembrarNome(loja.id, telDig, cliente);
      try { await (cardapioViaRpc() ? rpcUpsertClientePublico({ lojaId: loja.id, nome: cliente.trim(), telefone: telDig }) : upsertCliente({ nome: cliente.trim(), telefone: telDig, lojaId: loja.id })); } catch {}
      const rotuloTipo = { local: "Consumo no local", retirada: "Retirada", entrega: "Entrega" }[opc.id] || "Externo";
      novo = {
        id: `PED-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`,
        table: `Externo · ${rotuloTipo}`, command: `EXT-${telDig.slice(-6)}`, customer: cliente.trim(), clienteTelefone: telDig,
        status: "received", paymentStatus: "open",
        createdAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        items: itens, lojaId: loja.id,
        pagamentoForma: formaSel?.label ?? null, pagamentoMomento: momentoPagto, pagamentoTrocoPara: trocoParaNum, observation: obsPedido,
        ...(pedeEnderecoAgora ? { enderecoEntrega: enderecoEmLinha(endereco) } : {}),
      };
    } else {
      // Pedido na mesa (QR da mesa): exige mesa + comanda
      if (!podeMesa) return setMsg({ t: "error", m: "O QR Code por mesa está disponível nos modos Interno ou Ambos." });
      if (!mesa || Number(mesa) <= 0) return setMsg({ t: "error", m: "Informe o número da mesa." });
      if (!mesaValida) return setMsg({ t: "error", m: "Mesa não encontrada ou inativa. Verifique o QR Code." });
      if (!isValidCommand(comanda)) return setMsg({ t: "error", m: "Escaneie o QR Code da mesa (comanda) para pedir." });
      if (comanda.split("-")[0] !== loja.prefixo) return setMsg({ t: "error", m: `Comanda de outra empresa (${comanda.split("-")[0]}).` });
      setEnviando(true);
      // Identificação opcional na mesa: com telefone válido, cadastra/vincula o
      // cliente e grava clienteTelefone no pedido — é o que permite ACUMULAR
      // pontos (o caixa credita no fechamento) e ver o saldo. Sem telefone, o
      // pedido segue anônimo (sem pontos), como antes.
      const telMesa = telDig.length >= 10 ? telDig : null;
      if (telMesa) { try { await (cardapioViaRpc() ? rpcUpsertClientePublico({ lojaId: loja.id, nome: cliente.trim() || "Cliente", telefone: telMesa }) : upsertCliente({ nome: cliente.trim() || "Cliente", telefone: telMesa, lojaId: loja.id })); } catch { /* cadastro tolerante: não bloqueia o envio do pedido */ } }
      novo = {
        id: `PED-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`,
        table: currentTable, command: comanda, customer: cliente.trim() || "Cliente", clienteTelefone: telMesa,
        status: "received", paymentStatus: "open",
        createdAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        items: itens, lojaId: loja.id,
        pagamentoForma: formaSel?.label ?? null, pagamentoMomento: momentoPagto, pagamentoTrocoPara: trocoParaNum,
      };
    }
    try {
      let pedidoId = novo.id;
      const mesaNumero = modoExterno ? null : (Number(mesa) || null);
      const mesaId = modoExterno ? null : mesaIdURL;
      // Único caminho de criação do pedido público (correção P0.1): a
      // segurança da gravação não pode depender da flag CARDAPIO_PUBLICO_VIA_RPC
      // — não existe mais um caminho alternativo de inserção direta em
      // tab_pedidos/tab_impressoes_cozinha pelo navegador. Preço, opções/
      // adicionais, setor, impressora, regras de config_externo (aceita
      // pedido/modalidade/pedido mínimo) e forma/momento de pagamento são
      // validados e calculados no servidor (migration 119); a fila de
      // impressão é gravada lá dentro, na mesma transação. Se a RPC falhar,
      // o catch abaixo mostra um erro controlado ao cliente — SEM fallback
      // para o RPC legado (pub_criar_pedido, hoje fechado para anon/
      // authenticated) e SEM inserção direta pelo navegador.
      // Entrega com endereço (a loja pede): função própria, que cria o pedido pelas mesmas regras e grava o endereço junto.
      const dadosPedido = {
        lojaId: loja.id, canal: modoExterno ? "externo" : "interno", itens: itensV2,
        mesaNumero, mesaId, comanda: novo.command, cliente: novo.customer, telefone: novo.clienteTelefone || "",
        tipoEntrega: tipoEntregaSel, formaPagamentoId: formaSel?.id ?? null,
        trocoPara: trocoParaNum, observacaoPedido: obsPedido,
      };
      const r = pedeEnderecoAgora ? await criarPedidoEntrega(supabase, { ...dadosPedido, endereco }) : await rpcCriarPedidoPublicoV2(dadosPedido);
      if (r) pedidoId = r;
      // A Pesquisa de Satisfação NÃO aparece agora — só quando o pedido CONCLUIR
      // (pago + retirado/entregue). Registra o pedido como pendente de pesquisa.
      try { const pend = lerSetLS(SURVEY_PEND_KEY); pend.add(pedidoId); salvarSetLS(SURVEY_PEND_KEY, pend); } catch {}
      if (usarPedidoWhatsapp) {
        const urlWhatsapp = criarUrlPedidoWhatsApp(cfgExt.whatsappNumero, {
          pedido: { ...novo, lojaNome: loja.nome }, pedidoId, total: totalCart,
          formaPagamento: formaSel?.label || "", momentoPagamento: momentoPagto,
          introducao: cfgExt.whatsappMensagem,
        });
        if (urlWhatsapp) {
          if (janelaWhatsapp && !janelaWhatsapp.closed) janelaWhatsapp.location.href = urlWhatsapp;
          else window.location.href = urlWhatsapp;
        }
      }
      setCart([]); setTrocoResposta(""); setTrocoValor(""); setObservacaoPedido(""); setEndereco(ENDERECO_VAZIO); setAba("conta");
      setMsg({ t: "success", m: usarPedidoWhatsapp
        ? "Pedido registrado. O WhatsApp foi aberto para continuar o atendimento com a empresa."
        : modoExterno && tipoPedido === "local"
        ? "Pedido enviado com sucesso. Foi encaminhado para preparação — o pagamento será feito no fechamento da conta."
        : "Pedido enviado com sucesso. Foi encaminhado para preparação." });
    } catch (e) {
      if (janelaWhatsapp && !janelaWhatsapp.closed) janelaWhatsapp.close();
      console.error("Erro ao criar pedido:", e);
      // Convenção de erro controlado (migration 119, pub_criar_pedido_v2):
      // toda validação de negócio intencional da RPC vem prefixada com
      // "PPV2:" — só essas mensagens são mostradas ao cliente (sem o
      // prefixo). Qualquer outra coisa (cast inesperado, falha de rede,
      // erro bruto do Postgres/PostgREST) cai no aviso genérico — nunca
      // expõe detalhe técnico interno ao cliente final.
      const msgServidor = typeof e?.message === "string" ? e.message.trim() : "";
      const msgControlada = msgServidor.startsWith("PPV2:") ? msgServidor.slice(5).trim() : "";
      setMsg({ t: "error", m: msgControlada || "Erro ao enviar o pedido. Tente novamente." });
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
      const comPontos = usarPontos && saldoPontos > 0;
      // CARDAPIO_PUBLICO_VIA_RPC é uma constante literal `true` (src/lib/authMode.js)
      // — não depende de env/DB, então cardapioViaRpc() é sempre true e o ramo
      // alternativo era código morto. Removido: o cardápio público (caller anon)
      // usa exclusivamente a RPC pública pub_solicitar_conta, nunca uma RPC
      // interna app_* (essas exigem authenticated e nunca recebem EXECUTE de
      // anon — ver migration 132).
      const comandas = [...new Set(meusPedidos.map((o) => o.command).filter(Boolean))];
      await Promise.all(comandas.map((c) => rpcSolicitarContaPublico({ lojaId: loja.id, comanda: c, usarPontos: comPontos })));
      setMsg({ t: "success", m: comPontos ? "Fechamento solicitado — o caixa vai aplicar seus pontos." : reenvio ? "Solicitação reenviada ao caixa." : "Fechamento solicitado ao caixa." });
    } catch { setMsg({ t: "error", m: "Erro ao solicitar a conta. Tente novamente." }); }
    finally { setSolicitando(false); solicitandoRef.current = false; }
  }

  // ── Estados de carregamento/erro ───────────────────────────
  if (loja === undefined) return <CardapioSkeleton />;
  if (loja === null) return <Centro><span className="text-5xl">🔍</span><p className="mt-3 font-semibold text-[var(--client-text-primary)]">Empresa não encontrada</p><p className="mt-1 text-sm text-[var(--client-text-secondary)]">Verifique o link/QR do cardápio.</p></Centro>;

  // ── Consulta read-only por comanda (QR do relatório) ───────────
  // Mostra os pedidos/itens vinculados à comanda escaneada. Independe do canal
  // externo estar habilitado (é consulta, não pedido) — por isso vem antes.
  if (consultaComanda) {
    const pedidosC = orders
      .filter((o) => o.command === comanda && o.status !== "cancelled")
      .sort((a, b) => new Date(a.createdAtISO || 0) - new Date(b.createdAtISO || 0));
    const subtotalPedido = (o) => o.items.reduce((a, i) => a + i.price * i.quantity, 0);
    const subtotalC = pedidosC.reduce((s, o) => s + subtotalPedido(o), 0);
    const { taxa: taxaC, total: totalC } = resumoDosPedidos(pedidosC, taxaPct);
    // Base dos pontos: o total a pagar; com a conta em aberto, só os pedidos ainda NÃO quitados (os pagos já creditaram).
    const totalAbertoC = resumoDosPedidos(pedidosC.filter((o) => o.paymentStatus !== "paid"), taxaPct).total;
    const itensC = pedidosC.reduce((s, o) => s + o.items.reduce((a, i) => a + (i.quantity || 0), 0), 0);
    // Agrupa os pedidos por DIA (sem agrupar por comanda) — cada dia vira uma
    // seção com seu próprio subtotal + taxa, na mesma ordem cronológica.
    const diasC = [];
    for (const o of pedidosC) {
      const k = diaKeyConsulta(o.createdAtISO);
      let g = diasC.length && diasC[diasC.length - 1].key === k ? diasC[diasC.length - 1] : null;
      if (!g) { g = { key: k, iso: o.createdAtISO, pedidos: [], subtotal: 0 }; diasC.push(g); }
      g.pedidos.push(o); g.subtotal += subtotalPedido(o);
    }
    const pagaC = pedidosC.length > 0 && pedidosC.every((o) => o.paymentStatus === "paid");
    const solicC = pedidosC.some((o) => o.paymentStatus === "requested");
    const statusConta = pagaC ? { t: "Pagamento confirmado", cls: "border-[var(--client-success-border)] bg-[var(--client-success-soft)] text-[var(--client-success)]", ic: "bg-[var(--client-success)]" }
      : solicC ? { t: "Fechamento solicitado", cls: "border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] text-[var(--client-warning)]", ic: "bg-[var(--client-warning)]" }
      : { t: "Conta em aberto", cls: "border-[var(--client-info-border)] bg-[var(--client-info-soft)] text-[var(--client-text-primary)]", ic: "bg-[var(--client-info)]" };

    return (
      <div data-theme="light" className="tema-claro-area min-h-screen w-full max-w-full overflow-x-hidden bg-[var(--client-background)] text-[var(--client-text-primary)]" style={{ minHeight: "100dvh" }}>
        {/* Cabeçalho da marca */}
        <header className="border-b border-[var(--client-border)] bg-[var(--client-surface)] px-4 pb-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}>
          <div className="mx-auto flex max-w-md items-center gap-3">
            {loja.logoUrl ? <img src={loja.logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-2xl object-cover" /> : <LogoPP size={44} />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-[var(--client-text-primary)]">{loja.nome}</p>
              <p className="truncate text-xs text-[var(--client-text-secondary)]">Consulta da comanda</p>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-md px-4 py-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}>
          {/* Código da comanda */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] px-4 py-3">
            <div className="flex items-center gap-2 text-[var(--client-primary-hover)]">
              <CkIconRecibo width={18} height={18} />
              <span className="font-mono text-lg font-semibold tracking-wide">{comanda}</span>
            </div>
            {pedidosC.length > 0 && <span className="shrink-0 text-xs font-semibold text-[var(--client-primary-hover)]">{pedidosC.length} pedido{pedidosC.length > 1 ? "s" : ""} · {itensC} {itensC === 1 ? "item" : "itens"}</span>}
          </div>

          {pedidosC.length === 0 ? (
            <div className="mt-10 flex flex-col items-center text-center">
              {pedidosSync ? (
                <>
                  <span className="text-5xl">🧾</span>
                  <p className="mt-3 font-semibold text-[var(--client-text-primary)]">Nenhum pedido nesta comanda ainda</p>
                  <p className="mt-1 text-sm text-[var(--client-text-secondary)]">Assim que um pedido for lançado na comanda <b>{comanda}</b>, ele aparece aqui automaticamente.</p>
                  <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--client-text-secondary)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--client-success)]" aria-hidden="true" /> Atualizando ao vivo</p>
                </>
              ) : (
                <>
                  <Spinner />
                  <p className="mt-3 text-sm text-[var(--client-text-secondary)]">Buscando os pedidos da comanda…</p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Pedidos e itens — separados por dia */}
              <div className="mt-3 space-y-4">
                {diasC.map((dia) => (
                  <div key={dia.key} className="space-y-2.5">
                    {/* Cabeçalho do dia */}
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] px-3 py-2">
                      <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--client-primary-hover)]">
                        <CkIconRecibo width={14} height={14} />
                        {rotuloDiaConsulta(dia.iso)}
                        <span className="rounded-full bg-[var(--client-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--client-text-secondary)]">{dia.pedidos.length} pedido{dia.pedidos.length > 1 ? "s" : ""}</span>
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold text-[var(--client-primary-hover)]">{formatCurrency(resumoDosPedidos(dia.pedidos, taxaPct).total)}</span>
                    </div>
                    {dia.pedidos.map((o) => {
                      const s = estiloStatusCliente(o.status);
                      const modoPedido = modoEntregaPedido(o, true);
                      const subtotalO = subtotalPedido(o);
                      return (
                        <div key={o.id} className="rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] p-3.5 shadow-[var(--client-shadow-sm)]">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[var(--client-text-primary)]">Pedido nº {String(o.id || "").replace(/\D/g, "").slice(-4)}</p>
                              {o.createdAt && <p className="text-[11px] text-[var(--client-text-secondary)]">Realizado às {o.createdAt}</p>}
                            </div>
                            <span className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${s.chip}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />{statusClienteLabel(o, modoPedido)}
                            </span>
                          </div>
                          <div className="mt-3 space-y-1 border-t border-[var(--client-border)] pt-3">
                            {o.items.map((it, idx) => (
                              <div key={idx} className="flex justify-between gap-3 text-sm">
                                <span className="min-w-0 text-[var(--client-text-secondary)]"><b className="text-[var(--client-text-primary)]">{it.quantity}×</b> {it.name}{it.observation ? <i className="text-[var(--client-text-muted)]"> — {it.observation}</i> : ""}</span>
                                <span className="shrink-0 font-semibold text-[var(--client-text-primary)]">{formatCurrency(it.price * it.quantity)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between gap-3 pt-1 text-xs font-semibold text-[var(--client-text-secondary)]"><span>Subtotal do pedido</span><span>{formatCurrency(subtotalO)}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Status financeiro */}
              <div className={`mt-3 flex items-center gap-3 rounded-2xl border p-3.5 ${statusConta.cls}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${statusConta.ic}`}><CkIconCarteira width={17} height={17} /></span>
                <p className="text-sm font-semibold">{statusConta.t}</p>
              </div>

              {/* Totais */}
              <div className="mt-3 space-y-1.5 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] p-3.5">
                <div className="flex items-center justify-between text-sm"><span className="text-[var(--client-text-secondary)]">Subtotal</span><span className="text-[var(--client-text-secondary)]">{formatCurrency(subtotalC)}</span></div>
                {taxaC > 0 && <div className="flex items-center justify-between text-sm"><span className="text-[var(--client-text-secondary)]">Taxa de serviço ({textoDoPercentual(taxaPct)}%)</span><span className="text-[var(--client-text-secondary)]">{formatCurrency(taxaC)}</span></div>}
                <div className="flex items-center justify-between border-t border-[var(--client-border)] pt-2">
                  <span className={`text-sm font-semibold ${pagaC ? "text-[var(--client-success)]" : "text-[var(--client-text-secondary)]"}`}>{pagaC ? "Total pago" : "Total"}</span>
                  <span className={`text-xl font-semibold ${pagaC ? "text-[var(--client-success)]" : "text-[var(--client-text-primary)]"}`}>{formatCurrency(totalC)}</span>
                </div>
                {valorPorPontoPub > 0 && pontosPor(pagaC ? totalC : totalAbertoC, valorPorPontoPub) > 0 && (
                  <div className="flex items-center justify-between border-t border-[var(--client-border)] pt-2 text-xs font-semibold text-[var(--client-primary-hover)]">
                    <span className="inline-flex items-center gap-1"><CkIconEstrela width={12} height={12} className="shrink-0" /> {pagaC ? "Pontos creditados" : "Pontos desta conta"}</span>
                    <span>+{pontosPor(pagaC ? totalC : totalAbertoC, valorPorPontoPub).toLocaleString("pt-BR")} pts</span>
                  </div>
                )}
              </div>
              <p className="mt-3 text-center text-[11px] text-[var(--client-text-muted)]">Atualiza automaticamente · Consulta somente leitura</p>
            </>
          )}
          {pedidosOffline && <p className="mt-3 text-center text-[11px] text-[var(--client-warning)]">Reconectando à atualização em tempo real…</p>}
        </div>
      </div>
    );
  }
  if (!canalPermitido) return mesaURL
    ? <Centro><span className="text-5xl">📵</span><p className="mt-3 font-semibold text-[var(--client-text-primary)]">QR por mesa indisponível</p><p className="mt-1 text-sm text-[var(--client-text-secondary)]">O QR Code por mesa está disponível nos modos Interno ou Ambos.</p></Centro>
    : <Centro><span className="text-5xl">📵</span><p className="mt-3 font-semibold text-[var(--client-text-primary)]">Cardápio externo indisponível</p><p className="mt-1 text-sm text-[var(--client-text-secondary)]">Esta empresa não habilitou o cardápio digital para o cliente.</p></Centro>;
  if (mesaURL && !mesaValida) return <Centro><span className="text-5xl">🚫</span><p className="mt-3 font-semibold text-[var(--client-text-primary)]">QR Code inválido</p><p className="mt-1 text-sm text-[var(--client-text-secondary)]">Esta mesa não foi encontrada ou está inativa. Fale com a equipe do estabelecimento.</p></Centro>;
  // Nunca libera o cardápio antes de saber se a mesa está ocupada — evita
  // qualquer flash do cardápio antes do modal de confirmação aparecer.
  if (mesaURL && podeMesa && statusMesa === null) return <Centro><Spinner /><p className="mt-3 text-sm text-[var(--client-text-secondary)]">Verificando a mesa…</p></Centro>;
  // Cliente recusou a confirmação de mesa ocupada — bloqueia e orienta a
  // escanear o QR certo (não deixa seguir para o cardápio).
  if (mesaURL && ocupacaoRecusada) return <Centro><span className="text-5xl">🔍</span><p className="mt-3 font-semibold text-[var(--client-text-primary)]">Confira o QR Code</p><p className="mt-1 text-sm text-[var(--client-text-secondary)]">Escaneie o QR Code afixado na sua mesa para continuar.</p></Centro>;
  // Confirmação OBRIGATÓRIA de mesa ocupada — status vem sempre do backend
  // (pub_status_mesa, migration 067), nunca de cache. Só aparece quando
  // realmente ocupada (nunca para mesa disponível) e bloqueia o cardápio até
  // o cliente responder.
  if (mesaURL && statusMesa?.ocupada && !ocupacaoConfirmada) {
    const numeroFmt = String(statusMesa.numero ?? mesaURL).padStart(2, "0");
    return (
      <div data-theme="light" className="tema-claro-area fixed inset-0 z-[130] flex min-h-screen w-full max-w-full items-center justify-center overflow-x-hidden bg-black/60 p-6 backdrop-blur-sm" style={{ minHeight: "100dvh" }}>
        <div role="alertdialog" aria-modal="true" aria-labelledby="msg-mesa-ocupada" className="w-full max-w-sm rounded-3xl border border-[var(--client-border)] bg-[var(--client-surface)] p-5 text-center shadow-[var(--client-shadow-floating)]">
          <p className="text-3xl">🍽️</p>
          <p id="msg-mesa-ocupada" className="mt-2 text-base font-semibold text-[var(--client-text-primary)]">Esta mesa já está ocupada.</p>
          <p className="mt-1 text-sm text-[var(--client-text-secondary)]">
            Você está realmente na <b className="text-[var(--client-text-primary)]">Mesa {numeroFmt}{statusMesa.nome ? ` — ${statusMesa.nome}` : ""}</b>?
          </p>
          <p className="mt-2 text-xs text-[var(--client-text-muted)]">Ao continuar, seu pedido será adicionado aos pedidos já existentes desta mesa.</p>
          <div className="mt-4 flex flex-col gap-2">
            <button onClick={() => setOcupacaoConfirmada(true)} type="button" className="min-h-[44px] w-full rounded-2xl btn-laranja bg-[var(--client-primary-hover)] py-3 text-sm font-semibold text-[var(--client-info)] transition active:scale-95 hover:bg-[var(--client-primary)]">
              Sim, estou na Mesa {numeroFmt}
            </button>
            <button onClick={() => setOcupacaoRecusada(true)} type="button" className="min-h-[44px] w-full rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] py-3 text-sm font-semibold text-[var(--client-text-secondary)] transition active:scale-95 hover:bg-[var(--client-surface-secondary)]">
              Não, cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Tela de boas-vindas (QR da mesa / link externo) ──────────
  // Extraída para src/pages/cardapio/CardapioBoasVindas.jsx (mesmo
  // comportamento; cores/tipografia agora nos tokens --client-* oficiais).
  if (etapa === "welcome") {
    const lojaStatus = abertoAgora ? "aberto" : disp.motivo === MOTIVO.FORA_HORARIO ? "fechado" : null;
    const fechaHoje = abertoAgora ? (disp.intervaloAtual?.fecha || null) : null;
    return (
      <CardapioBoasVindas
        loja={loja} modoExterno={modoExterno} currentTable={currentTable}
        lojaStatus={lojaStatus} fechaHoje={fechaHoje}
        produtos={produtos} catNomePorId={catNomePorId}
        mesa={mesa} meusPedidos={meusPedidos} chamando={chamando} chamar={chamar} msg={msg}
        detalhe={detalhe} gruposOpcoes={gruposOpcoes} opcoes={opcoes} addConfigurado={addConfigurado}
        onFecharDetalhe={() => setDetalhe(null)}
        onAbrirCardapio={() => setEtapa("cardapio")}
        onAbrirProduto={(p) => { setEtapa("cardapio"); setDetalhe(p); }}
        onAcompanharPedido={() => { setEtapa("cardapio"); setAba("conta"); }}
      />
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
  const exigePagamentoAgora = modoExterno && tipoPedido !== "local" && formasPagto.length > 0;
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
    <div ref={raizRef} data-theme="light" className="tema-claro-area min-h-screen w-full max-w-full overflow-x-clip bg-[var(--client-background)] text-[var(--client-text-primary)]" style={{ minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom) + 78px)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
      {/* Cabeçalho */}
      {/* Cabeçalho + categorias num ÚNICO container sticky (top-0): grudam
          JUNTOS no topo por CSS nativo, sem depender do valor MEDIDO do header
          para posicionar a barra (o antigo top:headerH era frágil — soltava a
          barra quando a medição chegava errada). A medição (headerH/catBarH)
          continua só para o scroll-margin e o realce da categoria ativa. */}
      <div className="sticky top-0 z-30">
      <header ref={headerRef} className="border-b border-[var(--client-border)] bg-[var(--client-surface)] px-3 pb-2 backdrop-blur-xl" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}>
        {/* Header em UMA linha: logo + nome + ações SÓ-ÍCONE (garçom/ajuda/
            limpeza/QR). Antes eram 2 linhas (a de chamados ocupava ~50px); só
            ícones colapsa tudo numa linha e libera altura para os produtos.
            Cada ícone tem aria-label + title (a11y/desktop). Cor dos ícones =
            grafite (neutro/apoio) sobre superfície secundária — padrão da paleta
            para AÇÃO SECUNDÁRIA (o laranja fica reservado às ações primárias). */}
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {loja.logoUrl ? <img src={loja.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" /> : <LogoPP size={36} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-[var(--client-info)] sm:text-base">{loja.nome}</p>
            <p className="truncate text-[11px] leading-4 text-[var(--client-text-secondary)] sm:text-xs">{currentTable ? `${currentTable}${comanda ? " · " + comanda : ""}` : "Cardápio digital"}</p>
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
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--client-error-border)] bg-[var(--client-error-soft)] px-4 py-2.5 text-center text-sm font-semibold text-[var(--client-error)]">
            <CkIconAlerta width={16} height={16} /> Fechado no momento — pedidos indisponíveis fora do horário de funcionamento.
          </div>
        </div>
      )}

        {/* Categorias — fazem parte do container sticky acima (grudam junto com
            o cabeçalho). Fonte/altura compactas (text-sm, py-2): mais clean e
            libera altura para os produtos, sem perder legibilidade. Selecionada
            no laranja padrão da marca (--client-primary), sem ícone. */}
        <div ref={catBarRef} className="border-b border-[var(--client-border)] bg-[var(--client-surface)] shadow-[var(--client-shadow-sm)]">
          <div ref={catScrollRef} className="pp-noscrollbar mx-auto flex max-w-3xl gap-1.5 overflow-x-auto px-3 py-1.5">
          {cats.map((c) => { const ativo = catAtivaId === c.id;
            return (
              <button key={c.id} type="button" ref={(el) => (chipRefs.current[c.id] = el)} onClick={() => selecionarCategoria(c.id)}
                aria-current={ativo ? "true" : undefined} aria-pressed={ativo}
                className={`flex min-h-[32px] shrink-0 items-center rounded-full border px-3 text-xs font-semibold transition duration-200 ${ativo ? "border-[var(--client-primary)] bg-[var(--client-primary-soft)] text-[var(--client-info)]" : "border-[var(--client-border)] bg-[var(--client-surface)] text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]"}`}>
                {c.nome}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-3">
        {/* Sentinela do topo — "Todos" rola até aqui (scrollIntoView); quem rola
            é #root, não a window. */}
        <div ref={topoRef} aria-hidden="true" style={{ scrollMarginTop: 0 }} />

        {/* Ofertas vigentes */}
        {promosVigentes.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--client-offer-hover)]"><CkIconTag width={13} height={13} /> Ofertas de hoje</p>
            <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
              {promosVigentes.map((p) => {
                const ehCombo = p.tipo === "combo";
                const val = validadeOferta(p);
                return (
                  <button key={p.id} type="button" onClick={() => clicarOferta(p)}
                    className="group flex min-w-[200px] shrink-0 items-center gap-3 rounded-2xl border border-[var(--client-offer-border)] bg-[var(--client-offer-soft)] px-3.5 py-3 text-left shadow-[var(--client-shadow-sm)] transition active:scale-[0.97]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--client-offer-hover)]">{(() => { const Icone = iconeOferta(p); return <Icone width={17} height={17} />; })()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--client-text-primary)]">{p.nome}</p>
                      <p className="truncate text-xs font-semibold text-[var(--client-offer-hover)]">{promoResumoDesconto(p)}{ehCombo ? " · combo" : ""}</p>
                      {val && <p className="flex items-center gap-1 truncate text-[10px] font-semibold text-[var(--client-text-secondary)]"><CkIconCalendario width={11} height={11} className="shrink-0" /> {val}</p>}
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
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--client-text-primary)]"><CkIconSacola width={15} height={15} className="shrink-0 text-[var(--client-offer-hover)]" /> {c.promo.nome} <span className="rounded-full bg-[var(--client-offer-hover)] px-1.5 py-0.5 text-[9px] font-semibold text-white">COMBO</span></p>
                    {c.promo.descricao && <p className="mt-0.5 text-[11px] text-[var(--client-text-secondary)]">{c.promo.descricao}</p>}
                    <p className="mt-1 text-[11px] text-[var(--client-text-secondary)]">{c.itens.map((i) => i.name).join(" + ")}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {c.precoCombo < c.somaOriginal && <p className="text-[11px] font-semibold text-[var(--client-text-muted)] line-through">{formatCurrency(c.somaOriginal)}</p>}
                    <p className="text-lg font-semibold text-[var(--client-text-primary)]">{formatCurrency(c.precoCombo)}</p>
                  </div>
                </div>
                <button onClick={() => adicionarCombo(c)} className="mt-2.5 w-full min-h-[44px] rounded-xl bg-[var(--client-offer-hover)] py-2.5 text-sm font-semibold text-white transition active:scale-95 hover:bg-[var(--client-offer)]">+ Adicionar combo</button>
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
              <div className="sticky z-10 -mx-3 mb-2 mt-0.5 flex items-center gap-1.5 bg-[var(--client-surface)]/95 px-3 py-1 backdrop-blur" style={{ top: headerH + catBarH }}>
                <span className="h-3.5 w-1 rounded-full bg-[var(--client-primary-hover)]" />
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--client-info)]">{g.nome}</h2>
                <span className="text-[10px] font-semibold text-[var(--client-text-muted)]">{g.produtos.length} {g.produtos.length === 1 ? "item" : "itens"}</span>
              </div>
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-4">
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
      <div className={`fixed inset-x-0 bottom-0 z-40 border-t border-[var(--client-border)] bg-white shadow-[0_-6px_24px_rgba(45,52,54,0.10)] ${(aba || detalhe || survey) ? "hidden" : ""}`} style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {/* Fidelidade — faixa de incentivo colada ao carrinho: pontos que a compra
            rende + saldo atual do cliente (quando identificado). Estimula recompra. */}
        {((cart.length > 0 && pontosGanharCart > 0) || saldoPontos > 0) && (
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-1.5 border-b border-[var(--client-border)] bg-[var(--client-primary-soft)] px-3 py-1 text-[10px] font-semibold leading-4 text-[var(--client-primary-hover)]">
            {cart.length > 0 && pontosGanharCart > 0 && (
              <span className="inline-flex items-center gap-1"><CkIconEstrela width={12} height={12} className="shrink-0" /> Você ganhará <b>{pontosGanharCart.toLocaleString("pt-BR")} pontos</b> com esta compra</span>
            )}
            {saldoPontos > 0 && (
              <span className="text-[var(--client-text-secondary)]">{cart.length > 0 && pontosGanharCart > 0 ? "· " : ""}Seu saldo: <b className="text-[var(--client-primary-hover)]">{saldoPontos.toLocaleString("pt-BR")} pts</b>{reaisEmPontosSaldo > 0 ? ` (≈ ${formatCurrency(reaisEmPontosSaldo)})` : ""}</span>
            )}
          </div>
        )}
        {/* Barra SÓLIDA full-width, colada na base (borda superior + sombra p/
            cima). Antes era um card flutuante (rounded + margens px-3/pb-2), que
            deixava o produto atrás VAZAR pelas laterais e por baixo. Agora ocupa
            toda a largura e a base, cobrindo o fundo. Conteúdo em UMA linha:
            carrinho + Acompanhar (ícone com contador de pedidos, petróleo) +
            Finalizar (laranja). */}
        <div className="mx-auto flex max-w-3xl items-center gap-1.5 px-3 pb-1 pt-2">
            <button onClick={() => setAba("carrinho")} disabled={cart.length === 0} aria-label={cart.length > 0 ? "Ver carrinho" : "Carrinho vazio"}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl text-left disabled:cursor-default">
              <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cart.length > 0 ? "bg-[var(--client-primary-soft)] text-[var(--client-primary-hover)]" : "bg-[var(--client-surface-secondary)] text-[var(--client-text-muted)]"}`}>
                <CkIconCarrinho width={18} height={18} />
                {qtdCart > 0 && <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--client-primary-hover)] px-1 text-[10px] font-semibold text-[var(--client-info)]">{qtdCart}</span>}
              </span>
              <span className="min-w-0">
                {cart.length > 0 ? (
                  <><span className="block text-[13px] font-semibold leading-4 text-[var(--client-text-primary)]">Ver carrinho</span><span className="block truncate text-[11px] leading-4 text-[var(--client-text-secondary)]">{qtdCart} {qtdCart === 1 ? "item" : "itens"} · {formatCurrency(totalCart)}</span></>
                ) : meusPedidos.length > 0 ? (
                  // Com pedido ativo, o acompanhamento divide a barra: mensagem
                  // concisa (1 linha) p/ caber sem cortar nem espremer o texto.
                  <span className="block truncate text-sm font-semibold text-[var(--client-text-secondary)]">Carrinho vazio</span>
                ) : (
                  <><span className="block text-[13px] font-semibold leading-4 text-[var(--client-text-secondary)]">Seu carrinho está vazio</span><span className="block truncate text-[11px] leading-4 text-[var(--client-text-muted)]">Toque num produto para começar</span></>
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
                      <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-70">Meu pedido</span>
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden="true" className="flex shrink-0 gap-0.5">
                          {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 w-2.5 rounded-full bg-current ${i <= stepIdx ? "" : "opacity-25"}`} />)}
                        </span>
                        <span className="whitespace-nowrap text-xs font-semibold">{CURTO[stepIdx]}</span>
                      </span>
                    </span>
                  )}
                  <span className={`absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-semibold text-white ${DOT_CLS[tom]}`}>{meusPedidos.length}</span>
                </button>
              );
            })()}
            {cart.length > 0 && (
              <button onClick={() => setAba("carrinho")}
                className="flex h-11 shrink-0 items-center gap-1 rounded-xl btn-laranja bg-[var(--client-primary-hover)] px-3.5 text-[11px] font-semibold text-[var(--client-info)] transition active:scale-95 hover:bg-[var(--client-primary)]">Finalizar&nbsp;›</button>
            )}
        </div>
      </div>

      {/* Mensagem */}
      {msg && (
        <div className={`fixed inset-x-0 z-[120] flex justify-center px-4`} style={{ bottom: "82px" }}>
          <div role={msg.t === "error" ? "alert" : "status"} aria-live={msg.t === "error" ? "assertive" : "polite"} className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold shadow-xl ${msg.t === "error" ? "border-[var(--client-error-border)] bg-[var(--client-error-soft)] text-[var(--client-error)]" : "border-[var(--client-success-border)] bg-[var(--client-success-soft)] text-[var(--client-success)]"}`}>{msg.m}</div>
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
            <p id="msg-remover-item" className="mt-2 text-base font-semibold text-[var(--client-text-primary)]">Remover item?</p>
            <p className="mt-1 text-sm text-[var(--client-text-secondary)]"><b className="text-[var(--client-text-primary)]">{itemRemover.quantity}× {itemRemover.name}</b> será removido do seu pedido.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setItemRemover(null)} type="button" className="min-h-[44px] flex-1 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] py-3 text-sm font-semibold text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]">Manter item</button>
              <button onClick={() => { removerItem(itemRemover._uid); setItemRemover(null); }} type="button" className="min-h-[44px] flex-1 rounded-2xl bg-[var(--client-error)] py-3 text-sm font-semibold text-white hover:bg-[var(--client-error-hover)]">Remover</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação ao remover item de combo */}
      {comboRemover && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => setComboRemover(null)}>
          <div className="w-full max-w-sm rounded-3xl border border-[var(--client-border)] bg-[var(--client-surface)] p-5 text-center shadow-[var(--client-shadow-floating)]" onClick={(e) => e.stopPropagation()}>
            <p className="text-3xl">🍔</p>
            <p className="mt-2 text-base font-semibold text-[var(--client-text-primary)]">Sair do combo?</p>
            <p className="mt-1 text-sm text-[var(--client-text-secondary)]">Ao remover <b className="text-[var(--client-text-primary)]">{comboRemover.name}</b>, o combo <b className="text-[var(--client-offer-hover)]">{comboRemover.comboNome}</b> será desfeito. Os demais itens deixam a regra do combo e <b className="text-[var(--client-text-primary)]">voltam ao preço normal</b>.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setComboRemover(null)} className="flex-1 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] py-3 text-sm font-semibold text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]">Manter combo</button>
              <button onClick={() => desfazerCombo(comboRemover)} className="flex-1 rounded-2xl bg-[var(--client-error)] py-3 text-sm font-semibold text-white hover:bg-[var(--client-error-hover)]">Remover assim mesmo</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação obrigatória antes de esvaziar o carrinho inteiro */}
      {confirmarLimpar && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => setConfirmarLimpar(false)}>
          <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-3xl border border-[var(--client-border)] bg-[var(--client-surface)] p-5 text-center shadow-[var(--client-shadow-floating)]" onClick={(e) => e.stopPropagation()}>
            <p className="text-3xl">🗑️</p>
            <p className="mt-2 text-base font-semibold text-[var(--client-text-primary)]">Limpar o carrinho?</p>
            <p className="mt-1 text-sm text-[var(--client-text-secondary)]">Todos os {qtdCart} {qtdCart === 1 ? "item" : "itens"} do seu pedido serão removidos.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmarLimpar(false)} type="button" className="min-h-[44px] flex-1 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] py-3 text-sm font-semibold text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]">Manter itens</button>
              <button onClick={limparCarrinho} type="button" className="min-h-[44px] flex-1 rounded-2xl bg-[var(--client-error)] py-3 text-sm font-semibold text-white hover:bg-[var(--client-error-hover)]">Limpar tudo</button>
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
            <p id="msg-fechar-conta" className="mt-3 text-base font-semibold text-[var(--client-text-primary)]">{contaSolicitada ? "Reenviar solicitação ao caixa?" : "Solicitar fechamento da conta?"}</p>
            <p className="mt-1 text-sm text-[var(--client-text-secondary)]">{contaSolicitada ? "Confirme para avisar novamente o caixa sobre o fechamento da sua conta." : "Confirme para avisar o caixa que você deseja finalizar o atendimento."}</p>
            <p className="mt-3 rounded-2xl bg-[var(--client-surface-secondary)] py-2.5 text-lg font-semibold text-[var(--client-text-primary)]">{formatCurrency(totalMesa)}</p>
            {usarPontos && saldoPontos > 0 && <p className="mt-2 rounded-2xl border border-[var(--client-primary)] bg-[var(--client-primary-soft)] px-3 py-2 text-xs font-semibold text-[var(--client-primary-hover)]">⭐ Pagar com pontos — o caixa aplica o desconto dos seus {saldoPontos.toLocaleString("pt-BR")} pontos.</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmarFechamento(false)} type="button" className="min-h-[44px] flex-1 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] py-3 text-sm font-semibold text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]">Continuar consumindo</button>
              <button onClick={confirmarSolicitarConta} type="button" className="min-h-[44px] flex-1 rounded-2xl btn-laranja bg-[var(--client-primary-hover)] py-3 text-sm font-semibold text-[var(--client-info)] hover:bg-[var(--client-primary)]">{contaSolicitada ? "Reenviar" : "Solicitar fechamento"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal "Ver QR" — QR do link deste cardápio */}
      {qrModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => setQrModal(null)}>
          <div className="w-full max-w-xs rounded-3xl border border-[var(--client-border)] bg-[var(--client-surface)] p-5 text-center shadow-[var(--client-shadow-floating)]" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-semibold text-[var(--client-text-primary)]">{currentTable || loja.nome}</p>
            <img src={qrModal} alt="QR do cardápio" className="mx-auto w-full rounded-2xl bg-white p-2" />
            <p className="mt-3 text-xs text-[var(--client-text-secondary)]">Aponte a câmera para abrir este cardápio</p>
            <button onClick={() => setQrModal(null)} className="mt-4 w-full rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] py-2.5 text-sm font-semibold text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]">Fechar</button>
          </div>
        </div>
      )}

      {/* Gaveta: Carrinho */}
      {aba === "carrinho" && (
        <Gaveta className="pp-checkout" titulo="Finalizar pedido" subtitulo={cart.length > 0 ? "Revise os dados antes de confirmar" : undefined} onFechar={() => setAba(null)}
          rodape={cart.length === 0 ? undefined : (
            <>
              {modoExterno && minimoExterno > 0 && (
                <p className={`mb-1.5 text-[10px] font-semibold leading-4 ${minimoFalta > 0 ? "text-[var(--client-warning)]" : "text-[var(--client-success)]"}`}>
                  {minimoFalta > 0 ? `Pedido mínimo de ${formatCurrency(minimoExterno)} — faltam ${formatCurrency(minimoFalta)}.` : `Pedido mínimo de ${formatCurrency(minimoExterno)} atingido.`}
                </p>
              )}
              <button onClick={enviar} disabled={!podeEnviar || enviando} type="button"
                className={`mx-auto flex h-10 w-[96%] items-center justify-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold transition active:scale-95 ${(!podeEnviar || enviando) ? "bg-[var(--client-disabled-background)] text-[var(--client-disabled-text)]" : "btn-laranja bg-[var(--client-primary-hover)] text-[var(--client-info)] hover:bg-[var(--client-primary)]"}`}>
                {enviando && <CkIconSpinner />}
                {enviando ? "Enviando…" : bloqueioHorario ? "Pedido indisponível no momento" : usarPedidoWhatsapp ? "Confirmar e continuar no WhatsApp" : "Confirmar e enviar pedido"}
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
                <p className="text-sm font-semibold text-[var(--client-error)]">Estabelecimento fechado no momento</p>
                <p className="mt-0.5 text-xs font-medium text-[var(--client-error-hover)]">Consulte os horários de atendimento.</p>
              </div>
            </div>
          )}

          {cart.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-[var(--client-text-secondary)]">Seu carrinho está vazio.</p>
              <button onClick={() => setAba(null)} type="button" className="mt-4 min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--client-text-secondary)] transition hover:bg-[var(--client-surface-secondary)]">Voltar ao cardápio</button>
            </div>
          ) : (
            <>
              <EtapaProgresso etapas={etapasCheckout} atualIdx={etapaAtualIdx} />

              {/* Itens do pedido */}
              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--client-text-secondary)]">Seu pedido</h3>
                  <button onClick={() => setConfirmarLimpar(true)} type="button" className="min-h-8 rounded-lg px-2 text-xs font-semibold text-[var(--client-text-muted)] transition hover:bg-[var(--client-error-soft)] hover:text-[var(--client-error)]">Limpar carrinho</button>
                </div>
                <div>
                  {cart.map((i) => <CardItemCarrinho key={i._uid} item={i} onRemover={pedirRemover} />)}
                </div>
              </div>

              {/* Forma de recebimento (externo) / mesa+comanda (interno) */}
              {modoExterno ? (
                <div className="mt-4 space-y-2.5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--client-text-secondary)]">Como deseja receber?</h3>
                  {!aceitaExterno ? (
                    <div className="rounded-2xl border border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] px-4 py-3 text-sm font-semibold text-[var(--client-warning)]">Esta empresa não está aceitando pedidos pelo cardápio no momento.</div>
                  ) : opcoesEntrega.length === 0 ? (
                    <div className="rounded-2xl border border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] px-4 py-3 text-sm font-semibold text-[var(--client-warning)]">Nenhuma forma de pedido disponível no momento.</div>
                  ) : (
                    <div role="radiogroup" aria-label="Como deseja receber o pedido" className="space-y-2">
                      {opcoesEntrega.map((o) => {
                        const Icone = ICONES_ENTREGA[o.id] || CkIconLoja;
                        const sel = tipoPedido === o.id;
                        return (
                          <button key={o.id} type="button" role="radio" aria-checked={sel} onClick={() => escolherTipoPedido(o.id)}
                            className={`flex w-full items-start gap-2.5 rounded-xl border bg-white p-3 text-left transition ${sel ? "border-[var(--client-primary)]" : "border-[var(--client-border)] hover:border-[var(--client-border-strong)]"}`}>
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-white ${sel ? "border-[var(--client-primary)] text-[var(--client-primary-hover)]" : "border-[var(--client-border)] text-[var(--client-text-secondary)]"}`}><Icone width={16} height={16} /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[11px] font-semibold text-[var(--client-info)]">{o.label}</span>
                              <span className="mt-0.5 block text-[11px] text-[var(--client-text-secondary)]">{DESC_ENTREGA[o.id]}</span>
                            </span>
                            <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${sel ? "border-[var(--client-primary)]" : "border-[var(--client-border-strong)]"}`}>{sel && <span className="h-2 w-2 rounded-full bg-[var(--client-primary-hover)]" />}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block"><span className="mb-1 block text-[11px] font-semibold text-[var(--client-text-secondary)]">Telefone (WhatsApp) <span className="text-[var(--client-error)]">*</span></span>
                      <input type="tel" inputMode="numeric" autoComplete="tel" value={mascararTelefone(telefone)} onChange={(e) => setTelefone(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="(11) 98765-4321" maxLength={16}
                        className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-xs font-semibold text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:font-normal placeholder:text-[var(--client-text-muted)]" /></label>
                    <label className="block"><span className="mb-1 block text-[11px] font-semibold text-[var(--client-text-secondary)]">Seu nome <span className="text-[var(--client-error)]">*</span></span>
                      <input autoComplete="name" value={cliente} onChange={(e) => setCliente(capitalizarNome(e.target.value))} placeholder="Nome completo"
                        className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-xs text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:text-[var(--client-text-muted)]" /></label>
                  </div>
                  {pedeEnderecoAgora && <EnderecoEntregaCampos valor={endereco} onChange={setEndereco} />}
                  <label className="block">
                    <span className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-[var(--client-text-secondary)]">
                      <span>Observação do pedido <span className="font-normal text-[var(--client-text-muted)]">(opcional)</span></span>
                      <span className="font-normal tabular-nums text-[var(--client-text-muted)]">{observacaoPedido.length}/500</span>
                    </span>
                    <textarea value={observacaoPedido} onChange={(e) => setObservacaoPedido(e.target.value.slice(0, 500))} maxLength={500} rows={3}
                      placeholder="Ex.: retirar no horário combinado ou outra orientação para o estabelecimento"
                      className="w-full resize-y rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-xs leading-[1.45] text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:text-[var(--client-text-muted)]" />
                  </label>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--client-text-secondary)]">Confirme sua mesa</h3>
                  {mesaURL ? (
                    <>
                      {/* Mesa confirmada pelo QR — selo elegante em vez de campo desabilitado */}
                      <div className="flex items-center gap-3 rounded-2xl border border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] px-4 py-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--client-primary-hover)] text-[var(--client-info)]"><CkIconMesa width={18} height={18} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--client-text-secondary)]">Sua mesa</p>
                          <p className="text-base font-semibold leading-tight text-[var(--client-text-primary)]">Mesa {mesa}</p>
                        </div>
                        <span className="flex items-center gap-1 rounded-full bg-[var(--client-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--client-primary-active)]"><CkIconCheck width={12} height={12} /> Confirmada</span>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[var(--client-text-secondary)]">Telefone (WhatsApp) <span className="font-normal text-[var(--client-text-muted)]">— para acumular pontos</span></span>
                          <input type="tel" inputMode="numeric" autoComplete="tel" value={mascararTelefone(telefone)} onChange={(e) => setTelefone(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="(11) 98765-4321" maxLength={16}
                            className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-sm font-semibold text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:font-normal placeholder:text-[var(--client-text-muted)]" /></label>
                        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[var(--client-text-secondary)]">Seu nome (opcional)</span>
                          <input value={cliente} onChange={(e) => setCliente(capitalizarNome(e.target.value))} placeholder="Nome" className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-sm text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:text-[var(--client-text-muted)]" /></label>
                      </div>
                      {fidRegraPub && pontosGanharCart > 0 && (
                        <p className="flex items-center gap-1.5 rounded-xl border border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] px-3 py-2 text-[11px] font-semibold text-[var(--client-primary-hover)]"><CkIconEstrela width={13} height={13} className="shrink-0" /> Informe seu telefone e ganhe {pontosGanharCart.toLocaleString("pt-BR")} pontos nesta compra.</p>
                      )}
                    </>
                  ) : (
                    <>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[var(--client-text-secondary)]">Mesa <span className="text-[var(--client-error)]">*</span></span>
                        <input type="tel" inputMode="numeric" value={mesa} onChange={(e) => setMesa(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Nº"
                          className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-sm font-semibold text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)]" /></label>
                      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[var(--client-text-secondary)]">Seu nome (opcional)</span>
                        <input value={cliente} onChange={(e) => setCliente(capitalizarNome(e.target.value))} placeholder="Nome" className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-sm text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:text-[var(--client-text-muted)]" /></label>
                    </div>
                    <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[var(--client-text-secondary)]">Telefone (WhatsApp) <span className="font-normal text-[var(--client-text-muted)]">— para acumular pontos</span></span>
                      <input type="tel" inputMode="numeric" autoComplete="tel" value={mascararTelefone(telefone)} onChange={(e) => setTelefone(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="(11) 98765-4321" maxLength={16}
                        className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-sm font-semibold text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:font-normal placeholder:text-[var(--client-text-muted)]" /></label>
                    </>
                  )}
                  {!comURL && (
                    <div><span className="mb-1.5 block text-xs font-semibold text-[var(--client-text-secondary)]">Comanda <span className="text-[var(--client-error)]">*</span></span>
                      <input value={comanda} onChange={(e) => setComanda(e.target.value.toUpperCase())} placeholder={`Ex.: ${loja.prefixo}-000001`}
                        autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false} inputMode="text" enterKeyHint="done" name="comanda"
                        className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 font-mono text-sm font-semibold tracking-widest text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:font-sans placeholder:font-normal placeholder:text-[var(--client-text-muted)]" />
                      <p className="mt-1 text-[11px] text-[var(--client-text-secondary)]">Escaneie o QR Code da mesa ou digite a comanda.</p></div>
                  )}
                </div>
              )}

              {/* Pagamento — só no canal externo. No acesso interno (mesa/QR) o
                  pagamento é no caixa, então a tela não pede forma alguma. */}
              {modoExterno && (tipoPedido === "local" || formasPagto.length > 0) && (
              <div className="mt-5">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--client-text-secondary)]">Pagamento</h3>
                {!exigePagamentoAgora ? (
                  <div className="rounded-2xl border border-[var(--client-info-border)] bg-[var(--client-info-soft)] p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--client-info)] text-white"><CkIconRelogio width={17} height={17} /></span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--client-text-primary)]">Pagamento após o consumo</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--client-text-secondary)]">Seu pedido será enviado agora. A forma de pagamento será escolhida no fechamento da conta.</p>
                      </div>
                    </div>
                  </div>
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
                              className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-3 text-xs font-semibold transition ${sel ? "border-[var(--client-primary)] bg-[var(--client-primary-soft)] text-[var(--client-primary-active)]" : "border-[var(--client-border)] bg-[var(--client-surface)] text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]"}`}>
                              <Icone width={18} height={18} />
                              {f.label}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                    <p className="mt-2 text-[11px] text-[var(--client-text-secondary)]">Pagamento: <span className="font-semibold text-[var(--client-text-secondary)]">{momentoPagto}</span>.</p>

                    {formaPagto === "dinheiro" && (
                      <div className="mt-3 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface-secondary)] p-3.5">
                        <p className="mb-2 text-xs font-semibold text-[var(--client-text-primary)]">Precisa de troco?</p>
                        <div role="radiogroup" aria-label="Precisa de troco?" className="flex gap-2">
                          {[["sim", "Sim"], ["nao", "Não"]].map(([id, l]) => {
                            const sel = trocoResposta === id;
                            return (
                              <button key={id} type="button" role="radio" aria-checked={sel}
                                onClick={() => { setTrocoResposta(id); if (id === "nao") setTrocoValor(""); }}
                                className={`min-h-11 flex-1 rounded-xl border text-sm font-semibold transition ${sel ? "border-[var(--client-primary)] bg-[var(--client-primary-soft)] text-[var(--client-primary-active)]" : "border-[var(--client-border)] bg-[var(--client-surface)] text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]"}`}>{l}</button>
                            );
                          })}
                        </div>
                        {trocoResposta === "sim" && (
                          <div className="mt-3">
                            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[var(--client-text-secondary)]">Vai pagar com quanto?</span>
                              <input type="text" inputMode="decimal" value={trocoValor} onChange={(e) => setTrocoValor(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={formatCurrency(totalCart)}
                                className="w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-sm font-semibold text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:font-normal placeholder:text-[var(--client-text-muted)]" /></label>
                            {trocoValor && parseMoedaBR(trocoValor) > 0 && parseMoedaBR(trocoValor) < totalCart && (
                              <p className="mt-1.5 text-xs font-semibold text-[var(--client-error)]">O valor deve ser de pelo menos {formatCurrency(totalCart)} (total do pedido).</p>
                            )}
                            {trocoValor && parseMoedaBR(trocoValor) >= totalCart && (
                              <p className="mt-1.5 text-xs font-semibold text-[var(--client-success)]">Troco: {formatCurrency(parseMoedaBR(trocoValor) - totalCart)}.</p>
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
                <div className="mt-4 flex items-center justify-center gap-1.5 rounded-2xl border border-[var(--client-offer-border)] bg-[var(--client-offer-soft)] px-3 py-2 text-sm font-semibold text-[var(--client-offer-hover)]">
                  <CkIconCheck width={16} height={16} /> Você economizou {formatCurrency(economiaCart)} nesta compra!
                </div>
              )}

              {/* Resumo financeiro */}
              <div className="mt-4 space-y-1.5 border-t border-[var(--client-border)] pt-3.5">
                {economiaCart > 0 && (
                  <>
                    <div className="flex items-center justify-between text-sm"><span className="text-[var(--client-text-secondary)]">Subtotal</span><span className="text-[var(--client-text-secondary)]">{formatCurrency(totalCart + economiaCart)}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-[var(--client-text-secondary)]">Desconto</span><span className="font-semibold text-[var(--client-offer-hover)]">-{formatCurrency(economiaCart)}</span></div>
                  </>
                )}
                <div className="flex items-center justify-between"><span className="text-xs font-semibold text-[var(--client-text-secondary)]">Total do pedido</span><span className="text-lg font-semibold text-[var(--client-text-primary)]">{formatCurrency(totalCart)}</span></div>
                {modoExterno && tipoPedido === "local" && <p className="text-[11px] text-[var(--client-text-secondary)]">Pagamento realizado no fechamento da conta.</p>}
              </div>

              {/* Fidelidade — pontos creditados nesta compra (informado no pagamento) */}
              {pontosGanharCart > 0 && (
                <div className="mt-3 flex items-center justify-center gap-1.5 rounded-2xl border border-[var(--client-primary)] bg-[var(--client-primary-soft)] px-3 py-2.5 text-xs font-semibold text-[var(--client-primary-hover)]">
                  <CkIconEstrela width={14} height={14} className="shrink-0" /> Você ganhará {pontosGanharCart.toLocaleString("pt-BR")} pontos com esta compra
                  {saldoPontos > 0 && <span className="font-semibold text-[var(--client-text-secondary)]">· saldo passa a {(saldoPontos + pontosGanharCart).toLocaleString("pt-BR")} pts</span>}
                </div>
              )}
            </>
          )}
        </Gaveta>
      )}

      {/* Gaveta: Acompanhar / Conta */}
      {aba === "conta" && (
        <Gaveta titulo={modoExterno ? "Meus pedidos" : (currentTable || "Meus pedidos")} subtitulo="Acompanhe o preparo e o fechamento da sua conta." onFechar={() => setAba(null)} fecharLabel="Fechar acompanhamento dos pedidos">
          {meusPedidos.length > 0 && pedidosOffline && (
            <div className="mb-3 flex items-center gap-2 rounded-2xl border border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] px-3.5 py-2.5 text-xs font-semibold text-[var(--client-warning)]">
              <CkIconWifiOff width={15} height={15} className="shrink-0" /> Atualização em tempo real indisponível — tentando reconectar…
            </div>
          )}

          {meusPedidos.length === 0 ? (
            <div className="py-10 text-center">
              {pedidosOffline ? (
                // A consulta falhou (rede ou permissão): não dizer que "não há pedido" — o pedido pode existir e só não foi possível consultar.
                <div role="alert" data-testid="acompanhamento-indisponivel">
                  <p className="flex items-center justify-center gap-2 text-sm font-semibold text-[var(--client-warning)]"><CkIconWifiOff width={15} height={15} className="shrink-0" /> Não foi possível consultar seus pedidos agora.</p>
                  <p className="mt-1 text-xs text-[var(--client-text-muted)]">Seu pedido pode já ter sido enviado. Estamos tentando de novo automaticamente; se persistir, fale com o estabelecimento.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-[var(--client-text-secondary)]">Nenhum pedido para acompanhar ainda.</p>
                  <p className="mt-1 text-xs text-[var(--client-text-muted)]">Seus pedidos aparecerão aqui assim que forem enviados.</p>
                </>
              )}
              <button onClick={() => setAba(null)} type="button" className="mt-4 min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--client-text-secondary)] transition hover:bg-[var(--client-surface-secondary)]">Voltar ao cardápio</button>
            </div>
          ) : (
            <>
              {/* Resumo geral da conta */}
              <div className="rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] p-4 shadow-[var(--client-shadow-sm)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--client-info-soft)] text-[var(--client-info)]"><CkIconRecibo width={17} height={17} /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--client-text-primary)]">{!modoExterno && currentTable ? currentTable : "Seu pedido"}</p>
                      {!modoExterno && comanda && <p className="truncate text-[11px] text-[var(--client-text-secondary)]">Comanda {comanda}</p>}
                    </div>
                  </div>
                  {statusGeralConta && (
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      tomStatusGeral === "success" ? "border-[var(--client-success-border)] bg-[var(--client-success-soft)] text-[var(--client-success)]"
                        : tomStatusGeral === "warning" ? "border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] text-[var(--client-warning)]"
                        : "border-[var(--client-info-border)] bg-[var(--client-info-soft)] text-[var(--client-info)]"
                    }`}>{statusGeralConta}</span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--client-border)] pt-3">
                  <div><p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--client-text-muted)]">Pedidos</p><p className="text-sm font-semibold text-[var(--client-text-primary)]">{meusPedidos.length}</p></div>
                  <div><p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--client-text-muted)]">Aberta às</p><p className="text-sm font-semibold text-[var(--client-text-primary)]">{contaAbertaEm || "—"}</p></div>
                  <div className="col-span-2"><p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--client-text-muted)]">Valor atual da conta</p><p className="text-lg font-semibold text-[var(--client-text-primary)]">{formatCurrency(totalMesa)}</p></div>
                </div>
                {pagamentoPosteriorConta && (
                  <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-[var(--client-info-soft)] px-3 py-2 text-[11px] font-semibold text-[var(--client-info)]"><CkIconRelogio width={13} height={13} /> Pagamento após o consumo</p>
                )}
                {/* Fidelidade — pontos que ESTA conta gera, recalculados a cada
                    item adicionado/cancelado. Incentiva identificar-se e voltar. */}
                {fidRegraPub && pontosGanharConta > 0 && (
                  <div className="mt-3 rounded-xl border border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--client-primary-hover)]"><CkIconEstrela width={15} height={15} className="shrink-0" /> {clienteIdentificado ? "Você ganhará" : "Esta conta gera"} {pontosGanharConta.toLocaleString("pt-BR")} pontos</p>
                    {clienteIdentificado
                      ? (saldoPontos > 0 && <p className="mt-0.5 text-[11px] font-semibold text-[var(--client-text-secondary)]">Saldo atual: {saldoPontos.toLocaleString("pt-BR")} pts → passará a {(saldoPontos + pontosGanharConta).toLocaleString("pt-BR")} pts no fechamento.</p>)
                      : <p className="mt-0.5 text-[11px] font-semibold text-[var(--client-text-secondary)]">Informe seu telefone ao pedir para acumular estes pontos.</p>}
                  </div>
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
                          <p className="text-sm font-semibold text-[var(--client-text-primary)]">Pedido nº {String(o.id || "").replace(/\D/g, "").slice(-4)}</p>
                          <p className="text-[11px] text-[var(--client-text-secondary)]">Realizado às {o.createdAt}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span role="status" aria-live="polite" className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${s.chip}`}>
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
                                <span className="shrink-0 font-semibold text-[var(--client-text-primary)]">{formatCurrency(it.price * it.quantity)}</span>
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
                  <p className={`text-sm font-semibold ${contaSolicitada ? "text-[var(--client-warning)]" : contaPaga ? "text-[var(--client-success)]" : "text-[var(--client-text-primary)]"}`}>
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
                {resumoMesa.taxa > 0 && <div className="flex items-center justify-between text-sm"><span className="text-[var(--client-text-secondary)]">Taxa de serviço ({textoDoPercentual(taxaPct)}%)</span><span className="text-[var(--client-text-secondary)]">{formatCurrency(resumoMesa.taxa)}</span></div>}
                <div className="flex items-center justify-between pt-1">
                  <span className={`text-sm font-semibold ${contaPaga ? "text-[var(--client-success)]" : "text-[var(--client-text-secondary)]"}`}>{contaPaga ? "Total pago" : "Total em aberto"}</span>
                  <span className={`text-xl font-semibold ${contaPaga ? "text-[var(--client-success)]" : "text-[var(--client-text-primary)]"}`}>{formatCurrency(totalMesa)}</span>
                </div>
              </div>

              {/* Fidelidade: saldo de pontos + intenção de pagar com pontos (o caixa efetiva) */}
              {!contaPaga && saldoPontos > 0 && (
                <label className={`mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition ${usarPontos ? "border-[var(--client-primary)] bg-[var(--client-primary-soft)]" : "border-[var(--client-border)] bg-[var(--client-surface)]"}`}>
                  <input type="checkbox" checked={usarPontos} onChange={(e) => setUsarPontos(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--client-primary)]" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[var(--client-text-primary)]">⭐ Usar meus pontos nesta conta</span>
                    <span className="mt-0.5 block text-xs text-[var(--client-text-secondary)]">Você tem <b className="text-[var(--client-text-primary)]">{saldoPontos.toLocaleString("pt-BR")} pontos</b>. Ao solicitar o fechamento, o caixa aplica o desconto em pontos.</span>
                  </span>
                </label>
              )}

              {/* Solicitar/reenviar fechamento — nunca finaliza o pagamento sozinho, só avisa o caixa */}
              {!contaPaga && (
                <>
                  <button onClick={() => setConfirmarFechamento(true)} disabled={!podeFechar || solicitando} aria-disabled={!podeFechar || solicitando} aria-busy={solicitando} type="button"
                    className={`mt-4 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition active:scale-95 ${
                      (!podeFechar || solicitando) ? "bg-[var(--client-disabled-background)] text-[var(--client-disabled-text)]" : "btn-laranja bg-[var(--client-primary-hover)] text-[var(--client-info)] hover:bg-[var(--client-primary)]"
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
  return <div data-theme="light" className="tema-claro-area flex min-h-screen w-full max-w-full flex-col items-center justify-center overflow-x-hidden bg-[var(--client-background)] px-6 text-center text-[var(--client-text-primary)]" style={{ minHeight: "100dvh" }}>{children}</div>;
}
function Spinner() { return <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--client-primary-border)] border-t-[var(--client-primary)]" />; }

// Skeleton do primeiro carregamento — repete o formato real (cabeçalho +
// categorias + grade de cards) em vez de um spinner solto, pra reduzir a
// sensação de espera. Mesmo padrão já usado no projeto (animate-pulse +
// blocos cinza claro), sem CSS novo.
function BlocoSkeleton({ className }) { return <div className={`animate-pulse rounded-full bg-[var(--client-surface-secondary)] ${className}`} />; }
function CardapioSkeleton() {
  return (
    <div data-theme="light" className="tema-claro-area min-h-screen w-full max-w-full bg-[var(--client-background)]" style={{ minHeight: "100dvh" }} aria-busy="true" aria-label="Carregando cardápio">
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
    <div className="flex items-center gap-2 rounded-xl border border-[var(--client-error-border)] bg-[var(--client-error-soft)] px-3 py-2 text-xs font-semibold text-[var(--client-error)]">
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
            <span className={`text-xs font-semibold ${p.feito ? "text-[var(--client-text-primary)]" : p.atual ? (atualInfo ? "text-[var(--client-info)]" : "text-[var(--client-warning)]") : "text-[var(--client-text-muted)]"}`}>{p.label}</span>
            {p.sub && <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${p.subTom || "border-[var(--client-border)] bg-[var(--client-surface-secondary)] text-[var(--client-text-secondary)]"}`}>{p.sub}</span>}
          </span>
        </li>
        );
      })}
    </ol>
  );
}
// Indicador compacto de progresso — Pedido → Identificação → Confirmação
// (nunca "Pagamento": ele pode nem existir, ver regra do consumo local).
// Não depende só de cor: número/check + rótulo sempre visíveis.
