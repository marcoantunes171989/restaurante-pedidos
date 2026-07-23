import { Reveal, SectionHeading } from "../ui";
import { Icone } from "../icons";
import { INDICADORES_PAINEL, RECURSOS_PAINEL } from "../content";

const HORAS = [
  { h: "11h", v: 420 }, { h: "12h", v: 980 }, { h: "13h", v: 760 }, { h: "15h", v: 340 },
  { h: "18h", v: 690 }, { h: "19h", v: 1180 }, { h: "20h", v: 1460 }, { h: "21h", v: 1050 }, { h: "22h", v: 520 },
];
const RANKING = [
  { nome: "Pizza Margherita", vendas: 86 }, { nome: "Combo Smash Duplo", vendas: 71 }, { nome: "Chopp Artesanal 500ml", vendas: 64 },
];
const MESAS = ["livre", "ocupada", "aguardando", "livre", "ocupada", "livre", "ocupada", "aguardando", "livre", "livre", "ocupada", "livre"];
const COR_MESA = { livre: "bg-[var(--pp-success)]", ocupada: "bg-[var(--pp-primary-hover)]", aguardando: "bg-[var(--pp-warning)]" };

// "Dashboard Premium" — mockup grande e detalhado do painel administrativo:
// gráfico, KPIs, ranking de produtos e mapa de mesas no mesmo cartão.
// Dados ilustrativos (formato real do painel, não métrica de cliente).
export default function DashboardPremium() {
  const max = Math.max(...HORAS.map((x) => x.v));
  return (
    <section className="section bg-white">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading badge="Dashboard premium" titulo="Um painel à altura da decisão que ele precisa embasar"
          desc="Faturamento, ticket médio, ranking de produtos, tempo de preparo e mapa de mesas — tudo no mesmo lugar, atualizado a cada pedido." />

        <Reveal delay={140} className="mt-14 overflow-hidden rounded-[1.75rem] border border-[var(--pp-border)] bg-white shadow-[0_40px_90px_-40px_rgba(28,20,15,0.35)]">
          <div className="flex items-center justify-between border-b border-[var(--pp-border)] bg-[var(--pp-bg)] px-6 py-4">
            <p className="font-display text-sm font-bold text-[var(--pp-graphite)]">Painel administrativo</p>
            <span className="rounded-full bg-[#2F9E52]/10 px-3 py-1 text-[10px] font-bold text-[var(--pp-success-text)]">● Em tempo real</span>
          </div>

          <div className="grid gap-px bg-[var(--pp-border)] lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-6 bg-white p-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {INDICADORES_PAINEL.map((k) => (
                  <div key={k.label} className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">{k.label}</p>
                    <p className="font-display mt-1 text-lg font-black" style={{ color: k.cor }}>{k.valor}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs font-bold text-[var(--pp-graphite)]">Faturamento por horário</p>
                <div className="mt-3 flex items-end justify-between gap-1.5" style={{ height: 100 }}>
                  {HORAS.map((x) => (
                    <div key={x.h} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <div className="w-full rounded-t-md" style={{ height: Math.max(6, (x.v / max) * 84), background: x.v === max ? "#B8872A" : "#C63F1D" }} />
                      <span className="text-[8px] font-semibold text-[var(--pp-text-muted)]">{x.h}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-[var(--pp-graphite)]">Ranking de produtos</p>
                <div className="mt-3 space-y-2">
                  {RANKING.map((r, i) => (
                    <div key={r.nome} className="flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--pp-graphite)] text-[10px] font-black text-white">{i + 1}</span>
                      <span className="flex-1 text-xs font-semibold text-[var(--pp-graphite)]">{r.nome}</span>
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--pp-bg)]">
                        <div className="h-full rounded-full bg-[var(--pp-primary-hover)]" style={{ width: `${r.vendas}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6 bg-[var(--pp-bg)] p-6">
              <div>
                <p className="text-xs font-bold text-[var(--pp-graphite)]">Mapa de mesas</p>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {MESAS.map((m, i) => (
                    <div key={i} className={`flex h-10 items-center justify-center rounded-lg text-[10px] font-black text-white ${COR_MESA[m]}`}>{String(i + 1).padStart(2, "0")}</div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-semibold text-[var(--pp-text-muted)]">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--pp-success)]" /> Livre</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--pp-primary-hover)]" /> Ocupada</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--pp-warning)]" /> Aguardando</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-[var(--pp-graphite)]">Recursos deste painel</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {RECURSOS_PAINEL.map((r) => (
                    <span key={r} className="flex items-center gap-1 rounded-full border border-[var(--pp-border)] bg-white px-2.5 py-1 text-[10px] font-semibold text-[var(--pp-text-body)]">
                      <Icone nome="check" className="h-3 w-3 text-[var(--pp-success-text)]" /> {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
        <Reveal delay={200} className="mt-4 text-center text-[11px] text-[var(--pp-text-muted)]">Ilustrativo — mostra o formato real do painel, não métricas de um cliente específico.</Reveal>
      </div>
    </section>
  );
}
