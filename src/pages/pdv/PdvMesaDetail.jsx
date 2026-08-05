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
      <div className="shrink-0 border-b border-[var(--pp-border)] px-3 py-2 sm:px-3.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-base font-black tracking-tight text-[var(--pp-text)] sm:text-lg">{titulo}</h2>
          <span className={`inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ${
            ocupada
              ? "bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]"
              : "bg-[var(--pp-success-soft)] text-[var(--pp-success-text)]"
          }`}>
            {ocupada ? "Ocupada" : "Finalizada"}
          </span>
        </div>

        <div className="mt-1 grid gap-0.5 text-xs sm:text-[13px]">
          <MetaLinha rotulo="Cliente">
            <span className="truncate font-bold text-[var(--pp-text)]">{conta.cliente || "Não identificado"}</span>
            {conta.vip && (
              <span className="ml-1 shrink-0 rounded-md bg-[var(--op-nav-accent)]/15 px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-[var(--op-nav-accent)]">VIP</span>
            )}
            {typeof onEditarCliente === "function" && (
              <button
                type="button"
                onClick={onEditarCliente}
                className="ml-1 inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md border border-[var(--pp-border)] bg-white px-1.5 text-[10px] font-black text-[var(--pp-text-body)]"
              >
                <Pencil size={11} aria-hidden="true" />
                {conta.cliente || conta.telefone ? "Trocar" : "Incluir"}
              </button>
            )}
          </MetaLinha>
          <p className="truncate text-[11px] text-[var(--pp-text-muted)]">
            {conta.telefone && <span className="font-semibold tabular-nums text-[var(--pp-text-body)]">{conta.telefone}</span>}
            {comandasTxt && <span> · {comandasTxt}</span>}
            {tempo && <span> · {tempo}{aberturaHora ? ` · ${aberturaHora}` : ""}</span>}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-2 sm:px-3.5">
          <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">
            Produtos do pedido
          </h3>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-[var(--pp-bg)] px-1.5 py-0.5 text-[10px] font-black text-[var(--pp-text-body)]">
              {itens.length} {itens.length === 1 ? "item" : "itens"}
            </span>
            {typeof onIncluirProduto === "function" && (
              <button
                type="button"
                onClick={onIncluirProduto}
                disabled={produtosBloqueados}
                title={produtosBloqueados ? "Comprovante emitido — inclusão bloqueada" : "Incluir produto"}
                className="btn-laranja inline-flex h-7 items-center gap-0.5 rounded-md px-2 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={12} aria-hidden="true" /> Incluir
              </button>
            )}
          </div>
        </div>

        {produtosBloqueados && (
          <p className="mx-3 mb-1.5 shrink-0 rounded-lg border border-[var(--pp-warning)]/35 bg-[var(--pp-warning-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--pp-warning-text)]">
            Comprovante emitido — inclusão bloqueada.
          </p>
        )}

        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 pb-2 sm:px-3.5">
          {itens.map((it) => (
            <li
              key={it.key}
              className="overflow-hidden rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2.5 py-2"
            >
              <div className="flex items-start gap-2">
                <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-md bg-[var(--pp-primary-soft)] text-[11px] font-black text-[var(--pp-primary-text)]">
                  {it.quantity}x
                </span>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate text-[13px] font-bold leading-snug text-[var(--pp-text)]">
                    {it.name}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-[var(--pp-text-muted)]">
                    {formatCurrency(it.unit)} <span className="font-normal">un.</span>
                  </p>
                  {it.observation && (
                    <p className="mt-0.5 truncate text-[10px] font-semibold text-[var(--pp-warning-text)]">
                      Obs.: {it.observation}
                    </p>
                  )}
                  {it.removed?.length > 0 && (
                    <p className="mt-0.5 truncate text-[10px] font-semibold text-[var(--pp-text-muted)]">
                      Sem: {it.removed.join(", ")}
                    </p>
                  )}
                  {it.extrasList?.length > 0 && (
                    <p className="mt-0.5 truncate text-[10px] font-semibold text-[var(--pp-text-muted)]">
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
                <span className="shrink-0 text-right text-xs font-black tabular-nums text-[var(--pp-text)]">
                  {formatCurrency(it.total)}
                </span>
              </div>
            </li>
          ))}
          {itens.length === 0 && (
            <li className="rounded-lg border border-dashed border-[var(--pp-border)] px-3 py-6 text-center text-xs text-[var(--pp-text-muted)]">
              Nenhum produto nesta conta.
              {typeof onIncluirProduto === "function" && !produtosBloqueados && (
                <button type="button" onClick={onIncluirProduto} className="btn-laranja mt-2 inline-flex h-9 items-center gap-1 rounded-lg px-3 text-[11px] font-black text-white">
                  <Plus size={12} aria-hidden="true" /> Incluir produto
                </button>
              )}
            </li>
          )}
        </ul>
      </div>

      <div className="shrink-0 border-t border-[var(--pp-border)] px-3 py-2 sm:px-3.5">
        <div className="space-y-0.5 text-xs">
          <LinhaTot label="Subtotal" valor={formatCurrency(subtotal)} className="hidden sm:flex" />
          <LinhaTot label="Taxas e descontos" valor={formatCurrency(taxasDescontos)} className="hidden sm:flex" />
          <LinhaTot label="Total geral" valor={formatCurrency(total)} destaque />
        </div>
        <p className="mt-1 hidden truncate text-[10px] text-[var(--pp-text-muted)] sm:block">
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
    <div className={`flex h-5 items-center justify-between gap-2 ${className}`}>
      <span className={`shrink-0 font-semibold ${destaque ? "text-[var(--pp-text)]" : "text-[var(--pp-text-muted)]"}`}>{label}</span>
      <span className={`min-w-0 truncate text-right font-black tabular-nums ${destaque ? "text-base text-[var(--pp-primary)]" : "text-xs text-[var(--pp-text)]"}`}>{valor}</span>
    </div>
  );
}
