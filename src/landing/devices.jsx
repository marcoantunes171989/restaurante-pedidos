import { Icone } from "./icons";

// ════════════════════════════════════════════════════════════
//  Mockups de dispositivos e telas — 100% CSS/SVG (sem imagens externas
//  nem geração de imagem: o projeto não tem fotografia real disponível
//  para esta página). Os "chrome" de notebook/tablet/celular/PDV/
//  impressora são desenhados aqui; o conteúdo de tela representa o
//  FORMATO real das telas do Pedido Prime, sempre com dados ilustrativos
//  — nunca métrica real de cliente.
// ════════════════════════════════════════════════════════════

// ── Chrome de dispositivos ─────────────────────────────────────
export function LaptopFrame({ children, className = "" }) {
  return (
    <div className={`w-full ${className}`}>
      <div className="rounded-t-2xl border border-b-0 border-[var(--pp-graphite)]/15 bg-[var(--pp-graphite)] p-2.5 shadow-[0_40px_90px_-30px_rgba(28,20,15,0.45)]">
        <div className="flex items-center gap-1.5 px-1 pb-2">
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        </div>
        <div className="overflow-hidden rounded-lg bg-white">{children}</div>
      </div>
      <div className="mx-auto h-3 w-[108%] max-w-none -translate-x-[4%] rounded-b-xl bg-gradient-to-b from-[var(--pp-graphite)] to-[var(--pp-graphite-deep)]" />
      <div className="mx-auto h-1.5 w-1/3 rounded-b-2xl bg-[var(--pp-graphite-deep)]" />
    </div>
  );
}

export function TabletFrame({ children, className = "" }) {
  return (
    <div className={`rounded-[1.6rem] border-[6px] border-[var(--pp-graphite)] bg-[var(--pp-graphite)] shadow-[0_30px_70px_-25px_rgba(28,20,15,0.4)] ${className}`}>
      <div className="overflow-hidden rounded-[1.05rem] bg-white">{children}</div>
    </div>
  );
}

export function PhoneFrame({ children, className = "" }) {
  return (
    <div className={`relative rounded-[2rem] border-[6px] border-[var(--pp-graphite)] bg-[var(--pp-graphite)] shadow-[0_30px_70px_-25px_rgba(28,20,15,0.4)] ${className}`}>
      <span className="absolute left-1/2 top-1.5 z-10 h-1.5 w-10 -translate-x-1/2 rounded-full bg-[var(--pp-graphite-deep)]" />
      <div className="overflow-hidden rounded-[1.45rem] bg-white">{children}</div>
    </div>
  );
}

export function PosFrame({ children, className = "" }) {
  return (
    <div className={`w-full max-w-[220px] rounded-2xl border-2 border-[var(--pp-graphite)] bg-[var(--pp-graphite)] p-2 shadow-[0_24px_60px_-24px_rgba(28,20,15,0.4)] ${className}`}>
      <div className="overflow-hidden rounded-xl bg-white">{children}</div>
      <div className="mx-auto mt-1.5 h-2 w-1/2 rounded-full bg-white/10" />
    </div>
  );
}

export function PrinterFrame({ className = "" }) {
  return (
    <div className={`w-full max-w-[200px] ${className}`}>
      <div className="rounded-t-xl border border-b-0 border-[var(--pp-border)] bg-white px-3 py-2.5 shadow-[0_20px_50px_-24px_rgba(28,20,15,0.3)]">
        <div className="h-1.5 w-2/3 rounded-full bg-[var(--pp-bg)]" />
        <div className="mt-1.5 h-1.5 w-1/2 rounded-full bg-[var(--pp-bg)]" />
      </div>
      <div className="h-8 rounded-b-xl border border-t-0 border-[var(--pp-graphite)]/15 bg-[var(--pp-graphite)]" />
      <div className="mx-auto -mt-1 h-10 w-[85%] rounded-b-md bg-white shadow-[0_10px_20px_-10px_rgba(28,20,15,0.35)]" style={{ clipPath: "polygon(0 0,100% 0,94% 100%,6% 100%)" }} />
    </div>
  );
}

// ── Conteúdos de tela reutilizáveis (para dentro dos frames acima) ──

export function TelaMesa() {
  const itens = [
    { q: 1, nome: "Pizza Margherita", preco: "42,90" },
    { q: 1, nome: "Pizza Calabresa", preco: "44,90" },
    { q: 2, nome: "Refrigerante 2L", preco: "14,90" },
  ];
  return (
    <div className="p-3.5">
      <div className="flex items-center justify-between rounded-xl bg-[var(--pp-graphite)] px-3.5 py-2.5 text-white">
        <div>
          <p className="font-display text-xs font-bold leading-none">Forno &amp; Lenha</p>
          <p className="mt-1 text-[9px] text-white/60">Mesa 07 · Comanda #012E46</p>
        </div>
        <span className="rounded-full bg-[#F38525]/25 px-2 py-1 text-[9px] font-bold text-white">Em preparo</span>
      </div>
      <div className="mt-2.5 space-y-1.5">
        {itens.map((i) => (
          <div key={i.nome} className="flex items-center justify-between rounded-lg border border-[var(--pp-border)] px-2.5 py-2">
            <span className="text-[11px] text-[var(--pp-text-body)]"><b className="text-[var(--pp-graphite)]">{i.q}x</b> {i.nome}</span>
            <span className="font-display text-[11px] font-bold text-[var(--pp-graphite)]">R$ {i.preco}</span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between rounded-xl bg-[var(--pp-bg)] px-3 py-2.5">
        <p className="font-display text-base font-black text-[var(--pp-graphite)]">R$ 117,60</p>
        <span className="rounded-lg bg-[var(--pp-primary-hover)] px-2.5 py-1.5 text-[10px] font-bold text-white">Solicitar conta</span>
      </div>
    </div>
  );
}

// `compacta`: usada quando o frame de destino é muito estreito (ex.:
// celular sobreposto no cluster do Hero) — remove o swatch de imagem e a
// etiqueta de cada item, dando toda a largura ao nome do produto, para o
// truncamento (line-clamp) nunca cortar o texto a ponto de virar 1 letra.
export function TelaCardapioCliente({ compacta = false }) {
  const produtos = [
    { nome: "Combo Smash Duplo", preco: "36,90", tag: "Mais pedido" },
    { nome: "Batata rústica", preco: "18,90" },
    { nome: "Milkshake de morango", preco: "16,90" },
  ];
  return (
    <div className="p-3">
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="font-display text-xs font-bold text-[var(--pp-graphite)]">Cardápio</p>
        <span className="rounded-full bg-[#012E46]/10 px-2 py-0.5 text-[8px] font-bold text-[#012E46]">Aberto agora</span>
      </div>
      <div className="flex gap-1.5 overflow-hidden px-1">
        {["Lanches", "Bebidas", "Sobremesas"].map((c, i) => (
          <span key={c} className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${i === 0 ? "bg-[var(--pp-primary-hover)] text-white" : "bg-[#F3EDE4] text-[var(--pp-text-muted)]"}`}>{c}</span>
        ))}
      </div>
      <div className="mt-2 space-y-1.5 px-1">
        {produtos.map((p) => (
          <div key={p.nome} className={`flex items-center gap-2 rounded-lg border border-[var(--pp-border)] ${compacta ? "px-2 py-1.5" : "p-1.5"}`}>
            {!compacta && <span className="h-8 w-8 shrink-0 rounded-md bg-gradient-to-br from-[#F3EDE4] to-[#E9DECF]" />}
            <div className="min-w-0 flex-1">
              <p className={`truncate font-bold text-[var(--pp-graphite)] ${compacta ? "text-[9px]" : "text-[10px]"}`}>{p.nome}</p>
              {p.tag && !compacta && <span className="text-[8px] font-bold text-[#012E46]">{p.tag}</span>}
            </div>
            <span className={`shrink-0 font-black text-[var(--pp-graphite)] ${compacta ? "text-[9px]" : "text-[10px]"}`}>R$ {p.preco}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between rounded-lg bg-[var(--pp-graphite)] px-2.5 py-2">
        <span className="text-[9px] font-bold text-white">Ver carrinho (3)</span>
        <span className="text-[9px] font-black text-[#012E46]">R$ 72,70</span>
      </div>
    </div>
  );
}

export function TelaDashboard({ compacta = false }) {
  const horas = [420, 980, 760, 340, 690, 1180, 1460, 1050, 520];
  const max = Math.max(...horas);
  const ALT = compacta ? 46 : 72;
  return (
    <div className={compacta ? "p-3" : "p-4"}>
      <div className="flex items-start justify-between">
        <p className="font-display text-[11px] font-bold text-[var(--pp-graphite)]">Faturamento por horário</p>
        <span className="rounded-full bg-[#012E46]/10 px-2 py-0.5 text-[8px] font-bold text-[#012E46]">+12% vs. ontem</span>
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-1" style={{ height: ALT + 8 }}>
        {horas.map((v, i) => (
          <div key={i} className="w-full rounded-t-sm" style={{ height: Math.max(4, (v / max) * ALT), background: v === max ? "#012E46" : "#F38525" }} />
        ))}
      </div>
      {!compacta && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[{ l: "Faturamento", v: "R$ 4.860" }, { l: "Ticket médio", v: "R$ 42,90" }].map((k) => (
            <div key={k.l} className="rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] p-2">
              <p className="text-[8px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">{k.l}</p>
              <p className="font-display mt-0.5 text-[12px] font-black text-[var(--pp-graphite)]">{k.v}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Tela de notificação push — usada como mockup flutuante sobreposto ao
// Dashboard Premium (celular do gestor recebendo o alerta em tempo real).
export function TelaNotificacaoPush() {
  return (
    <div className="space-y-2 bg-[var(--pp-bg)] p-2.5">
      <div className="flex items-center gap-2 rounded-xl border border-[var(--pp-border)] bg-white p-2.5 shadow-sm">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--pp-primary-hover)] text-[9px] font-black text-white">PP</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] font-bold text-[var(--pp-graphite)]">Pedido Prime</p>
          <p className="truncate text-[8.5px] text-[var(--pp-text-muted)]">Novo pedido recebido — Mesa 07</p>
        </div>
        <span className="shrink-0 text-[8px] text-[var(--pp-text-muted)]">agora</span>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-[var(--pp-border)] bg-white/70 p-2.5 opacity-70">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#012E46] text-[9px] font-black text-white">PP</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] font-bold text-[var(--pp-graphite)]">Pedido Prime</p>
          <p className="truncate text-[8.5px] text-[var(--pp-text-muted)]">Fechamento de caixa concluído</p>
        </div>
        <span className="shrink-0 text-[8px] text-[var(--pp-text-muted)]">12min</span>
      </div>
    </div>
  );
}

export function TelaLista({ icone, linhas }) {
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--pp-primary-soft)] text-[var(--pp-primary-hover)]"><Icone nome={icone} className="h-3.5 w-3.5" /></span>
        <div className="h-2 w-16 rounded-full bg-[var(--pp-border)]" />
      </div>
      <div className="space-y-1.5">
        {linhas.map((l, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-[var(--pp-border)] px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${l.cor || "bg-[var(--pp-info)]"}`} />
              <span className="text-[9.5px] font-semibold text-[var(--pp-graphite)]">{l.a}</span>
            </div>
            <span className="text-[9px] font-bold text-[var(--pp-text-muted)]">{l.b}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TelaKanban({ colunas }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 p-3">
      {colunas.map((c) => (
        <div key={c.titulo} className="rounded-lg bg-[var(--pp-bg)] p-1.5">
          <p className="mb-1.5 text-center text-[8px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">{c.titulo}</p>
          <div className="space-y-1">
            {c.cards.map((card, i) => (
              <div key={i} className="rounded-md border border-[var(--pp-border)] bg-white px-1.5 py-1.5 text-[8px] font-semibold text-[var(--pp-graphite)]">{card}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Mapa de "telas" (chave `tela` de ECOSSISTEMA) → renderer específico.
export function TelaPorTipo({ tipo }) {
  switch (tipo) {
    case "cliente": return <TelaCardapioCliente />;
    case "garcom": return <TelaMesa />;
    case "dashboard":
    case "analytics": return <TelaDashboard />;
    case "financeiro": return <TelaLista icone="financeiro" linhas={[
      { a: "Venda — Mesa 07", b: "+ R$ 117,60", cor: "bg-[var(--pp-success)]" },
      { a: "Fornecedor — insumos", b: "− R$ 340,00", cor: "bg-[var(--pp-danger)]" },
      { a: "Venda — Comanda 12", b: "+ R$ 86,40", cor: "bg-[var(--pp-success)]" },
    ]} />;
    case "estoque": return <TelaLista icone="estoque" linhas={[
      { a: "Queijo mussarela", b: "Ok", cor: "bg-[var(--pp-success)]" },
      { a: "Massa de pizza", b: "Repor", cor: "bg-[var(--pp-warning)]" },
      { a: "Copo descartável", b: "Crítico", cor: "bg-[var(--pp-danger)]" },
    ]} />;
    case "crm": return <TelaLista icone="clientes" linhas={[
      { a: "Ana Souza", b: "12 pedidos", cor: "bg-[var(--pp-info)]" },
      { a: "Marcos Lima", b: "7 pedidos", cor: "bg-[var(--pp-info)]" },
      { a: "Beatriz Alves", b: "Novo cliente", cor: "bg-[#012E46]" },
    ]} />;
    case "caixa": return <TelaLista icone="caixa" linhas={[
      { a: "Comanda #012E46", b: "R$ 96,00", cor: "bg-[var(--pp-success)]" },
      { a: "Comanda #012E46", b: "R$ 42,90", cor: "bg-[var(--pp-warning)]" },
      { a: "Comanda #120", b: "R$ 214,50", cor: "bg-[var(--pp-info)]" },
    ]} />;
    case "cozinha": return <TelaKanban colunas={[
      { titulo: "Fila", cards: ["Pizza x2", "Massa"] },
      { titulo: "Preparo", cards: ["Risoto"] },
      { titulo: "Pronto", cards: ["Salada"] },
    ]} />;
    case "bar": return <TelaKanban colunas={[
      { titulo: "Fila", cards: ["Chopp x3"] },
      { titulo: "Preparo", cards: ["Drink"] },
      { titulo: "Pronto", cards: ["Suco", "Água"] },
    ]} />;
    case "delivery": return <TelaLista icone="delivery" linhas={[
      { a: "Pedido #501 — Bairro Sul", b: "Em rota", cor: "bg-[var(--pp-warning)]" },
      { a: "Pedido #502 — Centro", b: "Entregue", cor: "bg-[var(--pp-success)]" },
      { a: "Pedido #503 — Bairro Norte", b: "Preparando", cor: "bg-[var(--pp-info)]" },
    ]} />;
    default: return <TelaDashboard compacta />;
  }
}
