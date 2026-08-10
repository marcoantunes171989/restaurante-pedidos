import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconImpressora, IconSpinner } from "../../components/PrimeIcons";
import PdvHeader from "./PdvHeader";
import PdvStatsBar from "./PdvStatsBar";
import PdvMobileNav from "./PdvMobileNav";
import PdvMesaDetail from "./PdvMesaDetail";
import PdvMesasGrid from "./PdvMesasGrid";
import PdvCanalGrid from "./PdvCanalGrid";
import PdvDeliveryStrip from "./PdvDeliveryStrip";
import PdvPaymentPanel from "./PdvPaymentPanel";
import PdvActionBar from "./PdvActionBar";
import PdvStatusBar from "./PdvStatusBar";
import ModalDividirConta from "./PdvDividirConta";
import ModalIdentificarCliente from "./PdvIdentificarCliente";
import PdvAjuda from "./PdvAjuda";
import {
  ModalCliente,
  ModalHistoricoMesa,
  ModalIncluirProduto,
  ModalObservacoes,
  ModalSepararItens,
  ModalTransferirMesa,
} from "./PdvModais";
import {
  chaveConta,
  clienteEhVip,
  combinaBusca,
  ehPedidoExterno,
  formaPermiteTroco,
  formatCurrency,
  lerConfigTaxaServico,
  nomeClienteDe,
  normalizarBusca,
  numeroMesaDe,
  orderTotal,
  resumoCozinha,
  rotuloMesa,
  rotuloStatusPedido,
  situacaoMesaVisual,
  statusPedidosConta,
  textoBuscaConta,
} from "./pdvHelpers";
import { legendaCupom } from "./pdvCupomValidacao";
import {
  abrirCupomTermico,
  htmlComprovanteCompletoPagamento,
  htmlComprovanteEntregaRetirada,
  htmlConferenciaMesa,
  htmlCupomClienteSimplificado,
  htmlPreConta,
  imprimirPedidosProducaoPorSetor,
  montarCtxConta,
} from "./pdvCuponsTermicos";

function chaveObsInterna(lojaId, mesa) {
  return `pedidoPrime:obsInterna:${lojaId || "geral"}:${mesa || "-"}`;
}

function lerObsInterna(lojaId, mesa) {
  try {
    return localStorage.getItem(chaveObsInterna(lojaId, mesa)) || "";
  } catch {
    return "";
  }
}

function salvarObsInterna(lojaId, mesa, texto) {
  try {
    const k = chaveObsInterna(lojaId, mesa);
    if (texto) localStorage.setItem(k, texto);
    else localStorage.removeItem(k);
  } catch { /* ignore */ }
}

function itemDeProduto(produto) {
  const preco = produto.precoPromocional != null ? Number(produto.precoPromocional) : Number(produto.price) || 0;
  return {
    name: produto.name,
    quantity: 1,
    price: preco,
    selectedIngredients: [...(produto.ingredients || [])],
    removedIngredients: [],
    extraIngredients: [],
    observation: "",
  };
}

/**
 * PDV Pedido Prime — layout do mockup alimentado pelos dados atuais do sistema
 * (pedidos, mesas, formas de pagamento e clientes da loja). Finaliza via baixarComandas.
 */
export default function CashierPdv({
  orders = [],
  mesas = [],
  clientes = [],
  baixarComandas = async () => {},
  formasPagamento = [],
  lojaInfo,
  currentUser,
  caixaAberto = null,
  auditar = () => {},
  conexaoOk = true,
  editarItensPedido = async () => {},
  criarPedidoCaixa = async () => null,
  products = [],
  categories = [],
  setores = [],
  fidCaixa = null,
  atualizarClientePedidos = async () => {},
  transferirMesaPedidos = async () => {},
  separarItensPedidos = async () => {},
  notify = () => {},
  validarCupom = async () => ({ ok: false, motivo: "Cupons indisponíveis." }),
  consumirCupom = async () => ({ ok: true }),
}) {
  const SERVICE_FEE = lerConfigTaxaServico(lojaInfo?.id);
  const taxaPct = SERVICE_FEE.enabled && SERVICE_FEE.chargingRule !== "nao_cobrar" ? SERVICE_FEE.percent : 0;

  const [canal, setCanal] = useState("mesa");
  const [busca, setBusca] = useState("");
  const [temaClaro, setTemaClaro] = useState(true);
  const [selecionadaKey, setSelecionadaKey] = useState(null);
  // Mesa livre em foco (sem conta aberta) — a coluna esquerda vira a ficha da mesa.
  const [mesaLivreSel, setMesaLivreSel] = useState(null);
  const [formaSelecionada, setFormaSelecionada] = useState(null);
  const [bufferEntrada, setBufferEntrada] = useState("");
  // Pagamento dividido: parcelas já recebidas, por conta.
  const [pagamentosPorConta, setPagamentosPorConta] = useState({});
  // Cupom validado por conta + aviso de identificação do cliente.
  const [cupomPorConta, setCupomPorConta] = useState({});
  // Ajuste financeiro no pagamento: acréscimo, desconto manual e remoção de taxa.
  const [ajustePorConta, setAjustePorConta] = useState({});
  const [cupomProcessando, setCupomProcessando] = useState(false);
  // Legenda sob o campo de cupom: válido / inválido / fora do prazo / esgotado…
  const [cupomStatusUi, setCupomStatusUi] = useState({ status: "vazio" });
  const [avisoCliente, setAvisoCliente] = useState(null);
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const [confirmarFinalizacao, setConfirmarFinalizacao] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [sucesso, setSucesso] = useState(null);
  const [bloqueioProdutos, setBloqueioProdutos] = useState({});
  const [modal, setModal] = useState(null); // null | incluir | cliente | transferir | separar | historico | observacoes | dividir | identificar
  const [excluirPendente, setExcluirPendente] = useState(null); // { orderId, index, name, quantity }
  const [acaoProcessando, setAcaoProcessando] = useState(false);
  // Mobile/tablet: Conta (produtos) | Mesa | Pagar — abre em Conta (pedido em destaque).
  const [painelMobile, setPainelMobile] = useState("conta");
  // Delivery: pagar vários pedidos/comandas no mesmo fechamento.
  const [deliveryMultiAtivo, setDeliveryMultiAtivo] = useState(false);
  const [deliveryIdsSel, setDeliveryIdsSel] = useState([]);
  const processandoRef = useRef(false);

  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(iv);
  }, []);

  // Seleção múltipla só considera pedidos ainda em aberto.
  const deliveryIdsEfetivos = useMemo(
    () => deliveryIdsSel.filter((id) => orders.some((o) =>
      o.id === id && o.paymentStatus !== "paid" && o.status !== "cancelled",
    )),
    [deliveryIdsSel, orders],
  );

  const formasAtivas = useMemo(
    () => formasPagamento.filter((f) => f.active !== false && (f.nome || "").trim()),
    [formasPagamento],
  );
  const formaPadrao = useMemo(
    () => formasAtivas.find((f) => /dinheiro|espécie|especie/i.test(f.nome || "")) || formasAtivas[0] || null,
    [formasAtivas],
  );
  const formaAtual = formaSelecionada
    && (formaSelecionada.pontos || formasAtivas.some((f) => f.id === formaSelecionada.id || f.nome === formaSelecionada.nome))
    ? formaSelecionada
    : formaPadrao;

  const contasAbertas = useMemo(() => {
    const configCrm = lojaInfo?.configCrm || {};
    const mapa = {};
    orders.forEach((o) => {
      if (o.status === "cancelled" || o.paymentStatus === "paid") return;
      const key = chaveConta(o) || "-";
      if (!mapa[key]) {
        const tel = o.clienteTelefone || "";
        mapa[key] = {
          key,
          mesa: o.table,
          comandas: new Set(),
          pedidosIds: [],
          pedidos: [],
          subtotal: 0,
          aberturaISO: o.createdAtISO || null,
          cliente: nomeClienteDe(o, clientes),
          telefone: tel,
          vip: clienteEhVip({ telefone: tel, orders, configCrm }),
          pendentePreparo: false,
          solicitada: false,
          externo: ehPedidoExterno(o),
        };
      }
      const m = mapa[key];
      m.comandas.add(o.command);
      m.pedidosIds.push(o.id);
      m.pedidos.push(o);
      m.subtotal += orderTotal(o);
      if (o.createdAtISO && (!m.aberturaISO || o.createdAtISO < m.aberturaISO)) m.aberturaISO = o.createdAtISO;
      if (!m.cliente) m.cliente = nomeClienteDe(o, clientes);
      if (!m.telefone && o.clienteTelefone) {
        m.telefone = o.clienteTelefone;
        m.vip = clienteEhVip({ telefone: o.clienteTelefone, orders, configCrm });
      }
      if (o.status === "received" || o.status === "preparing") m.pendentePreparo = true;
      if (o.paymentStatus === "requested") m.solicitada = true;
    });
    return Object.values(mapa)
      .map((m) => {
        const conta = {
          ...m,
          comandas: [...m.comandas],
          total: m.subtotal * (1 + taxaPct / 100),
          situacao: m.solicitada ? "solicitado" : m.pendentePreparo ? "entrega" : "pagamento",
          statusPedido: statusPedidosConta(m.pedidos),
        };
        return { ...conta, indiceBusca: textoBuscaConta(conta, m.pedidos) };
      })
      .filter((c) => c.total > 0.001)
      .sort((a, b) => new Date(a.aberturaISO || 0) - new Date(b.aberturaISO || 0));
  }, [orders, taxaPct, clientes, lojaInfo?.configCrm]);

  const selecionadaEfetiva = useMemo(() => {
    if (selecionadaKey && contasAbertas.some((c) => c.key === selecionadaKey)) return selecionadaKey;
    // Mesa livre em foco: respeita a escolha do operador, sem puxar outra conta.
    if (mesaLivreSel) return null;
    // Em "Pagar vários" o operador escolhe explicitamente — sem auto-seleção.
    if (deliveryMultiAtivo) return null;
    const solicitadas = contasAbertas.filter((c) => c.solicitada);
    const urgente = [...solicitadas].sort((a, b) => new Date(a.aberturaISO || 0) - new Date(b.aberturaISO || 0))[0];
    return (urgente || contasAbertas[0])?.key || null;
  }, [selecionadaKey, contasAbertas, mesaLivreSel, deliveryMultiAtivo]);

  const contaSelSimples = contasAbertas.find((c) => c.key === selecionadaEfetiva) || null;

  const contaMultiDelivery = useMemo(() => {
    if (!deliveryMultiAtivo || deliveryIdsEfetivos.length === 0) return null;
    const pedidos = orders.filter((o) =>
      deliveryIdsEfetivos.includes(o.id)
      && ehPedidoExterno(o)
      && o.paymentStatus !== "paid"
      && o.status !== "cancelled",
    );
    if (pedidos.length === 0) return null;
    const configCrm = lojaInfo?.configCrm || {};
    const comandas = [...new Set(pedidos.map((o) => o.command).filter(Boolean))];
    const key = `multi:${[...comandas].sort().join("+")}`;
    let subtotal = 0;
    let aberturaISO = null;
    let telefone = "";
    let cliente = "";
    let pendentePreparo = false;
    let solicitada = false;
    const pedidosIds = [];
    pedidos.forEach((o) => {
      subtotal += orderTotal(o);
      pedidosIds.push(o.id);
      if (o.createdAtISO && (!aberturaISO || o.createdAtISO < aberturaISO)) aberturaISO = o.createdAtISO;
      if (!telefone && o.clienteTelefone) telefone = o.clienteTelefone;
      if (!cliente) cliente = nomeClienteDe(o, clientes) || o.customer || "";
      if (o.status === "received" || o.status === "preparing") pendentePreparo = true;
      if (o.paymentStatus === "requested") solicitada = true;
    });
    const n = pedidos.length;
    return {
      key,
      mesa: n > 1 ? `Delivery · ${n} pedidos` : (pedidos[0]?.table || "Externo"),
      comandas,
      pedidosIds,
      pedidos,
      subtotal,
      total: subtotal * (1 + taxaPct / 100),
      aberturaISO,
      cliente,
      telefone,
      vip: clienteEhVip({ telefone, orders, configCrm }),
      pendentePreparo,
      solicitada,
      externo: true,
      multiPagamento: true,
      situacao: solicitada ? "solicitado" : pendentePreparo ? "entrega" : "pagamento",
      statusPedido: statusPedidosConta(pedidos),
    };
  }, [deliveryMultiAtivo, deliveryIdsEfetivos, orders, taxaPct, clientes, lojaInfo?.configCrm]);

  const contaSel = contaMultiDelivery || (deliveryMultiAtivo ? null : contaSelSimples);
  const pedidosSel = useMemo(() => {
    if (!contaSel) return [];
    if (contaSel.multiPagamento) {
      return orders.filter((o) =>
        contaSel.pedidosIds.includes(o.id) && o.paymentStatus !== "paid" && o.status !== "cancelled",
      );
    }
    return orders.filter((o) =>
      contaSel.comandas.includes(o.command) && o.paymentStatus !== "paid" && o.status !== "cancelled",
    );
  }, [orders, contaSel]);
  const subtotalSel = contaSel?.subtotal || 0;
  const ajusteSel = (contaSel && ajustePorConta[contaSel.key]) || {};
  const taxaRemovida = !!ajusteSel.taxaRemovida;
  const acrescimoSel = Math.max(0, Number(ajusteSel.acrescimo) || 0);
  const descontoManualSel = Math.max(0, Number(ajusteSel.desconto) || 0);
  const taxaValorSel = taxaRemovida ? 0 : subtotalSel * (taxaPct / 100);
  // Total da conta com taxa (se mantida), acréscimo e desconto manual.
  const totalSel = Math.max(0, subtotalSel + taxaValorSel + acrescimoSel - descontoManualSel);
  const taxasSel = totalSel - subtotalSel;

  // Cupom validado para esta conta — o desconto reduz o que será cobrado.
  const cupomSel = (contaSel && cupomPorConta[contaSel.key]) || null;
  const descontoCupom = Math.min(Number(cupomSel?.desconto) || 0, totalSel);
  const totalCobrar = Math.max(0, totalSel - descontoCupom);

  function patchAjuste(patch) {
    if (!contaSel) return;
    setAjustePorConta((cur) => ({
      ...cur,
      [contaSel.key]: { ...(cur[contaSel.key] || {}), ...patch },
    }));
    setBufferEntrada("");
  }

  // Fidelidade: só cliente identificado acumula e resgata pontos.
  const fidAtiva = !!fidCaixa?.ativo;
  const pontosPorReal = Number(fidCaixa?.pontosPorReal) || 100;
  const valorPorPonto = Number(fidCaixa?.valorPorPonto) || 0;
  const telefoneConta = String(contaSel?.telefone || "").replace(/\D/g, "");
  const clienteIdentificado = !!(contaSel && (contaSel.telefone || contaSel.cliente));
  const saldoPontos = (fidAtiva && telefoneConta) ? (fidCaixa?.saldoPorTelefone?.[contaSel.telefone] || fidCaixa?.saldoPorTelefone?.[telefoneConta] || 0) : 0;
  const pontosEmReais = Math.floor((saldoPontos / pontosPorReal) * 100) / 100;

  // Pagamento dividido: cada OK vira uma parcela; o painel cobra só o restante.
  const pagamentosSel = (contaSel && pagamentosPorConta[contaSel.key]) || [];
  const recebidoEfetivo = pagamentosSel.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const pontosJaUsados = pagamentosSel.filter((p) => p.pontos).reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const restanteSel = Math.max(0, totalCobrar - recebidoEfetivo);
  const trocoSel = Math.max(0, recebidoEfetivo - totalCobrar);
  const trocoLiberado = formaPermiteTroco(formaAtual);
  const pontosDisponiveisReais = Math.max(0, pontosEmReais - pontosJaUsados);

  // Forma virtual "Pontos" — aparece só com cliente identificado e saldo.
  const formasComPontos = useMemo(() => {
    if (!fidAtiva || !telefoneConta || pontosDisponiveisReais <= 0) return formasAtivas;
    return [...formasAtivas, {
      id: "__pontos",
      nome: "Pontos",
      tipo: "pontos",
      pontos: true,
      maxValor: pontosDisponiveisReais,
    }];
  }, [formasAtivas, fidAtiva, telefoneConta, pontosDisponiveisReais]);

  // Base de consulta da identificação: cliente da loja + saldo de pontos.
  const clientesComPontos = useMemo(
    () => clientes.map((c) => ({ ...c, pontos: fidCaixa?.saldoPorTelefone?.[c.telefone] ?? null })),
    [clientes, fidCaixa],
  );

  const formaEhPontos = !!formaAtual?.pontos;
  // Pontos ganhos: sobre o valor efetivamente pago em dinheiro/cartão/etc.
  const pontosGanhar = (fidAtiva && telefoneConta && valorPorPonto > 0)
    ? Math.floor(Math.max(0, Math.min(recebidoEfetivo, totalCobrar) - pontosJaUsados) / valorPorPonto)
    : 0;

  // Fechamento: exige o total coberto pelas parcelas registradas.
  const podeFechar = !!contaSel
    && formasAtivas.length > 0
    && totalCobrar > 0
    && recebidoEfetivo + 0.001 >= totalCobrar;

  const produtosBloqueados = !!(contaSel && bloqueioProdutos[contaSel.key]);

  const mesasPainel = useMemo(() => {
    const cadastro = mesas.filter((m) => m.active !== false);
    const porNumero = {};
    cadastro.forEach((m) => {
      const n = Number(m.numero);
      if (Number.isFinite(n) && n > 0 && !porNumero[n]) porNumero[n] = m;
    });

    let numeros = Object.keys(porNumero).map(Number).sort((a, b) => a - b);
    if (!numeros.length) {
      const derivadas = new Set();
      orders.forEach((o) => {
        if (ehPedidoExterno(o) || o.status === "cancelled") return;
        const n = numeroMesaDe(o.table);
        if (n) derivadas.add(n);
      });
      numeros = [...derivadas].sort((a, b) => a - b);
    }

    // Conta finalizada NÃO ocupa a mesa — libera para novo consumo (Disponível).
    return numeros.map((numero) => {
      const label = rotuloMesa(numero);
      const cad = porNumero[numero] || null;
      const aberta = contasAbertas.find((c) => !c.externo && (c.mesa === label || numeroMesaDe(c.mesa) === numero));
      const status = situacaoMesaVisual(aberta || null);
      return {
        key: label,
        label,
        numero,
        status,
        conta: aberta || null,
        nome: cad?.nome || "",
        capacidade: cad?.capacidade || null,
        localizacao: cad?.localizacao || "",
        indiceBusca: aberta?.indiceBusca
          || normalizarBusca([label, numero, cad?.nome, cad?.localizacao, "disponivel livre"].filter(Boolean).join(" ")),
      };
    });
  }, [mesas, orders, contasAbertas]);

  const mesasFiltradas = useMemo(
    () => (busca.trim() ? mesasPainel.filter((m) => combinaBusca(m.indiceBusca, busca)) : mesasPainel),
    [mesasPainel, busca],
  );

  const deliveries = useMemo(() => {
    return orders
      .filter((o) => ehPedidoExterno(o) && o.paymentStatus !== "paid" && o.status !== "cancelled")
      .map((o) => ({
        ...o,
        customer: nomeClienteDe(o, clientes) || o.customer || "Cliente",
        total: orderTotal(o) * (1 + taxaPct / 100),
      }))
      .sort((a, b) => new Date(a.createdAtISO || 0) - new Date(b.createdAtISO || 0));
  }, [orders, taxaPct, clientes]);

  const deliveriesFiltrados = useMemo(() => {
    if (!busca.trim()) return deliveries;
    return deliveries.filter((p) => combinaBusca(textoBuscaConta({ mesa: p.table, cliente: p.customer, telefone: p.clienteTelefone, comandas: [p.command], total: p.total }, [p]), busca));
  }, [deliveries, busca]);

  const pagosHoje = useMemo(() => {
    const hoje = new Date();
    return orders.filter((o) => {
      if (o.paymentStatus !== "paid" || o.status === "cancelled") return false;
      const ref = o.updatedAtISO || o.createdAtISO;
      if (!ref) return true;
      return new Date(ref).toDateString() === hoje.toDateString();
    });
  }, [orders]);

  const faturamentoDia = pagosHoje.reduce((s, o) => s + orderTotal(o) * (1 + taxaPct / 100), 0);
  const ticketMedio = pagosHoje.length ? faturamentoDia / pagosHoje.length : 0;
  const statusCozinha = useMemo(() => resumoCozinha(orders), [orders]);
  const mesasDisponiveis = mesasPainel.filter((m) => m.status === "livre").length;
  const mesasOcupadas = new Set(contasAbertas.filter((c) => !c.externo).map((c) => c.mesa)).size;
  const pagamentoPendente = contasAbertas.filter((c) => c.solicitada || c.situacao === "pagamento").length;
  const pagamentoFinalizado = new Set(pagosHoje.filter((o) => !ehPedidoExterno(o)).map((o) => o.table)).size;

  const mesasOcupadasNums = useMemo(
    () => contasAbertas.filter((c) => !c.externo).map((c) => numeroMesaDe(c.mesa)).filter(Boolean),
    [contasAbertas],
  );

  function trocarCanal(novo) {
    setCanal(novo);
    if (novo !== "delivery") {
      setDeliveryMultiAtivo(false);
      setDeliveryIdsSel([]);
    }
  }

  function selecionarConta(conta, { manterCanal = false } = {}) {
    if (!conta) return;
    setSelecionadaKey(conta.key);
    setMesaLivreSel(null);
    setBufferEntrada("");
    if (!manterCanal) trocarCanal(conta.externo ? "delivery" : "mesa");
    setModal(null);
    setPainelMobile("conta");
  }

  function selecionarMesaPainel(m) {
    if (m.conta && (m.status === "ocupada" || m.status === "pendente")) {
      selecionarConta(m.conta);
      return;
    }
    // Mesa disponível — a coluna esquerda mostra a ficha da mesa livre.
    setSelecionadaKey(null);
    setBufferEntrada("");
    setMesaLivreSel({
      key: m.key,
      label: m.label || m.key,
      numero: m.numero,
      nome: m.nome,
      capacidade: m.capacidade,
      localizacao: m.localizacao,
    });
    setPainelMobile("conta");
  }

  function selecionarCardCanal(item) {
    if (!item?.contaKey && !item?.orderId && !item?.comanda) return;
    const conta = contasAbertas.find((c) =>
      c.key === item.contaKey
      || (item.comanda && c.comandas.includes(item.comanda))
      || (item.orderId && c.pedidosIds?.includes(item.orderId)),
    );
    if (conta) selecionarConta(conta, { manterCanal: true });
  }

  // Cards Cliente — só identificados (nome ou telefone) com conta em aberto
  const cardsCliente = useMemo(() => {
    const mapa = {};
    contasAbertas.forEach((c) => {
      const tel = String(c.telefone || "").replace(/\D/g, "");
      const nome = (c.cliente || "").trim();
      if (!tel && !nome) return;
      const key = tel || `nome:${nome.toLowerCase()}`;
      if (!mapa[key]) {
        mapa[key] = {
          key,
          contaKey: c.key,
          titulo: nome || "Cliente",
          subtitulo: c.externo ? "Delivery" : c.mesa,
          telefone: c.telefone || "",
          mesa: c.externo ? null : c.mesa,
          comanda: c.comandas?.[0],
          total: 0,
          aberturaISO: c.aberturaISO,
          vip: !!c.vip,
          status: c.solicitada ? "pendente" : "ocupada",
          statusLabel: c.solicitada ? "Conta pedida" : "Em consumo",
          statusChip: c.solicitada ? "bg-[#FBEFC4] text-[#012E46]" : "bg-[#FCE8D4] text-[#012E46]",
          produtosResumo: "",
          orderIds: [],
        };
      }
      const row = mapa[key];
      row.total += c.total || 0;
      if (c.aberturaISO && (!row.aberturaISO || c.aberturaISO < row.aberturaISO)) row.aberturaISO = c.aberturaISO;
      row.orderIds.push(...(c.pedidosIds || []));
      if (c.vip) row.vip = true;
      if (c.solicitada) {
        row.status = "pendente";
        row.statusLabel = "Conta pedida";
        row.statusChip = "bg-[#FBEFC4] text-[#012E46]";
      }
    });
    return Object.values(mapa)
      .map((row) => {
        const pedidos = orders.filter((o) => row.orderIds.includes(o.id));
        const nomes = pedidos.flatMap((o) => (o.items || []).map((it) => `${it.quantity}x ${it.name}`));
        return { ...row, produtosResumo: nomes.slice(0, 4).join(" · ") };
      })
      .sort((a, b) => b.total - a.total);
  }, [contasAbertas, orders]);

  // Cards Comanda — uma por comanda em aberto
  const cardsComanda = useMemo(() => {
    return contasAbertas.flatMap((c) =>
      (c.comandas || []).map((cmd) => {
        const pedidos = orders.filter((o) => o.command === cmd && o.paymentStatus !== "paid" && o.status !== "cancelled");
        const sub = pedidos.reduce((s, o) => s + orderTotal(o), 0);
        const nomes = pedidos.flatMap((o) => (o.items || []).map((it) => `${it.quantity}x ${it.name}`));
        return {
          key: `cmd-${cmd}`,
          contaKey: c.key,
          comanda: cmd,
          orderId: pedidos[0]?.id,
          titulo: cmd,
          subtitulo: c.cliente || (c.externo ? "Delivery" : c.mesa),
          telefone: c.telefone || "",
          mesa: c.externo ? null : c.mesa,
          total: sub * (1 + taxaPct / 100),
          aberturaISO: c.aberturaISO,
          vip: !!c.vip,
          status: c.solicitada ? "pendente" : "ocupada",
          statusLabel: c.solicitada ? "Conta pedida" : "Aberta",
          statusChip: c.solicitada ? "bg-[#FBEFC4] text-[#012E46]" : "bg-[#FCE8D4] text-[#012E46]",
          produtosResumo: nomes.slice(0, 4).join(" · "),
        };
      }),
    ).sort((a, b) => b.total - a.total);
  }, [contasAbertas, orders, taxaPct]);

  // Cards Pedido — um por pedido aberto
  const cardsPedido = useMemo(() => {
    return orders
      .filter((o) => o.paymentStatus !== "paid" && o.status !== "cancelled")
      .map((o) => {
        const tot = orderTotal(o) * (1 + taxaPct / 100);
        const nomes = (o.items || []).map((it) => `${it.quantity}x ${it.name}`);
        const conta = contasAbertas.find((c) => c.comandas.includes(o.command) || c.pedidosIds?.includes(o.id));
        // Status vem em inglês do banco — o card sempre mostra o rótulo em PT-BR.
        const st = rotuloStatusPedido(o.status);
        const solicitado = o.paymentStatus === "requested";
        return {
          key: o.id,
          contaKey: conta?.key,
          orderId: o.id,
          comanda: o.command,
          titulo: o.id,
          subtitulo: nomeClienteDe(o, clientes) || o.customer || "Sem cliente",
          telefone: o.clienteTelefone || "",
          mesa: o.table,
          total: tot,
          aberturaISO: o.createdAtISO,
          vip: conta?.vip,
          status: solicitado ? "pendente" : "ocupada",
          statusLabel: solicitado ? "Conta pedida" : st.label,
          statusChip: solicitado ? "bg-[#FBEFC4] text-[#012E46]" : st.chip,
          produtosResumo: nomes.slice(0, 4).join(" · "),
        };
      })
      .sort((a, b) => new Date(a.aberturaISO || 0) - new Date(b.aberturaISO || 0));
  }, [orders, taxaPct, contasAbertas, clientes]);

  /** Busca global vale para os cards de Cliente/Comanda/Pedido também. */
  const filtrarCards = (lista) => {
    if (!busca.trim()) return lista;
    return lista.filter((c) => combinaBusca(
      normalizarBusca([c.titulo, c.subtitulo, c.telefone, c.mesa, c.comanda, c.produtosResumo, c.statusLabel, formatCurrency(c.total)].filter(Boolean).join(" ")),
      busca,
    ));
  };

  function selecionarDelivery(p) {
    if (deliveryMultiAtivo) {
      setDeliveryIdsSel((cur) => {
        const tem = cur.includes(p.id);
        return tem ? cur.filter((id) => id !== p.id) : [...cur, p.id];
      });
      setSelecionadaKey(null);
      setMesaLivreSel(null);
      setBufferEntrada("");
      setPainelMobile("conta");
      return;
    }
    const conta = contasAbertas.find((c) => c.comandas.includes(p.command) || c.pedidosIds?.includes(p.id));
    if (conta) selecionarConta(conta);
  }

  function toggleDeliveryMulti(ativo) {
    if (ativo) {
      const atual = contaSelSimples?.externo
        ? orders.find((o) =>
          contaSelSimples.pedidosIds?.includes(o.id)
          || contaSelSimples.comandas?.includes(o.command),
        )
        : null;
      const seedId = atual && ehPedidoExterno(atual) ? atual.id : null;
      setDeliveryMultiAtivo(true);
      setDeliveryIdsSel(seedId ? [seedId] : []);
      setSelecionadaKey(null);
      setMesaLivreSel(null);
      setBufferEntrada("");
      return;
    }
    const primeiroId = deliveryIdsEfetivos[0];
    setDeliveryMultiAtivo(false);
    setDeliveryIdsSel([]);
    if (primeiroId) {
      const p = orders.find((o) => o.id === primeiroId);
      if (p) {
        const conta = contasAbertas.find((c) => c.comandas.includes(p.command) || c.pedidosIds?.includes(p.id));
        if (conta) selecionarConta(conta, { manterCanal: true });
      }
    }
  }

  /**
   * Trocar a forma zera o valor — exceto Pontos, que já lança o saldo
   * disponível em reais (teto do resgate) para o caixa só confirmar com OK.
   */
  function selecionarForma(forma) {
    setFormaSelecionada(forma);
    setPainelMobile("pagamento");
    if (forma?.pontos) {
      const teto = Math.min(restanteSel, Math.max(0, pontosDisponiveisReais));
      setBufferEntrada(teto > 0 ? String(Math.round(teto * 100)) : "");
      return;
    }
    setBufferEntrada("");
  }

  /** Teto do valor digitável na forma atual (pontos limitam ao saldo). */
  function tetoDaForma() {
    if (formaEhPontos) return Math.min(restanteSel, pontosDisponiveisReais);
    return restanteSel;
  }

  /** Busca por Enter — leva direto para a primeira conta que casa com o termo. */
  function executarBusca() {
    const q = busca.trim();
    if (!q) return;
    const alvo = contasAbertas.find((c) => combinaBusca(c.indiceBusca, q));
    if (alvo) {
      selecionarConta(alvo);
      return;
    }
    const mesaLivre = mesasFiltradas.find((m) => m.status === "livre");
    if (mesaLivre) selecionarMesaPainel(mesaLivre);
  }

  /**
   * Teto do que pode ser digitado: nunca acima do que falta receber.
   * Só o dinheiro escapa da trava — é dele que sai o troco.
   */
  function tecladoDigito(d) {
    if (!/^\d+$/.test(d)) return;
    const teto = tetoDaForma();
    setBufferEntrada((cur) => {
      const next = `${cur}${d}`.replace(/^0+(?=\d)/, "").slice(0, 9);
      const valor = Number(next || 0) / 100;
      // Dinheiro é a única forma que pode passar do restante (troco).
      if ((!trocoLiberado || formaEhPontos) && teto > 0 && valor > teto + 0.001) {
        return String(Math.round(teto * 100));
      }
      return next;
    });
  }
  function tecladoApagar() {
    setBufferEntrada((cur) => cur.slice(0, -1));
  }
  function tecladoLimpar() {
    setBufferEntrada("");
  }
  /** Atalho para quando o cliente paga tudo de uma vez só. */
  function lancarValorTotal() {
    const teto = tetoDaForma();
    if (!(teto > 0)) return;
    setBufferEntrada(String(Math.round(teto * 100)));
  }

  /** OK do teclado — registra a forma atual como uma parcela recebida. */
  function registrarPagamentoParcial() {
    if (!contaSel) {
      notify("error", "Selecione uma conta para registrar o pagamento.");
      return;
    }
    if (!formaAtual) {
      notify("error", "Escolha a forma de pagamento.");
      return;
    }
    if (restanteSel <= 0.001) {
      notify("error", "Conta já quitada. Feche a conta para concluir.");
      return;
    }
    const valor = Number(bufferEntrada || 0) / 100;
    if (!(valor > 0)) {
      notify("error", "Digite o valor a receber ou use o botão Valor total.");
      return;
    }
    if (formaEhPontos && valor > pontosDisponiveisReais + 0.001) {
      notify("error", `Saldo em pontos cobre até ${formatCurrency(pontosDisponiveisReais)}.`);
      return;
    }
    const aplicado = (trocoLiberado && !formaEhPontos) ? valor : Math.min(valor, tetoDaForma());
    const ptsUsados = formaEhPontos ? Math.round(aplicado * pontosPorReal) : 0;
    const parcela = {
      id: `pg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      forma: formaAtual.nome,
      formaId: formaAtual.pontos ? null : (formaAtual.id ?? null),
      pontos: !!formaAtual.pontos,
      valor: aplicado,
      pontosQtd: ptsUsados || undefined,
    };
    setPagamentosPorConta((cur) => ({ ...cur, [contaSel.key]: [...(cur[contaSel.key] || []), parcela] }));
    // Valor sempre volta a zero: a próxima parcela é digitada do começo.
    setBufferEntrada("");
    const novoRestante = Math.max(0, restanteSel - aplicado);
    if (formaEhPontos) {
      auditar("pagamento_pontos", "comanda", null, {
        mesa: contaSel.mesa,
        valor: aplicado,
        pontos: ptsUsados,
        telefone: telefoneConta,
      });
      notify("success", novoRestante > 0
        ? `Pontos · ${formatCurrency(aplicado)} (${ptsUsados} pts). Falta ${formatCurrency(novoRestante)}.`
        : `Pontos · ${formatCurrency(aplicado)} (${ptsUsados} pts). Conta quitada — pontos serão baixados no fechamento.`);
      return;
    }
    notify("success", novoRestante > 0
      ? `${formaAtual.nome} · ${formatCurrency(aplicado)} recebido. Falta ${formatCurrency(novoRestante)}.`
      : `${formaAtual.nome} · ${formatCurrency(aplicado)} recebido. Conta quitada.`);
  }

  /** Canal da conta selecionada — usado na validação do cupom (interno × externo). */
  function canalDaConta(conta = contaSel) {
    return conta?.externo ? "externo" : "interno";
  }

  /** Cupom: valida no banco (canal, vigência, horário, mínimo e quantidade). */
  async function aplicarCupom(codigo, aoAplicar) {
    if (!contaSel) return;
    const cod = String(codigo || "").trim().toUpperCase();
    if (!cod) {
      setCupomStatusUi({ status: "vazio" });
      return;
    }
    setCupomProcessando(true);
    setCupomStatusUi({ status: "validando" });
    try {
      const r = await validarCupom({
        codigo: cod,
        valorConta: totalCobrar > 0 ? totalCobrar : totalSel,
        canal: canalDaConta(),
      });
      if (!r?.ok) {
        setCupomStatusUi({
          status: r?.status || "nao_encontrado",
          motivo: r?.motivo,
          minimoCompra: r?.minimoCompra,
        });
        notify("error", r?.motivo || "Cupom inválido.");
        return;
      }
      setCupomPorConta((cur) => ({
        ...cur,
        [contaSel.key]: {
          id: r.id,
          codigo: String(r.codigo || cod).toUpperCase(),
          desconto: Number(r.desconto) || 0,
          restantes: r.restantes ?? null,
        },
      }));
      setCupomStatusUi({
        status: "valido",
        desconto: Number(r.desconto) || 0,
        restantes: r.restantes ?? null,
      });
      setBufferEntrada("");
      aoAplicar?.();
      const restTxt = r.restantes != null ? ` · ${r.restantes} restante(s)` : "";
      notify("success", `Cupom válido · −${formatCurrency(r.desconto)}${restTxt}`);
    } finally {
      setCupomProcessando(false);
    }
  }

  /** Pré-valida enquanto digita (canal/prazo/horário/quantidade) sem aplicar o desconto. */
  async function prevalidarCupomDigitado(codigo) {
    const cod = String(codigo || "").trim().toUpperCase();
    if (!cod) {
      setCupomStatusUi({ status: "vazio" });
      return;
    }
    if (cod.length < 3) {
      setCupomStatusUi({ status: "digitando" });
      return;
    }
    setCupomStatusUi({ status: "validando" });
    const r = await validarCupom({
      codigo: cod,
      valorConta: totalCobrar > 0 ? totalCobrar : totalSel,
      canal: canalDaConta(),
    });
    if (!r?.ok) {
      setCupomStatusUi({
        status: r?.status || "nao_encontrado",
        motivo: r?.motivo,
        minimoCompra: r?.minimoCompra,
      });
      return;
    }
    setCupomStatusUi({
      status: "valido",
      desconto: Number(r.desconto) || 0,
      restantes: r.restantes ?? null,
    });
  }

  function removerCupom() {
    if (!contaSel) return;
    setCupomPorConta((cur) => {
      const next = { ...cur };
      delete next[contaSel.key];
      return next;
    });
    setCupomStatusUi({ status: "vazio" });
    setBufferEntrada("");
  }

  const cupomLegenda = cupomSel
    ? legendaCupom("valido", { desconto: descontoCupom, restantes: cupomSel?.restantes })
    : legendaCupom(cupomStatusUi.status, cupomStatusUi);

  /** Identificação do cliente no pagamento — habilita acúmulo e resgate. */
  async function identificarCliente({ nome, telefone, jaCadastrado }) {
    if (!contaSel) return;
    setAcaoProcessando(true);
    try {
      await atualizarClientePedidos(pedidosSel.map((o) => o.id), { customer: nome, clienteTelefone: telefone });
      setModal(null);
      setAvisoCliente({
        texto: jaCadastrado ? `Cliente identificado · ${nome}` : `Cliente cadastrado com sucesso · ${nome}`,
        tom: "text-[#1F7A3D]",
      });
      notify("success", jaCadastrado ? "Cliente identificado." : "Cliente cadastrado com sucesso.");
    } finally {
      setAcaoProcessando(false);
    }
  }

  function removerPagamentoParcial(id) {
    if (!contaSel) return;
    setPagamentosPorConta((cur) => ({
      ...cur,
      [contaSel.key]: (cur[contaSel.key] || []).filter((p) => p.id !== id),
    }));
    setBufferEntrada("");
  }

  function abrirConfirmacao() {
    if (processandoRef.current) return;
    if (!contaSel) {
      notify("error", "Selecione uma conta para fechar.");
      return;
    }
    if (!podeFechar) {
      notify("error", `Ainda faltam ${formatCurrency(restanteSel)}. Registre o recebimento no teclado (OK).`);
      return;
    }
    setConfirmarFinalizacao(true);
  }

  async function confirmarEFinalizar() {
    if (processandoRef.current || !contaSel) return;
    const valorPago = recebidoEfetivo;
    if (!(valorPago > 0) || valorPago + 0.001 < totalCobrar) {
      notify("error", "Valor inválido para fechamento. Registre recebimentos que cubram o total.");
      return;
    }
    processandoRef.current = true;
    setProcessando(true);
    const contaKey = contaSel.key;
    const mesaFechada = contaSel.mesa;
    try {
      // Cupom: reconfere a disponibilidade AGORA e consome uma unidade. Se
      // acabou entre a aplicação e o fechamento, o pagamento não segue.
      if (cupomSel?.id) {
        const uso = await consumirCupom({
          cupomId: cupomSel.id,
          valorConta: totalSel,
          valorDesconto: descontoCupom,
          mesa: mesaFechada,
          comandas: [...contaSel.comandas],
          clienteTelefone: contaSel.telefone || null,
          canal: canalDaConta(contaSel),
        });
        if (!uso?.ok) {
          notify("error", uso?.motivo || "Cupom indisponível. Remova o cupom para concluir o pagamento.");
          return;
        }
      }
      // Cada parcela vai como uma linha de detalhe — é assim que tab_pagamentos,
      // o movimento de caixa e o relatório por forma conseguem separar o split.
      const detalhes = pagamentosSel.map((p) => ({ forma: p.forma, valor: p.valor }));
      const info = {
        mesa: mesaFechada,
        total: totalCobrar,
        troco: trocoSel,
        detalhes,
        comandas: [...contaSel.comandas],
        ...(descontoCupom > 0 ? { desconto: descontoCupom, cupom: cupomSel?.codigo } : {}),
      };
      const baixa = await baixarComandas(contaSel.comandas, info);
      auditar("finalizar_pagamento", "comanda", null, {
        mesa: info.mesa,
        comandas: contaSel.comandas,
        total: totalCobrar,
        formas: detalhes.map((d) => d.forma),
        ...(descontoCupom > 0 ? { cupom: cupomSel?.codigo, descontoCupom } : {}),
        ...(descontoManualSel > 0 ? { descontoManual: descontoManualSel } : {}),
        ...(acrescimoSel > 0 ? { acrescimo: acrescimoSel } : {}),
        ...(taxaRemovida ? { taxaRemovida: true } : {}),
      });
      setSucesso({
        ...info,
        subtotal: subtotalSel,
        taxa: taxaValorSel,
        acrescimo: acrescimoSel,
        descontoManual: descontoManualSel,
        pontosGanhos: pontosGanhar,
        codigo: `PAG-${Date.now().toString().slice(-8)}`,
        alertasEstoque: baixa?.alertas || [],
        cliente: contaSel.cliente || "",
        telefone: contaSel.telefone || "",
        aberturaISO: contaSel.aberturaISO || null,
        externo: !!contaSel.externo,
        itens: pedidosSel.flatMap((o) => o.items || []),
        tipoEntrega: /entreg/i.test(contaSel.mesa || "") ? "entrega" : "retirada",
      });
      setConfirmarFinalizacao(false);
      setBufferEntrada("");
      setFormaSelecionada(null);
      setAvisoCliente(null);
      setPagamentosPorConta((cur) => {
        const next = { ...cur };
        delete next[contaKey];
        return next;
      });
      setCupomPorConta((cur) => {
        const next = { ...cur };
        delete next[contaKey];
        return next;
      });
      // Limpa legenda/campo do cupom na tela após o pagamento (não deixa “fantasma”).
      setCupomStatusUi({ status: "vazio" });
      setAjustePorConta((cur) => {
        const next = { ...cur };
        delete next[contaKey];
        return next;
      });
      setBloqueioProdutos((cur) => {
        const next = { ...cur };
        delete next[contaKey];
        return next;
      });
      setSelecionadaKey(null);
      setDeliveryIdsSel([]);
      // Mesa liberada na hora: a coluna esquerda já mostra a ficha "Disponível".
      const numero = numeroMesaDe(mesaFechada);
      if (numero) {
        const cad = mesasPainel.find((m) => m.numero === numero);
        setMesaLivreSel({
          key: rotuloMesa(numero),
          label: rotuloMesa(numero),
          numero,
          nome: cad?.nome || "",
          capacidade: cad?.capacidade || null,
          localizacao: cad?.localizacao || "",
        });
      }
    } finally {
      processandoRef.current = false;
      setProcessando(false);
    }
  }

  /** Contexto compartilhado dos cupons térmicos 80mm da conta selecionada. */
  function ctxCupomConta(extras = {}) {
    const mesaCad = mesas.find((m) => numeroMesaDe(contaSel?.mesa) === m.numero);
    const formasNomes = formasAtivas.map((f) => f.nome).filter(Boolean).join(" · ")
      || "PIX · Dinheiro · Débito · Crédito";
    return montarCtxConta({
      lojaInfo,
      conta: contaSel,
      pedidos: pedidosSel,
      products,
      categories,
      setores,
      currentUser,
      caixaAberto,
      pessoas: mesaCad?.capacidade || extras.pessoas || 0,
      observacaoGeral: contaSel ? lerObsInterna(lojaInfo?.id, contaSel.mesa) : "",
      financeiros: {
        subtotal: subtotalSel,
        desconto: descontoCupom + descontoManualSel,
        descontoProvisorio: descontoCupom + descontoManualSel,
        acrescimo: acrescimoSel,
        taxaServico: taxaValorSel,
        taxaEstimada: taxaValorSel,
        taxaEntrega: 0,
        total: totalCobrar > 0 ? totalCobrar : totalSel,
        totalEstimado: totalCobrar > 0 ? totalCobrar : totalSel,
        formasAceitas: formasNomes,
        ...extras.financeiros,
      },
      ...extras,
    });
  }

  /** Pré-conta (modelo 5) — documento sem valor fiscal para o cliente. */
  function imprimirPreConta() {
    if (!contaSel || pedidosSel.length === 0) {
      notify("error", "Selecione uma conta com produtos para imprimir a pré-conta.");
      return;
    }
    const ctx = ctxCupomConta();
    const ok = abrirCupomTermico(
      `Pré-conta · ${ctx.mesa || ctx.comanda}`,
      htmlPreConta(ctx),
    );
    if (!ok) {
      notify("error", "Permita pop-ups para imprimir a pré-conta na impressora de cupom.");
      return;
    }
    auditar("imprimir_pre_conta", "comanda", null, { mesa: contaSel.mesa, total: ctx.total });
  }

  /**
   * Conferência de mesa (modelo 4) ou comprovante de retirada/entrega (modelo 6)
   * quando a conta é externa. Bloqueia alteração dos itens já impressos.
   */
  function emitirComprovanteMesa() {
    if (!contaSel || pedidosSel.length === 0) {
      notify("error", "Selecione uma conta com produtos para emitir o comprovante.");
      return;
    }
    const ctx = ctxCupomConta();
    const ok = contaSel.externo
      ? abrirCupomTermico(
        `Retirada/Entrega · #${ctx.pedidoNumero}`,
        htmlComprovanteEntregaRetirada({
          ...ctx,
          tipo: /entreg/i.test(contaSel.mesa || "") ? "entrega" : "retirada",
          codigoRastreio: ctx.comanda || ctx.pedidoNumero,
          realizadoISO: ctx.aberturaISO,
          formaPagamento: "Aguardando pagamento",
          statusPagamento: "EM ABERTO",
          total: ctx.total,
          conferidoPor: currentUser?.name || "",
          volumes: Math.max(1, ctx.itens.reduce((s, it) => s + (Number(it.quantity) || 0), 0)),
        }),
      )
      : abrirCupomTermico(
        `Conferência · ${ctx.mesa || ctx.comanda}`,
        htmlConferenciaMesa(ctx),
      );
    if (!ok) {
      notify("error", "Permita pop-ups para imprimir o comprovante na impressora de cupom.");
      return;
    }
    setBloqueioProdutos((cur) => ({ ...cur, [contaSel.key]: true }));
    auditar("emitir_comprovante_mesa", "comanda", null, {
      mesa: contaSel.mesa,
      total: ctx.total,
      modelo: contaSel.externo ? "entrega_retirada" : "conferencia",
    });
    notify("success", "Comprovante emitido. Para incluir produtos, informe a comanda do cliente.");
  }

  /** Produção: um cupom por setor de cozinha (modelo 3). */
  function imprimirCuponsCozinha() {
    if (!contaSel || pedidosSel.length === 0) {
      notify("error", "Selecione uma conta com produtos para imprimir a cozinha.");
      return;
    }
    const ctx = ctxCupomConta();
    const n = imprimirPedidosProducaoPorSetor(ctx);
    if (!n) {
      notify("error", "Permita pop-ups para imprimir os cupons de produção.");
      return;
    }
    auditar("imprimir_cozinha_setores", "comanda", null, {
      mesa: contaSel.mesa,
      setores: n,
    });
    notify("success", n === 1
      ? "Cupom de produção enviado à impressora."
      : `${n} cupons de produção enviados (um por setor).`);
  }

  /** Após pagamento: comprovante completo (2), simplificado (1) ou retirada/entrega (6). */
  function imprimirComprovante(dados, variante = "completo") {
    if (!dados) return;
    const itens = dados.itens || [];
    const base = {
      lojaInfo,
      mesa: dados.mesa,
      comanda: (dados.comandas || []).join(", "),
      pedidoNumero: dados.codigo?.replace(/\D/g, "").slice(-6) || String(dados.codigo || "").slice(-6),
      cliente: dados.cliente || "",
      telefone: dados.telefone || "",
      aberturaISO: dados.aberturaISO || null,
      fechamentoISO: new Date().toISOString(),
      operador: currentUser?.name || "",
      itens,
      subtotal: dados.subtotal || 0,
      desconto: (Number(dados.desconto) || 0) + (Number(dados.descontoManual) || 0),
      cupomCodigo: dados.cupom || "",
      acrescimo: Number(dados.acrescimo) || 0,
      taxaServico: Number(dados.taxa) || 0,
      total: dados.total || 0,
      pagamentos: dados.detalhes || [],
      troco: dados.troco || 0,
      pagamentoId: dados.codigo || "",
      caixaId: caixaAberto?.id ? String(caixaAberto.id).slice(-6) : "",
      pdvId: "PDV-CAIXA",
      atendimento: dados.externo ? "Delivery / Retirada" : "Salão",
    };

    let html;
    let titulo;
    if (dados.externo || variante === "entrega") {
      titulo = `Retirada/Entrega · ${base.pedidoNumero}`;
      html = htmlComprovanteEntregaRetirada({
        ...base,
        tipo: dados.tipoEntrega === "entrega" ? "entrega" : "retirada",
        codigoRastreio: base.comanda || base.pedidoNumero,
        realizadoISO: base.aberturaISO,
        formaPagamento: (dados.detalhes || []).map((d) => d.forma).join(" + ") || "—",
        statusPagamento: "PAGO",
        conferidoPor: currentUser?.name || "",
        volumes: Math.max(1, itens.reduce((s, it) => s + (Number(it.quantity) || 0), 0)),
      });
    } else if (variante === "simplificado") {
      titulo = `Cupom · ${base.pedidoNumero}`;
      html = htmlCupomClienteSimplificado({
        ...base,
        formaPagamento: (dados.detalhes || []).map((d) => d.forma).join(" + "),
        dataHora: new Date(),
      });
    } else {
      titulo = `Pagamento · ${base.pedidoNumero}`;
      html = htmlComprovanteCompletoPagamento(base);
    }
    const ok = abrirCupomTermico(titulo, html);
    if (!ok) notify("error", "Permita pop-ups para imprimir na impressora de cupom.");
  }

  async function alterarQtdItem(orderId, index, novaQtd) {
    if (produtosBloqueados) {
      notify("error", "Comprovante emitido — alteração dos itens atuais bloqueada. Inclua novos produtos pela comanda do cliente.");
      return;
    }
    const pedido = orders.find((o) => o.id === orderId);
    if (!pedido) return;
    const itens = [...(pedido.items || [])];
    if (novaQtd <= 0) {
      itens.splice(index, 1);
    } else {
      itens[index] = { ...itens[index], quantity: novaQtd };
    }
    if (itens.length === 0) {
      notify("error", "A conta precisa de ao menos um produto. Remova a conta pelo fluxo de cancelamento se necessário.");
      return;
    }
    await editarItensPedido(orderId, itens);
  }

  /** Abre confirmação antes de excluir o produto da conta. */
  function pedirExclusaoItem(orderId, index) {
    if (produtosBloqueados) {
      notify("error", "Comprovante emitido — exclusão dos itens atuais bloqueada.");
      return;
    }
    const pedido = orders.find((o) => o.id === orderId);
    const item = pedido?.items?.[index];
    if (!item) return;
    if ((pedido.items || []).length <= 1) {
      notify("error", "A conta precisa de ao menos um produto. Use o cancelamento da conta se necessário.");
      return;
    }
    setExcluirPendente({
      orderId,
      index,
      name: item.name,
      quantity: Number(item.quantity) || 1,
      price: Number(item.price) || 0,
    });
  }

  async function confirmarExclusaoItem() {
    if (!excluirPendente || !contaSel) return;
    const { orderId, index, name, quantity, price } = excluirPendente;
    setAcaoProcessando(true);
    try {
      await alterarQtdItem(orderId, index, 0);
      auditar("excluir_produto_conta", "pedido", orderId, {
        mesa: contaSel.mesa,
        produto: name,
        quantidade: quantity,
        valor: (Number(price) || 0) * (Number(quantity) || 0),
        comandas: contaSel.comandas,
      });
      notify("success", `${name} removido da conta.`);
      setExcluirPendente(null);
    } finally {
      setAcaoProcessando(false);
    }
  }

  async function removerItem(orderId, index) {
    pedirExclusaoItem(orderId, index);
  }

  /**
   * Inclui produto no pagamento. Sempre habilitado.
   * Com comprovante emitido: exige comanda e cria/vincula nova venda.
   * Se o cliente quiser pontuar e ainda não estiver identificado, abre a identificação.
   */
  async function incluirProduto(produto, opts = {}) {
    if (!contaSel) {
      notify("error", "Selecione uma conta para incluir o produto.");
      return;
    }
    const comandaInformada = String(opts.comanda || "").trim().toUpperCase();
    const querPontuar = !!opts.pontuar;
    const novo = itemDeProduto(produto);

    setAcaoProcessando(true);
    try {
      if (produtosBloqueados) {
        if (!comandaInformada) {
          notify("error", "Informe a comanda do cliente para vincular a nova venda.");
          return;
        }
        // Mescla em pedido aberto da mesma comanda nesta mesa; senão cria nova venda.
        const pedidoComanda = pedidosSel.find((o) => String(o.command || "").toUpperCase() === comandaInformada);
        if (pedidoComanda) {
          const itens = [...(pedidoComanda.items || [])];
          const mesmo = itens.findIndex((it) => it.name === novo.name && Number(it.price) === Number(novo.price) && !it.observation);
          if (mesmo >= 0) {
            itens[mesmo] = { ...itens[mesmo], quantity: (Number(itens[mesmo].quantity) || 0) + 1 };
          } else {
            itens.push(novo);
          }
          await editarItensPedido(pedidoComanda.id, itens);
        } else {
          const criado = await criarPedidoCaixa({
            table: contaSel.mesa,
            command: comandaInformada,
            customer: contaSel.cliente,
            clienteTelefone: contaSel.telefone || null,
            items: [novo],
          });
          if (!criado) return;
        }
        notify("success", `${produto.name} vinculado à comanda ${comandaInformada}.`);
      } else {
        if (!pedidosSel.length) {
          notify("error", "Nenhum pedido aberto nesta conta.");
          return;
        }
        const alvo = [...pedidosSel].sort((a, b) => new Date(b.createdAtISO || 0) - new Date(a.createdAtISO || 0))[0];
        const itens = [...(alvo.items || [])];
        const mesmo = itens.findIndex((it) => it.name === novo.name && Number(it.price) === Number(novo.price) && !it.observation);
        if (mesmo >= 0) {
          itens[mesmo] = { ...itens[mesmo], quantity: (Number(itens[mesmo].quantity) || 0) + 1 };
        } else {
          itens.push(novo);
        }
        await editarItensPedido(alvo.id, itens);
        notify("success", `${produto.name} incluído na conta.`);
      }

      setModal(null);
      if (querPontuar && fidAtiva && !clienteIdentificado) {
        setModal("identificar");
        setAvisoCliente({
          texto: "Identifique o cliente para pontuar nesta compra",
          tom: "text-[#1F7A3D]",
        });
      }
    } finally {
      setAcaoProcessando(false);
    }
  }

  async function salvarCliente({ customer, clienteTelefone }) {
    if (!contaSel) return;
    setAcaoProcessando(true);
    try {
      await atualizarClientePedidos(pedidosSel.map((o) => o.id), { customer, clienteTelefone });
      setModal(null);
    } finally {
      setAcaoProcessando(false);
    }
  }

  async function confirmarTransferencia(destino) {
    if (!contaSel) return;
    setAcaoProcessando(true);
    try {
      await transferirMesaPedidos(pedidosSel.map((o) => o.id), destino);
      setBloqueioProdutos((cur) => {
        const next = { ...cur };
        if (cur[contaSel.key]) {
          delete next[contaSel.key];
          next[destino] = true;
        }
        return next;
      });
      setSelecionadaKey(destino);
      setModal(null);
    } finally {
      setAcaoProcessando(false);
    }
  }

  async function confirmarSeparacao({ destino, itens }) {
    if (!contaSel) return;
    setAcaoProcessando(true);
    try {
      await separarItensPedidos({
        origemMesa: contaSel.mesa,
        destinoMesa: destino,
        itens,
        customer: contaSel.cliente,
        clienteTelefone: contaSel.telefone,
      });
      setModal(null);
    } finally {
      setAcaoProcessando(false);
    }
  }

  const historicoMesaPedidos = useMemo(() => {
    if (!contaSel || contaSel.externo) return [];
    const n = numeroMesaDe(contaSel.mesa);
    const hoje = new Date();
    return orders
      .filter((o) => {
        if (ehPedidoExterno(o) || o.status === "cancelled") return false;
        if (numeroMesaDe(o.table) !== n && o.table !== contaSel.mesa) return false;
        const ref = o.updatedAtISO || o.createdAtISO;
        if (ref && new Date(ref).toDateString() !== hoje.toDateString() && o.paymentStatus === "paid") return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAtISO || 0) - new Date(a.createdAtISO || 0));
  }, [orders, contaSel]);

  const itensParaSeparar = useMemo(() => {
    return pedidosSel.flatMap((o) =>
      (o.items || []).map((it, idx) => ({
        key: `${o.id}-${idx}`,
        orderId: o.id,
        index: idx,
        name: it.name,
        quantity: it.quantity,
        price: it.price,
        selectedIngredients: it.selectedIngredients,
        removedIngredients: it.removedIngredients,
        extraIngredients: it.extraIngredients,
        observation: it.observation,
        selectedOptions: it.selectedOptions,
      })),
    );
  }, [pedidosSel]);

  const obsItens = useMemo(() => {
    return pedidosSel.flatMap((o) =>
      (o.items || [])
        .filter((it) => it.observation)
        .map((it) => `${it.quantity}x ${it.name}: ${it.observation}`),
    );
  }, [pedidosSel]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "F1") {
        e.preventDefault();
        setAjudaAberta((a) => !a);
        return;
      }
      if (ajudaAberta) {
        if (e.key === "Escape") setAjudaAberta(false);
        return;
      }
      if (excluirPendente) {
        if (e.key === "Escape") setExcluirPendente(null);
        return;
      }
      if (modal || confirmarFinalizacao || sucesso) {
        if (e.key === "Escape") {
          setModal(null);
          setConfirmarFinalizacao(false);
          setSucesso(null);
        }
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        document.getElementById("pdv-busca-global")?.focus();
      } else if (e.key === "F3") {
        e.preventDefault();
        trocarCanal("mesa");
      } else if (e.key === "F4" && contaSel) {
        e.preventDefault();
        imprimirPreConta();
      } else if (e.key === "F5" && podeFechar) {
        e.preventDefault();
        abrirConfirmacao();
      } else if (e.key === "F6") {
        e.preventDefault();
        registrarPagamentoParcial();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmarFinalizacao, sucesso, contaSel, podeFechar, restanteSel, bufferEntrada, modal, ajudaAberta, excluirPendente]);

  const temConta = !!contaSel;
  const selecionadoCanalKey = canal === "cliente"
    ? cardsCliente.find((c) => c.contaKey === contaSel?.key)?.key
    : canal === "comanda"
      ? cardsComanda.find((c) => c.contaKey === contaSel?.key)?.key
      : canal === "pedido"
        ? cardsPedido.find((c) => c.contaKey === contaSel?.key || contaSel?.pedidosIds?.includes(c.orderId))?.key
        : contaSel?.mesa;

  return (
    <div
      data-theme="light"
      className="pdv-tema tema-claro-area fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--pp-surface)]"
      style={{
        height: "100dvh",
        maxHeight: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <PdvHeader
        canal={canal}
        onCanalChange={(c) => {
          trocarCanal(c);
          if (c !== "mesa") setMesaLivreSel(null);
          setPainelMobile("salao");
        }}
        busca={busca}
        onBuscaChange={setBusca}
        onBuscar={executarBusca}
        currentUser={currentUser}
        temaClaro={temaClaro}
        onToggleTema={() => setTemaClaro((t) => !t)}
        onAbrirAjuda={() => setAjudaAberta(true)}
      />

      <PdvStatsBar
        agora={agora}
        cozinha={statusCozinha}
        mesasDisponiveis={mesasDisponiveis}
        mesasOcupadas={mesasOcupadas}
        totalMesas={mesasPainel.length}
        pagamentoPendente={pagamentoPendente}
        pagamentoFinalizado={pagamentoFinalizado}
        faturamentoDia={faturamentoDia}
        ticketMedio={ticketMedio}
        contasAbertas={contasAbertas}
        pagosHoje={pagosHoje}
        taxaPct={taxaPct}
      />

      <PdvMobileNav
        ativo={painelMobile}
        onChange={setPainelMobile}
        temConta={temConta}
        totalLabel={temConta ? formatCurrency(totalSel) : ""}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Conta / produtos — aba mobile + coluna desktop */}
        <PdvMesaDetail
          conta={contaSel}
          pedidos={pedidosSel}
          subtotal={subtotalSel}
          taxasDescontos={taxasSel}
          total={totalCobrar > 0 ? totalCobrar : totalSel}
          taxaServico={taxaValorSel}
          taxaPct={taxaPct}
          taxaRemovida={taxaRemovida}
          acrescimo={acrescimoSel}
          descontoManual={descontoManualSel}
          descontoCupom={descontoCupom}
          cupomCodigo={cupomSel?.codigo || ""}
          recebido={recebidoEfetivo}
          agora={agora}
          mesaLivre={mesaLivreSel}
          onEditarCliente={temConta && !contaSel?.multiPagamento ? () => setModal("cliente") : undefined}
          onIncluirProduto={temConta && !contaSel?.multiPagamento ? () => setModal("incluir") : undefined}
          onAlterarQtd={contaSel?.multiPagamento ? undefined : alterarQtdItem}
          onRemoverItem={contaSel?.multiPagamento ? undefined : removerItem}
          produtosBloqueados={produtosBloqueados}
          className={`${painelMobile === "conta" ? "flex min-h-0 flex-1" : "hidden"} min-w-0 overflow-hidden border-b lg:flex lg:w-[214px] lg:max-w-[214px] lg:shrink-0 lg:border-b-0 lg:border-r xl:w-[248px] xl:max-w-[248px] 2xl:w-[280px] 2xl:max-w-[280px]`}
        />

        {/* Centro — canal Mesa / Delivery / Comanda / Cliente / Pedido */}
        <main
          className={`${painelMobile === "salao" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--pp-surface)] p-2 sm:p-2.5 lg:flex lg:p-3`}
        >
          {canal === "mesa" && (
            <PdvMesasGrid
              mesasPainel={mesasFiltradas}
              totalMesas={mesasPainel.length}
              busca={busca}
              selecionadaKey={contaSel?.mesa || mesaLivreSel?.key}
              onSelecionar={selecionarMesaPainel}
              agora={agora}
            />
          )}

          {canal === "delivery" && (
            <PdvDeliveryStrip
              pedidos={deliveriesFiltrados}
              selecionadoId={pedidosSel.find((o) => ehPedidoExterno(o))?.id}
              selecionadosIds={deliveryIdsEfetivos}
              multiAtivo={deliveryMultiAtivo}
              onSelecionar={selecionarDelivery}
              onToggleMulti={toggleDeliveryMulti}
              agora={agora}
            />
          )}

          {canal === "cliente" && (
            <PdvCanalGrid
              canal="cliente"
              itens={filtrarCards(cardsCliente)}
              selecionadoKey={selecionadoCanalKey}
              onSelecionar={selecionarCardCanal}
              agora={agora}
              busca={busca}
            />
          )}
          {canal === "comanda" && (
            <PdvCanalGrid
              canal="comanda"
              itens={filtrarCards(cardsComanda)}
              selecionadoKey={selecionadoCanalKey}
              onSelecionar={selecionarCardCanal}
              agora={agora}
              busca={busca}
            />
          )}
          {canal === "pedido" && (
            <PdvCanalGrid
              canal="pedido"
              itens={filtrarCards(cardsPedido)}
              selecionadoKey={selecionadoCanalKey}
              onSelecionar={selecionarCardCanal}
              agora={agora}
              busca={busca}
            />
          )}
        </main>

        {/* Pagamento — aba mobile + coluna direita desktop */}
        <PdvPaymentPanel
          totalConta={totalSel}
          totalCobrar={totalCobrar}
          subtotal={subtotalSel}
          taxaServico={taxaValorSel}
          taxaPct={taxaPct}
          taxaRemovida={taxaRemovida}
          acrescimo={acrescimoSel}
          descontoManual={descontoManualSel}
          descontoCupom={descontoCupom}
          cupomAplicado={cupomSel}
          recebido={recebidoEfetivo}
          restante={restanteSel}
          troco={trocoSel}
          pagamentos={pagamentosSel}
          formasPagamento={formasComPontos}
          formaSelecionada={formaAtual}
          permiteTroco={trocoLiberado && !formaEhPontos}
          cliente={contaSel ? { nome: contaSel.cliente, telefone: contaSel.telefone } : null}
          saldoPontos={saldoPontos}
          pontosGanhar={pontosGanhar}
          fidelidadeAtiva={fidAtiva}
          mensagemCliente={avisoCliente || (contaSel && !clienteIdentificado
            ? { texto: "Cliente não identificado — sem pontos nesta compra", tom: "text-[var(--pp-text-muted)]" }
            : null)}
          onSelecionarForma={selecionarForma}
          onRemoverPagamento={removerPagamentoParcial}
          onDividir={() => setModal("dividir")}
          onIdentificarCliente={temConta ? () => setModal("identificar") : undefined}
          onAplicarCupom={aplicarCupom}
          onRemoverCupom={removerCupom}
          onPrevalidarCupom={prevalidarCupomDigitado}
          cupomLegenda={cupomLegenda}
          onAlterarAcrescimo={(v) => patchAjuste({ acrescimo: Math.max(0, Number(v) || 0) })}
          onAlterarDescontoManual={(v) => patchAjuste({ desconto: Math.max(0, Number(v) || 0) })}
          onToggleTaxaServico={() => patchAjuste({ taxaRemovida: !taxaRemovida })}
          cupomProcessando={cupomProcessando}
          dividirDesabilitado={!contaSel || restanteSel <= 0.001}
          onDigito={tecladoDigito}
          onLimpar={tecladoLimpar}
          onApagar={tecladoApagar}
          onValorTotal={lancarValorTotal}
          onConfirmar={registrarPagamentoParcial}
          confirmarDesabilitado={!contaSel || totalCobrar <= 0 || restanteSel <= 0.001}
          bufferEntrada={bufferEntrada}
          className={`${painelMobile === "pagamento" ? "flex min-h-0 flex-1" : "hidden"} min-w-0 overflow-hidden border-t lg:flex lg:w-[214px] lg:max-w-[214px] lg:shrink-0 lg:border-l lg:border-t-0 xl:w-[248px] xl:max-w-[248px] 2xl:w-[280px] 2xl:max-w-[280px]`}
        />
      </div>

      <PdvActionBar
        onFecharConta={abrirConfirmacao}
        podeFechar={podeFechar}
        fechando={processando}
        onTransferir={temConta && !contaSel.externo ? () => setModal("transferir") : undefined}
        onSeparar={temConta && !contaSel.externo && itensParaSeparar.length > 0 ? () => setModal("separar") : undefined}
        onImprimir={temConta ? imprimirPreConta : undefined}
        onComprovante={temConta ? emitirComprovanteMesa : undefined}
        onCozinha={temConta ? imprimirCuponsCozinha : undefined}
        onObservacoes={temConta ? () => setModal("observacoes") : undefined}
        onHistorico={temConta ? () => setModal("historico") : undefined}
      />

      <PdvStatusBar conexaoOk={conexaoOk} agora={agora} />

      {modal === "incluir" && (
        <ModalIncluirProduto
          products={products}
          onIncluir={incluirProduto}
          onFechar={() => setModal(null)}
          exigeComanda={produtosBloqueados}
          fidelidadeAtiva={fidAtiva}
          clienteIdentificado={clienteIdentificado}
          prefixoLoja={lojaInfo?.prefixo || ""}
          processando={acaoProcessando}
        />
      )}
      {modal === "cliente" && contaSel && (
        <ModalCliente
          cliente={contaSel.cliente}
          telefone={contaSel.telefone}
          onSalvar={salvarCliente}
          onFechar={() => setModal(null)}
          salvando={acaoProcessando}
        />
      )}
      {modal === "transferir" && contaSel && (
        <ModalTransferirMesa
          mesaAtual={contaSel.mesa}
          mesas={mesas}
          mesasOcupadas={mesasOcupadasNums}
          onConfirmar={confirmarTransferencia}
          onFechar={() => setModal(null)}
          processando={acaoProcessando}
        />
      )}
      {modal === "separar" && contaSel && (
        <ModalSepararItens
          itens={itensParaSeparar}
          mesas={mesas}
          mesaAtual={contaSel.mesa}
          mesasOcupadas={mesasOcupadasNums}
          onConfirmar={confirmarSeparacao}
          onFechar={() => setModal(null)}
          processando={acaoProcessando}
        />
      )}
      {excluirPendente && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Confirmar exclusão" className="w-full max-w-sm rounded-3xl border border-[var(--pp-border)] bg-white p-5 shadow-2xl">
            <h2 className="text-base font-black text-[var(--pp-text)]">Excluir produto?</h2>
            <p className="mt-2 text-sm font-semibold text-[var(--pp-text-body)]">
              Remover <strong className="text-[var(--pp-text)]">{excluirPendente.quantity}x {excluirPendente.name}</strong> desta conta?
              A exclusão será registrada na auditoria.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setExcluirPendente(null)} className="min-h-11 rounded-2xl border border-[var(--pp-border)] text-sm font-black text-[var(--pp-text-body)]">
                Cancelar
              </button>
              <button
                type="button"
                disabled={acaoProcessando}
                onClick={confirmarExclusaoItem}
                className="min-h-11 rounded-2xl border border-[var(--pp-danger)]/40 bg-[var(--pp-danger-soft)] text-sm font-black text-[var(--pp-danger)] disabled:opacity-60"
              >
                {acaoProcessando ? "Removendo…" : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
      {modal === "historico" && contaSel && (
        <ModalHistoricoMesa
          mesa={contaSel.mesa}
          pedidos={historicoMesaPedidos}
          onFechar={() => setModal(null)}
        />
      )}
      {ajudaAberta && (
        <PdvAjuda
          contexto={{
            nomeLoja: lojaInfo?.nome,
            formasPagamento: formasAtivas,
            fidelidadeAtiva: fidAtiva,
            pontosPorReal,
            valorPorPonto,
            totalMesas: mesasPainel.length,
            taxaServico: taxaPct,
          }}
          onFechar={() => setAjudaAberta(false)}
        />
      )}
      {modal === "identificar" && contaSel && (
        <ModalIdentificarCliente
          clientes={clientesComPontos}
          telefoneInicial={contaSel.telefone}
          nomeInicial={contaSel.cliente}
          pontosPorReal={pontosPorReal}
          onConfirmar={identificarCliente}
          onFechar={() => setModal(null)}
          salvando={acaoProcessando}
        />
      )}
      {modal === "dividir" && contaSel && (
        <ModalDividirConta
          total={totalCobrar}
          restante={restanteSel}
          itens={itensParaSeparar.map((it) => ({
            key: it.key,
            name: it.name,
            quantity: it.quantity,
            total: (Number(it.price) || 0) * (Number(it.quantity) || 0) * (1 + (taxaRemovida ? 0 : taxaPct) / 100),
          }))}
          onAplicar={(valor) => {
            setBufferEntrada(valor > 0 ? String(Math.round(valor * 100)) : "");
            setModal(null);
            setPainelMobile("pagamento");
            notify("success", `Valor de ${formatCurrency(valor)} pronto para receber. Escolha a forma e toque em OK.`);
          }}
          onFechar={() => setModal(null)}
        />
      )}
      {modal === "observacoes" && contaSel && (
        <ModalObservacoes
          mesa={contaSel.mesa}
          obsItens={obsItens}
          valorInicial={lerObsInterna(lojaInfo?.id, contaSel.mesa)}
          onSalvar={(texto) => {
            salvarObsInterna(lojaInfo?.id, contaSel.mesa, texto);
            notify("success", "Observação interna salva.");
            setModal(null);
          }}
          onFechar={() => setModal(null)}
        />
      )}

      {confirmarFinalizacao && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl border border-[var(--pp-border)] bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black text-[var(--pp-text)]">Confirmar fechamento</h2>
            <p className="mt-1 text-sm text-[var(--pp-text-body)]">
              {contaSel?.mesa} · {contaSel?.comandas?.join(", ")}
            </p>
            <div className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><strong>{formatCurrency(subtotalSel)}</strong></div>
              {taxaPct > 0 && (
                <div className={`flex justify-between ${taxaRemovida ? "text-[#012E46]" : ""}`}>
                  <span>{taxaRemovida ? `Taxa ${taxaPct}% (removida)` : `Taxa ${taxaPct}%`}</span>
                  <strong>{formatCurrency(taxaValorSel)}</strong>
                </div>
              )}
              {acrescimoSel > 0 && (
                <div className="flex justify-between text-[#1F7A3D]"><span>Acréscimo</span><strong>+{formatCurrency(acrescimoSel)}</strong></div>
              )}
              {descontoManualSel > 0 && (
                <div className="flex justify-between text-[var(--pp-danger)]"><span>Desconto</span><strong>−{formatCurrency(descontoManualSel)}</strong></div>
              )}
              {descontoCupom > 0 && (
                <div className="flex justify-between text-[#1F7A3D]"><span>Cupom {cupomSel?.codigo}</span><strong>−{formatCurrency(descontoCupom)}</strong></div>
              )}
              <div className="flex justify-between"><span>Total a pagar</span><strong>{formatCurrency(totalCobrar)}</strong></div>
              {pagamentosSel.map((p) => (
                <div key={p.id} className="flex justify-between text-[var(--pp-text-body)]">
                  <span>{p.forma}</span><strong>{formatCurrency(p.valor)}</strong>
                </div>
              ))}
              <div className="flex justify-between border-t border-[var(--pp-border)] pt-1.5"><span>Recebido</span><strong>{formatCurrency(recebidoEfetivo)}</strong></div>
              {trocoSel > 0 && (
                <div className="flex justify-between text-[var(--pp-primary-text)]"><span>Troco</span><strong>{formatCurrency(trocoSel)}</strong></div>
              )}
              {pontosGanhar > 0 && (
                <div className="flex justify-between text-[#1F7A3D]"><span>Pontos ao cliente</span><strong>{pontosGanhar}</strong></div>
              )}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmarFinalizacao(false)} className="min-h-11 rounded-2xl border border-[var(--pp-border)] text-sm font-black text-[var(--pp-text-body)]">
                Cancelar
              </button>
              <button type="button" onClick={confirmarEFinalizar} disabled={processando} className="btn-verde flex min-h-11 items-center justify-center gap-2 rounded-2xl text-sm font-black text-white disabled:opacity-60">
                {processando ? <IconSpinner /> : <IconCheck width={16} height={16} />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {sucesso && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div role="status" className="w-full max-w-sm rounded-3xl border border-[var(--pp-border)] bg-white p-6 text-center shadow-2xl">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--pp-success)] text-white">
              <IconCheck width={26} height={26} />
            </span>
            <h2 className="mt-3 text-xl font-black text-[var(--pp-text)]">Pagamento concluído</h2>
            <p className="text-sm text-[var(--pp-text-body)]">{sucesso.mesa}</p>
            <p className="mt-2 text-2xl font-black text-[var(--pp-text)]">{formatCurrency(sucesso.total)}</p>
            {sucesso.desconto > 0 && (
              <p className="text-xs font-bold text-[#1F7A3D]">Cupom {sucesso.cupom} · −{formatCurrency(sucesso.desconto)}</p>
            )}
            {sucesso.pontosGanhos > 0 && (
              <p className="text-xs font-bold text-[#1F7A3D]">Cliente ganhou {sucesso.pontosGanhos} pontos</p>
            )}
            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={() => imprimirComprovante(sucesso, sucesso.externo ? "entrega" : "completo")}
                className="btn-laranja flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black text-[#012E46]"
              >
                <IconImpressora width={16} height={16} />
                {sucesso.externo ? "Imprimir retirada / entrega" : "Imprimir comprovante completo"}
              </button>
              {!sucesso.externo && (
                <button
                  type="button"
                  onClick={() => imprimirComprovante(sucesso, "simplificado")}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--pp-border)] text-sm font-black text-[var(--pp-text-body)]"
                >
                  <IconImpressora width={16} height={16} /> Cupom simplificado do cliente
                </button>
              )}
              <button type="button" onClick={() => setSucesso(null)} className="min-h-11 w-full rounded-2xl border border-[var(--pp-border)] text-sm font-black text-[var(--pp-text-body)]">
                Voltar ao PDV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
