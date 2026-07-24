import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, MapPin, User, Clock, CreditCard, Ban, Loader2 } from "lucide-react";
import OrderStatusBadge from "./OrderStatusBadge";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { useBodyScrollLock } from "../../lib/useBodyScrollLock";

function minutosEntreISO(a, b) {
  if (!a || !b) return null;
  const ms = new Date(b) - new Date(a);
  return ms > 0 ? ms / 60000 : null;
}

// Mesma formatação humana de duração de src/App.jsx (formatarDuracaoMin,
// exportado de lá) — reimplementada aqui só porque este componente segue
// o padrão do projeto de nunca importar de App.jsx pra dentro de
// src/components (toda a árvore de pedidos recebe helpers via props, não
// import direto); a fórmula em si é a mesma, uma linha.
function formatarDuracao(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}min` : `${m}min`;
}

function Linha({ icone: Icone, label, valor }) {
  if (!valor) return null;
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icone aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-[var(--pp-text-muted)]" />
      <span className="text-[var(--pp-text-body)]">{label}: <span className="font-semibold text-[var(--pp-text)]">{valor}</span></span>
    </div>
  );
}

function ItensDoSetor({ nome, itens, metaSetor }) {
  const sm = metaSetor?.(nome) || { label: nome };
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">{sm.label}</p>
      <div className="flex flex-col gap-2">
        {itens.map((it, i) => {
          const mods = [
            ...(it.removedIngredients || []).map((x) => "− " + x),
            ...(it.extraIngredients || []).map((x) => "+ " + x),
            it.observation,
          ].filter(Boolean).join(" · ");
          return (
            <div key={i} className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="shrink-0 font-bold text-[var(--pp-text)]">{it.quantity}×</span>
                <span className="text-[var(--pp-text)]">{it.name}</span>
              </div>
              {mods && <p className="mt-0.5 pl-[26px] text-xs leading-snug text-[var(--pp-warning-text)]">{mods}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoricoPedido({ order: o }) {
  const cancelado = o.status === "cancelled";
  const passos = [
    { chave: "criado", rotulo: "Pedido criado", quando: o.createdAtISO },
    { chave: "preparo", rotulo: "Em preparo", quando: o.preparoEmISO },
    { chave: "pronto", rotulo: "Finalizado", quando: o.prontoEmISO },
    { chave: "fim", rotulo: cancelado ? "Cancelado" : "Pago", quando: cancelado ? o.updatedAtISO : (o.paymentStatus === "paid" ? o.updatedAtISO : null) },
  ];
  return (
    <ol className="flex flex-col gap-2.5">
      {passos.map((p, i) => {
        const feito = !!p.quando;
        const delta = feito && passos[i - 1]?.quando ? minutosEntreISO(passos[i - 1].quando, p.quando) : null;
        return (
          <li key={p.chave} className="flex items-center gap-2.5 text-sm">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${cancelado && p.chave === "fim" ? "bg-[var(--pp-danger)]" : feito ? "bg-[var(--pp-success)]" : "bg-[var(--pp-border)]"}`} />
            <span className={feito ? "font-semibold text-[var(--pp-text)]" : "text-[var(--pp-text-muted)]"}>{p.rotulo}</span>
            <span className="ml-auto shrink-0 text-xs text-[var(--pp-text-muted)]">
              {p.quando ? new Date(p.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
              {delta != null && ` · +${formatarDuracao(delta)}`}
            </span>
          </li>
        );
      })}
      {o.cancelReason && <li className="text-xs text-[var(--pp-text-body)]">Motivo do cancelamento: <span className="font-semibold text-[var(--pp-text)]">{o.cancelReason}</span></li>}
    </ol>
  );
}

/**
 * Ver detalhes / histórico do pedido — modal de verdade (portal + focus
 * trap), aberto pelo OrderActionsMenu. `focoInicial` ("itens"|"historico")
 * só rola até a seção correspondente ao abrir; todo o conteúdo já vem
 * sempre completo (não é uma visão parcial por seção).
 */
export default function OrderDetailsDialog({
  order: o, variante, setoresNoPedido = [],
  origemDe, haTxt, numeroPedido, metaSetor, itensDoSetor,
  focoInicial = null, podeCancelar = false, onCancelar,
  onFechar, gatilhoRef,
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [erro, setErro] = useState("");
  const painelRef = useRef(null);
  const itensRef = useRef(null);
  const historicoRef = useRef(null);

  useFocusTrap(painelRef, true);
  useBodyScrollLock(true);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => painelRef.current?.querySelector("button, [href], input, [tabindex]")?.focus(), 0);
    const gatilho = gatilhoRef?.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
      gatilho?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const alvo = focoInicial === "itens" ? itensRef.current : focoInicial === "historico" ? historicoRef.current : null;
    if (alvo) alvo.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focoInicial]);

  async function confirmarCancelamento() {
    if (cancelando || !onCancelar) return;
    setCancelando(true);
    setErro("");
    try { await onCancelar(o.id, "Cancelado pela operação"); onFechar(); }
    catch { setErro("Não foi possível cancelar agora. Tente novamente."); setCancelando(false); }
  }

  const org = origemDe(o);
  const [tableBase, tableSub] = String(o.table || "").split(" · ");
  const numero = numeroPedido?.[o.id] ?? "—";

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4" style={{ background: "rgba(33, 24, 20, 0.32)", backdropFilter: "blur(2px)" }} onClick={onFechar}>
      <div
        ref={painelRef}
        role="dialog" aria-modal="true" aria-labelledby="detalhes-pedido-titulo"
        className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-[var(--pp-border)] bg-[var(--pp-surface)] shadow-[0_18px_48px_rgba(57,40,31,0.16)] sm:max-h-[85dvh] sm:w-[480px] sm:rounded-[22px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--pp-border)] p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 id="detalhes-pedido-titulo" className="text-base font-bold text-[var(--pp-text)]">Pedido #{numero}</h2>
              {variante && <OrderStatusBadge variante={variante} />}
            </div>
            <p className="mt-0.5 truncate text-xs text-[var(--pp-text-muted)]">{tableBase || o.table}{tableSub ? ` · ${tableSub}` : ""}</p>
          </div>
          <button onClick={onFechar} type="button" aria-label="Fechar detalhes do pedido" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--pp-text-body)] transition hover:bg-[var(--pp-bg)]">
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
          <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3">
            <Linha icone={MapPin} label="Origem" valor={org?.l} />
            <Linha icone={User} label="Cliente" valor={o.customer} />
            <Linha icone={Clock} label="Horário" valor={[o.createdAt, haTxt?.(o)].filter(Boolean).join(" · ")} />
            {o.pagamentoForma && <Linha icone={CreditCard} label="Pagamento" valor={`${o.pagamentoForma}${o.pagamentoMomento ? ` · ${o.pagamentoMomento}` : ""}`} />}
            <p className="mt-0.5 text-xs text-[var(--pp-text-muted)]">Código: <span className="font-mono font-semibold text-[var(--pp-text-body)]">{o.id}</span></p>
          </div>

          <div ref={itensRef} className="mt-4 scroll-mt-4">
            <h3 className="mb-2 text-[11px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Produtos</h3>
            {setoresNoPedido.map((sk) => {
              const itens = itensDoSetor?.(o, sk) || [];
              if (itens.length === 0) return null;
              return <ItensDoSetor key={sk} nome={sk} itens={itens} metaSetor={metaSetor} />;
            })}
          </div>

          <div ref={historicoRef} className="mt-4 scroll-mt-4 border-t border-[var(--pp-border)] pt-3.5">
            <h3 className="mb-2.5 text-[11px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Histórico</h3>
            <HistoricoPedido order={o} />
          </div>
        </div>

        {podeCancelar && (
          <div className="shrink-0 border-t border-[var(--pp-border)] p-4" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
            {confirmando ? (
              <div>
                <p className="text-sm font-bold text-[var(--pp-text)]">Cancelar pedido?</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--pp-text-body)]">Esta ação alterará o status do pedido e poderá afetar a operação dos setores.</p>
                {erro && <p role="alert" className="mt-2 rounded-lg bg-[var(--pp-danger-soft)] px-3 py-2 text-xs font-semibold text-[var(--pp-danger)]">{erro}</p>}
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => { setConfirmando(false); setErro(""); }} disabled={cancelando}
                    className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] text-sm font-bold text-[var(--pp-text-body)] transition hover:bg-[var(--pp-bg)] disabled:opacity-50">
                    Voltar
                  </button>
                  <button type="button" onClick={confirmarCancelamento} disabled={cancelando} aria-busy={cancelando}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--pp-danger)] text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60">
                    {cancelando && <Loader2 aria-hidden="true" size={15} className="animate-spin" />}
                    {cancelando ? "Cancelando…" : "Cancelar pedido"}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmando(true)}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--pp-danger)]/30 bg-[var(--pp-surface)] text-sm font-bold text-[var(--pp-danger)] transition hover:bg-[var(--pp-danger-soft)]">
                <Ban aria-hidden="true" size={16} /> Cancelar pedido
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
