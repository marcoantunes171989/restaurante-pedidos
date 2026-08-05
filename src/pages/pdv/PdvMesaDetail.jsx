import { formatCurrency, tempoAbertoISO } from "./pdvHelpers";

/**
 * Coluna esquerda — conta da mesa com foco nos produtos consumidos.
 * Hierarquia: produtos em destaque; metadados da mesa e totais em apoio.
 */
export default function PdvMesaDetail({
  conta,
  pedidos = [],
  subtotal = 0,
  taxasDescontos = 0,
  total = 0,
  agora,
}) {
  if (!conta) {
    return (
      <aside className="flex w-full flex-col overflow-hidden border-b border-[var(--pp-border)] bg-[var(--pp-surface)] lg:w-[320px] lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="text-base font-black text-[var(--pp-text)]">Nenhuma mesa selecionada</p>
          <p className="text-sm text-[var(--pp-text-muted)]">Toque em uma mesa do salão ou busque por número, cliente ou pedido.</p>
        </div>
      </aside>
    );
  }

  const itens = pedidos.flatMap((o) =>
    (o.items || []).map((it, idx) => ({
      key: `${o.id}-${idx}`,
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

  return (
    <aside className="flex w-full flex-col overflow-hidden border-b border-[var(--pp-border)] bg-[var(--pp-surface)] lg:w-[320px] lg:shrink-0 lg:border-b-0 lg:border-r">
      {/* Cabeçalho compacto da mesa */}
      <div className="border-b border-[var(--pp-border)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-black tracking-tight text-[var(--pp-text)]">{titulo}</h2>
          <span className={`inline-flex shrink-0 rounded-md px-2 py-0.5 text-[11px] font-black ${
            ocupada
              ? "bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]"
              : "bg-[var(--pp-success-soft)] text-[var(--pp-success-text)]"
          }`}>
            {ocupada ? "Mesa ocupada" : "Mesa finalizada"}
          </span>
        </div>

        <div className="mt-2.5 grid gap-1 text-[13px]">
          <MetaLinha rotulo="Cliente">
            <span className="font-black text-[var(--pp-text)]">{conta.cliente || "Não identificado"}</span>
            {conta.vip && (
              <span className="ml-1.5 rounded-md bg-[var(--op-nav-accent)]/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--op-nav-accent)]">VIP</span>
            )}
          </MetaLinha>
          {conta.telefone && <MetaLinha rotulo="Telefone"><span className="font-bold tabular-nums text-[var(--pp-text)]">{conta.telefone}</span></MetaLinha>}
          {comandasTxt && <MetaLinha rotulo="Comanda"><span className="font-bold text-[var(--pp-text)]">{comandasTxt}</span></MetaLinha>}
          {tempo && (
            <MetaLinha rotulo="Tempo">
              <span className="font-bold text-[var(--pp-text)]">{tempo}</span>
              {aberturaHora && <span className="text-[var(--pp-text-muted)]"> · aberta às {aberturaHora}</span>}
            </MetaLinha>
          )}
        </div>
      </div>

      {/* Produtos — bloco principal (valor ao produto) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-baseline justify-between gap-2 px-4 pb-1 pt-3">
          <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">
            Produtos do pedido
          </h3>
          <span className="rounded-full bg-[var(--pp-bg)] px-2 py-0.5 text-[11px] font-black text-[var(--pp-text-body)]">
            {itens.length} {itens.length === 1 ? "item" : "itens"}
          </span>
        </div>

        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
          {itens.map((it) => (
            <li
              key={it.key}
              className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5"
            >
              <div className="flex items-start gap-2.5">
                <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-lg bg-[var(--pp-primary-soft)] text-sm font-black text-[var(--pp-primary-text)]">
                  {it.quantity}x
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-black leading-snug tracking-tight text-[var(--pp-text)]">
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
                </div>
                <span className="shrink-0 text-right text-sm font-black tabular-nums text-[var(--pp-text)]">
                  {formatCurrency(it.total)}
                </span>
              </div>
            </li>
          ))}
          {itens.length === 0 && (
            <li className="rounded-xl border border-dashed border-[var(--pp-border)] px-3 py-8 text-center text-sm text-[var(--pp-text-muted)]">
              Nenhum produto nesta conta.
            </li>
          )}
        </ul>
      </div>

      {/* Totais — apoio financeiro abaixo dos produtos */}
      <div className="border-t border-[var(--pp-border)] px-4 py-3">
        <div className="space-y-1 text-sm">
          <LinhaTot label="Subtotal" valor={formatCurrency(subtotal)} />
          <LinhaTot label="Taxas e descontos" valor={formatCurrency(taxasDescontos)} />
          <LinhaTot label="Total geral" valor={formatCurrency(total)} destaque />
        </div>
      </div>

      <div className="border-t border-[var(--pp-border)] px-4 py-2.5 text-xs text-[var(--pp-text-muted)]">
        Pedido #{pedidoRef} · aberto em {aberturaFmt}
      </div>
    </aside>
  );
}

function MetaLinha({ rotulo, children }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 text-[var(--pp-text-body)]">
      <span className="font-semibold text-[var(--pp-text-muted)]">{rotulo}:</span>
      {children}
    </p>
  );
}

function LinhaTot({ label, valor, destaque }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`font-semibold ${destaque ? "text-[var(--pp-text)]" : "text-[var(--pp-text-muted)]"}`}>{label}</span>
      <span className={`font-black tabular-nums ${destaque ? "text-lg text-[var(--pp-primary)]" : "text-[var(--pp-text)]"}`}>{valor}</span>
    </div>
  );
}
