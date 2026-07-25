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
  temConta, onAbrirConta,
  totalCartItems, onAbrirCarrinhoMobile,
}) {
  const nomeLoja = lojaInfo?.nome || "Pedido Prime";
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
          <button type="button" onClick={onAbrirConta} disabled={!temConta} title="Acompanhar pedidos e conta" aria-label="Acompanhar pedidos e conta"
            className="flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--client-border)] text-[var(--client-text-secondary)] transition hover:bg-[var(--client-background-soft)] disabled:cursor-not-allowed disabled:opacity-40 lg:w-auto lg:px-3">
            <Receipt aria-hidden="true" size={17} /><span className="hidden text-xs font-bold lg:inline">Pedidos</span>
          </button>
          <button type="button" onClick={onAbrirCarrinhoMobile}
            aria-label={`Ver carrinho, ${totalCartItems} ${totalCartItems === 1 ? "item" : "itens"}`}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl btn-laranja bg-[var(--client-primary-hover)] text-white transition hover:bg-[var(--client-primary)] lg:hidden">
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
