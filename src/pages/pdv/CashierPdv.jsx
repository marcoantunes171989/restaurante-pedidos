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
  rotuloMesa,
  rotuloStatusPedido,
  situacaoMesaVisual,
  statusPedidosConta,
  textoBuscaConta,
} from "./pdvHelpers";

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
  products = [],
  fidCaixa = null,
  atualizarClientePedidos = async () => {},
  transferirMesaPedidos = async () => {},
  separarItensPedidos = async () => {},
  notify = () => {},
}) {
  void caixaAberto;
  void fidCaixa;

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
  const [confirmarFinalizacao, setConfirmarFinalizacao] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [sucesso, setSucesso] = useState(null);
  const [bloqueioProdutos, setBloqueioProdutos] = useState({});
  const [modal, setModal] = useState(null); // null | incluir | cliente | transferir | separar | historico | observacoes | dividir
  const [acaoProcessando, setAcaoProcessando] = useState(false);
  // Mobile/tablet: Conta (produtos) | Salão | Pagar — abre em Conta (pedido em destaque).
  const [painelMobile, setPainelMobile] = useState("conta");
  const processandoRef = useRef(false);

  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(iv);
  }, []);

  const formasAtivas = useMemo(
    () => formasPagamento.filter((f) => f.active !== false && (f.nome || "").trim()),
    [formasPagamento],
  );
  const formaPadrao = useMemo(
    () => formasAtivas.find((f) => /dinheiro|espécie|especie/i.test(f.nome || "")) || formasAtivas[0] || null,
    [formasAtivas],
  );
  const formaAtual = formaSelecionada && formasAtivas.some((f) => f.id === formaSelecionada.id || f.nome === formaSelecionada.nome)
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
    const solicitadas = contasAbertas.filter((c) => c.solicitada);
    const urgente = [...solicitadas].sort((a, b) => new Date(a.aberturaISO || 0) - new Date(b.aberturaISO || 0))[0];
    return (urgente || contasAbertas[0])?.key || null;
  }, [selecionadaKey, contasAbertas, mesaLivreSel]);

  const contaSel = contasAbertas.find((c) => c.key === selecionadaEfetiva) || null;
  const pedidosSel = useMemo(() => {
    if (!contaSel) return [];
    return orders.filter((o) =>
      contaSel.comandas.includes(o.command) && o.paymentStatus !== "paid" && o.status !== "cancelled",
    );
  }, [orders, contaSel]);
  const subtotalSel = contaSel?.subtotal || 0;
  const totalSel = contaSel?.total || 0;
  const taxasSel = totalSel - subtotalSel;

  // Pagamento dividido: cada OK vira uma parcela; o painel cobra só o restante.
  const pagamentosSel = (contaSel && pagamentosPorConta[contaSel.key]) || [];
  const recebidoEfetivo = pagamentosSel.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const restanteSel = Math.max(0, totalSel - recebidoEfetivo);
  const trocoSel = Math.max(0, recebidoEfetivo - totalSel);
  const trocoLiberado = formaPermiteTroco(formaAtual);
  // Fechamento: exige o total coberto pelas parcelas registradas.
  const podeFechar = !!contaSel
    && formasAtivas.length > 0
    && totalSel > 0
    && recebidoEfetivo + 0.001 >= totalSel;

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
  const mesasDisponiveis = mesasPainel.filter((m) => m.status === "livre").length;
  const mesasOcupadas = new Set(contasAbertas.filter((c) => !c.externo).map((c) => c.mesa)).size;
  const pagamentoPendente = contasAbertas.filter((c) => c.solicitada || c.situacao === "pagamento").length;
  const pagamentoFinalizado = new Set(pagosHoje.filter((o) => !ehPedidoExterno(o)).map((o) => o.table)).size;

  const mesasOcupadasNums = useMemo(
    () => contasAbertas.filter((c) => !c.externo).map((c) => numeroMesaDe(c.mesa)).filter(Boolean),
    [contasAbertas],
  );

  function selecionarConta(conta, { manterCanal = false } = {}) {
    if (!conta) return;
    setSelecionadaKey(conta.key);
    setMesaLivreSel(null);
    setBufferEntrada("");
    if (!manterCanal) setCanal(conta.externo ? "delivery" : "mesa");
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
          statusChip: c.solicitada ? "bg-[#FBEFC4] text-[#8D6708]" : "bg-[#FCE8D4] text-[#B3600E]",
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
        row.statusChip = "bg-[#FBEFC4] text-[#8D6708]";
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
          statusChip: c.solicitada ? "bg-[#FBEFC4] text-[#8D6708]" : "bg-[#FCE8D4] text-[#B3600E]",
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
          statusChip: solicitado ? "bg-[#FBEFC4] text-[#8D6708]" : st.chip,
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
    const conta = contasAbertas.find((c) => c.comandas.includes(p.command) || c.pedidosIds?.includes(p.id));
    if (conta) selecionarConta(conta);
  }

  /**
   * Escolher a forma sugere o que falta receber — mas nunca sobrescreve um
   * valor já digitado ou calculado na divisão da conta.
   */
  function selecionarForma(forma) {
    setFormaSelecionada(forma);
    if (!bufferEntrada && restanteSel > 0) setBufferEntrada(String(Math.round(restanteSel * 100)));
    setPainelMobile("pagamento");
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
    setBufferEntrada((cur) => {
      const next = `${cur}${d}`.replace(/^0+(?=\d)/, "").slice(0, 9);
      const valor = Number(next || 0) / 100;
      if (!trocoLiberado && restanteSel > 0 && valor > restanteSel + 0.001) {
        return String(Math.round(restanteSel * 100));
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
    const digitado = Number(bufferEntrada || 0) / 100;
    const valor = digitado > 0 ? digitado : restanteSel;
    if (!(valor > 0)) {
      notify("error", "Informe um valor maior que zero.");
      return;
    }
    const aplicado = trocoLiberado ? valor : Math.min(valor, restanteSel);
    const parcela = {
      id: `pg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      forma: formaAtual.nome,
      formaId: formaAtual.id ?? null,
      valor: aplicado,
    };
    setPagamentosPorConta((cur) => ({ ...cur, [contaSel.key]: [...(cur[contaSel.key] || []), parcela] }));
    const novoRestante = Math.max(0, restanteSel - aplicado);
    setBufferEntrada(novoRestante > 0 ? String(Math.round(novoRestante * 100)) : "");
    notify("success", novoRestante > 0
      ? `${formaAtual.nome} · ${formatCurrency(aplicado)} recebido. Falta ${formatCurrency(novoRestante)}.`
      : `${formaAtual.nome} · ${formatCurrency(aplicado)} recebido. Conta quitada.`);
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
    if (!(valorPago > 0) || valorPago + 0.001 < totalSel) {
      notify("error", "Valor inválido para fechamento. Registre recebimentos que cubram o total.");
      return;
    }
    processandoRef.current = true;
    setProcessando(true);
    const contaKey = contaSel.key;
    const mesaFechada = contaSel.mesa;
    try {
      // Cada parcela vai como uma linha de detalhe — é assim que tab_pagamentos,
      // o movimento de caixa e o relatório por forma conseguem separar o split.
      const detalhes = pagamentosSel.map((p) => ({ forma: p.forma, valor: p.valor }));
      const info = {
        mesa: mesaFechada,
        total: totalSel,
        troco: trocoSel,
        detalhes,
        comandas: [...contaSel.comandas],
      };
      const baixa = await baixarComandas(contaSel.comandas, info);
      auditar("finalizar_pagamento", "comanda", null, {
        mesa: info.mesa,
        comandas: contaSel.comandas,
        total: totalSel,
        formas: detalhes.map((d) => d.forma),
      });
      setSucesso({
        ...info,
        subtotal: subtotalSel,
        taxa: taxasSel,
        codigo: `PAG-${Date.now().toString().slice(-8)}`,
        alertasEstoque: baixa?.alertas || [],
      });
      setConfirmarFinalizacao(false);
      setBufferEntrada("");
      setFormaSelecionada(null);
      setPagamentosPorConta((cur) => {
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

  function htmlCupom({ titulo, mesa, cliente, itensHtml, subtotal, taxas, total, rodape }) {
    const agoraD = new Date();
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${titulo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}@page{size:80mm auto;margin:0}
body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4mm 3mm;color:#000}
.c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:5px 0}
.row{display:flex;justify-content:space-between;gap:6px;margin:2px 0}
</style></head><body>
<div class="c b">${(lojaInfo?.nome || "PEDIDO PRIME").toUpperCase()}</div>
<div class="c">${titulo}</div>
<div class="sep"></div>
<div class="row"><span>${mesa || "—"}</span><span>${agoraD.toLocaleString("pt-BR")}</span></div>
<div class="row"><span>Cliente</span><span>${cliente || "—"}</span></div>
<div class="sep"></div>
${itensHtml}
<div class="sep"></div>
<div class="row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
<div class="row"><span>Taxas</span><span>${formatCurrency(taxas)}</span></div>
<div class="row b"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>
${rodape || ""}
<script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</scr` + `ipt>
</body></html>`;
  }

  function itensHtmlPedidos(pedidos) {
    return pedidos
      .flatMap((o) => (o.items || []).map((it) => `<div class="row"><span>${it.quantity}x ${it.name}</span><span>${formatCurrency(it.price * it.quantity)}</span></div>`))
      .join("");
  }

  function imprimirPreConta() {
    if (!contaSel || pedidosSel.length === 0) return;
    const janela = window.open("", "_blank", "width=400,height=640");
    if (!janela) return;
    janela.document.write(htmlCupom({
      titulo: "PRÉ-CONTA — SEM VALOR FISCAL",
      mesa: contaSel.mesa,
      cliente: contaSel.cliente,
      itensHtml: itensHtmlPedidos(pedidosSel),
      subtotal: subtotalSel,
      taxas: taxasSel,
      total: totalSel,
    }));
    janela.document.close();
  }

  /** Emite comprovante da mesa aberta e bloqueia inclusão de novos produtos. */
  function emitirComprovanteMesa() {
    if (!contaSel || pedidosSel.length === 0) {
      notify("error", "Selecione uma mesa com produtos para emitir o comprovante.");
      return;
    }
    const janela = window.open("", "_blank", "width=400,height=640");
    if (!janela) {
      notify("error", "Permita pop-ups para imprimir o comprovante.");
      return;
    }
    janela.document.write(htmlCupom({
      titulo: "COMPROVANTE DA MESA — NÃO FISCAL",
      mesa: contaSel.mesa,
      cliente: contaSel.cliente,
      itensHtml: itensHtmlPedidos(pedidosSel),
      subtotal: subtotalSel,
      taxas: taxasSel,
      total: totalSel,
      rodape: `<div class="sep"></div><div class="c b">COMPROVANTE EMITIDO</div><div class="c">Inclusão de produtos bloqueada</div>`,
    }));
    janela.document.close();
    setBloqueioProdutos((cur) => ({ ...cur, [contaSel.key]: true }));
    auditar("emitir_comprovante_mesa", "comanda", null, { mesa: contaSel.mesa, total: totalSel });
    notify("success", "Comprovante emitido. Inclusão de produtos bloqueada nesta conta.");
  }

  function imprimirComprovante(dados) {
    if (!dados) return;
    const j = window.open("", "_blank", "width=400,height=640");
    if (!j) return;
    j.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Comprovante</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}@page{size:80mm auto;margin:0}
body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4mm 3mm}
.c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:5px 0}
.row{display:flex;justify-content:space-between;gap:6px}
</style></head><body>
<div class="c b">${(lojaInfo?.nome || "PEDIDO PRIME").toUpperCase()}</div>
<div class="c">COMPROVANTE NÃO FISCAL</div>
<div class="sep"></div>
<div class="row"><span>${dados.mesa}</span><span>${dados.codigo}</span></div>
<div class="sep"></div>
<div class="row b"><span>TOTAL</span><span>${formatCurrency(dados.total)}</span></div>
${(dados.detalhes || []).map((d) => `<div class="row"><span>${d.forma}</span><span>${formatCurrency(d.valor)}</span></div>`).join("")}
${dados.troco > 0 ? `<div class="row b"><span>TROCO</span><span>${formatCurrency(dados.troco)}</span></div>` : ""}
<div class="sep"></div><div class="c b">PAGAMENTO CONFIRMADO</div>
<script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</scr` + `ipt>
</body></html>`);
    j.document.close();
  }

  async function alterarQtdItem(orderId, index, novaQtd) {
    if (produtosBloqueados) {
      notify("error", "Comprovante emitido — alteração de produtos bloqueada.");
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

  async function removerItem(orderId, index) {
    await alterarQtdItem(orderId, index, 0);
  }

  async function incluirProduto(produto) {
    if (produtosBloqueados) {
      notify("error", "Comprovante emitido — inclusão bloqueada.");
      return;
    }
    if (!pedidosSel.length) {
      notify("error", "Nenhum pedido aberto nesta conta.");
      return;
    }
    // Preferência: último pedido da conta (mais recente).
    const alvo = [...pedidosSel].sort((a, b) => new Date(b.createdAtISO || 0) - new Date(a.createdAtISO || 0))[0];
    const novo = itemDeProduto(produto);
    const itens = [...(alvo.items || [])];
    const mesmo = itens.findIndex((it) => it.name === novo.name && Number(it.price) === Number(novo.price) && !it.observation);
    if (mesmo >= 0) {
      itens[mesmo] = { ...itens[mesmo], quantity: (Number(itens[mesmo].quantity) || 0) + 1 };
    } else {
      itens.push(novo);
    }
    await editarItensPedido(alvo.id, itens);
    setModal(null);
    notify("success", `${produto.name} incluído na conta.`);
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
        setCanal("mesa");
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
  }, [confirmarFinalizacao, sucesso, contaSel, podeFechar, restanteSel, bufferEntrada, modal]);

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
          setCanal(c);
          if (c !== "mesa") setMesaLivreSel(null);
          setPainelMobile("salao");
        }}
        busca={busca}
        onBuscaChange={setBusca}
        onBuscar={executarBusca}
        currentUser={currentUser}
        temaClaro={temaClaro}
        onToggleTema={() => setTemaClaro((t) => !t)}
      />

      <PdvStatsBar
        agora={agora}
        mesasDisponiveis={mesasDisponiveis}
        mesasOcupadas={mesasOcupadas}
        pagamentoPendente={pagamentoPendente}
        pagamentoFinalizado={pagamentoFinalizado}
        faturamentoDia={faturamentoDia}
        ticketMedio={ticketMedio}
        contasAbertas={contasAbertas}
        pagosHoje={pagosHoje}
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
          total={totalSel}
          agora={agora}
          mesaLivre={mesaLivreSel}
          onEditarCliente={temConta ? () => setModal("cliente") : undefined}
          onIncluirProduto={temConta ? () => setModal("incluir") : undefined}
          onAlterarQtd={alterarQtdItem}
          onRemoverItem={removerItem}
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
              onSelecionar={selecionarDelivery}
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
          recebido={recebidoEfetivo}
          restante={restanteSel}
          troco={trocoSel}
          pagamentos={pagamentosSel}
          formasPagamento={formasAtivas}
          formaSelecionada={formaAtual}
          permiteTroco={trocoLiberado}
          onSelecionarForma={selecionarForma}
          onRemoverPagamento={removerPagamentoParcial}
          onDividir={() => setModal("dividir")}
          dividirDesabilitado={!contaSel || restanteSel <= 0.001}
          onDigito={tecladoDigito}
          onLimpar={tecladoLimpar}
          onApagar={tecladoApagar}
          onConfirmar={registrarPagamentoParcial}
          confirmarDesabilitado={!contaSel || totalSel <= 0 || restanteSel <= 0.001}
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
        onObservacoes={temConta ? () => setModal("observacoes") : undefined}
        onHistorico={temConta ? () => setModal("historico") : undefined}
      />

      <PdvStatusBar conexaoOk={conexaoOk} agora={agora} />

      {modal === "incluir" && (
        <ModalIncluirProduto
          products={products}
          onIncluir={incluirProduto}
          onFechar={() => setModal(null)}
          bloqueado={produtosBloqueados}
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
          onConfirmar={confirmarSeparacao}
          onFechar={() => setModal(null)}
          processando={acaoProcessando}
        />
      )}
      {modal === "historico" && contaSel && (
        <ModalHistoricoMesa
          mesa={contaSel.mesa}
          pedidos={historicoMesaPedidos}
          onFechar={() => setModal(null)}
        />
      )}
      {modal === "dividir" && contaSel && (
        <ModalDividirConta
          total={totalSel}
          restante={restanteSel}
          itens={itensParaSeparar.map((it) => ({
            key: it.key,
            name: it.name,
            quantity: it.quantity,
            total: (Number(it.price) || 0) * (Number(it.quantity) || 0) * (1 + taxaPct / 100),
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
              <div className="flex justify-between"><span>Total</span><strong>{formatCurrency(totalSel)}</strong></div>
              {pagamentosSel.map((p) => (
                <div key={p.id} className="flex justify-between text-[var(--pp-text-body)]">
                  <span>{p.forma}</span><strong>{formatCurrency(p.valor)}</strong>
                </div>
              ))}
              <div className="flex justify-between border-t border-[var(--pp-border)] pt-1.5"><span>Recebido</span><strong>{formatCurrency(recebidoEfetivo)}</strong></div>
              {trocoSel > 0 && (
                <div className="flex justify-between text-[var(--pp-primary-text)]"><span>Troco</span><strong>{formatCurrency(trocoSel)}</strong></div>
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
            <div className="mt-5 space-y-2">
              <button type="button" onClick={() => imprimirComprovante(sucesso)} className="btn-laranja flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black text-white">
                <IconImpressora width={16} height={16} /> Imprimir comprovante
              </button>
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
