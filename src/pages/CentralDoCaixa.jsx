import { useMemo, useRef, useState } from "react";
import { formatCurrency } from "../App";
import OperationalBottomNav from "../components/OperationalBottomNav";
import { OperationalBrandLogo } from "../components/BrandLogo";

// Categoria só é usada para o badge/filtro visual — nunca decide o que a
// conta PODE fazer (pagar antecipado é sempre permitido, como já era).
// "aguardando" = ainda não paga e o pedido nem ficou pronto; "em_aberto" =
// não paga e já pronta (tab realmente "aberta" para fechar agora);
// "pago" = paymentStatus paid, aguardando confirmação de retirada.
function categoriaDe(o) {
  if (o.paymentStatus === "paid") return "pago";
  return o.status === "ready" ? "em_aberto" : "aguardando";
}

const CATEGORIA_META = {
  aguardando: { label: "Aguardando", badge: "border-[#F4D27A] bg-[#FFF7E0] text-[#9A6A00]" },
  em_aberto: { label: "Em aberto", badge: "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]" },
  pago: { label: "Pago", badge: "border-[#B7E4C7] bg-[#EAFBF2] text-[#16A34A]" },
};

const FILTROS = [
  { key: "todas", label: "Todas" },
  { key: "aguardando", label: "Aguardando" },
  { key: "em_aberto", label: "Em aberto" },
  { key: "pago", label: "Pagas" },
];

/* ── Header ──────────────────────────────────────────────────── */
function Header({ lojaInfo, usuarioNome, onFechar }) {
  return (
    <header className="flex items-center gap-3 rounded-[24px] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(16,24,40,.06)] sm:p-5">
      <OperationalBrandLogo />
      <div className="min-w-0 flex-1">
        <p className="page-title text-[20px] font-bold leading-tight text-[#182230]">Caixa</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[#667085]">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#16A34A] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#16A34A]" />
          </span>
          {lojaInfo?.nome || "Operação da loja"} · {usuarioNome || "Administrador"}
        </p>
      </div>
      {onFechar && (
        <button
          onClick={onFechar}
          aria-label="Sair da operação"
          className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-2xl border border-[#FCA5A5] bg-[#FFF1F2] px-4 text-xs font-black text-[#B91C1C] transition hover:bg-[#FEE2E2]"
        >
          ✕ Sair
        </button>
      )}
    </header>
  );
}

/* ── KPIs ────────────────────────────────────────────────────── */
function KpiCard({ icon, value, label, bar, iconBg, valueCls }) {
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(16,24,40,.06)]">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: bar }} aria-hidden="true" />
      <div className="flex items-center justify-between pl-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl text-base" style={{ background: iconBg }} aria-hidden="true">{icon}</span>
      </div>
      <p className={`page-title mt-3 pl-2 text-2xl font-bold ${valueCls}`}>{value}</p>
      <p className="pl-2 text-[11px] font-medium text-[#667085]">{label}</p>
    </div>
  );
}

function KpiGrid({ aguardandoCount, contasAbertasCount, totalReceber, faturadoHoje }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="relative overflow-hidden rounded-[20px] border border-[#F4D27A] p-4 shadow-[0_8px_24px_rgba(16,24,40,.06)]" style={{ background: "linear-gradient(140deg, #FAF9F5 0%, #FFF7E0 100%)" }}>
        <span className="absolute inset-y-0 left-0 w-1 bg-[#D9A441]" aria-hidden="true" />
        <div className="pl-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/70 text-base" aria-hidden="true">⏳</span></div>
        <p className="page-title mt-3 pl-2 text-2xl font-bold text-[#9A6A00]">{aguardandoCount}</p>
        <p className="pl-2 text-[11px] font-medium text-[#9A6A00]/80">Aguardando pagamento</p>
      </div>
      <KpiCard icon="📋" value={contasAbertasCount} label="Contas em aberto" bar="#2563EB" iconBg="#EFF6FF" valueCls="text-[#182230]" />
      <KpiCard icon="💰" value={formatCurrency(totalReceber)} label="Total a receber" bar="#16A34A" iconBg="#EAFBF2" valueCls="text-[#147A4A]" />
      <KpiCard icon="📈" value={formatCurrency(faturadoHoje)} label="Faturado hoje" bar="#E8622C" iconBg="#FDF1EC" valueCls="text-[#C9501F]" />
    </div>
  );
}

/* ── Toolbar (busca + chips) ─────────────────────────────────── */
function CaixaToolbar({ busca, onBusca, filtro, onFiltro, counts }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex min-w-[200px] flex-1 items-center gap-2.5 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
        <span aria-hidden="true" className="text-[#667085]">🔎</span>
        <input
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar por mesa, cliente ou pedido…"
          aria-label="Buscar por mesa, cliente ou pedido"
          className="w-full bg-transparent text-sm text-[#182230] outline-none placeholder:text-[#98A2B3]"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const ativo = filtro === f.key;
          const cnt = counts[f.key] ?? 0;
          return (
            <button
              key={f.key}
              onClick={() => onFiltro(f.key)}
              className={`flex min-h-[40px] items-center gap-2 rounded-2xl border px-3.5 text-sm font-bold transition ${
                ativo ? "border-transparent bg-[#E8622C] text-white" : "border-[#E5E7EB] bg-white text-[#475467] hover:bg-[#F9FAFB]"
              }`}
            >
              {f.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${ativo ? "bg-white/25 text-white" : "bg-[#F7F8FA] text-[#667085]"}`}>{cnt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Card de conta ───────────────────────────────────────────── */
function ContaCard({ o, totalCom, haTxt, numeroPedido, telMascarado, opcoes, pagando, onFinalizar, retirando, onRetirar }) {
  const [aberto, setAberto] = useState(false);
  const categoria = categoriaDe(o);
  const meta = CATEGORIA_META[categoria];
  const total = totalCom(o);
  const sub = Math.round((total / 1.1) * 100) / 100;
  const taxa = Math.round((total - sub) * 100) / 100;
  const pago = categoria === "pago";
  const externo = o.table === "Externo" || /^EXT-/.test(o.command || "");
  const [tableBase, tableSub] = String(o.table || "").split(" · ");
  const subtitulo = externo ? (tableSub || "Delivery/retirada") : (tableBase || o.table);

  // Estado do formulário de pagamento (múltiplas formas) — mesma lógica de
  // sempre, só que agora escondida atrás de "Receber" em vez de sempre visível.
  const [linhas, setLinhas] = useState([]);
  const soma = Math.round(linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0) * 100) / 100;
  const restante = Math.round((total - soma) * 100) / 100;
  const valido = linhas.length > 0 && linhas.every((l) => (Number(l.valor) || 0) > 0) && Math.abs(restante) < 0.01;
  const fmtMoeda = (n) => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const toggleForma = (f) => setLinhas((cur) => {
    if (cur.some((l) => l.forma === f)) return cur.filter((l) => l.forma !== f);
    const pagoAtual = cur.reduce((s, l) => s + (Number(l.valor) || 0), 0);
    const falta = Math.max(0, Math.round((total - pagoAtual) * 100) / 100);
    return [...cur, { forma: f, valor: falta }];
  });
  const editarValor = (f, raw) => setLinhas((cur) => cur.map((l) => l.forma === f ? { ...l, valor: parseInt(String(raw).replace(/\D/g, "") || "0", 10) / 100 } : l));

  const itensVisiveis = (o.items || []).slice(0, 3);
  const itensExtra = (o.items || []).length - itensVisiveis.length;

  return (
    <div className="group rounded-[20px] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(16,24,40,.06)] transition hover:-translate-y-[3px] hover:border-[#F4D27A] hover:shadow-[0_14px_40px_rgba(16,24,40,.10)]">
      <div className="flex items-start gap-3">
        <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-[#FFF7E0] text-lg" aria-hidden="true">{externo ? "🛵" : "🍽️"}</span>
        <div className="min-w-0 flex-1">
          <p className="page-title truncate text-sm font-bold text-[#182230]">Pedido #{numeroPedido[o.id] ?? "—"} · {o.customer || "Cliente"}</p>
          <p className="truncate text-xs text-[#667085]">{subtitulo}{haTxt(o) ? ` · ${haTxt(o)}` : ""}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${meta.badge}`}>{meta.label}</span>
      </div>

      <p className="mt-2 text-[10px] text-[#98A2B3]">{o.id}</p>
      {telMascarado(o.clienteTelefone) && <p className="mt-0.5 text-[11px] text-[#667085]">📞 {telMascarado(o.clienteTelefone)}</p>}

      <div className="mt-3 space-y-1 border-y border-dashed border-[#E7E5E4] py-2.5">
        {itensVisiveis.map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="font-bold text-[#E8622C]">{it.quantity}×</span>
            <span className="min-w-0 flex-1 truncate text-[#475467]">{it.name}</span>
          </div>
        ))}
        {itensExtra > 0 && <p className="text-xs font-semibold text-[#98A2B3]">+ {itensExtra} {itensExtra === 1 ? "item" : "itens"}</p>}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-[#667085]">Total</span>
        <span className="page-title text-[22px] font-bold text-[#182230]">{formatCurrency(total)}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => setAberto((v) => !v)}
          className="flex min-h-[44px] items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-sm font-bold text-[#475467] transition hover:bg-[#F9FAFB]"
        >
          Detalhes
        </button>
        {pago ? (
          <button
            onClick={() => onRetirar(o)}
            disabled={retirando}
            className="flex min-h-[44px] items-center justify-center rounded-xl bg-[#16A34A] text-sm font-black text-white transition active:scale-95 disabled:opacity-50"
          >
            {retirando ? "Confirmando…" : "✓ Retirada"}
          </button>
        ) : (
          <button
            onClick={() => setAberto(true)}
            className="flex min-h-[44px] items-center justify-center rounded-xl bg-[#E8622C] text-sm font-black text-white transition hover:bg-[#C9501F] active:scale-95"
          >
            Receber
          </button>
        )}
      </div>

      {aberto && (
        <div className="mt-3 space-y-2 rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-3">
          <div className="space-y-0.5">
            {(o.items || []).map((it, i) => (
              <div key={i} className="flex justify-between text-xs"><span className="text-[#475467]">{it.quantity}× {it.name}</span><span className="font-bold text-[#182230]">{formatCurrency(it.price * it.quantity)}</span></div>
            ))}
          </div>
          <div className="space-y-0.5 border-t border-[#E5E7EB] pt-2 text-xs">
            <div className="flex justify-between text-[#475467]"><span>Subtotal</span><span className="text-[#182230]">{formatCurrency(sub)}</span></div>
            <div className="flex justify-between text-[#475467]"><span>Taxa de serviço (10%)</span><span className="text-[#182230]">{formatCurrency(taxa)}</span></div>
            <div className="flex justify-between text-sm font-black"><span className="text-[#182230]">Total</span><span className="text-[#147A4A]">{formatCurrency(total)}</span></div>
          </div>

          {!pago && (
            <>
              <p className="pt-1 text-[10px] font-bold uppercase tracking-wide text-[#667085]">Forma(s) de pagamento</p>
              <div className="grid grid-cols-2 gap-1.5">
                {opcoes.map((f) => {
                  const on = linhas.some((l) => l.forma === f);
                  return (
                    <button
                      key={f}
                      onClick={() => toggleForma(f)}
                      className={`flex min-h-[40px] items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-center text-xs font-bold transition ${
                        on ? "border-[#D9A441] bg-[#D9A441] text-[#182230]" : "border-[#E5E7EB] bg-white text-[#475467] hover:bg-white"
                      }`}
                    >
                      {on && <span>✓</span>}<span className="truncate">{f}</span>
                    </button>
                  );
                })}
              </div>
              {linhas.length > 0 && (
                <div className="space-y-1.5">
                  {linhas.map((l) => (
                    <div key={l.forma} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#9A6A00]">{l.forma}</span>
                      <span className="shrink-0 text-xs text-[#667085]">R$</span>
                      <input
                        inputMode="numeric"
                        value={fmtMoeda(l.valor)}
                        onChange={(e) => editarValor(l.forma, e.target.value)}
                        aria-label={`Valor pago em ${l.forma}`}
                        className="w-24 shrink-0 rounded-lg border border-[#D0D5DD] bg-white px-2 py-1 text-right text-sm font-bold text-[#182230] outline-none focus:border-[#2563EB]"
                      />
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={Math.abs(restante) < 0.01 ? "font-bold text-[#147A4A]" : restante > 0 ? "font-bold text-[#9A6A00]" : "font-bold text-[#B42318]"}>
                      {Math.abs(restante) < 0.01 ? "Valor confere ✓" : restante > 0 ? `Falta ${formatCurrency(restante)}` : `Excede ${formatCurrency(-restante)}`}
                    </span>
                    <span className="text-[#667085]">Pago {formatCurrency(soma)} / {formatCurrency(total)}</span>
                  </div>
                </div>
              )}
              <button
                onClick={() => onFinalizar(o, linhas, total)}
                disabled={!valido || pagando}
                className="mt-1 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#16A34A] text-sm font-black text-white transition active:scale-95 disabled:cursor-not-allowed disabled:bg-[#E5E7EB] disabled:text-[#98A2B3]"
              >
                {pagando ? "Registrando…" : linhas.length === 0 ? "Selecione a forma de pagamento" : !valido ? "Confirme o valor" : "Finalizar pagamento"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Caixa (/operacional/caixa) — camada de apresentação apenas. Toda a lógica
 * (buscar/receber pagamento, confirmar retirada, formas de pagamento,
 * navegação, logout) é a mesma já existente em OperacaoMobileView; este
 * componente só recebe os dados prontos e formata a UI.
 */
export default function CentralDoCaixa({
  usuarioNome = "",
  lojaInfo,
  onFechar,
  navItems = [],
  onNavigate,
  contas = [],
  totalCom,
  formasPagamento = [],
  baixarComandas,
  confirmarRetirada = async () => {},
  haTxt,
  numeroPedido = {},
  telMascarado = () => "",
  faturadoHoje = 0,
}) {
  const [pagando, setPagando] = useState(null);
  const [retirando, setRetirando] = useState(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todas");
  // Trava síncrona (ref) contra clique duplo antes do re-render aplicar o "disabled".
  const pagandoIdsRef = useRef(new Set());

  async function retirar(o) {
    setRetirando(o.id);
    try { await confirmarRetirada(o.id); } catch { /* feedback já tratado no backend */ }
    setRetirando(null);
  }

  const opcoes = useMemo(() => {
    const vistos = new Set(); const out = [];
    formasPagamento.filter((f) => f.active !== false).forEach((f) => {
      const nome = (f.nome || "").trim(); const k = nome.toLowerCase();
      if (nome && !vistos.has(k)) { vistos.add(k); out.push(nome); }
    });
    return out.length ? out : ["Pix", "Cartão", "Dinheiro"];
  }, [formasPagamento]);

  async function finalizar(o, linhas, total) {
    if (pagandoIdsRef.current.has(o.id)) return; // trava contra clique duplo antes do re-render
    pagandoIdsRef.current.add(o.id);
    setPagando(o.id);
    try {
      const detalhes = linhas.map((l) => ({ forma: l.forma, valor: Number(l.valor) || 0 }));
      await baixarComandas([o.command], { forma: detalhes.map((d) => d.forma).join(" + "), total, valor: total, detalhes, mesa: o.table, lojaId: lojaInfo?.id }, { manterStatus: true, somenteId: o.id });
    } catch { /* feedback já tratado no backend */ }
    pagandoIdsRef.current.delete(o.id);
    setPagando(null);
  }

  const abertas = contas.filter((o) => o.paymentStatus !== "paid");
  const totalReceber = abertas.reduce((s, o) => s + totalCom(o), 0);
  const buscaNorm = busca.trim().toLowerCase();
  const bate = (o) => {
    if (!buscaNorm) return true;
    const alvo = [o.table, o.customer, o.id, `#${numeroPedido[o.id] ?? ""}`].join(" ").toLowerCase();
    return alvo.includes(buscaNorm);
  };
  const contasComCategoria = contas.map((o) => ({ o, categoria: categoriaDe(o) }));
  const counts = {
    todas: contas.length,
    aguardando: contasComCategoria.filter((c) => c.categoria === "aguardando").length,
    em_aberto: contasComCategoria.filter((c) => c.categoria === "em_aberto").length,
    pago: contasComCategoria.filter((c) => c.categoria === "pago").length,
  };
  const visiveis = contasComCategoria.filter((c) => (filtro === "todas" || c.categoria === filtro) && bate(c.o));

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] pb-28" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto w-full max-w-[1280px] space-y-5 px-4 pt-4 sm:px-6 lg:px-8 lg:pt-8">
        <Header lojaInfo={lojaInfo} usuarioNome={usuarioNome} onFechar={onFechar} />
        <KpiGrid aguardandoCount={counts.aguardando} contasAbertasCount={contas.length} totalReceber={totalReceber} faturadoHoje={faturadoHoje} />
        <CaixaToolbar busca={busca} onBusca={setBusca} filtro={filtro} onFiltro={setFiltro} counts={counts} />

        {visiveis.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#667085]">Nenhuma conta no momento.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visiveis.map(({ o }) => (
              <ContaCard
                key={o.id}
                o={o}
                totalCom={totalCom}
                haTxt={haTxt}
                numeroPedido={numeroPedido}
                telMascarado={telMascarado}
                opcoes={opcoes}
                pagando={pagando === o.id}
                onFinalizar={finalizar}
                retirando={retirando === o.id}
                onRetirar={retirar}
              />
            ))}
          </div>
        )}
      </div>

      <OperationalBottomNav items={navItems} active="caixa" onNavigate={onNavigate} />
    </div>
  );
}
