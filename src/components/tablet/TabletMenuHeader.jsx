import { Receipt, ShoppingCart } from "lucide-react";

// Cabeçalho da tela de pedidos do tablet — identidade do estabelecimento,
// mesa em destaque (só mostra "lugares" quando a mesa tem capacidade
// cadastrada de verdade — nunca inventa uma contagem de pessoas) e acesso a
// pedidos/carrinho. Ícones sempre com aria-label; texto aparece a partir do
// breakpoint com espaço (lg) — abaixo disso os botões continuam com 44px
// mínimos de toque. Sem campo de busca (removido a pedido) nem ação de
// "Garçom" nesta tela (removida a pedido — ver acompanhamento de pedidos em
// TabletOrderTrackingDrawer).
export default function TabletMenuHeader({
  lojaInfo, mesaAtual, tableNumber, dadosCompletos,
  temConta, statusConta = null, tomConta = null, onAbrirConta,
  totalCartItems, onAbrirCarrinhoMobile,
}) {
  const nomeLoja = lojaInfo?.nome || "Pedido Prime";
  // Botão "Pedidos": linha de processo AGRUPADA — mini-stepper + status geral
  // (cor por tom no lg, ponto no compacto). Detalhe por pedido abre no drawer.
  const tomMap = {
    info:    { btn: "border-[var(--client-info-border)] bg-[var(--client-info-soft)] text-[var(--client-info)]", dot: "bg-[var(--client-info)]" },
    warning: { btn: "border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] text-[var(--client-warning)]", dot: "bg-[var(--client-warning)]" },
    success: { btn: "border-[var(--client-success-border)] bg-[var(--client-success-soft)] text-[var(--client-success)]", dot: "bg-[var(--client-success)]" },
  };
  const contaTom = (statusConta && tomMap[tomConta]) || null;
  // Etapa atual p/ o mini-stepper (Recebido → Preparo → Pronto → Entregue)
  const stepIdx = { "Pedido recebido": 0, "Em preparação": 1, "Pedido pronto": 2, "Pedidos entregues": 3, "Pagamento confirmado": 3, "Fechamento solicitado": 3 }[statusConta] ?? 0;
  return (
    <header className="shrink-0 border-b border-[var(--client-border)] bg-[var(--client-surface)] px-4 py-2.5 sm:px-5">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {lojaInfo?.logoUrl ? (
            <img src={lojaInfo.logoUrl} alt={`Logo ${nomeLoja}`} className="h-9 w-9 shrink-0 rounded-xl border border-[var(--client-border)] object-cover"
              onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--client-primary-soft)] text-sm font-black text-[var(--client-primary-active)]">
              {nomeLoja.trim().charAt(0).toUpperCase() || "P"}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-black leading-none text-[var(--client-text-primary)]">{nomeLoja}</p>
            <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--client-text-muted)]">Pedido Prime</p>
          </div>
        </div>

        <div className="shrink-0 rounded-2xl border border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] px-3.5 py-1.5 text-center leading-none sm:px-4">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--client-primary-active)]">Mesa</p>
          <p className="text-xl font-black tabular-nums text-[var(--client-text-primary)]">{dadosCompletos ? String(tableNumber).padStart(2, "0") : "--"}</p>
          {mesaAtual?.capacidade ? <p className="mt-0.5 whitespace-nowrap text-[9px] font-bold text-[var(--client-primary-active)]">{mesaAtual.capacidade} lugares</p> : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button type="button" onClick={onAbrirConta} disabled={!temConta}
            title={statusConta ? `Acompanhar pedidos · ${statusConta}` : "Acompanhar pedidos e conta"}
            aria-label={statusConta ? `Acompanhar pedidos, ${statusConta}` : "Acompanhar pedidos e conta"}
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-40 lg:w-auto lg:px-3 ${contaTom ? contaTom.btn : "border-[var(--client-border)] text-[var(--client-text-secondary)] hover:bg-[var(--client-background-soft)]"}`}>
            <Receipt aria-hidden="true" size={17} />
            <span className="hidden items-center gap-1.5 text-xs font-bold lg:inline-flex">
              {contaTom && <span aria-hidden="true" className="flex gap-0.5">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 w-2 rounded-full bg-current ${i <= stepIdx ? "" : "opacity-25"}`} />)}</span>}
              {statusConta || "Pedidos"}
            </span>
            {contaTom && <span aria-hidden="true" className={`absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-[var(--client-surface)] lg:hidden ${contaTom.dot}`} />}
          </button>
          <button type="button" onClick={onAbrirCarrinhoMobile}
            aria-label={`Ver carrinho, ${totalCartItems} ${totalCartItems === 1 ? "item" : "itens"}`}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl btn-laranja bg-[var(--client-primary-hover)] text-[#012E46] transition hover:bg-[var(--client-primary)] lg:hidden">
            <ShoppingCart aria-hidden="true" size={18} />
            {totalCartItems > 0 && (
              <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--client-error)] px-1 text-[10px] font-black text-white">{totalCartItems}</span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
