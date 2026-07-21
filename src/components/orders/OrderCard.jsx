import { User, CreditCard, MoreVertical } from "lucide-react";
import OrderStatusBadge from "./OrderStatusBadge";
import { STATUS_ACCENT } from "./orderStatusColors";
import OrderOriginBadge from "./OrderOriginBadge";
import OrderActionButton from "./OrderActionButton";

// Mesma formatação de modificadores ("− ingrediente, + ingrediente,
// observação") de src/components/OrderItemsList.jsx (tema escuro,
// compartilhado com Cozinha/Bar) — lógica idêntica, só reescrita com as
// classes do tema claro em vez de duplicar/alterar aquele arquivo.
function ItensLista({ items = [] }) {
  return (
    <div className="flex flex-col gap-2 border-t border-dashed border-[var(--pp-border)] pt-3">
      {items.map((it, i) => {
        const mods = [
          ...(it.removedIngredients || []).map((x) => "− " + x),
          ...(it.extraIngredients || []).map((x) => "+ " + x),
          it.observation,
        ].filter(Boolean).join(" · ");
        return (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2.5 text-[13.5px]">
              <span className="min-w-[30px] shrink-0 rounded-md bg-[var(--pp-bg)] px-1.5 py-0.5 text-center text-xs font-bold tabular-nums text-[var(--pp-text-body)]">{it.quantity}×</span>
              <span className="text-[var(--pp-text)]">{it.name}</span>
            </div>
            {mods && <p className="ml-[38px] text-xs leading-snug text-[var(--pp-warning-text)]">{mods}</p>}
          </div>
        );
      })}
    </div>
  );
}

function SetorBloco({ sk, its, metaSetor }) {
  const sm = metaSetor(sk);
  return (
    <div className="mt-1">
      <span className="mb-2 inline-flex items-center rounded-lg bg-[var(--pp-brand)]/10 px-2.5 py-1 text-[11px] font-bold text-[var(--pp-brand-text)]">{sm.label}</span>
      <ItensLista items={its} />
    </div>
  );
}

/**
 * Card de pedido (tema claro) — usado só pela tela Pedidos
 * (src/pages/CentralDePedidos.jsx). Cozinha/Bar continuam usando
 * OperationalOrderCardDark (tema escuro, inalterado) — mesmos dados,
 * apresentação diferente. `acao` é o objeto cru vindo de
 * `acaoPrincipal(o)` (App.jsx: { l, fn, disabled }), não mais o JSX
 * pré-montado — este componente decide seu próprio ícone/estados.
 */
export default function OrderCard({
  o, variante, setoresNoPedido = [], acao,
  origemDe, haTxt, numeroPedido, itensDoSetor, metaSetor,
  destacado = false, cardRef,
}) {
  const org = origemDe(o);
  const [tableBase, tableSub] = String(o.table || "").split(" · ");
  const mostrarMenu = variante === "novo"; // paridade com o comportamento atual (ver nota abaixo)

  return (
    <article ref={cardRef} className={`relative overflow-hidden rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 shadow-[0_1px_2px_rgba(43,35,32,0.04),0_2px_10px_rgba(43,35,32,0.05)] transition-shadow duration-200 hover:shadow-[0_4px_18px_rgba(43,35,32,0.09)] ${destacado ? "pp-order-destaque" : ""}`}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: STATUS_ACCENT[variante] }} />

      <div className="mb-3 flex items-center justify-between gap-2 pl-2">
        <OrderStatusBadge variante={variante} />
        <OrderOriginBadge origem={org} tempoTexto={haTxt(o)} />
      </div>

      <div className="pl-2">
        <h4 className="text-base font-bold leading-tight text-[var(--pp-text)]">
          Pedido #{numeroPedido[o.id] ?? "—"} <span className="font-semibold text-[var(--pp-text-body)]">· {tableBase || o.table}</span>
        </h4>
        <p className="mt-0.5 text-[11px] tracking-wide text-[var(--pp-text-muted)]">{o.id}{tableSub ? ` · ${tableSub}` : ""}</p>
      </div>

      <div className="mt-3 flex flex-col gap-1.5 pl-2">
        <div className="flex items-center gap-2 text-sm">
          <User aria-hidden="true" size={14} className="shrink-0 text-[var(--pp-text-muted)]" />
          <span className="font-semibold text-[var(--pp-text)]">{o.customer || "Cliente"}</span>
        </div>
        {o.pagamentoForma && (
          <div className="flex items-center gap-2 text-sm text-[var(--pp-text-body)]">
            <CreditCard aria-hidden="true" size={14} className="shrink-0 text-[var(--pp-text-muted)]" />
            {o.pagamentoForma}{o.pagamentoMomento ? ` · ${o.pagamentoMomento}` : ""}
          </div>
        )}
      </div>

      <div className="pl-2">
        {setoresNoPedido.map((sk) => {
          const its = itensDoSetor(o, sk);
          if (its.length === 0) return null;
          return <SetorBloco key={sk} sk={sk} its={its} metaSetor={metaSetor} />;
        })}
      </div>

      {acao && (
        <div className="mt-4 flex gap-2 pl-2">
          <OrderActionButton a={acao} variante={variante} />
          {/* Botão preservado por paridade com o comportamento atual (o
              menu de ações desta tela já não tinha nenhuma opção
              implementada — sem handler, sem popover — só neste ponto do
              fluxo/"novo"); mantido decorativo em vez de simular um menu
              vazio ou inventar ações que não existem hoje. */}
          {mostrarMenu && (
            <button type="button" aria-label="Mais opções" className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-muted)] transition-colors duration-150 hover:bg-[var(--pp-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)]">
              <MoreVertical aria-hidden="true" size={18} />
            </button>
          )}
        </div>
      )}
    </article>
  );
}
