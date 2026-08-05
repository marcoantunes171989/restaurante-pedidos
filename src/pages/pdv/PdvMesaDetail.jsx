import { Clock, HandCoins, Pencil, Plus, Users } from "lucide-react";
import { formatCurrency, tempoAbertoISO } from "./pdvHelpers";
import { ControlesItem } from "./PdvModais";

/**
 * Painel da conta — produtos em destaque (valor ao produto).
 * Sem conta aberta, a mesma coluna mostra a ficha da mesa Disponível,
 * para o operador confirmar qual mesa vai receber o próximo cliente.
 */
export default function PdvMesaDetail({
  conta,
  pedidos = [],
  subtotal = 0,
  taxasDescontos = 0,
  total = 0,
  agora,
  mesaLivre = null,
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
        {mesaLivre ? (
          <MesaDisponivel mesa={mesaLivre} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-5 text-center">
            <p className="text-[13px] font-black text-[var(--pp-text)]">Nenhuma mesa selecionada</p>
            <p className="max-w-xs text-[11px] text-[var(--pp-text-muted)]">
              Toque em uma mesa do salão ou busque por número, cliente, produto ou valor.
            </p>
          </div>
        )}
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
  const tempo = tempoAbertoISO(conta.aberturaISO, agora);
  const aberturaHora = conta.aberturaISO
    ? new Date(conta.aberturaISO).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;
  const pedidoRef = pedidos[0]?.id || conta.comandas?.[0] || "—";
  const comandasTxt = (conta.comandas || []).join(", ");
  const edicaoAtiva = typeof onAlterarQtd === "function" && !produtosBloqueados;
  const statusPedido = conta.statusPedido;

  return (
    <aside className={`flex w-full flex-col overflow-hidden border-[var(--pp-border)] bg-[var(--pp-surface)] ${className}`}>
      <div className="shrink-0 border-b border-[var(--pp-border)] px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-[15px] font-black tracking-tight text-[var(--pp-text)]">{titulo}</h2>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase ${
            conta.solicitada
              ? "bg-[#FBEFC4] text-[#8D6708]"
              : "bg-[#FCE8D4] text-[#B3600E]"
          }`}>
            {conta.solicitada && <HandCoins size={10} aria-hidden="true" />}
            {conta.solicitada ? "Conta solicitada" : "Ocupada"}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1">
          {statusPedido && (
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${statusPedido.chip}`}>
              {statusPedido.label}
            </span>
          )}
          {tempo && (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold text-[var(--pp-text-muted)]">
              <Clock size={10} aria-hidden="true" />
              {tempo} na mesa{aberturaHora ? ` · ${aberturaHora}` : ""}
            </span>
          )}
        </div>

        <div className="mt-1 grid gap-0.5 text-[11px]">
          <p className="flex flex-wrap items-center gap-x-1 text-[var(--pp-text-body)]">
            <span className="font-semibold text-[var(--pp-text-muted)]">Cliente:</span>
            <span className="truncate font-bold text-[var(--pp-text)]">{conta.cliente || "Não identificado"}</span>
            {conta.vip && (
              <span className="rounded bg-[var(--op-nav-accent-soft)] px-1 py-px text-[9px] font-black uppercase text-[var(--op-nav-accent)]">VIP</span>
            )}
            {typeof onEditarCliente === "function" && (
              <button
                type="button"
                onClick={onEditarCliente}
                className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md border border-[var(--pp-border)] bg-[var(--pp-surface)] px-1.5 text-[9px] font-black text-[var(--pp-text-body)]"
              >
                <Pencil size={10} aria-hidden="true" />
                {conta.cliente || conta.telefone ? "Trocar" : "Incluir"}
              </button>
            )}
          </p>
          {(conta.telefone || comandasTxt) && (
            <p className="truncate text-[10px] text-[var(--pp-text-muted)]">
              {conta.telefone && <span className="font-semibold tabular-nums text-[var(--pp-text-body)]">{conta.telefone}</span>}
              {conta.telefone && comandasTxt && <span> · </span>}
              {comandasTxt}
            </p>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2 px-2.5 pb-1 pt-1.5">
          <h3 className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">
            Produtos
          </h3>
          <div className="flex items-center gap-1">
            <span className="rounded-full bg-[var(--pp-bg)] px-1.5 py-0.5 text-[9px] font-black text-[var(--pp-text-body)]">
              {itens.length} {itens.length === 1 ? "item" : "itens"}
            </span>
            {typeof onIncluirProduto === "function" && (
              <button
                type="button"
                onClick={onIncluirProduto}
                disabled={produtosBloqueados}
                title={produtosBloqueados ? "Comprovante emitido — inclusão bloqueada" : "Incluir produto"}
                className="btn-laranja inline-flex h-6 items-center gap-0.5 rounded-md px-1.5 text-[9px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={11} aria-hidden="true" /> Incluir
              </button>
            )}
          </div>
        </div>

        {produtosBloqueados && (
          <p className="mx-2.5 mb-1 shrink-0 rounded-md border border-[#F5DFA3] bg-[#FFFBEB] px-1.5 py-1 text-[9px] font-semibold text-[#8D6708]">
            Comprovante emitido — inclusão bloqueada.
          </p>
        )}

        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2.5 pb-2">
          {itens.map((it) => (
            <li
              key={it.key}
              className="overflow-hidden rounded-lg border border-[var(--pp-border)] bg-[var(--pp-surface)] px-2 py-1.5"
            >
              <div className="flex items-start gap-1.5">
                <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-md bg-[var(--pp-primary-soft)] text-[10px] font-black text-[var(--pp-primary-text)]">
                  {it.quantity}x
                </span>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate text-[12px] font-bold leading-snug text-[var(--pp-text)]">
                    {it.name}
                  </p>
                  <p className="text-[9px] font-semibold text-[var(--pp-text-muted)]">
                    {formatCurrency(it.unit)} <span className="font-normal">un.</span>
                  </p>
                  {it.observation && (
                    <p className="truncate text-[9px] font-semibold text-[#8D6708]">Obs.: {it.observation}</p>
                  )}
                  {it.removed?.length > 0 && (
                    <p className="truncate text-[9px] font-semibold text-[var(--pp-text-muted)]">Sem: {it.removed.join(", ")}</p>
                  )}
                  {it.extrasList?.length > 0 && (
                    <p className="truncate text-[9px] font-semibold text-[var(--pp-text-muted)]">Extra: {it.extrasList.join(", ")}</p>
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
                <span className="shrink-0 text-right text-[11px] font-black tabular-nums text-[var(--pp-text)]">
                  {formatCurrency(it.total)}
                </span>
              </div>
            </li>
          ))}
          {itens.length === 0 && (
            <li className="rounded-lg border border-dashed border-[var(--pp-border)] px-3 py-5 text-center text-[11px] text-[var(--pp-text-muted)]">
              Nenhum produto nesta conta.
              {typeof onIncluirProduto === "function" && !produtosBloqueados && (
                <button type="button" onClick={onIncluirProduto} className="btn-laranja mt-2 inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[10px] font-black text-white">
                  <Plus size={11} aria-hidden="true" /> Incluir produto
                </button>
              )}
            </li>
          )}
        </ul>
      </div>

      <div className="shrink-0 border-t border-[var(--pp-border)] px-2.5 py-1.5">
        <div className="space-y-0.5">
          <LinhaTot label="Subtotal" valor={formatCurrency(subtotal)} className="hidden sm:flex" />
          <LinhaTot label="Taxas e descontos" valor={formatCurrency(taxasDescontos)} className="hidden sm:flex" />
          <LinhaTot label="Total geral" valor={formatCurrency(total)} destaque />
        </div>
        <p className="mt-0.5 hidden truncate text-[9px] text-[var(--pp-text-muted)] sm:block">
          Pedido #{pedidoRef}
        </p>
      </div>
    </aside>
  );
}

/** Ficha da mesa livre — confirma visualmente qual mesa vai abrir. */
function MesaDisponivel({ mesa }) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[var(--pp-border)] px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-[15px] font-black tracking-tight text-[var(--pp-text)]">{mesa.label}</h2>
          <span className="shrink-0 rounded-md bg-[#DFF3E6] px-1.5 py-0.5 text-[9px] font-black uppercase text-[#1F7A3D]">
            Disponível
          </span>
        </div>
        <p className="mt-0.5 text-[10px] font-semibold text-[var(--pp-text-muted)]">Livre para receber um novo cliente</p>
      </div>

      <div className="flex-1 space-y-1.5 px-2.5 py-2.5">
        <FichaLinha Icon={Users} rotulo="Capacidade" valor={mesa.capacidade ? `${mesa.capacidade} lugares` : "Não informada"} />
        {mesa.localizacao && <FichaLinha rotulo="Localização" valor={mesa.localizacao} />}
        {mesa.nome && <FichaLinha rotulo="Identificação" valor={mesa.nome} />}
        <FichaLinha rotulo="Conta" valor="Sem consumo lançado" />
      </div>

      <div className="shrink-0 border-t border-[var(--pp-border)] px-2.5 py-2">
        <p className="text-[10px] leading-snug text-[var(--pp-text-muted)]">
          Os pedidos lançados nesta mesa (tablet, comanda ou QR Code) aparecem aqui automaticamente.
        </p>
      </div>
    </div>
  );
}

function FichaLinha({ Icon, rotulo, valor }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2 py-1.5">
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--pp-text-muted)]">
        {Icon && <Icon size={11} aria-hidden="true" />}
        {rotulo}
      </span>
      <span className="truncate text-[11px] font-black text-[var(--pp-text)]">{valor}</span>
    </div>
  );
}

function LinhaTot({ label, valor, destaque, className = "" }) {
  return (
    <div className={`flex h-5 items-center justify-between gap-2 ${className}`}>
      <span className={`shrink-0 text-[10px] font-semibold ${destaque ? "text-[var(--pp-text)]" : "text-[var(--pp-text-muted)]"}`}>{label}</span>
      <span className={`min-w-0 truncate text-right font-black tabular-nums ${destaque ? "text-[15px] text-[var(--pp-primary-text)]" : "text-[11px] text-[var(--pp-text)]"}`}>{valor}</span>
    </div>
  );
}
