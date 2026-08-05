import { Pencil, Plus } from "lucide-react";
import { formatCurrency, tempoAbertoISO } from "./pdvHelpers";
import { ControlesItem } from "./PdvModais";

/**
 * Painel da conta — produtos em destaque (valor ao produto).
 * Mobile: ocupa a aba Conta em altura total; desktop: coluna ~320px.
 */
export default function PdvMesaDetail({
  conta,
  pedidos = [],
  subtotal = 0,
  taxasDescontos = 0,
  total = 0,
  agora,
  onEditarCliente,
  onIncluirProduto,
  onAlterarQtd,
  onRemoverItem,
  produtosBloqueados = false,
  className = "",
}) {
  if (!conta) {
    return (
      <aside className={`flex w-full flex-col overflow-hidden border-[var(--pp-border)] bg-[var(--pp-surface)] ${className}`}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center sm:p-8">
          <p className="text-base font-black text-[var(--pp-text)]">Nenhuma mesa selecionada</p>
          <p className="max-w-xs text-sm text-[var(--pp-text-muted)]">
            Toque em Salão para escolher uma mesa, ou busque por número, cliente ou pedido.
          </p>
        </div>
      </aside>
    );
  }

  const itens = pedidos.flatMap((o) =>
    (o.items || []).map((it, idx) => ({
      key: `${o.id}-${idx}`,
      orderId: o.id,
      index: idx,
      name: it.name,
      quantity: Number(it.quantity) || 0,
      unit: Number(it.price) || 0,
      total: (Number(it.price) || 0) * (Number(it.quantity) || 0),
      observation: it.observation,
      removed: it.removedIngredients || [],
      extrasList: it.extraIngredients || [],
    })),
  );

  const titulo = conta.mesa || "Conta";
  const ocupada = conta.situacao !== "finalizada";
  const tempo = tempoAbertoISO(conta.aberturaISO, agora);
  const aberturaHora = conta.aberturaISO
    ? new Date(conta.aberturaISO).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;
  const aberturaFmt = conta.aberturaISO
    ? new Date(conta.aberturaISO).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  const pedidoRef = pedidos[0]?.id || conta.comandas?.[0] || "—";
  const comandasTxt = (conta.comandas || []).join(", ");
  const edicaoAtiva = typeof onAlterarQtd === "function" && !produtosBloqueados;

  return (
    <aside className={`flex w-full flex-col overflow-hidden border-[var(--pp-border)] bg-[var(--pp-surface)] ${className}`}>
      <div className="shrink-0 border-b border-[var(--pp-border)] px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-lg font-black tracking-tight text-[var(--pp-text)] sm:text-2xl">{titulo}</h2>
          <span className={`inline-flex shrink-0 rounded-md px-2 py-0.5 text-[11px] font-black ${
            ocupada
              ? "bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]"
              : "bg-[var(--pp-success-soft)] text-[var(--pp-success-text)]"
          }`}>
            {ocupada ? "Ocupada" : "Finalizada"}
          </span>
        </div>

        <div className="mt-1.5 grid gap-0.5 text-[13px] sm:mt-2 sm:gap-1 sm:text-sm">
          <MetaLinha rotulo="Cliente">
            <span className="font-black text-[var(--pp-text)]">{conta.cliente || "Não identificado"}</span>
            {conta.vip && (
              <span className="ml-1.5 rounded-md bg-[var(--op-nav-accent)]/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--op-nav-accent)]">VIP</span>
            )}
            {typeof onEditarCliente === "function" && (
              <button
                type="button"
                onClick={onEditarCliente}
                className="ml-1.5 inline-flex min-h-9 items-center gap-1 rounded-lg border border-[var(--pp-border)] bg-white px-2 py-1 text-[11px] font-black text-[var(--pp-text-body)] active:bg-[var(--pp-bg)]"
              >
                <Pencil size={12} aria-hidden="true" />
                {conta.cliente || conta.telefone ? "Trocar" : "Incluir"}
              </button>
            )}
          </MetaLinha>
          <p className="flex flex-wrap items-center gap-x-2 text-[var(--pp-text-body)]">
            {conta.telefone && (
              <span className="font-bold tabular-nums text-[var(--pp-text)]">{conta.telefone}</span>
            )}
            {comandasTxt && <span className="text-[var(--pp-text-muted)]">· {comandasTxt}</span>}
            {tempo && (
              <span className="text-[var(--pp-text-muted)]">
                · {tempo}{aberturaHora ? ` · ${aberturaHora}` : ""}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-2.5 sm:px-4 sm:pt-3">
          <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">
            Produtos do pedido
          </h3>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-[var(--pp-bg)] px-2 py-0.5 text-[11px] font-black text-[var(--pp-text-body)]">
              {itens.length} {itens.length === 1 ? "item" : "itens"}
            </span>
            {typeof onIncluirProduto === "function" && (
              <button
                type="button"
                onClick={onIncluirProduto}
                disabled={produtosBloqueados}
                title={produtosBloqueados ? "Comprovante emitido — inclusão bloqueada" : "Incluir produto"}
                className="btn-laranja inline-flex h-10 items-center gap-1 rounded-lg px-2.5 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50 sm:h-8"
              >
                <Plus size={14} aria-hidden="true" /> Incluir
              </button>
            )}
          </div>
        </div>

        {produtosBloqueados && (
          <p className="mx-3 mb-2 shrink-0 rounded-lg border border-[var(--pp-warning)]/35 bg-[var(--pp-warning-soft)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--pp-warning-text)] sm:mx-3">
            Comprovante emitido — inclusão de produtos bloqueada.
          </p>
        )}

        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 pb-3 sm:px-3">
          {itens.map((it) => (
            <li
              key={it.key}
              className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5"
            >
              <div className="flex items-start gap-2.5">
                <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-lg bg-[var(--pp-primary-soft)] text-sm font-black text-[var(--pp-primary-text)]">
                  {it.quantity}x
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-black leading-snug tracking-tight text-[var(--pp-text)] sm:text-base">
                    {it.name}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-[var(--pp-text-muted)]">
                    {formatCurrency(it.unit)} <span className="font-normal">un.</span>
                  </p>
                  {it.observation && (
                    <p className="mt-1 text-xs font-semibold leading-snug text-[var(--pp-warning-text)]">
                      Obs.: {it.observation}
                    </p>
                  )}
                  {it.removed?.length > 0 && (
                    <p className="mt-0.5 text-[11px] font-semibold text-[var(--pp-text-muted)]">
                      Sem: {it.removed.join(", ")}
                    </p>
                  )}
                  {it.extrasList?.length > 0 && (
                    <p className="mt-0.5 text-[11px] font-semibold text-[var(--pp-text-muted)]">
                      Extra: {it.extrasList.join(", ")}
                    </p>
                  )}
                  {edicaoAtiva && (
                    <ControlesItem
                      quantity={it.quantity}
                      onMenos={() => onAlterarQtd?.(it.orderId, it.index, it.quantity - 1)}
                      onMais={() => onAlterarQtd?.(it.orderId, it.index, it.quantity + 1)}
                      onRemover={() => onRemoverItem?.(it.orderId, it.index)}
                    />
                  )}
                </div>
                <span className="shrink-0 text-right text-sm font-black tabular-nums text-[var(--pp-text)] sm:text-base">
                  {formatCurrency(it.total)}
                </span>
              </div>
            </li>
          ))}
          {itens.length === 0 && (
            <li className="rounded-xl border border-dashed border-[var(--pp-border)] px-3 py-8 text-center text-sm text-[var(--pp-text-muted)]">
              Nenhum produto nesta conta.
              {typeof onIncluirProduto === "function" && !produtosBloqueados && (
                <button type="button" onClick={onIncluirProduto} className="btn-laranja mt-3 inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-black text-white">
                  <Plus size={14} aria-hidden="true" /> Incluir produto
                </button>
              )}
            </li>
          )}
        </ul>
      </div>

      <div className="shrink-0 border-t border-[var(--pp-border)] px-3 py-2 sm:px-4 sm:py-3">
        <div className="space-y-0.5 text-sm sm:space-y-1">
          <LinhaTot label="Subtotal" valor={formatCurrency(subtotal)} className="hidden sm:flex" />
          <LinhaTot label="Taxas e descontos" valor={formatCurrency(taxasDescontos)} className="hidden sm:flex" />
          <LinhaTot label="Total geral" valor={formatCurrency(total)} destaque />
        </div>
        <p className="mt-1 hidden text-xs text-[var(--pp-text-muted)] sm:block">
          Pedido #{pedidoRef} · aberto em {aberturaFmt}
        </p>
      </div>
    </aside>
  );
}

function MetaLinha({ rotulo, children }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-[var(--pp-text-body)]">
      <span className="font-semibold text-[var(--pp-text-muted)]">{rotulo}:</span>
      {children}
    </p>
  );
}

function LinhaTot({ label, valor, destaque, className = "" }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <span className={`font-semibold ${destaque ? "text-[var(--pp-text)]" : "text-[var(--pp-text-muted)]"}`}>{label}</span>
      <span className={`font-black tabular-nums ${destaque ? "text-xl text-[var(--pp-primary)] sm:text-xl" : "text-[var(--pp-text)]"}`}>{valor}</span>
    </div>
  );
}
