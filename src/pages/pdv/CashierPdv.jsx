import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconImpressora, IconSpinner } from "../../components/PrimeIcons";
import PdvHeader from "./PdvHeader";
import PdvStatsBar from "./PdvStatsBar";
import PdvMesaDetail from "./PdvMesaDetail";
import PdvMesasGrid from "./PdvMesasGrid";
import PdvDeliveryStrip from "./PdvDeliveryStrip";
import PdvPaymentPanel from "./PdvPaymentPanel";
import PdvActionBar from "./PdvActionBar";
import PdvStatusBar from "./PdvStatusBar";
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
}) {
  void caixaAberto;
  void editarItensPedido;
  void products;
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
  const [confirmarFinalizacao, setConfirmarFinalizacao] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [sucesso, setSucesso] = useState(null);
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
  const configCrm = lojaInfo?.configCrm || {};

  // Contas abertas agrupadas (mesa interna / command externo) a partir dos pedidos reais
  const contasAbertas = useMemo(() => {
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
  }, [orders, taxaPct, clientes, configCrm]);

  // Contas finalizadas hoje (para grade + métricas)
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

  // Seleção efetiva: respeita a escolha do operador; se inválida/vazia, cai na
  // conta com fechamento solicitado (ou a primeira aberta) — sem setState em effect.
  const selecionadaEfetiva = useMemo(() => {
    if (selecionadaKey && contasAbertas.some((c) => c.key === selecionadaKey)) return selecionadaKey;
    // Prioriza fechamento solicitado com maior tempo aberto (mais urgente).
    const solicitadas = contasAbertas.filter((c) => c.solicitada);
    const urgente = [...solicitadas].sort((a, b) => new Date(a.aberturaISO || 0) - new Date(b.aberturaISO || 0))[0];
    return (urgente || contasAbertas[0])?.key || null;
  }, [selecionadaKey, contasAbertas]);

  const contaSel = contasAbertas.find((c) => c.key === selecionadaEfetiva) || null;
  const pedidosSel = contaSel
    ? orders.filter((o) => contaSel.comandas.includes(o.command) && o.paymentStatus !== "paid" && o.status !== "cancelled")
    : [];
  const subtotalSel = contaSel?.subtotal || 0;
  const totalSel = contaSel?.total || 0;
  const taxasSel = totalSel - subtotalSel;
  const falta = Math.max(0, totalSel - recebido);
  const aPagarAgora = totalSel;
  const podeFechar = !!contaSel && !!formaAtual && formasAtivas.length > 0 && recebido + 0.001 >= totalSel && totalSel > 0;

  // Grade do salão: mesas cadastradas na loja; se ainda não houver cadastro,
  // deriva só das mesas que aparecem nos pedidos atuais (sem inventar 01–20).
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

  // Métricas do turno — faturamento do dia usa o momento do pagamento (updatedAt)
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

  function selecionarConta(conta) {
    if (!conta) return;
    setSelecionadaKey(conta.key);
    setRecebido(0);
    setBufferEntrada("");
    setCanal(conta.externo ? "delivery" : "mesa");
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

  function executarBusca() {
    const q = busca.trim();
    if (!q) return;
    const qLower = q.toLowerCase();
    const soDigitos = q.replace(/\D/g, "");

    // Mesa por número
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

    // Telefone / cliente / pedido / comanda
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
    setBufferEntrada((cur) => (cur + d).replace(/^0+(?=\d)/, "").slice(0, 9));
  }
  function tecladoApagar() {
    setBufferEntrada((cur) => cur.slice(0, -1));
  }
  function tecladoLimpar() {
    setBufferEntrada("");
  }
  function tecladoConfirmar() {
    if (!bufferEntrada) {
      // Confirma recebimento do valor total na forma selecionada
      if (!contaSel || !formaAtual || totalSel <= 0) return;
      setRecebido(totalSel);
      return;
    }
    const valor = Number(bufferEntrada) / 100;
    setRecebido(valor);
    setBufferEntrada("");
  }

  function abrirConfirmacao() {
    if (!podeFechar || processandoRef.current) return;
    setConfirmarFinalizacao(true);
  }

  async function confirmarEFinalizar() {
    if (processandoRef.current || !contaSel) return;
    processandoRef.current = true;
    setProcessando(true);
    try {
      const troco = Math.max(0, recebido - totalSel);
      const detalhes = [{ forma: formaAtual?.nome || "Dinheiro", valor: recebido }];
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
      setSelecionadaKey(null);
    } finally {
      processandoRef.current = false;
      setProcessando(false);
    }
  }

  function imprimirPreConta() {
    if (!contaSel || pedidosSel.length === 0) return;
    const agoraD = new Date();
    const janela = window.open("", "_blank", "width=400,height=640");
    if (!janela) return;
    const itensHtml = pedidosSel
      .flatMap((o) => o.items.map((it) => `<div class="row"><span>${it.quantity}x ${it.name}</span><span>${formatCurrency(it.price * it.quantity)}</span></div>`))
      .join("");
    janela.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Pré-conta</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}@page{size:80mm auto;margin:0}
body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4mm 3mm;color:#000}
.c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:5px 0}
.row{display:flex;justify-content:space-between;gap:6px;margin:2px 0}
</style></head><body>
<div class="c b">${(lojaInfo?.nome || "PEDIDO PRIME").toUpperCase()}</div>
<div class="c">PRÉ-CONTA — SEM VALOR FISCAL</div>
<div class="sep"></div>
<div class="row"><span>${contaSel.mesa}</span><span>${agoraD.toLocaleString("pt-BR")}</span></div>
<div class="row"><span>Cliente</span><span>${contaSel.cliente || "—"}</span></div>
<div class="sep"></div>
${itensHtml}
<div class="sep"></div>
<div class="row"><span>Subtotal</span><span>${formatCurrency(subtotalSel)}</span></div>
<div class="row"><span>Taxas</span><span>${formatCurrency(taxasSel)}</span></div>
<div class="row b"><span>TOTAL</span><span>${formatCurrency(totalSel)}</span></div>
<script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</scr` + `ipt>
</body></html>`);
    janela.document.close();
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

  // Atalhos F2–F6
  useEffect(() => {
    function onKey(e) {
      if (confirmarFinalizacao || sucesso) {
        if (e.key === "Escape") {
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
  }, [confirmarFinalizacao, sucesso, contaSel, podeFechar, recebido, bufferEntrada]);

  const mostrarGrade = canal === "mesa";

  return (
    <div
      data-theme="light"
      className="tema-claro-area fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--pp-bg)]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <PdvHeader
        canal={canal}
        onCanalChange={setCanal}
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

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <PdvMesaDetail
          conta={contaSel}
          pedidos={pedidosSel}
          subtotal={subtotalSel}
          taxasDescontos={taxasSel}
          total={totalSel}
          agora={agora}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--pp-bg)] p-3 sm:p-4">
          {mostrarGrade ? (
            <PdvMesasGrid
              mesasPainel={mesasPainel}
              selecionadaKey={contaSel?.mesa}
              onSelecionar={selecionarMesaPainel}
              agora={agora}
            />
          ) : (
            <div className="mb-3 flex-1 overflow-y-auto">
              <h2 className="mb-2 text-sm font-black text-[var(--pp-text)]">Delivery em andamento</h2>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {deliveries.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selecionarDelivery(p)}
                    className={`rounded-xl border bg-[var(--pp-surface)] p-3 text-left transition ${
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

          <PdvDeliveryStrip
            pedidos={deliveries}
            selecionadoId={pedidosSel.find((o) => ehPedidoExterno(o))?.id}
            onSelecionar={selecionarDelivery}
          />
        </main>

        <PdvPaymentPanel
          totalConta={totalSel}
          aPagarAgora={aPagarAgora}
          recebido={recebido}
          falta={falta}
          formasPagamento={formasAtivas}
          formaSelecionada={formaAtual}
          onSelecionarForma={setFormaSelecionada}
          onDigito={tecladoDigito}
          onLimpar={tecladoLimpar}
          onApagar={tecladoApagar}
          onConfirmar={tecladoConfirmar}
          confirmarDesabilitado={!contaSel}
          bufferEntrada={bufferEntrada}
        />
      </div>

      <PdvActionBar
        onFecharConta={abrirConfirmacao}
        podeFechar={podeFechar}
        fechando={processando}
        onImprimir={contaSel ? imprimirPreConta : undefined}
        onComprovante={sucesso ? () => imprimirComprovante(sucesso) : undefined}
      />

      <PdvStatusBar conexaoOk={conexaoOk} agora={agora} />

      {confirmarFinalizacao && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl border border-[var(--pp-border)] bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black text-[var(--pp-text)]">Confirmar fechamento</h2>
            <p className="mt-1 text-sm text-[var(--pp-text-body)]">
              {contaSel?.mesa} · {contaSel?.comandas?.join(", ")}
            </p>
            <div className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span>Total</span><strong>{formatCurrency(totalSel)}</strong></div>
              <div className="flex justify-between"><span>Recebido ({formaAtual?.nome})</span><strong>{formatCurrency(recebido)}</strong></div>
              {recebido > totalSel && (
                <div className="flex justify-between text-[var(--pp-primary)]"><span>Troco</span><strong>{formatCurrency(recebido - totalSel)}</strong></div>
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
