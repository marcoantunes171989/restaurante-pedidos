import { ClipboardList, Clock, Receipt, UserRound, Phone, MapPin } from "lucide-react";
import { formatCurrency, tempoAbertoISO } from "./pdvHelpers";

/**
 * Grades de Comandas, Clientes e Pedidos — mesma densidade e leitura dos
 * cards do salão e do delivery, para o operador não trocar de linguagem
 * ao mudar de canal.
 */
export default function PdvCanalGrid({
  canal = "cliente",
  itens = [],
  selecionadoKey,
  onSelecionar,
  agora,
  busca = "",
}) {
  const meta = META_CANAL[canal] || META_CANAL.cliente;
  const filtrando = !!busca.trim();

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-0.5 pb-2">
        <h2 className="text-[13px] font-black text-[var(--pp-text)]">
          {meta.titulo}
          <span className="ml-1.5 font-bold text-[var(--pp-text-muted)]">{itens.length}</span>
        </h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
        {itens.length === 0 ? (
          <div className="grid h-full min-h-[140px] place-items-center rounded-xl border border-dashed border-[var(--pp-border)] bg-[var(--pp-surface)] px-4 py-6 text-center">
            <div>
              <meta.Icon size={22} className="mx-auto mb-1.5 text-[var(--pp-text-muted)]" aria-hidden="true" />
              <p className="text-[13px] font-black text-[var(--pp-text)]">
                {filtrando ? "Nada encontrado para esta busca" : meta.vazioTitulo}
              </p>
              <p className="mt-1 text-[11px] text-[var(--pp-text-muted)]">
                {filtrando ? "A busca procura por mesa, cliente, produto, valor ou telefone." : meta.vazioDesc}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(224px,1fr))] gap-1.5 sm:gap-2">
            {itens.map((item) => {
              const selected = selecionadoKey === item.key;
              const pendente = item.status === "pendente";
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelecionar?.(item)}
                  className={`flex flex-col gap-1 rounded-xl border bg-[var(--pp-surface)] p-2 text-left transition active:scale-[0.99] ${
                    selected
                      ? "border-[var(--pp-primary)] shadow-[0_0_0_2px_var(--pp-primary-soft)]"
                      : "border-[var(--pp-border)] hover:border-[var(--pp-primary)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="truncate text-[12px] font-black text-[var(--pp-text)]">{item.titulo}</span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                      item.statusChip || (pendente ? "bg-[#FBEFC4] text-[#012E46]" : "bg-[#FCE8D4] text-[#012E46]")
                    }`}>
                      {item.statusLabel || "Em aberto"}
                    </span>
                  </div>

                  {item.subtitulo && (
                    <p className="truncate text-[11px] font-bold text-[var(--pp-text-body)]">
                      {item.subtitulo}
                      {item.vip && (
                        <span className="ml-1 rounded bg-[var(--op-nav-accent-soft)] px-1 py-px text-[8px] font-black uppercase text-[var(--op-nav-accent)]">VIP</span>
                      )}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] font-semibold text-[var(--pp-text-muted)]">
                    {item.telefone && (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Phone size={9} aria-hidden="true" /> {item.telefone}
                      </span>
                    )}
                    {item.mesa && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin size={9} className="shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.mesa}</span>
                      </span>
                    )}
                    {item.comanda && canal !== "comanda" && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <ClipboardList size={9} className="shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.comanda}</span>
                      </span>
                    )}
                  </div>

                  {item.produtosResumo && (
                    <p className="line-clamp-2 text-[10px] font-semibold leading-snug text-[var(--pp-text-muted)]">
                      {item.produtosResumo}
                    </p>
                  )}

                  <div className="mt-auto flex items-end justify-between gap-2 pt-0.5">
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[var(--pp-text-muted)]">
                      <Clock size={9} aria-hidden="true" />
                      {item.aberturaISO ? tempoAbertoISO(item.aberturaISO, agora) : item.meta || "—"}
                    </span>
                    <span className="text-[12px] font-black tabular-nums text-[var(--pp-text)]">
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
    Icon: UserRound,
    vazioTitulo: "Nenhum cliente identificado",
    vazioDesc: "Clientes com nome ou telefone na compra aparecem aqui.",
  },
  comanda: {
    titulo: "Comandas em aberto",
    Icon: ClipboardList,
    vazioTitulo: "Nenhuma comanda aberta",
    vazioDesc: "Comandas com consumo em andamento aparecem neste painel.",
  },
  pedido: {
    titulo: "Pedidos em aberto",
    Icon: Receipt,
    vazioTitulo: "Nenhum pedido em aberto",
    vazioDesc: "Pedidos não pagos da loja aparecem aqui para seleção rápida.",
  },
};
