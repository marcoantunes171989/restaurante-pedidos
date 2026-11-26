import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconImpressora } from "../../components/PrimeIcons";
import PdvHeader from "./PdvHeader";
import PdvStatsBar from "./PdvStatsBar";
import PdvMobileNav from "./PdvMobileNav";
import PdvMesaDetail from "./PdvMesaDetail";
import PdvMesasGrid from "./PdvMesasGrid";
import PdvCanalGrid from "./PdvCanalGrid";
import PdvDeliveryStrip from "./PdvDeliveryStrip";
import PdvPaymentPanel from "./PdvPaymentPanel";
import PdvPaletaFuncoes from "./PdvPaletaFuncoes";
import { catalogoFuncoes, teclaAbrePaleta } from "./pdvFuncoes";
import PdvPassos from "./PdvPassos";
import PdvPassoFechar from "./PdvPassoFechar";
import PdvBarraAcao from "./PdvBarraAcao";
import PdvModalAjuste from "./PdvModalAjuste";
import PdvFaixaTurno from "./PdvFaixaTurno";
import PdvStatusBar from "./PdvStatusBar";
import { useVersaoApp } from "../../lib/useVersaoApp";
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
import { produtoIdDoItem } from "../../lib/pedidoItem";
import { composicaoDaConta } from "../../lib/fiscal/vendaFiscal";
import { seloFiscalDaConta, PREVIA_FISCAL_PDV_ATIVA } from "../../lib/fiscal/seloFiscal";
import { emitirNotaDaVenda, EMISSAO_FISCAL_PDV_ATIVA, ambienteNfceDaLoja, ambienteNfeDaLoja, postarApiFiscal, dadosDaNotaNoCaixa, motivoSemNota, tipoDaNota, NOTA_VAZIA } from "../../lib/fiscal/emissaoPdv";
import { registrarVendaCaixa } from "../../lib/fiscal/vendaCaixa";
import { normalizarEntregaNfce } from "../../lib/fiscal/entregaNfce";
import { enderecoEmLinha } from "../../lib/enderecoEntrega";
import { useEnderecoDoPedido } from "../../hooks/useEnderecoDoPedido";
import { buscarEmitenteFiscal, buscarConfigFiscalVenda, configVendaParaSelo } from "../../lib/fiscal/fiscalApi";
import { useEnvioFiscalAutomatico } from "../../hooks/useEnvioFiscalAutomatico";
import { useAlertasFiscais } from "../../hooks/useAlertasFiscais";
import { listarDocumentosFiscais } from "../../lib/fiscal/notasFiscais";
import { comPrazo, guardarVendaPendente, listarVendasPendentes, marcarVendaPendente, removerVendaPendente, vendasParaAvisar } from "../../lib/fiscal/vendaPendenteNota";
import { AvisoFiscalPdv } from "../../components/fiscal/AlertasFiscais";
import { imprimirNotaFiscal as imprimirDanfe, abrirJanelaDeImpressao, fecharJanelaDeImpressao } from "../../lib/fiscal/imprimirNota";
import AvisoNotaFiscal from "../../components/fiscal/AvisoNotaFiscal";
import { cobraTaxaServico } from "../../lib/taxaServico";
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

// Defaults estáveis (evitam recalcular o selo fiscal a cada render).
const SEM_CTX_FISCAL = Object.freeze({});
const SEM_CONFIG_FISCAL = Object.freeze({});

function itemDeProduto(produto) {
  const preco = produto.precoPromocional != null ? Number(produto.precoPromocional) : Number(produto.price) || 0;
  // productId (aditivo): vínculo com o cadastro, base da nota fiscal.
  const productId = produtoIdDoItem({ productId: produto.id });
  return {
    ...(productId != null ? { productId } : {}),
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
  onSair,
  // Etapa 1c (fiscal): emitente da loja, contexto de regras e configuração de venda.
  emitenteFiscal = null,
  ctxFiscal = SEM_CTX_FISCAL,
  configFiscalVenda = SEM_CONFIG_FISCAL,
  supabase = null,
}) {
  const versaoApp = useVersaoApp();
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
  // Novo layout: paleta de funções (*), passo da conta (Produtos → Pagamento → Fechar), modal de ajuste (desconto/acréscimo/cupom) e resumo do turno.
  const [paletaAberta, setPaletaAberta] = useState(false);
  const [ajusteModal, setAjusteModal] = useState(null); // null | desconto | acrescimo | cupom
  const [turnoAberto, setTurnoAberto] = useState(false);
  const [ultimaNota, setUltimaNota] = useState(null); // { documentoId, numero } da última NFC-e emitida nesta sessão (função 33: reimprimir)
  const [passoState, setPassoState] = useState({ key: null, passo: 0 }); // o passo é por conta: ao trocar de conta volta ao 1º
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
  // Vendas pagas cuja NFC-e ainda não saiu (emissão interrompida ou com falha): ficam na fila do aparelho até a nota existir.
  const [vendasSemNotaVersao, setVendasSemNotaVersao] = useState(0);
  const [reemitindoSemNota, setReemitindoSemNota] = useState("");
  const vendasSemNota = useMemo(
    () => vendasParaAvisar(listarVendasPendentes(lojaInfo?.id), { agora: agora.getTime() }).filter((v) => !(sucesso && sucesso.codigo === v.codigo)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lojaInfo?.id, vendasSemNotaVersao, agora, sucesso],
  );
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
  // Retirada/entrega externa não tem taxa de serviço (o cliente viu o valor sem ela).
  const taxaRemovida = !!ajusteSel.taxaRemovida || !cobraTaxaServico(contaSel?.mesa);
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

  // Etapa 1c — selo "Nota fiscal" (só prévia; null quando a loja não emite nota).
  const seloFiscal = useMemo(() => seloFiscalDaConta({
    ativo: PREVIA_FISCAL_PDV_ATIVA,
    emitente: emitenteFiscal,
    pedidos: pedidosSel,
    produtos: products,
    composicao: composicaoDaConta({
      subtotal: subtotalSel, taxaServico: taxaValorSel, acrescimo: acrescimoSel,
      descontoManual: descontoManualSel, descontoCupom,
    }),
    pagamentos: (contaSel && pagamentosPorConta[contaSel.key]) || [],
    formas: formasPagamento,
    config: configFiscalVenda,
    ctxFiscal,
  }), [emitenteFiscal, pedidosSel, products, subtotalSel, taxaValorSel, acrescimoSel, descontoManualSel, descontoCupom, contaSel, pagamentosPorConta, formasPagamento, configFiscalVenda, ctxFiscal]);

  // E8: nota fiscal da venda (CPF/CNPJ na nota e NF-e para empresa).
  // Os dados digitados valem só para a conta em que foram digitados: CPF e endereço de um cliente não passam para outra conta.
  const [notaState, setNotaState] = useState({ key: null, valor: NOTA_VAZIA });
  const chaveDaNota = contaSel?.key ?? null;
  const notaCaixa = notaState.key === chaveDaNota ? notaState.valor : NOTA_VAZIA;
  const setNotaCaixa = (valor) => setNotaState({ key: chaveDaNota, valor });
  const nfceNaLoja = EMISSAO_FISCAL_PDV_ATIVA && !!supabase && !!ambienteNfceDaLoja(emitenteFiscal);
  const nfeNaLoja = EMISSAO_FISCAL_PDV_ATIVA && !!supabase && !!ambienteNfeDaLoja(emitenteFiscal);
  // NFC-e de entrega a domicílio: só quando a loja ligou em Fiscal › Emissão (migration 206).
  const entregaNaLoja = nfceNaLoja && normalizarEntregaNfce(configFiscalVenda?.entregaNfce).ativo;
  // Endereço que o cliente informou no cardápio. Em pagamento de várias entregas juntas não vale (são clientes diferentes).
  const enderecoDoPedido = useEnderecoDoPedido(supabase, contaSel?.multiPagamento ? [] : pedidosSel);
  // E9 parte 2: alertas fiscais (prazos, rejeitadas, certificado) no topo do PDV.
  const alertasFiscaisPdv = useAlertasFiscais({ supabase, lojaId: lojaInfo?.id ?? emitenteFiscal?.lojaId ?? null, ativo: nfceNaLoja || nfeNaLoja });
  // E8 parte 4: com o caixa aberto, envia sozinho as notas de contingência.
  useEnvioFiscalAutomatico({
    ativo: (nfceNaLoja || nfeNaLoja) && !!caixaAberto,
    lojaId: lojaInfo?.id ?? emitenteFiscal?.lojaId ?? null,
    buscar: (corpo) => postarApiFiscal(supabase, corpo),
    // U1: também tenta de novo as notas que ficaram reservadas sem envio.
    listarNotas: () => listarDocumentosFiscais(supabase, lojaInfo?.id ?? emitenteFiscal?.lojaId, { limite: 50 }),
    onResultado: (r) => {
      if (r.autorizadas) notify("success", `${r.autorizadas} nota(s) de contingência autorizada(s) pela SEFAZ.`);
      if (r.rejeitadas) notify("error", `${r.rejeitadas} nota(s) de contingência rejeitada(s): veja em Notas emitidas.`);
    },
  });

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

  const passo = contaSel && passoState.key === contaSel.key ? passoState.passo : 0;
  const setPasso = (n) => setPassoState({ key: contaSel?.key ?? null, passo: n });

  // F5 / função 50: com o total coberto leva ao passo Fechar; já no passo Fechar, fecha a conta (emite e imprime a NFC-e).
  function acionarFechar() {
    if (processandoRef.current) return;
    if (!contaSel) {
      notify("error", "Selecione uma conta para fechar.");
      return;
    }
    if (!podeFechar) {
      notify("error", `Ainda faltam ${formatCurrency(restanteSel)}. Registre o recebimento no teclado (OK).`);
      setPasso(1);
      return;
    }
    if (passo !== 2) { setPasso(2); return; }
    confirmarEFinalizar();
  }
  // Venda paga que ficou sem nota: emite de novo com os mesmos dados. A chave de idempotência vem dos pedidos: nunca duplica.
  async function emitirVendaSemNota(v) {
    if (reemitindoSemNota) return;
    setReemitindoSemNota(v.codigo);
    try {
      let emitente = emitenteFiscal;
      if (supabase && lojaInfo?.id != null && !(emitente && emitente.nfceHabilitada === true)) {
        try { const e = await buscarEmitenteFiscal(supabase, lojaInfo.id); if (e) emitente = e; } catch { /* segue com o que tem */ }
      }
      const n = await comPrazo(emitirNotaDaVenda({
        supabase, emitente, pedidos: v.pedidos, produtos: products, composicao: v.composicao, pagamento: v.pagamento, formas: formasPagamento,
        config: configFiscalVenda, ctxFiscal, modelo: v.modelo, cpf: v.cpf, destinatario: v.destinatario, entrega: v.entrega, entregaOpcoes: v.entregaOpcoes,
      }), 90000, () => ({ estado: "erro", titulo: "Nota fiscal pendente", detalhe: "A emissão demorou demais. Tente de novo." }));
      if (n.documentoId || ["autorizada", "contingencia"].includes(n.estado)) {
        removerVendaPendente(lojaInfo?.id, v.codigo);
        if (["autorizada", "contingencia"].includes(n.estado)) { setUltimaNota({ documentoId: n.documentoId, numero: n.numero ?? null }); notify("success", `${n.titulo}. Confira em Notas emitidas.`); }
        else notify("error", `${n.titulo}${n.detalhe ? `: ${n.detalhe}` : ""}. A nota está em Notas emitidas.`);
      } else {
        marcarVendaPendente(lojaInfo?.id, v.codigo, n.estado === "pendente" ? "pendente" : "erro", [n.titulo, n.detalhe].filter(Boolean).join(": "));
        notify("error", [n.titulo, n.detalhe].filter(Boolean).join(": "));
      }
      auditar("nota_fiscal_venda_reemitida", "comanda", null, { codigo: v.codigo, estado: n.estado, numero: n.numero ?? null });
    } catch {
      notify("error", "Não foi possível emitir agora. Tente de novo.");
    } finally {
      setReemitindoSemNota("");
      setVendasSemNotaVersao((x) => x + 1);
    }
  }
  function dispensarVendaSemNota(v) {
    if (typeof window !== "undefined" && !window.confirm("Dispensar este aviso? A venda continua paga, mas ficará SEM nota fiscal.")) return;
    removerVendaPendente(lojaInfo?.id, v.codigo);
    setVendasSemNotaVersao((x) => x + 1);
  }

  async function confirmarEFinalizar() {
    if (processandoRef.current || !contaSel) return;
    const valorPago = recebidoEfetivo;
    if (!(valorPago > 0) || valorPago + 0.001 < totalCobrar) {
      notify("error", "Valor inválido para fechamento. Registre recebimentos que cubram o total.");
      return;
    }
    // E8: confere o CPF/CNPJ (e a NF-e) antes de fechar; corrigir ou apagar o campo libera.
    const notaCx = nfceNaLoja || nfeNaLoja ? dadosDaNotaNoCaixa(notaCaixa, { nfceDisponivel: nfceNaLoja, nfeDisponivel: nfeNaLoja, entregaDisponivel: entregaNaLoja, ufEmitente: emitenteFiscal?.uf }) : { ok: true, modelo: 65, cpf: "", destinatario: null };
    if (!notaCx.ok) {
      notify("error", notaCx.erro);
      return;
    }
    processandoRef.current = true;
    setProcessando(true);
    // NFC-e: a janela de impressão abre AGORA (no clique, senão o navegador bloqueia) e imprime sozinha quando a SEFAZ autorizar.
    const janelaNota = nfceNaLoja && notaCx.modelo === 65 ? abrirJanelaDeImpressao() : null;
    if (nfceNaLoja && notaCx.modelo === 65 && !janelaNota) notify("error", "Permita pop-ups para a NFC-e imprimir sozinha. Use o botão Imprimir nota fiscal ao final.");
    let janelaNotaEmUso = false;
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
        // Composição completa da conta (aditivo) — base do rascunho da nota
        // fiscal (src/lib/fiscal/vendaFiscal.js). Não muda o que é cobrado.
        composicao: composicaoDaConta({
          subtotal: subtotalSel, taxaServico: taxaValorSel, acrescimo: acrescimoSel,
          descontoManual: descontoManualSel, descontoCupom,
        }),
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
      const codigoPagamento = `PAG-${Date.now().toString().slice(-8)}`;
      // E8: NFC-e da venda em segundo plano — nunca trava nem desfaz a venda.
      // Venda que não foi gravada no banco (baixa com erro) não gera nota fiscal: a nota só sai de venda registrada.
      // O cadastro fiscal em memória pode estar velho (a emissão foi ligada depois de abrir o caixa): se ele diz que a loja
      // não emite, relê do banco na hora da venda antes de decidir. É a leitura do banco que vale.
      const ehNfe = notaCx.modelo === 55;
      let emitenteVenda = emitenteFiscal;
      let configVenda = configFiscalVenda;
      const ambienteDe = (e) => (ehNfe ? ambienteNfeDaLoja(e) : ambienteNfceDaLoja(e));
      const balcao = notaCx.balcao === true; // o caixa escolheu Venda Balcão: nada de nota agora
      if (!balcao && EMISSAO_FISCAL_PDV_ATIVA && supabase && lojaInfo?.id != null && !ambienteDe(emitenteFiscal)) {
        try {
          const [e, c] = await Promise.all([buscarEmitenteFiscal(supabase, lojaInfo.id), buscarConfigFiscalVenda(supabase, lojaInfo.id)]);
          if (e) { emitenteVenda = e; configVenda = configVendaParaSelo(c); } // pagamentos mapeados depois de abrir o caixa também valem
        } catch { /* segue com o que tem */ }
      }
      // A nota sai sempre que o PAGAMENTO foi gravado (os pedidos constam como pagos): falha só em estoque/histórico/caixa não pode impedir a NFC-e.
      // Pagamento recusado (sem retorno) ou não gravado: nada de nota (nenhum número é reservado).
      const vendaGravada = !!baixa && typeof baixa === "object" && (!baixa.erro || baixa.pagamentoGravado === true);
      const emiteNota = !balcao && vendaGravada && EMISSAO_FISCAL_PDV_ATIVA && !!supabase && !!ambienteDe(emitenteVenda);
      // Emissão ligada no sistema mas esta venda não gerou nota: diz o motivo (antes ficava só o recibo antigo, em silêncio).
      const motivoSem = !balcao && !emiteNota && vendaGravada && EMISSAO_FISCAL_PDV_ATIVA && !!supabase ? motivoSemNota(emitenteVenda, { nfe: ehNfe }) : null;
      // Guarda o que foi cobrado (migration 208): a tela Venda Balcão emite a nota depois com estes valores, sem edição.
      if (vendaGravada && EMISSAO_FISCAL_PDV_ATIVA && supabase && lojaInfo?.id != null) {
        registrarVendaCaixa(supabase, {
          lojaId: lojaInfo.id, codigo: codigoPagamento, tipo: balcao ? "balcao" : ehNfe ? "nfe" : "nfce", mesa: mesaFechada,
          pedidos: pedidosSel, composicao: info.composicao, pagamento: { total: totalCobrar, troco: trocoSel, detalhes },
        }).then((r) => { if (!r.ok && balcao) notify("error", `A venda foi paga, mas não ficou guardada para emitir a nota depois: ${r.erro}`); });
      }
      setSucesso({
        ...info,
        notaFiscal: emiteNota ? { estado: "emitindo", titulo: "Emitindo nota fiscal…" }
          : balcao && vendaGravada ? { estado: "balcao", titulo: "Venda Balcão: sem nota fiscal", detalhe: "Para emitir depois, abra Fiscal › Venda Balcão." }
          : motivoSem ? { estado: "desligada", titulo: "Nota fiscal não emitida", detalhe: motivoSem } : null,
        subtotal: subtotalSel,
        taxa: taxaValorSel,
        acrescimo: acrescimoSel,
        descontoManual: descontoManualSel,
        pontosGanhos: pontosGanhar,
        codigo: codigoPagamento,
        alertasEstoque: baixa?.alertas || [],
        cliente: contaSel.cliente || "",
        telefone: contaSel.telefone || "",
        aberturaISO: contaSel.aberturaISO || null,
        externo: !!contaSel.externo,
        itens: pedidosSel.flatMap((o) => o.items || []),
        tipoEntrega: /entreg/i.test(contaSel.mesa || "") ? "entrega" : "retirada",
        // Comprovante de entrega: vale o endereço conferido pelo operador na nota; sem ele, o informado no pedido.
        endereco: enderecoEmLinha(notaCx.entrega ? notaCx.destinatario?.ender : enderecoDoPedido),
      });
      if (emiteNota) {
        const atualizarNota = (n) => setSucesso((cur) => (cur && cur.codigo === codigoPagamento ? { ...cur, notaFiscal: n } : cur));
        janelaNotaEmUso = true;
        const lojaIdFila = lojaInfo?.id ?? null;
        guardarVendaPendente(lojaIdFila, {
          codigo: codigoPagamento, total: totalCobrar, mesa: mesaFechada, pedidos: pedidosSel, composicao: info.composicao,
          pagamento: { total: totalCobrar, troco: trocoSel, detalhes }, cpf: notaCx.cpf, modelo: notaCx.modelo, destinatario: notaCx.destinatario, entrega: notaCx.entrega, entregaOpcoes: notaCx.entregaOpcoes,
        });
        setVendasSemNotaVersao((v) => v + 1);
        // A emissão nunca fica eternamente em "Emitindo…": passou do prazo, a venda segue na fila para emitir de novo (sem duplicar).
        comPrazo(emitirNotaDaVenda({
          supabase, emitente: emitenteVenda, pedidos: pedidosSel, produtos: products, composicao: info.composicao,
          pagamento: { total: totalCobrar, troco: trocoSel, detalhes }, formas: formasPagamento,
          config: configVenda, ctxFiscal, modelo: notaCx.modelo, cpf: notaCx.cpf, destinatario: notaCx.destinatario, entrega: notaCx.entrega, entregaOpcoes: notaCx.entregaOpcoes,
        }), 90000, () => ({ estado: "erro", titulo: "Nota fiscal pendente", detalhe: "A emissão demorou demais. A venda ficou em \"Venda sem nota fiscal\": use Emitir agora (não duplica a nota)." })).then((n) => {
          // A nota existe (ou o documento está reservado em Notas emitidas): sai da fila. Senão, a venda fica com o motivo.
          if (n.documentoId || ["autorizada", "contingencia", "fora"].includes(n.estado)) removerVendaPendente(lojaIdFila, codigoPagamento);
          else marcarVendaPendente(lojaIdFila, codigoPagamento, n.estado === "pendente" ? "pendente" : "erro", [n.titulo, n.detalhe].filter(Boolean).join(": "));
          setVendasSemNotaVersao((v) => v + 1);
          atualizarNota(n);
          if (n.documentoId && ["autorizada", "contingencia"].includes(n.estado)) setUltimaNota({ documentoId: n.documentoId, numero: n.numero ?? null });
          auditar("nota_fiscal_venda", "comanda", null, { mesa: mesaFechada, estado: n.estado, numero: n.numero ?? null });
          // Autorizada (ou em contingência): imprime a NFC-e na hora. Qualquer outro resultado fecha a janela e o aviso explica o motivo.
          if (janelaNota && n.documentoId && ["autorizada", "contingencia"].includes(n.estado)) {
            imprimirDanfe({ documentoId: n.documentoId, janela: janelaNota, buscar: (corpo) => postarApiFiscal(supabase, corpo) })
              .then((r) => { if (!r.ok) notify("error", r.erro); else auditar("imprimir_nota_fiscal", "comanda", null, { numero: n.numero ?? null, automatico: true }); });
          } else fecharJanelaDeImpressao(janelaNota);
        }).catch(() => {
          marcarVendaPendente(lojaIdFila, codigoPagamento, "erro", "Falha ao emitir a nota.");
          setVendasSemNotaVersao((v) => v + 1);
          atualizarNota({ estado: "erro", titulo: "Nota fiscal pendente", detalhe: "A venda ficou em \"Venda sem nota fiscal\": use Emitir agora." });
          fecharJanelaDeImpressao(janelaNota);
        });
      }
      setNotaCaixa(NOTA_VAZIA);
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
      if (!janelaNotaEmUso) fecharJanelaDeImpressao(janelaNota); // venda não emitiu nota (erro, recusa, loja sem emissão): não deixa janela em branco
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
          endereco: enderecoEmLinha(enderecoDoPedido),
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

  /** E8: DANFE NFC-e da venda (a janela abre no clique; os dados vêm do XML no servidor). */
  async function imprimirNotaFiscal(nota) {
    const r = await imprimirDanfe({ documentoId: nota.documentoId, buscar: (corpo) => postarApiFiscal(supabase, corpo) });
    if (!r.ok) notify("error", r.erro);
    else auditar("imprimir_nota_fiscal", "comanda", null, { numero: nota.numero ?? null });
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
        endereco: dados.endereco || "",
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
        productId: it.productId,
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
      // Paleta de funções: * (teclado numérico), F12 ou Ctrl+K. Com ela ou o modal de ajuste abertos, as demais teclas são deles.
      if (teclaAbrePaleta(e)) {
        e.preventDefault();
        if (!paletaAberta && !ajudaAberta && !modal && !ajusteModal && !sucesso && !excluirPendente) setPaletaAberta(true);
        return;
      }
      if (paletaAberta || ajusteModal) return;
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
      if (modal || sucesso) {
        if (e.key === "Escape") {
          setModal(null);
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
      } else if (e.key === "F5" && contaSel) {
        e.preventDefault();
        acionarFechar();
      } else if (e.key === "F6") {
        e.preventDefault();
        registrarPagamentoParcial();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Sem lista de dependências de propósito: o atalho (F5 = fechar conta etc.) tem de enxergar SEMPRE o estado atual. Com a lista
    // antiga ele usava um CPF/CNPJ velho (vazio) e a nota saía sem o documento do consumidor digitado no passo Fechar.
  });

  const temConta = !!contaSel;
  const emiteNotaTela = nfceNaLoja || nfeNaLoja;
  const tipoNotaTela = emiteNotaTela ? tipoDaNota(notaCaixa, { nfceDisponivel: nfceNaLoja, nfeDisponivel: nfeNaLoja }) : null;
  const abrirAdmin = (rota) => window.open(rota, "_blank", "noopener");
  const funcoesPdv = catalogoFuncoes({
    e: {
      temConta, externo: !!contaSel?.externo, contaMulti: !!contaSel?.multiPagamento, temItensParaSeparar: itensParaSeparar.length > 0,
      semRestante: restanteSel <= 0.001, taxaRemovida, semTaxa: !(taxaPct > 0), semPontos: !fidAtiva || !formasComPontos.some((f) => f.pontos),
      emiteNota: emiteNotaTela, nfeDisponivel: nfeNaLoja, temUltimaNota: !!ultimaNota,
    },
    a: {
      incluirProduto: () => setModal("incluir"),
      buscar: () => document.getElementById("pdv-busca-global")?.focus(),
      transferir: () => setModal("transferir"),
      separar: () => setModal("separar"),
      observacoes: () => setModal("observacoes"),
      historico: () => setModal("historico"),
      dividir: () => { setPasso(1); setModal("dividir"); },
      desconto: () => setAjusteModal("desconto"),
      acrescimo: () => setAjusteModal("acrescimo"),
      alternarTaxa: () => patchAjuste({ taxaRemovida: !taxaRemovida }),
      cupom: () => setAjusteModal("cupom"),
      pontos: () => { setPasso(1); const f = formasComPontos.find((x) => x.pontos); if (f) selecionarForma(f); },
      registrarParcial: () => { setPasso(1); registrarPagamentoParcial(); },
      identificarCliente: () => setModal("identificar"),
      cpfNaNota: () => { if (podeFechar) setPasso(2); else notify("error", "Receba o valor total primeiro: o CPF na nota é informado no passo Fechar."); },
      nfe: () => { if (podeFechar) setPasso(2); else notify("error", "Receba o valor total primeiro: a NF-e é informada no passo Fechar."); },
      preConta: imprimirPreConta,
      comprovante: emitirComprovanteMesa,
      cozinha: imprimirCuponsCozinha,
      reimprimirNfce: () => imprimirNotaFiscal({ documentoId: ultimaNota?.documentoId, numero: ultimaNota?.numero }),
      notasEmitidas: () => abrirAdmin("/admin/notas-fiscais"),
      cancelarNfce: () => abrirAdmin("/admin/cancelamento-nfce"),
      cancelarNfe: () => abrirAdmin("/admin/cancelamento-nfe"),
      xmls: () => abrirAdmin("/admin/xmls-fiscais"),
      fecharConta: acionarFechar,
      resumoTurno: () => setTurnoAberto(true),
      mesas: () => trocarCanal("mesa"),
      ajuda: () => setAjudaAberta(true),
      atalhos: () => setAjudaAberta(true),
    },
  });
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
      className="pdv-tema pdv-toque tema-claro-area fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--pp-surface)]"
      style={{
        height: "100dvh",
        maxHeight: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {versaoApp.desatualizada && (
        <div role="alert" data-testid="aviso-versao-desatualizada" className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-[#F8D9A8] bg-[#FEF3E2] px-3 py-2 text-[13px] font-semibold text-[#8A5200]">
          <span>Há uma versão nova do sistema (esta tela roda a {versaoApp.rodando}, a atual é a {versaoApp.publicada}). Correções, como a da nota fiscal, só valem depois de atualizar.</span>
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-[#012E46] px-3 py-1 text-[12px] font-black text-white">Atualizar agora</button>
          <span className="text-[11px] font-medium">Termine a venda em andamento antes de atualizar.</span>
        </div>
      )}
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
        onFuncoes={() => setPaletaAberta(true)}
        onSair={onSair}
      />

      {vendasSemNota.length > 0 && (
        <section role="alert" className="shrink-0 border-b border-[#B26A00]/30 bg-[#FFF5E5] px-3 py-2" data-testid="vendas-sem-nota">
          <p className="text-[12px] font-black text-[#8A5200]">Venda sem nota fiscal</p>
          <ul className="mt-1 space-y-1">
            {vendasSemNota.slice(0, 3).map((v) => (
              <li key={v.codigo} className="flex flex-wrap items-center gap-2 text-[12px] text-[#8A5200]">
                <span className="min-w-0 flex-1"><b>{formatCurrency(v.total)}</b>{v.mesa ? ` · ${v.mesa}` : ""} — {v.estado === "emitindo" ? "a emissão foi interrompida" : v.detalhe || "a nota não foi gerada"}</span>
                <button type="button" onClick={() => emitirVendaSemNota(v)} disabled={!!reemitindoSemNota} data-testid="emitir-venda-sem-nota" className="btn-laranja min-h-9 rounded-xl px-3 text-[12px] font-black text-[#012E46] disabled:opacity-60">{reemitindoSemNota === v.codigo ? "Emitindo…" : "Emitir agora"}</button>
                <button type="button" onClick={() => dispensarVendaSemNota(v)} disabled={!!reemitindoSemNota} className="min-h-9 rounded-xl border border-[#B26A00]/40 bg-white px-3 text-[12px] font-bold text-[#8A5200]">Dispensar</button>
              </li>
            ))}
          </ul>
          {vendasSemNota.length > 3 && <p className="mt-1 text-[11px] text-[#8A5200]">e mais {vendasSemNota.length - 3} venda(s) sem nota.</p>}
        </section>
      )}
      <PdvFaixaTurno
        agora={agora}
        faturamentoDia={faturamentoDia}
        ticketMedio={ticketMedio}
        mesasDisponiveis={mesasDisponiveis}
        pagamentoPendente={pagamentoPendente}
        nfceAtiva={nfceNaLoja || nfeNaLoja}
        alertasFiscais={alertasFiscaisPdv.length}
        aberta={turnoAberto}
        onAlternar={() => setTurnoAberto((v) => !v)}
      >
        <AvisoFiscalPdv alertas={alertasFiscaisPdv} />
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
      </PdvFaixaTurno>

      <PdvMobileNav
        ativo={painelMobile}
        onChange={setPainelMobile}
        temConta={temConta}
        totalLabel={temConta ? formatCurrency(totalSel) : ""}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Esquerda — escolher a conta: Mesa / Delivery / Comanda / Cliente / Pedido */}
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

        {/* Direita — a conta em 3 passos: Produtos → Pagamento → Fechar */}
        <section
          aria-label="Conta"
          data-testid="painel-conta"
          className={`${painelMobile === "salao" ? "hidden" : "flex min-h-0 flex-1"} min-w-0 flex-col overflow-hidden border-t border-[var(--pp-border)] bg-[var(--pp-surface)] lg:flex lg:w-[360px] lg:flex-none lg:border-l lg:border-t-0 xl:w-[420px]`}
        >
          <div className="shrink-0 border-b border-[var(--pp-border)] p-2">
            <PdvPassos
              passo={passo}
              onPasso={setPasso}
              desabilitado={!temConta}
              maxPasso={!temConta || !pedidosSel.some((o) => (o.items || []).length > 0) ? 0 : podeFechar ? 2 : 1}
            />
          </div>
          {passo === 0 && (
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
              enderecoEntrega={enderecoEmLinha(enderecoDoPedido)}
              onEditarCliente={temConta && !contaSel?.multiPagamento ? () => setModal("cliente") : undefined}
              onIncluirProduto={temConta && !contaSel?.multiPagamento ? () => setModal("incluir") : undefined}
              onAlterarQtd={contaSel?.multiPagamento ? undefined : alterarQtdItem}
              onRemoverItem={contaSel?.multiPagamento ? undefined : removerItem}
              produtosBloqueados={produtosBloqueados}
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            />
          )}
          {passo === 1 && (
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
              seloFiscal={seloFiscal}
              modoLimpo
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            />
          )}
          {passo === 2 && (
            <PdvPassoFechar
              pedidoComEndereco={enderecoDoPedido ? { endereco: enderecoDoPedido, cliente: contaSel?.cliente } : null}
              entregaConfig={configFiscalVenda?.entregaNfce}
              conta={contaSel}
              subtotal={subtotalSel}
              taxaPct={taxaPct}
              taxaRemovida={taxaRemovida}
              taxaValor={taxaValorSel}
              acrescimo={acrescimoSel}
              descontoManual={descontoManualSel}
              descontoCupom={descontoCupom}
              cupomCodigo={cupomSel?.codigo || ""}
              total={totalCobrar}
              pagamentos={pagamentosSel}
              recebido={recebidoEfetivo}
              troco={trocoSel}
              pontosGanhar={pontosGanhar}
              mostraNota={nfceNaLoja || nfeNaLoja}
              notaCaixa={notaCaixa}
              onNotaChange={setNotaCaixa}
              nfeDisponivel={nfeNaLoja}
              entregaDisponivel={entregaNaLoja}
              emiteNota={nfceNaLoja}
            />
          )}
        </section>
      </div>

      <PdvBarraAcao
        estado={{
          temConta, passo, temItens: pedidosSel.some((o) => (o.items || []).length > 0), restante: restanteSel, podeFechar,
          total: totalCobrar > 0 ? totalCobrar : totalSel,
          emiteNota: tipoNotaTela === "nfce" || tipoNotaTela === "nfe", nfe: tipoNotaTela === "nfe", balcao: tipoNotaTela === "balcao",
        }}
        fechando={processando}
        onFuncoes={() => setPaletaAberta(true)}
        onAcao={(a) => { if (a === "receber") setPasso(1); else if (a === "continuar") setPasso(2); else if (a === "fechar") confirmarEFinalizar(); }}
      />
      <PdvStatusBar conexaoOk={conexaoOk} agora={agora} versao={versaoApp.rodando} />

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

      <PdvPaletaFuncoes
        aberta={paletaAberta}
        funcoes={funcoesPdv}
        onFechar={() => setPaletaAberta(false)}
        onExecutar={(f) => { setPaletaAberta(false); f.executar(); }}
        onBloqueada={(txt) => notify("error", txt)}
      />
      {ajusteModal && (
        <PdvModalAjuste
          tipo={ajusteModal}
          valorAtual={ajusteModal === "desconto" ? descontoManualSel : ajusteModal === "acrescimo" ? acrescimoSel : 0}
          processando={cupomProcessando}
          onConfirmar={(v) => { if (ajusteModal === "cupom") aplicarCupom(v, () => setAjusteModal(null)); else { patchAjuste(ajusteModal === "desconto" ? { desconto: v } : { acrescimo: v }); setAjusteModal(null); } }}
          onRemover={() => { patchAjuste(ajusteModal === "desconto" ? { desconto: 0 } : { acrescimo: 0 }); setAjusteModal(null); }}
          onFechar={() => setAjusteModal(null)}
        />
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
            {sucesso.notaFiscal && sucesso.notaFiscal.estado !== "fora" && <AvisoNotaFiscal nota={sucesso.notaFiscal} onImprimir={imprimirNotaFiscal} />}
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
