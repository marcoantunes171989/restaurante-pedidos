import { useRef } from "react";
import { ShoppingBag, X, QrCode, Minus, Plus, Loader2, CheckCircle2, Receipt, RefreshCcw } from "lucide-react";
import { formatCurrency } from "../../App";
import { useFocusTrap } from "../../lib/useFocusTrap";

// Conteúdo do carrinho — usado tanto no painel lateral permanente
// (desktop/tablet-paisagem) quanto no corpo da gaveta/bottom-sheet
// (tablet-retrato/celular). Toda a lógica de negócio (cálculo de totais,
// validação de comanda, envio) já vem pronta via props — este componente
// só formata a apresentação.
export default function TabletCartPanel({
  cart, subtotal, serviceFee, total, economiaCart = 0, message,
  mesaSelecionada, tableNumber, dadosCompletos, onTrocarMesa,
  customerName, setCustomerName,
  commandCode, comandaValida, onAbrirScanner, podeEscanear,
  addToCart, removeFromCart, onRemoverComboItem,
  onEnviar, enviando,
  podeFecharConta, contaSolicitada, onFecharConta, temPedidoNaMesa,
  lojaInfo,
  onFechar, // presente só na variante "sheet" (mobile/retrato)
}) {
  const containerRef = useRef(null);
  useFocusTrap(containerRef, Boolean(onFechar));

  return (
    <div ref={containerRef} className="flex h-full flex-col bg-[var(--client-surface)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--client-border)] px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--client-primary-soft)] text-[var(--client-primary-active)]"><ShoppingBag size={17} /></span>
          <div>
            <p className="text-sm font-black text-[var(--client-text-primary)]">Seu pedido</p>
            <p className="text-[11px] text-[var(--client-text-muted)]">Personalize e envie para a cozinha</p>
          </div>
        </div>
        {onFechar && (
          <button type="button" onClick={onFechar} aria-label="Fechar carrinho"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--client-border)] text-[var(--client-text-secondary)] transition hover:bg-[var(--client-background-soft)]">
            <X aria-hidden="true" size={16} />
          </button>
        )}
      </div>

      {/* Mesa / cliente / comanda */}
      <div className="shrink-0 space-y-3 border-b border-[var(--client-border)] px-4 py-3.5">
        <div>
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-[var(--client-text-muted)]">Mesa deste tablet</span>
          <div className="flex items-center justify-between rounded-xl border border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] px-3.5 py-2.5">
            <span className="text-sm font-black text-[var(--client-text-primary)]">
              {mesaSelecionada ? `Mesa ${String(mesaSelecionada.numero).padStart(2, "0")}${mesaSelecionada.nome ? ` — ${mesaSelecionada.nome}` : ""}` : (dadosCompletos ? `Mesa ${String(tableNumber).padStart(2, "0")}` : "Mesa não definida")}
            </span>
            <button type="button" onClick={onTrocarMesa}
              className="shrink-0 rounded-lg border border-[var(--client-border)] bg-[var(--client-surface)] px-2.5 py-1 text-xs font-bold text-[var(--client-text-primary)] transition hover:bg-[var(--client-background-soft)]">
              Trocar
            </button>
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-[var(--client-text-muted)]">Cliente (opcional)</span>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente"
            className="w-full rounded-xl border border-[var(--client-border)] bg-[var(--client-background-soft)] px-3 py-2.5 text-sm text-[var(--client-text-primary)] outline-none transition placeholder:text-[var(--client-text-muted)] focus:border-[var(--client-primary)] focus:ring-2 focus:ring-[var(--client-focus-primary)]" />
        </label>
        <div>
          <span className="mb-1.5 flex items-center gap-1.5 rounded-lg bg-[var(--client-warning-soft)] px-3 py-1.5 text-[11px] font-bold text-[var(--client-warning)]">Comanda obrigatória — leia o QR Code</span>
          <div className="mt-2 flex items-center gap-2">
            <input value={commandCode} readOnly placeholder={`Escaneie o QR (${lojaInfo?.prefixo || "CMD"}-000001)`}
              className={`flex-1 rounded-xl border bg-[var(--client-background-soft)] px-3 py-2.5 font-mono text-sm text-[var(--client-text-primary)] outline-none transition cursor-default placeholder:text-[var(--client-text-muted)] ${comandaValida ? "border-[var(--client-success-border)]" : "border-[var(--client-border)]"}`} />
            <button type="button" onClick={onAbrirScanner} disabled={!podeEscanear}
              title={!podeEscanear ? "Informe a mesa e adicione itens" : "Escanear QR Code da comanda"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] text-[var(--client-primary-active)] transition hover:bg-[var(--client-primary-border)] disabled:cursor-not-allowed disabled:opacity-40">
              <QrCode aria-hidden="true" size={18} />
            </button>
          </div>
          {comandaValida && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-[var(--client-success)]"><CheckCircle2 aria-hidden="true" size={13} /> Comanda válida: {commandCode}</p>
          )}
        </div>
      </div>

      {/* Itens */}
      <div className="scrollbar-none flex-1 space-y-2.5 overflow-y-auto px-4 py-3.5">
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center opacity-80">
            <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--client-background-soft)] text-[var(--client-text-muted)]"><ShoppingBag size={24} /></span>
            <p className="text-sm font-bold text-[var(--client-text-primary)]">Seu pedido começa aqui</p>
            <p className="max-w-[220px] text-xs text-[var(--client-text-muted)]">Adicione produtos do cardápio para montar seu pedido.</p>
          </div>
        ) : cart.map((item) => (
          <div key={item._uid || item.id} className={`rounded-xl border bg-[var(--client-surface)] p-3 shadow-[var(--client-shadow-sm)] ${item.comboId ? "border-[var(--client-success-border)]" : "border-[var(--client-border)]"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold leading-tight text-[var(--client-text-primary)]">{item.name}</p>
              {item.comboId ? (
                <button type="button" onClick={() => onRemoverComboItem(item)} title="Sair do combo" aria-label={`Remover ${item.name} do combo`}
                  className="shrink-0 rounded-lg border border-[var(--client-error-border)] bg-[var(--client-error-soft)] px-2 py-1 text-xs font-black text-[var(--client-error)] transition hover:brightness-95">
                  <X aria-hidden="true" size={13} />
                </button>
              ) : (
                <div className="flex items-center gap-1 rounded-lg border border-[var(--client-border)] bg-[var(--client-background-soft)] p-0.5">
                  <button type="button" onClick={() => removeFromCart(item.id)} aria-label={`Remover uma unidade de ${item.name}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--client-text-primary)] transition hover:bg-[var(--client-surface)]"><Minus aria-hidden="true" size={13} /></button>
                  <span className="w-5 text-center text-sm font-black text-[var(--client-text-primary)]">{item.quantity}</span>
                  <button type="button" onClick={() => addToCart(item)} aria-label={`Adicionar mais uma unidade de ${item.name}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--client-primary-hover)] text-white transition hover:bg-[var(--client-primary)]"><Plus aria-hidden="true" size={13} /></button>
                </div>
              )}
            </div>
            {item.comboId && <p className="mt-0.5 text-[11px] font-bold text-[var(--client-success)]">Combo: {item.comboNome}</p>}
            <p className="mt-0.5 text-xs text-[var(--client-text-muted)]">{formatCurrency(item.price)} cada • <span className="font-semibold text-[var(--client-text-primary)]">{formatCurrency(item.price * item.quantity)}</span></p>
            {(item.selectedOptions || []).length > 0 && <p className="mt-1 text-xs text-[var(--client-text-secondary)]">{item.selectedOptions.map((o) => o.nome).join(", ")}</p>}
            {item.removedIngredients.length > 0 && <p className="mt-1 text-xs text-[var(--client-error)]">Sem: {item.removedIngredients.join(", ")}</p>}
            {item.extraIngredients.length > 0 && <p className="mt-1 text-xs text-[var(--client-text-secondary)]">Adicionais: {item.extraIngredients.join(", ")}</p>}
            {item.observation && <p className="mt-1 text-xs italic text-[var(--client-text-muted)]">"{item.observation}"</p>}
          </div>
        ))}
      </div>

      {/* Totais + ações */}
      <div className="shrink-0 space-y-3 border-t border-[var(--client-border)] bg-[var(--client-background-soft)] px-4 py-3.5">
        <div className="space-y-1.5 rounded-xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3.5 py-3 text-sm">
          <div className="flex justify-between text-[var(--client-text-secondary)]"><span>Subtotal</span><span className="font-bold text-[var(--client-text-primary)]">{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between text-[var(--client-text-secondary)]"><span>Taxa de serviço (10%)</span><span className="font-bold text-[var(--client-text-primary)]">{formatCurrency(serviceFee)}</span></div>
          {economiaCart > 0 && <div className="flex justify-between text-[var(--client-success)]"><span>Economia (promoções)</span><span className="font-bold">− {formatCurrency(economiaCart)}</span></div>}
          <div className="h-px bg-[var(--client-border)]" />
          <div className="flex items-center justify-between"><span className="text-base font-black text-[var(--client-text-primary)]">Total</span><span className="text-lg font-black text-[var(--client-text-primary)]">{formatCurrency(total)}</span></div>
        </div>

        {message.text && (
          <div role={message.type === "error" ? "alert" : "status"}
            className={`rounded-xl border p-3 text-xs font-semibold ${message.type === "error" ? "border-[var(--client-error-border)] bg-[var(--client-error-soft)] text-[var(--client-error)]" : "border-[var(--client-success-border)] bg-[var(--client-success-soft)] text-[var(--client-success)]"}`}>
            {message.text}
          </div>
        )}

        {cart.length > 0 && !dadosCompletos && (
          <div role="alert" className="rounded-xl border border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] p-3 text-xs font-semibold text-[var(--client-warning)]">
            Informe a mesa e leia o QR Code da comanda para enviar o pedido.
          </div>
        )}

        {!comandaValida ? (
          <button type="button" onClick={onAbrirScanner} disabled={!podeEscanear}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--client-primary-hover)] text-sm font-bold text-white transition active:scale-[0.98] hover:bg-[var(--client-primary)] disabled:cursor-not-allowed disabled:bg-[var(--client-disabled-background)] disabled:text-[var(--client-disabled-text)]">
            <QrCode aria-hidden="true" size={17} /> Escanear comanda e enviar pedido
          </button>
        ) : (
          <button type="button" onClick={onEnviar} disabled={cart.length === 0 || enviando} aria-busy={enviando}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--client-primary-hover)] text-sm font-bold text-white transition active:scale-[0.98] hover:bg-[var(--client-primary)] disabled:cursor-not-allowed disabled:bg-[var(--client-disabled-background)] disabled:text-[var(--client-disabled-text)]">
            {enviando ? (<><Loader2 aria-hidden="true" size={17} className="animate-spin" /> Enviando pedido...</>) : "Enviar pedido para a cozinha"}
          </button>
        )}

        <button type="button" onClick={onFecharConta} disabled={!podeFecharConta}
          title={!podeFecharConta ? "Disponível quando os pedidos forem entregues" : (contaSolicitada ? "Reenviar a conta ao caixa" : "Solicitar fechamento ao caixa")}
          className={`flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${contaSolicitada ? "border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] text-[var(--client-warning)] hover:brightness-95" : "border-[var(--client-border)] bg-[var(--client-surface)] text-[var(--client-text-secondary)] hover:bg-[var(--client-background-soft)]"}`}>
          {contaSolicitada ? <><RefreshCcw aria-hidden="true" size={14} /> Reenviar conta ao caixa</> : <><Receipt aria-hidden="true" size={14} /> Fechar conta da mesa</>}
        </button>
        {contaSolicitada && <p className="text-center text-xs font-semibold text-[var(--client-warning)]">Conta já enviada ao caixa — reenvie se necessário</p>}
        {temPedidoNaMesa && !podeFecharConta && <p className="text-center text-xs text-[var(--client-text-muted)]">Aguardando entrega dos pedidos para fechar a conta</p>}
      </div>
    </div>
  );
}
