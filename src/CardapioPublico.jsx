import { useEffect, useMemo, useState } from "react";
import {
  fetchLojas, fetchProdutos, fetchCategorias,
  inserirPedido, atualizarPedido, escutarPedidos,
  buscarClientePorTelefone, upsertCliente,
} from "./lib/supabase";
import {
  ProdutoModal, formatCurrency, fallbackImage, statusMap, STATUS_TABLET_LABEL, isValidCommand,
} from "./App";

// ════════════════════════════════════════════════════════════
//  Cardápio digital PÚBLICO (cliente, externo) — ver + pedir + acompanhar
//  URL: /cardapio?e=PREFIXO[&mesa=NN][&c=COMANDA]
// ════════════════════════════════════════════════════════════
export default function CardapioPublico() {
  const params = new URLSearchParams(window.location.search);
  const prefixo  = (params.get("e") || "").toUpperCase();
  const mesaURL  = (params.get("mesa") || "").replace(/\D/g, "").slice(0, 2);
  const comURL   = (params.get("c") || "").toUpperCase();

  const [loja, setLoja]           = useState(undefined); // undefined=carregando, null=não achou
  const [produtos, setProdutos]   = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [orders, setOrders]       = useState([]);
  const [cat, setCat]             = useState("Todos");
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
  const [enviando, setEnviando]   = useState(false);
  const [msg, setMsg]             = useState(null);

  // Carrega empresa (por prefixo) + produtos + categorias
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [lojas, prods, cats] = await Promise.all([fetchLojas(), fetchProdutos(), fetchCategorias()]);
        if (!vivo) return;
        const l = lojas.find((x) => x.prefixo === prefixo) || null;
        setLoja(l);
        if (l) {
          setProdutos(prods.filter((p) => (p.lojaId == null || p.lojaId === l.id) && p.active));
          setCategorias(cats.filter((c) => (c.lojaId == null || c.lojaId === l.id) && c.active !== false));
        }
      } catch { if (vivo) setLoja(null); }
    })();
    return () => { vivo = false; };
  }, [prefixo]);

  // Realtime dos pedidos (acompanhamento)
  useEffect(() => {
    if (!loja) return;
    const off = escutarPedidos((all) => setOrders(all.filter((o) => o.lojaId === loja.id)));
    return () => off && off();
  }, [loja?.id]);

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); }, [msg]);

  const podeExterno = loja && (loja.modoUso === "externo" || loja.modoUso === "ambos");
  const cats = useMemo(() => ["Todos", ...categorias.map((c) => c.nome)], [categorias]);
  const itens = useMemo(() => {
    const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const termo = norm(busca);
    return produtos.filter((p) => {
      const catOk = cat === "Todos" || p.category === cat;
      const txt = norm(`${p.name} ${p.description} ${p.category} ${(p.ingredients || []).join(" ")}`);
      return catOk && (termo === "" || txt.includes(termo));
    });
  }, [produtos, cat, busca]);

  const telDig = telefone.replace(/\D/g, "");
  // Busca cliente pelo telefone (auto-carrega o nome no próximo pedido)
  useEffect(() => {
    if (!modoExterno || !loja || telDig.length < 10) { setClienteSalvo(false); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      const c = await buscarClientePorTelefone(loja.id, telDig);
      if (!vivo) return;
      if (c) { setCliente(c.nome); setClienteSalvo(true); } else { setClienteSalvo(false); }
    }, 500);
    return () => { vivo = false; clearTimeout(t); };
  }, [telDig, modoExterno, loja?.id]);

  const currentTable = mesa ? `Mesa ${String(mesa).padStart(2, "0")}` : "";
  const meusPedidos = modoExterno
    ? orders.filter((o) => telDig && o.clienteTelefone === telDig && o.paymentStatus !== "paid" && o.status !== "cancelled")
    : orders.filter((o) => o.table === currentTable && o.command === comanda && o.paymentStatus !== "paid" && o.status !== "cancelled");
  const subtotal = meusPedidos.reduce((s, o) => s + o.items.reduce((a, i) => a + i.price * i.quantity, 0), 0);
  const totalMesa = subtotal * 1.1;
  const totalCart = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const qtdCart = cart.reduce((s, i) => s + i.quantity, 0);
  const podeFechar = meusPedidos.length > 0 && meusPedidos.every((o) => o.status === "delivered");
  const contaSolicitada = meusPedidos.some((o) => o.paymentStatus === "requested");

  function addConfigurado(item) { setCart((c) => [...c, { ...item, _uid: Date.now() + Math.random() }]); setDetalhe(null); }
  function removerItem(uid) { setCart((c) => c.filter((i) => i._uid !== uid)); }

  async function enviar() {
    if (cart.length === 0) return;
    const itens = cart.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, selectedIngredients: i.selectedIngredients, removedIngredients: i.removedIngredients, extraIngredients: i.extraIngredients, observation: i.observation }));
    let novo;
    if (modoExterno) {
      // Pedido externo (link de divulgação): exige NOME + TELEFONE
      if (!cliente.trim()) return setMsg({ t: "error", m: "Informe o seu nome." });
      if (telDig.length < 10) return setMsg({ t: "error", m: "Informe um telefone válido (com DDD)." });
      setEnviando(true);
      try { await upsertCliente({ nome: cliente.trim(), telefone: telDig, lojaId: loja.id }); } catch {}
      novo = {
        id: `PED-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`,
        table: "Externo", command: `EXT-${telDig.slice(-6)}`, customer: cliente.trim(), clienteTelefone: telDig,
        status: "received", paymentStatus: "open",
        createdAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        items: itens, lojaId: loja.id,
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
      };
    }
    try { await inserirPedido(novo); setCart([]); setAba("conta"); setMsg({ t: "success", m: "✅ Pedido enviado para a cozinha!" }); }
    catch { setMsg({ t: "error", m: "Erro ao enviar o pedido. Tente novamente." }); }
    finally { setEnviando(false); }
  }

  async function solicitarConta() {
    if (!podeFechar) return setMsg({ t: "error", m: "Aguarde a entrega de todos os pedidos para solicitar a conta." });
    try { await Promise.all(meusPedidos.map((o) => atualizarPedido(o.id, { status_pagamento: "solicitado" }))); setMsg({ t: "success", m: "🧾 Conta solicitada ao caixa." }); }
    catch { setMsg({ t: "error", m: "Erro ao solicitar a conta." }); }
  }

  // ── Estados de carregamento/erro ───────────────────────────
  if (loja === undefined) return <Centro><Spinner /><p className="mt-3 text-sm text-slate-400">Carregando cardápio…</p></Centro>;
  if (loja === null) return <Centro><span className="text-5xl">🔍</span><p className="mt-3 font-black text-white">Empresa não encontrada</p><p className="mt-1 text-sm text-slate-500">Verifique o link/QR do cardápio.</p></Centro>;
  if (!podeExterno) return <Centro><span className="text-5xl">📵</span><p className="mt-3 font-black text-white">Cardápio externo indisponível</p><p className="mt-1 text-sm text-slate-500">Esta empresa não habilitou o cardápio digital para o cliente.</p></Centro>;

  const podeEnviar = cart.length > 0;
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" style={{ minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom) + 88px)" }}>
      {/* Cabeçalho */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-900/95 px-4 py-3 backdrop-blur-xl" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {loja.logoUrl ? <img src={loja.logoUrl} alt="" className="h-10 w-10 rounded-2xl object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/15 text-xl">🍽️</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black text-white leading-tight">{loja.nome}</p>
            <p className="text-xs text-slate-400">{currentTable ? `${currentTable}${comanda ? " · " + comanda : ""}` : "Cardápio digital"}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4">
        {/* Categorias */}
        <div className="sticky top-[64px] z-20 -mx-4 flex gap-2 overflow-x-auto border-b border-white/10 bg-slate-950/90 px-4 py-3 backdrop-blur">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold transition ${cat === c ? "border-blue-400 bg-blue-500 text-white" : "border-white/10 bg-white/[0.05] text-slate-300"}`}>{c}</button>
          ))}
        </div>

        {/* Busca */}
        <div className="py-3">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Buscar no cardápio…"
            className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-blue-400 placeholder:text-slate-500" />
        </div>

        {/* Grade de produtos */}
        <div className="grid gap-4 pb-6 sm:grid-cols-2">
          {itens.length === 0 && <p className="col-span-full py-10 text-center text-sm text-slate-500">Nenhum produto encontrado.</p>}
          {itens.map((item) => (
            <article key={item.id} className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-xl">
              <button onClick={() => setDetalhe(item)} className="relative block h-40 w-full overflow-hidden bg-slate-800 text-left">
                <img src={item.imageUrl || fallbackImage} alt={item.name} className="h-full w-full object-cover" />
                <span className="absolute bottom-2 left-2 rounded-2xl bg-black/60 px-3 py-1 text-base font-black text-white backdrop-blur-sm">{formatCurrency(item.price)}</span>
              </button>
              <div className="flex flex-1 flex-col p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-blue-400">{item.category}</p>
                <h3 className="mt-1 text-base font-black text-white leading-tight">{item.name}</h3>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{item.description}</p>
                <button onClick={() => setDetalhe(item)} className="mt-auto pt-3">
                  <span className="block w-full rounded-2xl bg-blue-500 py-3 text-center text-sm font-black text-white hover:bg-blue-400 transition">+ Adicionar</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>

      {/* Barra inferior fixa */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-900/95 backdrop-blur-xl" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-2 p-3">
          <button onClick={() => setAba("conta")} disabled={meusPedidos.length === 0}
            className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black text-slate-300 disabled:opacity-40">👁️ Acompanhar</button>
          <button onClick={() => setAba("carrinho")} disabled={cart.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3.5 text-sm font-black text-white disabled:opacity-40">
            🛒 {qtdCart > 0 ? `${qtdCart} item(ns) · ${formatCurrency(totalCart)}` : "Carrinho vazio"}
          </button>
        </div>
      </div>

      {/* Mensagem */}
      {msg && (
        <div className={`fixed inset-x-0 z-[120] flex justify-center px-4`} style={{ bottom: "96px" }}>
          <div className={`rounded-2xl border px-4 py-2.5 text-sm font-bold shadow-xl ${msg.t === "error" ? "border-red-400/30 bg-red-500/15 text-red-200" : "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"}`}>{msg.m}</div>
        </div>
      )}

      {/* Modal de produto (reutilizado) */}
      {detalhe && <ProdutoModal produto={detalhe} onFechar={() => setDetalhe(null)} onAdicionar={addConfigurado} />}

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
            // Pedido externo (link de divulgação) — nome + telefone obrigatórios
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label><span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-amber-500">⚠ Telefone (WhatsApp) *</span>
                  <input type="tel" inputMode="numeric" value={telefone} onChange={(e) => setTelefone(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="(DDD) número"
                    className="w-full rounded-2xl border border-amber-400/40 bg-slate-800 px-3 py-2.5 text-sm font-black text-white outline-none" /></label>
                <label><span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-amber-500">⚠ Seu nome *</span>
                  <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome completo"
                    className="w-full rounded-2xl border border-amber-400/40 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none" /></label>
              </div>
              {clienteSalvo && <p className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-200">✓ Cliente já cadastrado — bem-vindo(a) de volta, {cliente}!</p>}
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label><span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-amber-500">⚠ Mesa *</span>
                  <input type="tel" inputMode="numeric" value={mesa} onChange={(e) => setMesa(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Nº" disabled={!!mesaURL}
                    className="w-full rounded-2xl border border-amber-400/40 bg-slate-800 px-3 py-2.5 text-sm font-black text-white outline-none disabled:opacity-70" /></label>
                <label><span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-slate-500">Seu nome (opcional)</span>
                  <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome" className="w-full rounded-2xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none" /></label>
              </div>
              {!comURL && (
                <div className="mt-3"><span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-amber-500">⚠ Comanda *</span>
                  <input value={comanda} onChange={(e) => setComanda(e.target.value.toUpperCase())} placeholder={`Ex.: ${loja.prefixo}-000001`}
                    className="w-full rounded-2xl border border-amber-400/40 bg-slate-800 px-3 py-2.5 font-mono text-sm font-black tracking-widest text-white outline-none" />
                  <p className="mt-1 text-[11px] text-slate-500">Escaneie o QR Code da mesa ou digite a comanda.</p></div>
              )}
            </>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3"><span className="text-sm text-slate-400">Total</span><span className="text-xl font-black text-emerald-400">{formatCurrency(totalCart)}</span></div>
          <button onClick={enviar} disabled={!podeEnviar || enviando}
            className="mt-3 w-full rounded-2xl bg-emerald-500 py-4 text-sm font-black text-white hover:bg-emerald-400 transition active:scale-95 disabled:opacity-40">
            {enviando ? "Enviando…" : "🚀 Enviar pedido para a cozinha"}
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
                  <div className="mb-1.5 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-widest text-slate-500">{o.id} • {o.createdAt}</span>
                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusMap[o.status]?.chip}`}>{STATUS_TABLET_LABEL[o.status] || statusMap[o.status]?.label}</span></div>
                  {o.items.map((it, idx) => <div key={idx} className="flex justify-between text-sm py-0.5"><span className="text-slate-300"><b className="text-white">{it.quantity}×</b> {it.name}</span><span className="font-bold text-white">{formatCurrency(it.price * it.quantity)}</span></div>)}
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
                className={`mt-3 w-full rounded-2xl py-4 text-sm font-black text-white transition active:scale-95 disabled:opacity-40 ${contaSolicitada ? "bg-amber-500" : "bg-violet-500 hover:bg-violet-400"}`}>
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
function Gaveta({ titulo, onFechar, children }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl rounded-t-[2rem] border border-white/10 bg-slate-900 shadow-2xl" style={{ maxHeight: "88dvh" }}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><h2 className="text-lg font-black text-white">{titulo}</h2><button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300">Fechar ✕</button></div>
        <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: "calc(88dvh - 64px)" }}>{children}</div>
      </div>
    </div>
  );
}
