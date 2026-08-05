import { formatCurrency, tempoAbertoISO } from "./pdvHelpers";

/**
 * Coluna esquerda — detalhe da conta/mesa selecionada (itens, totais, observações).
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
      <aside className="flex w-full flex-col overflow-hidden border-b border-[var(--pp-border)] bg-[var(--pp-surface)] lg:w-[300px] lg:shrink-0 lg:border-b-0 lg:border-r">
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
      quantity: it.quantity,
      total: (Number(it.price) || 0) * (Number(it.quantity) || 0),
      observation: it.observation,
    })),
  );

  const observacoes = [
    ...pedidos.flatMap((o) => (o.items || []).map((it) => it.observation).filter(Boolean)),
  ].filter(Boolean);
  const obsUnicas = [...new Set(observacoes)];

  const titulo = conta.mesa || "Conta";
  const ocupada = conta.situacao !== "finalizada";
  const tempo = tempoAbertoISO(conta.aberturaISO, agora);
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
    <aside className="flex w-full flex-col overflow-hidden border-b border-[var(--pp-border)] bg-[var(--pp-surface)] lg:w-[300px] lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="border-b border-[var(--pp-border)] px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-black tracking-tight text-[var(--pp-text)]">{titulo}</h2>
            <span className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-[11px] font-black ${
              ocupada
                ? "bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]"
                : "bg-[var(--pp-success-soft)] text-[var(--pp-success-text)]"
            }`}>
              {ocupada ? "Mesa ocupada" : "Mesa finalizada"}
            </span>
          </div>
        </div>

        <div className="mt-3 space-y-1.5 text-sm">
          <p className="flex flex-wrap items-center gap-2 text-[var(--pp-text-body)]">
            <span className="font-semibold text-[var(--pp-text-muted)]">Cliente:</span>
            <span className="font-black text-[var(--pp-text)]">{conta.cliente || "Não identificado"}</span>
            {conta.vip && (
              <span className="rounded-md bg-[var(--op-nav-accent)]/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--op-nav-accent)]">VIP</span>
            )}
          </p>
          {conta.telefone && (
            <p className="text-[var(--pp-text-body)]">
              <span className="font-semibold text-[var(--pp-text-muted)]">Telefone:</span>{" "}
              <span className="font-bold text-[var(--pp-text)]">{conta.telefone}</span>
            </p>
          )}
          {comandasTxt && (
            <p className="text-[var(--pp-text-body)]">
              <span className="font-semibold text-[var(--pp-text-muted)]">Comanda:</span>{" "}
              <span className="font-bold text-[var(--pp-text)]">{comandasTxt}</span>
            </p>
          )}
          {tempo && (
            <p className="text-[var(--pp-text-body)]">
              <span className="font-semibold text-[var(--pp-text-muted)]">Tempo aberta:</span>{" "}
              <span className="font-bold text-[var(--pp-text)]">{tempo}</span>
              {conta.aberturaISO && (
                <span className="text-[var(--pp-text-muted)]">
                  {" "}(aberta às {new Date(conta.aberturaISO).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="border-b border-[var(--pp-border)] px-4 py-3">
        <div className="space-y-1 text-sm">
          <LinhaTot label="Subtotal" valor={formatCurrency(subtotal)} />
          <LinhaTot label="Taxas e descontos" valor={formatCurrency(taxasDescontos)} />
          <LinhaTot label="Total geral" valor={formatCurrency(total)} destaque />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-[var(--pp-text-muted)]">
          Itens consumidos ({itens.length})
        </p>
        <ul className="space-y-2.5">
          {itens.map((it) => (
            <li key={it.key} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-bold leading-snug text-[var(--pp-text)]">{it.name}</p>
                <p className="text-xs font-semibold text-[var(--pp-text-muted)]">{it.quantity}x</p>
              </div>
              <span className="shrink-0 font-black tabular-nums text-[var(--pp-text)]">{formatCurrency(it.total)}</span>
            </li>
          ))}
          {itens.length === 0 && (
            <li className="py-6 text-center text-sm text-[var(--pp-text-muted)]">Nenhum item nesta conta.</li>
          )}
        </ul>

        {obsUnicas.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-[var(--pp-text-muted)]">Observações</p>
            <div className="flex flex-wrap gap-1.5">
              {obsUnicas.map((obs) => (
                <span key={obs} className="rounded-md border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2 py-1 text-xs font-bold text-[var(--pp-text-body)]">
                  {obs}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--pp-border)] px-4 py-2.5 text-xs text-[var(--pp-text-muted)]">
        Pedido #{pedidoRef} · aberto em {aberturaFmt}
      </div>
    </aside>
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
