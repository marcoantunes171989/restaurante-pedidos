import { useState, useEffect, useMemo } from "react";
import QRCode from "qrcode";

// ── Helpers ───────────────────────────────────────────────────
function gerarCodigo(prefixo = "CMD", numero) {
  return `${prefixo}-${String(numero).padStart(6, "0")}`;
}
async function gerarQR(texto) {
  return QRCode.toDataURL(texto, {
    width: 360, margin: 1,
    color: { dark: "#0f172a", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });
}

// ══════════════════════════════════════════════════════════════
//  Componente principal — duas abas: Gerar | Visualizar
// ══════════════════════════════════════════════════════════════
export function GeradorComandas({
  prefixoLoja = "CMD",
  empresa = "Restaurante",
  onGerar,
  comandasRegistradas = [],
  orders = [],           // pedidos da loja — para checar histórico
  onExcluirComanda,
  onRenomearComanda,
  onToggleComanda,
}) {
  const [aba, setAba] = useState("gerar"); // "gerar" | "visualizar"

  return (
    <div className="space-y-5">
      {/* Alternador de abas */}
      <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
        <button onClick={() => setAba("gerar")}
          className={`flex-1 rounded-xl py-2.5 text-sm font-black transition ${aba === "gerar" ? "bg-blue-500 text-white" : "text-slate-300 hover:bg-white/5"}`}>
          ⚡ Gerar novas comandas
        </button>
        <button onClick={() => setAba("visualizar")}
          className={`flex-1 rounded-xl py-2.5 text-sm font-black transition ${aba === "visualizar" ? "bg-emerald-500 text-white" : "text-slate-300 hover:bg-white/5"}`}>
          📋 Visualizar comandas ({comandasRegistradas.length})
        </button>
      </div>

      {aba === "gerar" && (
        <PainelGerar
          prefixoLoja={prefixoLoja}
          empresa={empresa}
          onGerar={onGerar}
        />
      )}
      {aba === "visualizar" && (
        <PainelVisualizar
          comandasRegistradas={comandasRegistradas}
          orders={orders}
          empresa={empresa}
          prefixoLoja={prefixoLoja}
          onExcluir={onExcluirComanda}
          onRenomear={onRenomearComanda}
          onToggle={onToggleComanda}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  Aba 1 — Gerar novas comandas (código existente mantido)
// ══════════════════════════════════════════════════════════════
function PainelGerar({ prefixoLoja, empresa, onGerar }) {
  const [nomeEmpresa, setNomeEmpresa] = useState(empresa);
  const [logoUrl, setLogoUrl]         = useState("");
  const [chamada, setChamada]         = useState("Escaneie e faça seu pedido");
  const [prefixo, setPrefixo]         = useState(prefixoLoja);
  const [inicio, setInicio]           = useState(1);
  const [quantidade, setQuantidade]   = useState(10);
  const [colunas, setColunas]         = useState(3);
  const [comandas, setComandas]       = useState([]);
  const [gerando, setGerando]         = useState(false);

  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600 transition";
  const lbl = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500";

  const [qrAmostra, setQrAmostra] = useState("");
  useEffect(() => {
    let ativo = true;
    gerarQR(gerarCodigo(prefixo || "CMD", inicio)).then((u) => { if (ativo) setQrAmostra(u); });
    return () => { ativo = false; };
  }, [prefixo, inicio]);

  async function gerar() {
    setGerando(true);
    const lista = [];
    for (let i = 0; i < quantidade; i++) {
      const codigo = gerarCodigo(prefixo, inicio + i);
      const qrUrl  = await gerarQR(codigo);
      lista.push({ codigo, qrUrl });
    }
    setComandas(lista);
    setGerando(false);
    if (lista[0]) setQrAmostra(lista[0].qrUrl);
    if (onGerar) onGerar(lista.map((c) => c.codigo));
  }

  function imprimir() { imprimirComandas(comandas, nomeEmpresa, logoUrl, chamada, colunas); }

  const codigoExemplo = gerarCodigo(prefixo || "CMD", inicio);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">Gerar comandas QR Code</h3>
          <p className="mt-0.5 text-sm text-slate-400">Gere e imprima comandas com a identidade da sua empresa.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={gerar} disabled={gerando || prefixo.length < 1}
            className="rounded-2xl bg-blue-500 px-6 py-3 text-sm font-black text-white hover:bg-blue-400 disabled:opacity-50 transition active:scale-95">
            {gerando ? "⏳ Gerando..." : "⚡ Gerar comandas"}
          </button>
          {comandas.length > 0 && (
            <button onClick={imprimir}
              className="rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-6 py-3 text-sm font-black text-emerald-200 hover:bg-emerald-500/25 transition active:scale-95">
              🖨️ Imprimir
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <h4 className="text-base font-black text-white">Identidade</h4>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><span className={lbl}>Nome da empresa</span><input value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} placeholder="Ex.: Pizzaria do Bairro" className={inp} /></div>
            <div className="sm:col-span-2"><span className={lbl}>Logo (URL — opcional)</span><input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://.../logo.png" className={inp} /></div>
            <div className="sm:col-span-2"><span className={lbl}>Chamada (rodapé)</span><input value={chamada} onChange={(e) => setChamada(e.target.value)} placeholder="Escaneie e faça seu pedido" className={inp} /></div>
          </div>
          <h4 className="mt-6 text-base font-black text-white">Numeração</h4>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><span className={lbl}>Prefixo</span><input value={prefixo} onChange={(e) => setPrefixo(e.target.value.toUpperCase().replace(/[^A-Z]/g,"").slice(0,5))} maxLength={5} className={`${inp} font-mono text-lg font-black tracking-widest`} /></div>
            <div><span className={lbl}>Número inicial</span><input type="number" min={1} max={999999} value={inicio} onChange={(e) => setInicio(Math.max(1,Number(e.target.value)))} className={inp} /></div>
            <div><span className={lbl}>Quantidade</span><input type="number" min={1} max={120} value={quantidade} onChange={(e) => setQuantidade(Math.min(120,Math.max(1,Number(e.target.value))))} className={inp} /></div>
            <div><span className={lbl}>Colunas</span><select value={colunas} onChange={(e) => setColunas(Number(e.target.value))} className={inp}><option value={2}>2 por linha</option><option value={3}>3 por linha (padrão)</option><option value={4}>4 por linha</option></select></div>
          </div>
          {comandas.length > 0 && (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
              {comandas.length} comanda(s) • <span className="font-mono font-bold text-slate-200">{comandas[0].codigo}</span> → <span className="font-mono font-bold text-slate-200">{comandas[comandas.length-1].codigo}</span>
            </p>
          )}
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <h4 className="mb-3 text-base font-black text-white">Modelo</h4>
          <div className="mx-auto w-full max-w-[240px] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl">
            <div className="h-1.5 w-full bg-blue-600" />
            <div className="flex flex-col items-center px-4 pb-4 pt-3 text-center">
              {logoUrl ? <img src={logoUrl} alt="logo" className="mb-1 h-11 w-11 rounded-lg object-contain" /> : null}
              <p className="text-[15px] font-black leading-tight">{nomeEmpresa || "Restaurante"}</p>
              <p className="text-[8px] font-bold uppercase tracking-[2px] text-slate-500">Comanda do cliente</p>
              <div className="my-2 h-[150px] w-[150px] overflow-hidden rounded-lg bg-slate-100">
                {qrAmostra ? <img src={qrAmostra} alt="qr" className="h-full w-full" /> : <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">QR</div>}
              </div>
              <p className="font-mono text-lg font-black tracking-widest">{codigoExemplo}</p>
              {chamada && <p className="mt-1 text-[10px] text-slate-500">{chamada}</p>}
            </div>
          </div>
        </div>
      </div>

      {comandas.length > 0 && (
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <h4 className="mb-4 text-base font-black text-white">Prévia ({comandas.length})</h4>
          <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {comandas.map(({ codigo, qrUrl }) => (
              <div key={codigo} className="flex flex-col items-center rounded-2xl border border-white/10 bg-slate-950/50 p-2.5 text-center">
                <img src={qrUrl} alt={codigo} className="h-20 w-20 rounded-lg bg-white p-1" />
                <p className="mt-1.5 font-mono text-[11px] font-black text-white">{codigo}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  Aba 2 — Visualizar / Reimprimir / Editar comandas existentes
// ══════════════════════════════════════════════════════════════
function PainelVisualizar({ comandasRegistradas, orders, empresa, prefixoLoja, onExcluir, onRenomear, onToggle }) {
  const [busca, setBusca]               = useState("");
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [editando, setEditando]         = useState(null);
  const [confirmExcluir, setConfirmExcluir] = useState(null);
  const [bloqueioExcluir, setBloqueioExcluir] = useState(null); // comanda com histórico

  // Conta pedidos vinculados a uma comanda
  const pedidosDaComanda = (codigo) => (orders || []).filter((o) => o.command === codigo);
  const temHistorico = (codigo) => pedidosDaComanda(codigo).length > 0;
  const [qrCache, setQrCache]           = useState({});    // codigo → dataUrl
  const [gerando, setGerando]           = useState(false);
  const [nomeEmpresa]                   = useState(empresa);
  const [chamada]                       = useState("Escaneie e faça seu pedido");

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? comandasRegistradas.filter((c) => c.codigo.toLowerCase().includes(t)) : comandasRegistradas;
  }, [comandasRegistradas, busca]);

  // Pré-gera QR somente para as comandas visíveis
  useEffect(() => {
    let ativo = true;
    const faltam = filtradas.filter((c) => !qrCache[c.codigo]).slice(0, 50);
    if (faltam.length === 0) return;
    (async () => {
      const novos = {};
      for (const c of faltam) {
        if (!ativo) break;
        novos[c.codigo] = await gerarQR(c.codigo);
      }
      if (ativo) setQrCache((prev) => ({ ...prev, ...novos }));
    })();
    return () => { ativo = false; };
  }, [filtradas]);

  function toggleSel(codigo) {
    setSelecionadas((s) => {
      const n = new Set(s);
      n.has(codigo) ? n.delete(codigo) : n.add(codigo);
      return n;
    });
  }
  function toggleTodos() {
    setSelecionadas((s) => s.size === filtradas.length ? new Set() : new Set(filtradas.map((c) => c.codigo)));
  }

  // Reimprimir selecionadas (ou todas se nenhuma selecionada)
  async function reimprimir() {
    const alvo = selecionadas.size > 0
      ? filtradas.filter((c) => selecionadas.has(c.codigo))
      : filtradas;
    if (alvo.length === 0) return;
    setGerando(true);
    const lista = [];
    for (const c of alvo) {
      const qrUrl = qrCache[c.codigo] || await gerarQR(c.codigo);
      lista.push({ codigo: c.codigo, qrUrl });
    }
    setGerando(false);
    imprimirComandas(lista, nomeEmpresa, "", chamada, 3);
  }

  // Reimprimir uma única comanda
  async function reimprimirUma(codigo) {
    const qrUrl = qrCache[codigo] || await gerarQR(codigo);
    imprimirComandas([{ codigo, qrUrl }], nomeEmpresa, "", chamada, 3);
  }

  const totalSel = selecionadas.size;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">Comandas registradas</h3>
          <p className="mt-0.5 text-sm text-slate-400">
            {comandasRegistradas.length} comanda(s) gerada(s) nesta empresa.
            {totalSel > 0 && <span className="ml-2 font-bold text-blue-300">{totalSel} selecionada(s)</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {totalSel > 0 && (
            <button onClick={() => setSelecionadas(new Set())}
              className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-xs font-black text-slate-300 hover:bg-white/10 transition">
              ✕ Limpar seleção
            </button>
          )}
          <button onClick={reimprimir} disabled={gerando || filtradas.length === 0}
            className="rounded-2xl bg-blue-500 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-400 disabled:opacity-50 transition active:scale-95">
            {gerando ? "⏳ Gerando..." : `🖨️ ${totalSel > 0 ? `Reimprimir ${totalSel}` : "Reimprimir todas"}`}
          </button>
        </div>
      </div>

      {/* Busca + lista */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar comanda pelo código..."
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-blue-400" />
        </div>

        {filtradas.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-4xl">🎫</p>
            <p className="mt-2 text-sm text-slate-500">
              {comandasRegistradas.length === 0 ? "Nenhuma comanda registrada. Gere as primeiras na aba ⚡ Gerar." : "Nenhuma comanda encontrada para esta busca."}
            </p>
          </div>
        )}

        {filtradas.length > 0 && (
          <>
            {/* Linha de seleção geral */}
            <div className="mb-3 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5">
              <input type="checkbox"
                checked={selecionadas.size === filtradas.length && filtradas.length > 0}
                onChange={toggleTodos}
                className="h-4 w-4 accent-blue-500" />
              <span className="text-xs font-bold text-slate-400">
                {selecionadas.size === filtradas.length ? "Desmarcar todas" : `Selecionar todas (${filtradas.length})`}
              </span>
            </div>

            {/* Grade de comandas */}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtradas.map((c) => {
                const sel = selecionadas.has(c.codigo);
                const qr  = qrCache[c.codigo];
                return (
                  <div key={c.codigo}
                    onClick={() => toggleSel(c.codigo)}
                    className={`group cursor-pointer rounded-2xl border p-3 transition ${sel ? "border-blue-400/50 bg-blue-500/10" : "border-white/10 bg-slate-950/40 hover:border-white/20 hover:bg-white/[0.04]"}`}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={sel} onChange={() => toggleSel(c.codigo)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 shrink-0 accent-blue-500" />
                      <div className="min-w-0 flex-1">
                        <div className="relative mb-1 inline-block">
                          {qr
                            ? <img src={qr} alt={c.codigo} className={`h-16 w-16 rounded-lg bg-white p-0.5 ${c.ativo === false ? "opacity-40 grayscale" : ""}`} />
                            : <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-800 text-[10px] text-slate-500">QR</div>
                          }
                          {c.ativo === false && (
                            <span className="absolute -bottom-1 left-0 right-0 text-center rounded-full bg-slate-700 px-1 py-0.5 text-[9px] font-black text-slate-300">INATIVA</span>
                          )}
                          {temHistorico(c.codigo) && (
                            <span title={`${pedidosDaComanda(c.codigo).length} pedido(s)`} className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-black text-white">
                              {pedidosDaComanda(c.codigo).length}
                            </span>
                          )}
                        </div>
                        <p className={`font-mono text-xs font-black ${c.ativo === false ? "text-slate-500 line-through" : "text-white"}`}>{c.codigo}</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => reimprimirUma(c.codigo)}
                          title="Reimprimir esta comanda"
                          className="rounded-xl border border-blue-400/20 bg-blue-500/10 p-2 text-blue-300 hover:bg-blue-500/20 transition">
                          🖨️
                        </button>
                        <button onClick={() => setEditando(c)}
                          title="Editar código"
                          className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-2 text-amber-300 hover:bg-amber-500/20 transition">
                          ✏️
                        </button>
                        {onToggle && (
                          <button
                            onClick={() => onToggle(c.codigo, c.ativo === false ? true : false)}
                            title={c.ativo === false ? "Reativar comanda" : "Inativar comanda"}
                            className={`rounded-xl border p-2 text-xs font-black transition ${c.ativo === false ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20" : "border-slate-400/20 bg-slate-500/10 text-slate-400 hover:bg-slate-500/20"}`}>
                            {c.ativo === false ? "▶️" : "⏸"}
                          </button>
                        )}
                        {onExcluir && (
                          <button
                            onClick={() => temHistorico(c.codigo) ? setBloqueioExcluir(c) : setConfirmExcluir(c)}
                            title={temHistorico(c.codigo) ? "Comanda com histórico — veja opções" : "Excluir comanda"}
                            className="rounded-xl border border-red-400/20 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20 transition">
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal editar comanda */}
      {editando && (
        <ModalEditarComanda
          comanda={editando}
          prefixoLoja={prefixoLoja}
          onSalvar={async (novoCode) => {
            if (onRenomear) await onRenomear(editando.codigo, novoCode);
            setEditando(null);
          }}
          onFechar={() => setEditando(null)}
        />
      )}

      {/* Confirm excluir (sem histórico) */}
      {confirmExcluir && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setConfirmExcluir(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div>
              <h2 className="text-lg font-black text-white">Excluir comanda?</h2>
              <p className="mt-1 text-sm text-slate-400">
                A comanda <span className="font-mono font-black text-white">{confirmExcluir.codigo}</span> será removida do sistema permanentemente.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmExcluir(null)} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10">Cancelar</button>
              <button onClick={async () => { await onExcluir?.(confirmExcluir.codigo); setConfirmExcluir(null); }}
                className="flex-[1.5] rounded-2xl bg-red-500 py-3 text-sm font-black text-white hover:bg-red-400 transition active:scale-95">
                🗑️ Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de bloqueio: comanda com histórico de pedidos */}
      {bloqueioExcluir && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setBloqueioExcluir(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-[2rem] border border-amber-400/20 bg-slate-900 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-amber-500/10 border-b border-amber-400/20 px-6 py-4 flex items-center gap-3">
              <span className="text-3xl">⚠️</span>
              <div>
                <h2 className="text-base font-black text-white">Comanda com histórico de pedidos</h2>
                <p className="text-xs text-amber-300/80">Exclusão bloqueada para preservar as referências</p>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-300">
                A comanda <span className="font-mono font-black text-amber-300">{bloqueioExcluir.codigo}</span> possui{" "}
                <span className="font-black text-white">{pedidosDaComanda(bloqueioExcluir.codigo).length} pedido(s)</span> registrado(s).
                Excluí-la quebraria o histórico financeiro e de pedidos.
              </p>

              {/* Resumo dos pedidos */}
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3 space-y-1.5 max-h-40 overflow-y-auto">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Pedidos vinculados</p>
                {pedidosDaComanda(bloqueioExcluir.codigo).slice(0, 10).map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-300">{o.id}</span>
                    <span className="text-slate-400">{o.table} · {o.createdAt}</span>
                    <span className={`rounded-full px-2 py-0.5 font-black ${o.paymentStatus === "paid" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                      {o.paymentStatus === "paid" ? "Pago" : "Em aberto"}
                    </span>
                  </div>
                ))}
                {pedidosDaComanda(bloqueioExcluir.codigo).length > 10 && (
                  <p className="text-xs text-slate-500 text-center">+ {pedidosDaComanda(bloqueioExcluir.codigo).length - 10} pedido(s)</p>
                )}
              </div>

              <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3">
                <p className="text-xs font-bold text-blue-300">💡 Recomendação</p>
                <p className="mt-0.5 text-xs text-slate-300">
                  Inative a comanda para que ela não aceite novos pedidos, mantendo o histórico intacto.
                  Você pode reativá-la a qualquer momento.
                </p>
              </div>
            </div>

            <div className="border-t border-white/10 px-6 py-4 flex gap-2">
              <button onClick={() => setBloqueioExcluir(null)}
                className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10">
                Cancelar
              </button>
              {onToggle && bloqueioExcluir.ativo !== false && (
                <button onClick={async () => { await onToggle?.(bloqueioExcluir.codigo, false); setBloqueioExcluir(null); }}
                  className="flex-[1.5] rounded-2xl bg-amber-500 py-3 text-sm font-black text-white hover:bg-amber-400 transition active:scale-95">
                  ⏸ Inativar comanda
                </button>
              )}
              {onToggle && bloqueioExcluir.ativo === false && (
                <button onClick={async () => { await onToggle?.(bloqueioExcluir.codigo, true); setBloqueioExcluir(null); }}
                  className="flex-[1.5] rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white hover:bg-emerald-400 transition active:scale-95">
                  ▶️ Reativar comanda
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal: editar código de uma comanda ──────────────────────
function ModalEditarComanda({ comanda, prefixoLoja, onSalvar, onFechar }) {
  const [codigo, setCodigo] = useState(comanda.codigo);
  const [qr, setQr]         = useState("");
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 font-mono font-black tracking-widest text-lg";
  const alterado = codigo.trim().toUpperCase() !== comanda.codigo;
  const valido   = /^[A-Z]{2,5}-\d{1,6}$/.test(codigo.trim().toUpperCase());

  useEffect(() => {
    const c = codigo.trim().toUpperCase();
    if (c) gerarQR(c).then(setQr);
  }, [codigo]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-500/15 text-lg">✏️</span>
            <h2 className="text-lg font-black text-white">Editar comanda</h2>
          </div>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">Código atual</p>
            <p className="font-mono text-base font-black text-slate-400">{comanda.codigo}</p>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-slate-500">Novo código *</p>
            <input value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder={`Ex.: ${prefixoLoja}-000001`}
              className={inp} />
            {!valido && codigo.trim() && (
              <p className="mt-1 text-xs text-amber-400">Formato: PREFIXO-NNNNNN (ex: {prefixoLoja}-000001)</p>
            )}
          </div>
          {/* Prévia do QR atualizado */}
          {qr && valido && (
            <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
              <img src={qr} alt={codigo} className="h-20 w-20 rounded-lg bg-white p-1 shrink-0" />
              <div>
                <p className="text-xs text-slate-500">Novo QR Code</p>
                <p className="font-mono text-sm font-black text-white">{codigo.trim().toUpperCase()}</p>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 px-6 py-4 flex gap-3">
          <button onClick={onFechar} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3.5 text-sm font-black text-slate-300 hover:bg-white/10">Cancelar</button>
          <button onClick={() => onSalvar(codigo.trim().toUpperCase())} disabled={!valido || !alterado}
            className="flex-[2] rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
            💾 Salvar novo código
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Impressão (reutilizada pelas duas abas) ──────────────────
function imprimirComandas(comandas, nomeEmpresa, logoUrl, chamada, colunas = 3) {
  if (comandas.length === 0) return;
  const logoTag = logoUrl ? `<img class="logo" src="${logoUrl}" alt="logo" />` : "";
  const cards = comandas.map(({ codigo, qrUrl }) => `
    <div class="card">
      <div class="top">${logoTag}<div class="emp">${nomeEmpresa||"Restaurante"}</div><div class="tag">Comanda do cliente</div></div>
      <img class="qr" src="${qrUrl}" alt="${codigo}" />
      <div class="num">${codigo}</div>
      <div class="cta">${chamada||""}</div>
    </div>`).join("");
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Comandas — ${nomeEmpresa}</title>
  <style>
    @page{size:A4;margin:8mm}*{box-sizing:border-box;margin:0;padding:0}
    body{background:#fff;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a}
    .grade{display:grid;grid-template-columns:repeat(${colunas},1fr);gap:8px}
    .card{position:relative;border:1.5px dashed #cbd5e1;border-radius:16px;padding:14px 10px 12px;display:flex;flex-direction:column;align-items:center;text-align:center;break-inside:avoid;page-break-inside:avoid;overflow:hidden}
    .card::before{content:"";position:absolute;top:0;left:0;right:0;height:6px;background:#2563eb}
    .top{display:flex;flex-direction:column;align-items:center;margin-top:4px}
    .logo{width:44px;height:44px;object-fit:contain;border-radius:10px;margin-bottom:4px}
    .emp{font-size:15px;font-weight:800;letter-spacing:.3px;line-height:1.1}
    .tag{font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:2.5px;margin-top:2px}
    .qr{width:150px;height:150px;margin:8px 0 6px}
    .num{font-family:'Courier New',monospace;font-size:18px;font-weight:800;letter-spacing:3px}
    .cta{font-size:9.5px;color:#475569;margin-top:5px}
  </style></head><body>
  <div class="grade">${cards}</div>
  <script>window.onload=function(){setTimeout(function(){window.print();},250)}<\/script>
  </body></html>`;
  const j = window.open("", "_blank");
  if (!j) return;
  j.document.write(html);
  j.document.close();
}
