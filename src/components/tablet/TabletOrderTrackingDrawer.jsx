import { useRef } from "react";
import { X, Receipt, RefreshCcw, Ban, Check, Star } from "lucide-react";
import { formatCurrency, statusMap, STATUS_TABLET_LABEL } from "../../App";
import { useFocusTrap } from "../../lib/useFocusTrap";

function StatusBadge({ status }) {
  const s = statusMap[status];
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${s.chip}`}>{STATUS_TABLET_LABEL[status] ?? s.label}</span>;
}

// Acompanhamento de pedidos + conta da mesa — substitui o antigo modal
// "verConta" (agora com identidade clara --client-*). Mantém intactas as
// regras já existentes (fechamento só após entrega, reenvio ao caixa,
// cancelamento só na fila/preparo) — só a apresentação foi reescrita.
export default function TabletOrderTrackingDrawer({
  tableNumber, porComanda, currentTableCancelled = [],
  currentTableSubtotal, currentTableTotal,
  podeFecharConta, contaSolicitada, onSolicitarFechamento,
  orderStage = -1, statusConta = null, tomConta = "info", pontosConta = 0,
  onCancelarPedido, onFechar,
}) {
  const containerRef = useRef(null);
  useFocusTrap(containerRef, true);
  const comandasArr = Object.values(porComanda);
  const semNada = comandasArr.length === 0 && currentTableCancelled.length === 0;
  // Stepper visual do preparo (mesmo do painel do carrinho) — visão geral da mesa.
  const ETAPAS = ["Recebido", "Em preparo", "Pronto", "Entregue"];
  const TOM_STATUS = {
    success: "border-[var(--client-success-border)] bg-[var(--client-success-soft)] text-[var(--client-success)]",
    warning: "border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] text-[var(--client-warning)]",
    info: "border-[var(--client-info-border)] bg-[var(--client-info-soft)] text-[var(--client-info)]",
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(33,24,20,0.45)] backdrop-blur-sm sm:items-center sm:p-4" onClick={onFechar}>
      <div ref={containerRef} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="acompanhar-titulo"
        className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[28px] border border-[var(--client-border)] bg-[var(--client-surface)] shadow-[var(--client-shadow-floating)] sm:rounded-[28px]"
        style={{ width: "calc(100% - 24px)" }}>

        <div className="flex shrink-0 items-center justify-between border-b border-[var(--client-border)] px-5 py-4">
          <div>
            <h2 id="acompanhar-titulo" className="text-base font-black text-[var(--client-text-primary)]">Conta — Mesa {String(tableNumber).padStart(2, "0")}</h2>
            <p className="mt-0.5 text-xs text-[var(--client-text-muted)]">Acompanhe seus pedidos e o status de cada comanda</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="shrink-0 rounded-full border border-[var(--client-border)] bg-[var(--client-background-soft)] px-3.5 py-2 text-xs font-black text-[var(--client-text-secondary)] transition hover:bg-[var(--client-surface-secondary)]">
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {semNada && (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center opacity-70">
              <Receipt aria-hidden="true" size={36} className="text-[var(--client-text-muted)]" />
              <p className="font-black text-[var(--client-text-primary)]">Nenhum pedido na mesa ainda</p>
              <p className="text-xs text-[var(--client-text-muted)]">Envie um pedido para que a conta seja exibida aqui.</p>
            </div>
          )}

          {/* Stepper do preparo — visão geral da mesa (mesma linguagem do carrinho) */}
          {comandasArr.length > 0 && orderStage >= 0 && (
            <div className="rounded-2xl border border-[var(--client-border)] bg-[var(--client-background-soft)] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-black text-[var(--client-text-primary)]">Andamento do pedido</p>
                {statusConta && <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black ${TOM_STATUS[tomConta] || TOM_STATUS.info}`}>{statusConta}</span>}
              </div>
              <ol className="flex items-start">
                {ETAPAS.map((label, i) => {
                  const done = i < orderStage, current = i === orderStage;
                  return (
                    <li key={label} className="flex flex-1 flex-col items-center text-center">
                      <div className="flex w-full items-center">
                        <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : (i <= orderStage ? "bg-[var(--client-success)]" : "bg-[var(--client-border)]")}`} />
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${current ? "btn-laranja bg-[var(--client-primary-hover)] text-[#012E46] ring-4 ring-[var(--client-primary-soft)]" : done ? "bg-[var(--client-success)] text-white" : "border border-[var(--client-border)] bg-[var(--client-surface)] text-[var(--client-text-muted)]"}`}>
                          {done ? <Check aria-hidden="true" size={14} /> : i + 1}
                        </span>
                        <span className={`h-0.5 flex-1 ${i === ETAPAS.length - 1 ? "opacity-0" : (i < orderStage ? "bg-[var(--client-success)]" : "bg-[var(--client-border)]")}`} />
                      </div>
                      <span className={`mt-1.5 text-[11px] font-bold leading-tight ${current ? "text-[var(--client-primary-hover)]" : done ? "text-[var(--client-text-primary)]" : "text-[var(--client-text-muted)]"}`}>{label}</span>
                    </li>
                  );
                })}
              </ol>
              {pontosConta > 0 && (
                <p className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] px-3 py-2 text-xs font-black text-[var(--client-primary-hover)]">
                  <Star aria-hidden="true" size={13} className="shrink-0" /> Esta conta vai gerar {pontosConta.toLocaleString("pt-BR")} pontos
                </p>
              )}
            </div>
          )}

          {comandasArr.map(({ comanda, pedidos, subtotal: subCmd }) => (
            <div key={comanda} className="overflow-hidden rounded-2xl border border-[var(--client-border)] bg-[var(--client-background-soft)] shadow-[var(--client-shadow-sm)]">
              <div className="flex items-center justify-between border-b border-[var(--client-border)] bg-[var(--client-surface)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg border border-[var(--client-info-border)] bg-[var(--client-info-soft)] px-2.5 py-1 font-mono text-xs font-black text-[var(--client-info)]">{comanda}</span>
                  <span className="text-xs text-[var(--client-text-muted)]">{pedidos.length} pedido(s)</span>
                </div>
                <span className="text-sm font-black text-[var(--client-text-primary)]">{formatCurrency(subCmd)}</span>
              </div>
              <div className="divide-y divide-[var(--client-border)]">
                {pedidos.map((order) => (
                  <div key={order.id} className="px-4 py-3">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-widest text-[var(--client-text-muted)]">{order.id} • {order.createdAt}</span>
                      <StatusBadge status={order.status} />
                    </div>
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between gap-3 py-0.5 text-sm">
                        <span className="break-words text-[var(--client-text-secondary)]"><span className="font-black text-[var(--client-text-primary)]">{item.quantity}×</span> {item.name}</span>
                        <span className="shrink-0 font-bold text-[var(--client-text-primary)]">{formatCurrency(item.price * item.quantity)}</span>
                      </div>
                    ))}
                    {(order.status === "received" || order.status === "preparing") && (
                      <button type="button" onClick={() => onCancelarPedido(order)}
                        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--client-error-border)] bg-[var(--client-error-soft)] py-2 text-xs font-black text-[var(--client-error)] transition hover:brightness-95">
                        <Ban aria-hidden="true" size={13} /> Cancelar este pedido
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {currentTableCancelled.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-[var(--client-error-border)] bg-[var(--client-error-soft)]">
              <div className="flex items-center justify-between border-b border-[var(--client-error-border)] px-4 py-3">
                <span className="text-sm font-black text-[var(--client-error)]">Pedidos cancelados</span>
                <span className="text-xs font-bold text-[var(--client-error)]">{currentTableCancelled.length} pedido(s)</span>
              </div>
              <div className="divide-y divide-[var(--client-error-border)]">
                {currentTableCancelled.map((order) => (
                  <div key={order.id} className="px-4 py-3">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-widest text-[var(--client-text-muted)]">{order.id} • {order.command} • {order.createdAt}</span>
                      <StatusBadge status="cancelled" />
                    </div>
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between gap-3 py-0.5 text-sm">
                        <span className="break-words text-[var(--client-text-muted)] line-through"><span className="font-black">{item.quantity}×</span> {item.name}</span>
                        <span className="shrink-0 font-bold text-[var(--client-text-muted)] line-through">{formatCurrency(item.price * item.quantity)}</span>
                      </div>
                    ))}
                    {order.cancelReason && (
                      <p className="mt-1.5 rounded-lg border border-[var(--client-error-border)] bg-[var(--client-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--client-error)]">Justificativa: <span className="font-black">{order.cancelReason}</span></p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-[var(--client-border)] bg-[var(--client-background-soft)] px-5 py-4">
          <div className="flex justify-between text-sm text-[var(--client-text-secondary)]"><span>Subtotal</span><span className="font-bold text-[var(--client-text-primary)]">{formatCurrency(currentTableSubtotal)}</span></div>
          <div className="flex justify-between text-sm text-[var(--client-text-secondary)]"><span>Taxa de serviço (10%)</span><span className="font-bold text-[var(--client-text-primary)]">{formatCurrency(currentTableSubtotal * 0.1)}</span></div>
          <div className="h-px bg-[var(--client-border)]" />
          <div className="flex justify-between text-lg font-black text-[var(--client-text-primary)]"><span>Total da mesa</span><span className="text-[var(--client-success)]">{formatCurrency(currentTableTotal)}</span></div>
          {comandasArr.length > 1 && (
            <p className="text-center text-xs text-[var(--client-text-muted)]">{comandasArr.length} comandas na mesa • Total dividido: {formatCurrency(currentTableTotal / comandasArr.length)} por comanda</p>
          )}
          <button type="button" onClick={onSolicitarFechamento} disabled={!podeFecharConta}
            title={!podeFecharConta ? "Disponível somente quando todos os pedidos forem entregues pela cozinha" : ""}
            className={`mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:border disabled:border-[var(--client-border)] disabled:bg-[var(--client-disabled-background)] disabled:text-[var(--client-disabled-text)] ${contaSolicitada ? "bg-[var(--client-warning-soft)] text-[var(--client-warning)] hover:brightness-95" : "bg-[var(--client-primary-hover)] text-[#012E46] hover:bg-[var(--client-primary)]"}`}>
            {contaSolicitada ? <><RefreshCcw aria-hidden="true" size={16} /> Reenviar conta ao caixa</> : <><Receipt aria-hidden="true" size={16} /> Solicitar fechamento ao caixa</>}
          </button>
          {!podeFecharConta && comandasArr.length > 0 && (
            <p className="text-center text-xs text-[var(--client-text-muted)]">Aguardando a cozinha entregar todos os pedidos para liberar o fechamento.</p>
          )}
          {!(currentTableTotal > 0) && (
            <p className="text-center text-xs text-[var(--client-text-muted)]">O fechamento é liberado quando a mesa tiver um total maior que zero.</p>
          )}
        </div>
      </div>
    </div>
  );
}
