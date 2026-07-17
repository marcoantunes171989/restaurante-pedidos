import { useEffect, useMemo, useRef, useState } from "react";
import { Hourglass, Receipt, Wallet, CalendarCheck } from "lucide-react";
import { formatCurrency } from "../App";
import OperationalBottomNav from "../components/OperationalBottomNav";
import OperationalDarkHeader from "../components/OperationalDarkHeader";

// Categoria só é usada para o badge/filtro visual — nunca decide o que a
// conta PODE fazer (pagar antecipado é sempre permitido, como já era).
// "aguardando" = ainda não paga e o pedido nem ficou pronto; "em_aberto" =
// não paga e já pronta (tab realmente "aberta" para fechar agora);
// "pago" = paymentStatus paid, aguardando confirmação de retirada.
function categoriaDe(o) {
  if (o.paymentStatus === "paid") return "pago";
  return o.status === "ready" ? "em_aberto" : "aguardando";
}

// Mesmo vocabulário visual de tag do tema escuro (pp-pd-tag-*, já usado
// nos cards de Pedidos/Cozinha/Bar) — aguardando=âmbar, em_aberto=azul,
// pago=verde, sem introduzir cores novas.
const CATEGORIA_META = {
  aguardando: { label: "Aguardando", cls: "pp-pd-tag-preparo" },
  em_aberto: { label: "Em aberto", cls: "pp-pd-tag-novo" },
  pago: { label: "Pago", cls: "pp-pd-tag-pronto" },
};

const FILTROS = [
  { key: "todas", label: "Todas" },
  { key: "aguardando", label: "Aguardando" },
  { key: "em_aberto", label: "Em aberto" },
  { key: "pago", label: "Pagas" },
];

const brand = { graphite: "#1a1a1a" };

// NOTA IMPORTANTE: nunca usar as classes literais `text-white`,
// `bg-white/5`, `bg-white/10`, `bg-white/[0.0N]` ou `border-white/5|10|20`
// aqui — index.css tem regras globais de repaint do tema claro
// ([data-theme="light"] .tema-claro-area .text-white/.bg-white.../.border-
// white...) que hijackam exatamente esses nomes de classe (toda tela
// /operacional/* vive dentro de .tema-claro-area). Por isso, branco/preto
// translúcido sempre entra como valor arbitrário (`text-[#fff]`,
// `bg-[rgba(255,255,255,.05)]`), nunca como a utility reservada — mesmo
// padrão já usado em OperationalDarkHeader/OperationalOrderCardDark.

/* ── Toolbar de filtros (chips com contador) ────────────────────
   Mesmo vocabulário visual dos botões do tema escuro (gradiente laranja/
   dourado no ativo, vidro translúcido no inativo). flex-wrap em vez de
   scroll forçado: com 4 chips curtos, "quebra organizada" em 1-2 linhas
   já resolve o celular sem precisar de scroll horizontal escondido. */
function CaixaFiltros({ filtro, onFiltro, counts }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {FILTROS.map((f) => {
        const ativo = filtro === f.key;
        const cnt = counts[f.key] ?? 0;
        return (
          <button
            key={f.key}
            onClick={() => onFiltro(f.key)}
            type="button"
            className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-2xl border px-3.5 text-sm font-bold transition ${
              ativo
                ? "border-transparent bg-gradient-to-r from-[#e8622c] to-[#d4a017] text-[#fff]"
                : "border-[rgba(255,255,255,.15)] bg-[rgba(255,255,255,.05)] text-[rgba(255,255,255,.7)] hover:bg-[rgba(255,255,255,.1)]"
            }`}
          >
            {f.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${ativo ? "bg-[rgba(255,255,255,.25)] text-[#fff]" : "bg-[rgba(255,255,255,.1)] text-[rgba(255,255,255,.7)]"}`}>{cnt}</span>
          </button>
        );
      })}
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
    <div className="pp-pd-order min-w-0">
      {/* flex-wrap (não position:absolute): quando não há espaço para os
          3 itens numa linha, o badge (último no fluxo) desce para sua
          própria linha, sem nunca cobrir o número do pedido. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-[rgba(255,255,255,.07)] text-lg" aria-hidden="true">{externo ? "🛵" : "🍽️"}</span>
        <div className="min-w-0 flex-1 basis-[140px]">
          <p className="text-sm font-bold text-[#fff] [overflow-wrap:anywhere]">Pedido #{numeroPedido[o.id] ?? "—"} · {o.customer || "Cliente"}</p>
          <p className="text-xs text-[rgba(255,255,255,.6)] [overflow-wrap:anywhere]">{subtitulo}{haTxt(o) ? ` · ${haTxt(o)}` : ""}</p>
        </div>
        {/* whiteSpace normal via style (não na classe pp-pd-tag compartilhada
            com Pedidos/Cozinha/Bar): defesa extra para o badge nunca
            ultrapassar o card, mesmo que um rótulo futuro seja mais longo
            que os atuais (Aguardando/Em aberto/Pago, sempre curtos). */}
        <span className={`pp-pd-tag ${meta.cls} shrink-0 max-w-full`} style={{ whiteSpace: "normal", textAlign: "center" }}>{meta.label}</span>
      </div>

      <p className="mt-2 text-[10px] text-[rgba(255,255,255,.35)] [overflow-wrap:anywhere]">{o.id}</p>
      {telMascarado(o.clienteTelefone) && <p className="mt-0.5 text-[11px] text-[rgba(255,255,255,.6)]">📞 {telMascarado(o.clienteTelefone)}</p>}

      <div className="mt-3 space-y-1.5 border-y border-dashed border-[rgba(255,255,255,.15)] py-2.5">
        {itensVisiveis.map((it, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span className="shrink-0 font-bold text-[#f2b84a]">{it.quantity}×</span>
            <span className="min-w-0 flex-1 break-words text-[rgba(255,255,255,.75)]">{it.name}</span>
          </div>
        ))}
        {itensExtra > 0 && <p className="text-xs font-semibold text-[rgba(255,255,255,.4)]">+ {itensExtra} {itensExtra === 1 ? "item" : "itens"}</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="shrink-0 text-xs text-[rgba(255,255,255,.6)]">Total</span>
        <span className="min-w-0 break-words text-right text-[22px] font-bold text-[#fff]">{formatCurrency(total)}</span>
      </div>

      <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 min-[380px]:grid-cols-2">
        <button
          onClick={() => setAberto((v) => !v)}
          type="button"
          className="flex min-h-[44px] min-w-0 items-center justify-center rounded-xl border border-[rgba(255,255,255,.15)] bg-[rgba(255,255,255,.05)] text-sm font-bold text-[rgba(255,255,255,.8)] transition hover:bg-[rgba(255,255,255,.1)]"
        >
          Detalhes
        </button>
        {pago ? (
          <button
            onClick={() => onRetirar(o)}
            disabled={retirando}
            type="button"
            className="pp-pd-btn pp-pd-btn-green min-w-0"
          >
            {retirando ? "Confirmando…" : "✓ Retirada"}
          </button>
        ) : (
          <button
            onClick={() => setAberto(true)}
            type="button"
            className="pp-pd-btn pp-pd-btn-primary min-w-0"
          >
            Receber
          </button>
        )}
      </div>

      {aberto && (
        <div className="mt-3 space-y-2 rounded-2xl border border-[rgba(255,255,255,.1)] bg-[rgba(255,255,255,.05)] p-3">
          <div className="space-y-1">
            {(o.items || []).map((it, i) => (
              <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs">
                <span className="min-w-0 flex-1 break-words text-[rgba(255,255,255,.7)]">{it.quantity}× {it.name}</span>
                <span className="shrink-0 font-bold text-[#fff]">{formatCurrency(it.price * it.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-0.5 border-t border-[rgba(255,255,255,.1)] pt-2 text-xs">
            <div className="flex flex-wrap justify-between gap-x-2 text-[rgba(255,255,255,.6)]"><span>Subtotal</span><span className="text-[#fff]">{formatCurrency(sub)}</span></div>
            <div className="flex flex-wrap justify-between gap-x-2 text-[rgba(255,255,255,.6)]"><span>Taxa de serviço (10%)</span><span className="text-[#fff]">{formatCurrency(taxa)}</span></div>
            <div className="flex flex-wrap justify-between gap-x-2 text-sm font-black"><span className="text-[#fff]">Total</span><span className="text-[#5fe08c]">{formatCurrency(total)}</span></div>
          </div>

          {!pago && (
            <>
              <p className="pt-1 text-[10px] font-bold uppercase tracking-wide text-[rgba(255,255,255,.5)]">Forma(s) de pagamento</p>
              <div className="grid grid-cols-2 gap-1.5">
                {opcoes.map((f) => {
                  const on = linhas.some((l) => l.forma === f);
                  return (
                    <button
                      key={f}
                      onClick={() => toggleForma(f)}
                      type="button"
                      className={`flex min-h-[40px] items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-center text-xs font-bold transition ${
                        on ? "border-[#d4a017] bg-[#d4a017] text-[#1a1a1a]" : "border-[rgba(255,255,255,.15)] bg-[rgba(255,255,255,.05)] text-[rgba(255,255,255,.75)] hover:bg-[rgba(255,255,255,.1)]"
                      }`}
                    >
                      {on && <span className="shrink-0">✓</span>}<span className="min-w-0 break-words">{f}</span>
                    </button>
                  );
                })}
              </div>
              {linhas.length > 0 && (
                <div className="space-y-1.5">
                  {linhas.map((l) => (
                    <div key={l.forma} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 break-words text-xs font-bold text-[#e8c170]">{l.forma}</span>
                      <span className="shrink-0 text-xs text-[rgba(255,255,255,.6)]">R$</span>
                      <input
                        inputMode="numeric"
                        value={fmtMoeda(l.valor)}
                        onChange={(e) => editarValor(l.forma, e.target.value)}
                        aria-label={`Valor pago em ${l.forma}`}
                        className="w-28 shrink-0 rounded-lg border border-[rgba(255,255,255,.15)] bg-[rgba(255,255,255,.05)] px-2 py-1 text-right text-sm font-bold text-[#fff] outline-none focus:border-[#d4a017]"
                      />
                    </div>
                  ))}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-[11px]">
                    <span className={`min-w-0 break-words ${Math.abs(restante) < 0.01 ? "font-bold text-[#5fe08c]" : restante > 0 ? "font-bold text-[#f2b84a]" : "font-bold text-[#f87171]"}`}>
                      {Math.abs(restante) < 0.01 ? "Valor confere ✓" : restante > 0 ? `Falta ${formatCurrency(restante)}` : `Excede ${formatCurrency(-restante)}`}
                    </span>
                    <span className="min-w-0 break-words text-[rgba(255,255,255,.6)]">Pago {formatCurrency(soma)} / {formatCurrency(total)}</span>
                  </div>
                </div>
              )}
              <button
                onClick={() => onFinalizar(o, linhas, total)}
                disabled={!valido || pagando}
                type="button"
                className="pp-pd-btn pp-pd-btn-green mt-1 w-full disabled:!bg-[rgba(255,255,255,.1)] disabled:!text-[rgba(255,255,255,.35)]"
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
 * Caixa (/operacional/caixa) — tema escuro padronizado com Pedidos
 * (src/pages/CentralDePedidos.jsx): mesmo cabeçalho (OperationalDarkHeader,
 * também usado por Pedidos/Cozinha/Bar), mesmos cards de KPI, mesma
 * paleta/gradiente/bordas/sombras. NÃO vira kanban — mantém sua própria
 * hierarquia (indicadores + filtros + grid de contas), só reestilizada.
 * Toda a lógica (buscar/receber pagamento, confirmar retirada, formas de
 * pagamento, navegação, logout) é a mesma já existente em
 * OperacaoMobileView; este componente só recebe os dados prontos e
 * formata a UI.
 */
export default function CentralDoCaixa({
  usuarioNome = "",
  lojaInfo,
  onFechar,
  navItems = [],
  onNavigate,
  nivelAcesso = "",
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

  // Chegada via clique numa notificação de Caixa (?destacar=<id>, migration
  // 064 / NotificationBell) — realça e rola até a conta certa, uma vez só.
  // Lido no initializer (não num efeito) para não disparar setState síncrono
  // dentro de useEffect.
  const [destacadoId, setDestacadoId] = useState(() => new URLSearchParams(window.location.search).get("destacar"));
  const destacadoRef = useRef(null);

  useEffect(() => {
    if (!destacadoId) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("destacar")) return;
    params.delete("destacar");
    const resto = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (resto ? `?${resto}` : ""));
  }, [destacadoId]);

  useEffect(() => {
    if (!destacadoId || !destacadoRef.current) return;
    destacadoRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setDestacadoId(null), 4000);
    return () => clearTimeout(t);
  }, [destacadoId]);

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

  const kpis = [
    { key: "aguardando", Icon: Hourglass, label: "Aguardando pagamento", value: counts.aguardando },
    { key: "abertas", Icon: Receipt, label: "Contas em aberto", value: contas.length },
    { key: "receber", Icon: Wallet, label: "Total a receber", value: formatCurrency(totalReceber) },
    { key: "faturado", Icon: CalendarCheck, label: "Faturado hoje", value: formatCurrency(faturadoHoje) },
  ];

  return (
    <div className="pp-pd-root" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto max-w-5xl px-4 pt-6 md:pt-10">
        <OperationalDarkHeader
          title="Caixa"
          usuarioNome={usuarioNome}
          lojaInfo={lojaInfo}
          onFechar={onFechar}
          nivelAcesso={nivelAcesso}
          searchPlaceholder="Buscar por mesa, cliente ou pedido…"
          busca={busca}
          onBuscaChange={setBusca}
          notificacoes={counts.aguardando}
          kpis={kpis}
          kpiGridClassName="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4"
        />

        {/* Contas — mesma família de card escuro do cabeçalho (não é
            kanban: filtros + grid de contas, mesma hierarquia de sempre). */}
        <div
          className="pp-operational-header relative mt-6 overflow-hidden rounded-3xl p-6 shadow-lg md:p-8"
          style={{ background: `linear-gradient(160deg, ${brand.graphite} 0%, #241c15 100%)` }}
        >
          <CaixaFiltros filtro={filtro} onFiltro={setFiltro} counts={counts} />

          {visiveis.length === 0 ? (
            <div className="pp-pd-empty"><div className="pp-pd-e-ic">🧾</div><p>Nenhuma conta no momento.</p></div>
          ) : (
            // auto-fit + minmax(min(100%,280px),1fr): a coluna nunca fica
            // mais estreita que o conteúdo do card (280px), então a grade
            // se ajusta sozinha ao espaço real — 1 col até ~480px, 2 col em
            // tablet, 3 col em desktop/1024px+ (container tem max-w-5xl,
            // então 4 colunas não caberiam com folga aqui; 280px é a
            // largura mínima confortável para ícone+texto+badge do card,
            // um pouco menor que os 300px de referência para garantir 3
            // colunas exatamente a partir de 1024px).
            <div className="mt-5 grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
              {visiveis.map(({ o }) => (
                <div key={o.id} ref={o.id === destacadoId ? destacadoRef : undefined} className={o.id === destacadoId ? "pp-pd-destacado" : undefined}>
                  <ContaCard
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <OperationalBottomNav items={navItems} active="caixa" onNavigate={onNavigate} />
    </div>
  );
}
