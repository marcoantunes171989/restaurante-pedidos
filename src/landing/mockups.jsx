import { INDICADORES_PAINEL } from "./content";

// ════════════════════════════════════════════════════════════
//  Mockups visuais (JSX/CSS, sem imagens externas — o projeto não tem
//  fotos reais de tela para usar aqui). Representam o FORMATO real das
//  telas do sistema; os dados exibidos são ilustrativos, nunca métricas
//  reais de clientes.
// ════════════════════════════════════════════════════════════

// Mockup de tablet/mesa — usado no Hero.
export function MockupTablet() {
  const itens = [
    { q: 1, nome: "Pizza Margherita", preco: "42,90" },
    { q: 1, nome: "Pizza Calabresa", preco: "44,90" },
    { q: 2, nome: "Refrigerante 2L", preco: "14,90" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="pp-float rounded-[1.75rem] border border-[var(--pp-border)] bg-white p-4 shadow-[0_30px_80px_-30px_rgba(13,27,42,0.35)]">
        <div className="flex items-center justify-between rounded-2xl bg-[var(--pp-graphite)] px-4 py-3 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-base" aria-hidden="true">🍕</span>
            <div>
              <p className="font-display text-sm font-bold leading-none">Forno &amp; Lenha</p>
              <p className="mt-1 text-[10px] text-white/60">Mesa 07 · Comanda #124</p>
            </div>
          </div>
          <span className="rounded-full bg-[#F59E0B]/20 px-2.5 py-1 text-[10px] font-bold text-[var(--pp-warning-text)]">Em preparo</span>
        </div>
        <div className="mt-3 space-y-2">
          {itens.map((i) => (
            <div key={i.nome} className="flex items-center justify-between rounded-xl border border-[var(--pp-border)] px-3.5 py-2.5">
              <span className="text-sm text-[var(--pp-text-body)]"><b className="text-[var(--pp-graphite)]">{i.q}x</b> {i.nome}</span>
              <span className="font-display text-sm font-bold text-[var(--pp-graphite)]">R$ {i.preco}</span>
            </div>
          ))}
        </div>
        {/* Recebido/Preparando usam as MESMAS cores semânticas de status de
            pedido do resto do sistema (info/aviso) — mesma semântica nas
            três superfícies (landing, login, admin). */}
        <div className="mt-3 flex items-center gap-1.5">
          {["Recebido", "Preparando", "Pronto", "Entregue"].map((s, i) => (
            <div key={s} className="flex-1 text-center">
              <div className={`h-1.5 rounded-full ${i === 0 ? "bg-[var(--pp-info)]" : i === 1 ? "bg-[var(--pp-warning)]" : "bg-[var(--pp-border)]"}`} />
              <p className={`mt-1 text-[9px] font-bold ${i === 0 ? "text-[var(--pp-info)]" : i === 1 ? "text-[var(--pp-warning-text)]" : "text-[var(--pp-text-muted)]"}`}>{s}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-[var(--pp-bg)] px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--pp-text-muted)]">Total parcial</p>
            <p className="font-display text-xl font-black text-[var(--pp-graphite)]">R$ 117,60</p>
          </div>
          <span className="rounded-xl bg-[var(--pp-primary-hover)] px-3.5 py-2 text-xs font-bold text-white">Solicitar conta</span>
        </div>
      </div>
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,rgba(232,98,44,0.14),transparent)]" />
    </div>
  );
}

// Mockup de smartphone com cardápio digital — usado no Hero e na seção
// "Experiência do cliente".
export function MockupCardapioCliente() {
  const produtos = [
    { nome: "Combo Smash Duplo", preco: "36,90", tag: "Mais pedido" },
    { nome: "Batata rústica", preco: "18,90" },
    { nome: "Milkshake de morango", preco: "16,90" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-[280px]">
      <div className="pp-float rounded-[2rem] border border-[var(--pp-border)] bg-white p-3 shadow-[0_30px_80px_-30px_rgba(13,27,42,0.3)]">
        <div className="flex items-center justify-between px-2 pb-2">
          <p className="font-display text-sm font-bold text-[var(--pp-graphite)]">Cardápio</p>
          <span className="rounded-full bg-[#D4A017]/10 px-2 py-0.5 text-[9px] font-bold text-[var(--pp-brand-text)]">Aberto agora</span>
        </div>
        <div className="flex gap-1.5 overflow-hidden px-2">
          {["Lanches", "Bebidas", "Sobremesas"].map((c, i) => (
            <span key={c} className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${i === 0 ? "bg-[var(--pp-primary-hover)] text-white" : "bg-[#F5F4F0] text-[var(--pp-text-muted)]"}`}>{c}</span>
          ))}
        </div>
        <div className="mt-2 space-y-2 px-1">
          {produtos.map((p) => (
            <div key={p.nome} className="flex items-center gap-2.5 rounded-xl border border-[var(--pp-border)] p-2">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#F5F4F0] text-lg" aria-hidden="true">🍔</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[var(--pp-graphite)]">{p.nome}</p>
                {p.tag && <span className="text-[9px] font-bold text-[var(--pp-brand-text)]">{p.tag}</span>}
              </div>
              <span className="shrink-0 text-xs font-black text-[var(--pp-graphite)]">R$ {p.preco}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--pp-graphite)] px-3.5 py-2.5">
          <span className="text-xs font-bold text-white">Ver carrinho (3)</span>
          <span className="text-xs font-black text-[#D4A017]">R$ 72,70</span>
        </div>
      </div>
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,rgba(212,160,23,0.14),transparent)]" />
    </div>
  );
}

// Mockup de dashboard — usado na seção "Painel administrativo".
export function MockupDashboard() {
  const horas = [
    { h: "11h", v: 420 }, { h: "12h", v: 980 }, { h: "13h", v: 760 }, { h: "15h", v: 340 },
    { h: "18h", v: 690 }, { h: "19h", v: 1180 }, { h: "20h", v: 1460 }, { h: "21h", v: 1050 }, { h: "22h", v: 520 },
  ];
  const max = Math.max(...horas.map((x) => x.v));
  const ALT = 90;
  return (
    <div className="rounded-[1.75rem] border border-[var(--pp-border)] bg-white p-5 shadow-[0_30px_80px_-40px_rgba(13,27,42,0.35)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-sm font-bold text-[var(--pp-graphite)]">Faturamento por horário</p>
          <p className="mt-0.5 text-[11px] text-[var(--pp-text-muted)]">Ilustrativo — formato do painel real</p>
        </div>
        <span className="rounded-full bg-[#D4A017]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--pp-brand-text)]">+12% vs. ontem</span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-1.5" style={{ height: ALT + 18 }}>
        {horas.map((x) => {
          const pico = x.v === max;
          return (
            <div key={x.h} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div className="w-full rounded-t-md transition-all" style={{ height: Math.max(6, (x.v / max) * ALT), background: pico ? "#D4A017" : "#E8622C" }} />
              <span className="text-[8px] font-semibold leading-none text-[var(--pp-text-muted)]">{x.h}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {INDICADORES_PAINEL.map((k) => (
          <div key={k.label} className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--pp-text-muted)]">{k.label}</p>
            <p className="font-display mt-1 text-base font-black" style={{ color: k.cor }}>{k.valor}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
