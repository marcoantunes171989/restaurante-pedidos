import { ClipboardList, Receipt, UserRound, Phone, MapPin } from "lucide-react";
import { formatCurrency, tempoAbertoISO } from "./pdvHelpers";

/**
 * Grades de cards no padrão do salão — Cliente, Comanda e Pedido.
 * Dados vindos dos pedidos/clientes reais da loja.
 */
export default function PdvCanalGrid({
  canal = "cliente",
  itens = [],
  selecionadoKey,
  onSelecionar,
  agora,
}) {
  const meta = META_CANAL[canal] || META_CANAL.cliente;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
        <h2 className="text-sm font-black text-[var(--pp-text)]">{meta.titulo}</h2>
        <span className="rounded-full bg-[var(--pp-bg)] px-2.5 py-0.5 text-[11px] font-black text-[var(--pp-text-body)]">
          {itens.length} {itens.length === 1 ? meta.unidade : meta.unidadePlural}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        {itens.length === 0 ? (
          <div className="grid h-full min-h-[160px] place-items-center rounded-xl border border-dashed border-[var(--pp-border)] bg-[var(--pp-surface)] px-4 py-8 text-center">
            <div>
              <meta.Icon size={28} className="mx-auto mb-2 text-[var(--pp-text-muted)]" aria-hidden="true" />
              <p className="text-sm font-black text-[var(--pp-text)]">{meta.vazioTitulo}</p>
              <p className="mt-1 text-xs text-[var(--pp-text-muted)]">{meta.vazioDesc}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {itens.map((item) => {
              const selected = selecionadoKey === item.key;
              const ocupada = item.status === "ocupada" || item.status === "pendente" || item.status === "aberto";
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelecionar?.(item)}
                  className={`relative flex min-h-[112px] flex-col items-start justify-between rounded-xl border bg-[var(--pp-surface)] p-3 text-left transition active:scale-[0.99] ${
                    selected
                      ? "border-[var(--pp-primary)] shadow-[0_0_0_2px_rgba(230,126,34,0.25)]"
                      : "border-[var(--pp-border)] hover:border-[var(--pp-primary)]/50"
                  }`}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-[var(--pp-text)]">{item.titulo}</p>
                      {item.subtitulo && (
                        <p className="mt-0.5 truncate text-xs font-semibold text-[var(--pp-text-muted)]">{item.subtitulo}</p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase ${
                      ocupada
                        ? item.status === "pendente"
                          ? "bg-[var(--pp-warning-soft)] text-[var(--pp-warning-text)]"
                          : "bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]"
                        : "bg-[var(--pp-success-soft)] text-[var(--pp-success-text)]"
                    }`}>
                      {item.statusLabel || (ocupada ? "Aberto" : "OK")}
                    </span>
                  </div>

                  <div className="mt-2 flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-[var(--pp-text-muted)]">
                    {item.telefone && (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Phone size={11} aria-hidden="true" /> {item.telefone}
                      </span>
                    )}
                    {item.mesa && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={11} aria-hidden="true" /> {item.mesa}
                      </span>
                    )}
                    {item.comanda && canal !== "comanda" && (
                      <span className="inline-flex items-center gap-1">
                        <ClipboardList size={11} aria-hidden="true" /> {item.comanda}
                      </span>
                    )}
                    {item.vip && (
                      <span className="rounded-md bg-[var(--op-nav-accent)]/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-[var(--op-nav-accent)]">VIP</span>
                    )}
                  </div>

                  {item.produtosResumo && (
                    <p className="mt-1.5 line-clamp-2 w-full text-[11px] font-semibold leading-snug text-[var(--pp-text-body)]">
                      {item.produtosResumo}
                    </p>
                  )}

                  <div className="mt-auto flex w-full items-end justify-between gap-2 pt-2">
                    <span className="text-[11px] font-semibold text-[var(--pp-text-muted)]">
                      {item.aberturaISO ? tempoAbertoISO(item.aberturaISO, agora) : item.meta || "—"}
                    </span>
                    <span className="text-sm font-black tabular-nums text-[var(--pp-text)]">
                      {formatCurrency(item.total || 0)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

const META_CANAL = {
  cliente: {
    titulo: "Clientes identificados",
    unidade: "cliente",
    unidadePlural: "clientes",
    Icon: UserRound,
    vazioTitulo: "Nenhum cliente identificado",
    vazioDesc: "Clientes com nome ou telefone na compra aparecem aqui — como as mesas do salão.",
  },
  comanda: {
    titulo: "Comandas em aberto",
    unidade: "comanda",
    unidadePlural: "comandas",
    Icon: ClipboardList,
    vazioTitulo: "Nenhuma comanda aberta",
    vazioDesc: "Comandas com consumo em andamento aparecem neste painel.",
  },
  pedido: {
    titulo: "Pedidos em aberto",
    unidade: "pedido",
    unidadePlural: "pedidos",
    Icon: Receipt,
    vazioTitulo: "Nenhum pedido em aberto",
    vazioDesc: "Pedidos não pagos da loja aparecem aqui para seleção rápida.",
  },
};
