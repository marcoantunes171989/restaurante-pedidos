import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconImpressora, IconSpinner } from "../../components/PrimeIcons";
import PdvHeader from "./PdvHeader";
import PdvStatsBar from "./PdvStatsBar";
import PdvMobileNav from "./PdvMobileNav";
import PdvMesaDetail from "./PdvMesaDetail";
import PdvMesasGrid from "./PdvMesasGrid";
import PdvDeliveryStrip from "./PdvDeliveryStrip";
import PdvPaymentPanel from "./PdvPaymentPanel";
import PdvActionBar from "./PdvActionBar";
import PdvStatusBar from "./PdvStatusBar";
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
  ehPedidoExterno,
  formatCurrency,
  lerConfigTaxaServico,
  nomeClienteDe,
  numeroMesaDe,
  orderTotal,
  rotuloMesa,
  situacaoMesaVisual,
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
  const [formaSelecionada, setFormaSelecionada] = useState(null);
  const [bufferEntrada, setBufferEntrada] = useState("");
  const [recebido, setRecebido] = useState(0);
  const [valorManual, setValorManual] = useState(false);
  const [confirmarFinalizacao, setConfirmarFinalizacao] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [sucesso, setSucesso] = useState(null);
  const [bloqueioProdutos, setBloqueioProdutos] = useState({});
  const [modal, setModal] = useState(null); // null | incluir | cliente | transferir | separar | historico | observacoes
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
      .map((m) => ({
        ...m,
        comandas: [...m.comandas],
        total: m.subtotal * (1 + taxaPct / 100),
        situacao: m.solicitada ? "solicitado" : m.pendentePreparo ? "entrega" : "pagamento",
      }))
      .filter((c) => c.total > 0.001)
      .sort((a, b) => new Date(a.aberturaISO || 0) - new Date(b.aberturaISO || 0));
  }, [orders, taxaPct, clientes, lojaInfo?.configCrm]);

  const contasFinalizadasHoje = useMemo(() => {
    const hoje = new Date();
    const mapa = {};
    orders.forEach((o) => {
      if (o.paymentStatus !== "paid" || o.status === "cancelled") return;
      const ref = o.updatedAtISO || o.createdAtISO;
      if (ref) {
        const d = new Date(ref);
        if (d.toDateString() !== hoje.toDateString()) return;
      }
      if (ehPedidoExterno(o)) return;
      const key = o.table || chaveConta(o);
      if (!mapa[key]) {
        mapa[key] = {
          key,
          mesa: o.table,
          comandas: [o.command],
          subtotal: 0,
          aberturaISO: o.createdAtISO || null,
          cliente: nomeClienteDe(o, clientes),
          situacao: "finalizada",
          paymentStatus: "paid",
          solicitada: false,
          pendentePreparo: false,
          externo: false,
        };
      }
      mapa[key].subtotal += orderTotal(o);
    });
    return Object.values(mapa).map((m) => ({ ...m, total: m.subtotal * (1 + taxaPct / 100) }));
  }, [orders, taxaPct, clientes]);

  const selecionadaEfetiva = useMemo(() => {
    if (selecionadaKey && contasAbertas.some((c) => c.key === selecionadaKey)) return selecionadaKey;
    const solicitadas = contasAbertas.filter((c) => c.solicitada);
    const urgente = [...solicitadas].sort((a, b) => new Date(a.aberturaISO || 0) - new Date(b.aberturaISO || 0))[0];
    return (urgente || contasAbertas[0])?.key || null;
  }, [selecionadaKey, contasAbertas]);

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
  // Sem edição manual: o valor acompanha o total da conta (ao escolher a forma).
  const recebidoEfetivo = (!valorManual && formaAtual && totalSel > 0) ? totalSel : recebido;
  const bufferEfetivo = (!valorManual && formaAtual && totalSel > 0)
    ? String(Math.round(totalSel * 100))
    : bufferEntrada;
  const falta = Math.max(0, totalSel - recebidoEfetivo);
  const aPagarAgora = totalSel;
  // Fechamento: exige forma, valor positivo e cobertura do total (troco ok).
  const podeFechar = !!contaSel
    && !!formaAtual
    && formasAtivas.length > 0
    && totalSel > 0
    && recebidoEfetivo > 0
    && recebidoEfetivo + 0.001 >= totalSel;

  const produtosBloqueados = !!(contaSel && bloqueioProdutos[contaSel.key]);

  const mesasPainel = useMemo(() => {
    const numerosCadastro = [...new Set(
      mesas
        .filter((m) => m.active !== false)
        .map((m) => Number(m.numero))
        .filter((n) => Number.isFinite(n) && n > 0),
    )].sort((a, b) => a - b);

    let numeros = numerosCadastro;
    if (!numeros.length) {
      const derivadas = new Set();
      orders.forEach((o) => {
        if (ehPedidoExterno(o) || o.status === "cancelled") return;
        const n = numeroMesaDe(o.table);
        if (n) derivadas.add(n);
      });
      numeros = [...derivadas].sort((a, b) => a - b);
    }

    return numeros.map((numero) => {
      const label = rotuloMesa(numero);
      const aberta = contasAbertas.find((c) => !c.externo && (c.mesa === label || numeroMesaDe(c.mesa) === numero));
      const finalizada = !aberta
        ? contasFinalizadasHoje.find((c) => c.mesa === label || numeroMesaDe(c.mesa) === numero)
        : null;
      const conta = aberta || finalizada || null;
      const status = situacaoMesaVisual(conta);
      return { key: label, numero, status, conta };
    });
  }, [mesas, orders, contasAbertas, contasFinalizadasHoje]);

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
  const mesasOcupadas = new Set(contasAbertas.filter((c) => !c.externo).map((c) => c.mesa)).size;
  const pagamentoPendente = contasAbertas.filter((c) => c.solicitada || c.situacao === "pagamento").length;
  const pagamentoFinalizado = new Set(pagosHoje.filter((o) => !ehPedidoExterno(o)).map((o) => o.table)).size;

  const mesasOcupadasNums = useMemo(
    () => contasAbertas.filter((c) => !c.externo).map((c) => numeroMesaDe(c.mesa)).filter(Boolean),
    [contasAbertas],
  );

  function selecionarConta(conta) {
    if (!conta) return;
    setSelecionadaKey(conta.key);
    setValorManual(false);
    setRecebido(0);
    setBufferEntrada("");
    setCanal(conta.externo ? "delivery" : "mesa");
    setModal(null);
    setPainelMobile("conta");
  }

  function selecionarMesaPainel(m) {
    if (m.conta && m.status !== "finalizada") {
      selecionarConta(m.conta);
      return;
    }
    if (m.conta && m.status === "finalizada") {
      setSelecionadaKey(null);
      return;
    }
    setSelecionadaKey(null);
  }

  function selecionarDelivery(p) {
    const conta = contasAbertas.find((c) => c.comandas.includes(p.command) || c.pedidosIds?.includes(p.id));
    if (conta) selecionarConta(conta);
  }

  function selecionarForma(forma) {
    setFormaSelecionada(forma);
    setValorManual(false);
    setBufferEntrada("");
    setRecebido(0);
    setPainelMobile("pagamento");
  }

  function executarBusca() {
    const q = busca.trim();
    if (!q) return;
    const qLower = q.toLowerCase();
    const soDigitos = q.replace(/\D/g, "");

    if (/^\d{1,3}$/.test(q) || /^mesa\s*\d+/i.test(q)) {
      const n = numeroMesaDe(q.includes("esa") ? q : `Mesa ${q}`);
      const label = rotuloMesa(n);
      const conta = contasAbertas.find((c) => c.mesa === label || numeroMesaDe(c.mesa) === n);
      if (conta) {
        selecionarConta(conta);
        setBusca("");
        return;
      }
    }

    const hit = orders.find((o) => {
      if (o.status === "cancelled") return false;
      const tel = String(o.clienteTelefone || "").replace(/\D/g, "");
      return (
        String(o.customer || "").toLowerCase().includes(qLower)
        || String(o.id || "").toLowerCase().includes(qLower)
        || String(o.command || "").toLowerCase().includes(qLower)
        || (soDigitos.length >= 4 && tel.includes(soDigitos))
        || String(o.table || "").toLowerCase().includes(qLower)
      );
    });
    if (hit) {
      const conta = contasAbertas.find((c) => c.comandas.includes(hit.command));
      if (conta) selecionarConta(conta);
      setBusca("");
    }
  }

  function tecladoDigito(d) {
    if (d === ",") return;
    setValorManual(true);
    setBufferEntrada((cur) => {
      const next = `${cur}${d}`.replace(/^0+(?=\d)/, "").slice(0, 9);
      setRecebido(Number(next || 0) / 100);
      return next;
    });
  }
  function tecladoApagar() {
    setValorManual(true);
    setBufferEntrada((cur) => {
      const next = cur.slice(0, -1);
      setRecebido(Number(next || 0) / 100);
      return next;
    });
  }
  function tecladoLimpar() {
    setValorManual(true);
    setBufferEntrada("");
    setRecebido(0);
  }
  function tecladoConfirmar() {
    if (!contaSel || !formaAtual) return;
    if (!bufferEntrada && !valorManual) {
      if (totalSel <= 0) return;
      // Confirma o total sugerido explicitamente no estado.
      setRecebido(totalSel);
      setBufferEntrada(String(Math.round(totalSel * 100)));
      setValorManual(true);
      return;
    }
    const raw = bufferEntrada || bufferEfetivo;
    const valor = Number(raw || 0) / 100;
    if (!(valor > 0)) {
      notify("error", "Informe um valor maior que zero.");
      return;
    }
    setRecebido(valor);
    setBufferEntrada(String(Math.round(valor * 100)));
    setValorManual(true);
  }

  function abrirConfirmacao() {
    if (!podeFechar || processandoRef.current) return;
    if (!(recebidoEfetivo > 0)) {
      notify("error", "Valor zerado ou negativo não é permitido no fechamento.");
      return;
    }
    setConfirmarFinalizacao(true);
  }

  async function confirmarEFinalizar() {
    if (processandoRef.current || !contaSel) return;
    const valorPago = recebidoEfetivo;
    if (!(valorPago > 0) || valorPago + 0.001 < totalSel) {
      notify("error", "Valor inválido para fechamento. Informe um valor positivo que cubra o total.");
      return;
    }
    processandoRef.current = true;
    setProcessando(true);
    try {
      const troco = Math.max(0, valorPago - totalSel);
      const detalhes = [{ forma: formaAtual?.nome || "Dinheiro", valor: valorPago }];
      const info = {
        mesa: contaSel.mesa,
        total: totalSel,
        troco,
        detalhes,
        comandas: [...contaSel.comandas],
      };
      const baixa = await baixarComandas(contaSel.comandas, info);
      auditar("finalizar_pagamento", "comanda", null, {
        mesa: info.mesa,
        comandas: contaSel.comandas,
        total: totalSel,
        formas: [formaAtual?.nome],
      });
      setSucesso({
        ...info,
        subtotal: subtotalSel,
        taxa: taxasSel,
        codigo: `PAG-${Date.now().toString().slice(-8)}`,
        alertasEstoque: baixa?.alertas || [],
      });
      setConfirmarFinalizacao(false);
      setRecebido(0);
      setBufferEntrada("");
      setValorManual(false);
      setSelecionadaKey(null);
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
        tecladoConfirmar();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmarFinalizacao, sucesso, contaSel, podeFechar, recebido, bufferEntrada, modal]);

  const mostrarGrade = canal === "mesa";
  const temConta = !!contaSel;

  return (
    <div
      data-theme="light"
      className="tema-claro-area fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--pp-bg)]"
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
        mesasOcupadas={mesasOcupadas}
        pagamentoPendente={pagamentoPendente}
        pagamentoFinalizado={pagamentoFinalizado}
        faturamentoDia={faturamentoDia}
        ticketMedio={ticketMedio}
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
          onEditarCliente={temConta ? () => setModal("cliente") : undefined}
          onIncluirProduto={temConta ? () => setModal("incluir") : undefined}
          onAlterarQtd={alterarQtdItem}
          onRemoverItem={removerItem}
          produtosBloqueados={produtosBloqueados}
          className={`${painelMobile === "conta" ? "flex min-h-0 flex-1" : "hidden"} border-b lg:flex lg:w-[300px] lg:shrink-0 lg:border-b-0 lg:border-r xl:w-[320px]`}
        />

        {/* Salão / delivery — aba mobile + centro desktop */}
        <main
          className={`${painelMobile === "salao" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--pp-bg)] p-3 sm:p-4 lg:flex`}
        >
          {mostrarGrade ? (
            <PdvMesasGrid
              mesasPainel={mesasPainel}
              selecionadaKey={contaSel?.mesa}
              onSelecionar={selecionarMesaPainel}
              agora={agora}
            />
          ) : (
            <div className="mb-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <h2 className="mb-2 text-sm font-black text-[var(--pp-text)]">Delivery em andamento</h2>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {deliveries.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selecionarDelivery(p)}
                    className={`min-h-[88px] rounded-xl border bg-[var(--pp-surface)] p-3 text-left transition active:scale-[0.99] ${
                      contaSel?.comandas?.includes(p.command)
                        ? "border-[var(--pp-primary)]"
                        : "border-[var(--pp-border)] hover:border-[var(--pp-primary)]/40"
                    }`}
                  >
                    <p className="text-xs font-black text-[var(--op-nav-accent)]">#{p.command}</p>
                    <p className="font-bold text-[var(--pp-text)]">{p.customer || "Cliente"}</p>
                    <p className="text-sm font-black">{formatCurrency(p.total)}</p>
                  </button>
                ))}
                {deliveries.length === 0 && (
                  <p className="col-span-full rounded-xl border border-dashed border-[var(--pp-border)] px-4 py-8 text-center text-sm text-[var(--pp-text-muted)]">
                    Nenhum pedido delivery aberto.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="hidden lg:block">
            <PdvDeliveryStrip
              pedidos={deliveries}
              selecionadoId={pedidosSel.find((o) => ehPedidoExterno(o))?.id}
              onSelecionar={selecionarDelivery}
            />
          </div>
          {/* No mobile, delivery strip só no canal delivery (já listado acima) ou canal mesa com strip compacto */}
          {canal === "mesa" && (
            <div className="lg:hidden">
              <PdvDeliveryStrip
                pedidos={deliveries}
                selecionadoId={pedidosSel.find((o) => ehPedidoExterno(o))?.id}
                onSelecionar={selecionarDelivery}
              />
            </div>
          )}
        </main>

        {/* Pagamento — aba mobile + coluna direita desktop */}
        <PdvPaymentPanel
          totalConta={totalSel}
          aPagarAgora={aPagarAgora}
          recebido={recebidoEfetivo}
          falta={falta}
          formasPagamento={formasAtivas}
          formaSelecionada={formaAtual}
          onSelecionarForma={selecionarForma}
          onDigito={tecladoDigito}
          onLimpar={tecladoLimpar}
          onApagar={tecladoApagar}
          onConfirmar={tecladoConfirmar}
          confirmarDesabilitado={!contaSel || totalSel <= 0}
          bufferEntrada={bufferEfetivo}
          valorExibido={recebidoEfetivo}
          className={`${painelMobile === "pagamento" ? "flex min-h-0 flex-1" : "hidden"} border-t lg:flex lg:w-[300px] lg:shrink-0 lg:border-l lg:border-t-0 xl:w-[320px]`}
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
              <div className="flex justify-between"><span>Recebido ({formaAtual?.nome})</span><strong>{formatCurrency(recebidoEfetivo)}</strong></div>
              {recebidoEfetivo > totalSel && (
                <div className="flex justify-between text-[var(--pp-primary)]"><span>Troco</span><strong>{formatCurrency(recebidoEfetivo - totalSel)}</strong></div>
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
