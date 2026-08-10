// ════════════════════════════════════════════════════════════
//  Componentes globais Pedido Prime — padrão visual SaaS premium
//  Reutilizáveis em todas as telas administrativas.
// ════════════════════════════════════════════════════════════
import { memo } from "react";

// ── FilterChip ────────────────────────────────────────────────
// Componente OFICIAL de filtro/chip/segment-button/aba de filtro do
// Pedido Prime. Toda tela administrativa com filtros, abas de período,
// status, turno, canal, categoria etc. deve usar ESTE componente —
// nenhum filtro deve ter CSS próprio (tokens filter-chip-* em src/index.css).
// size: sm | md | lg. color: primary (única cor oficial hoje).
const FILTER_CHIP_SIZES = {
  sm: "min-h-11 sm:min-h-[36px] px-3 py-2 text-[13px]",
  md: "min-h-11 sm:min-h-[38px] px-4 py-2 text-sm",
  lg: "min-h-11 sm:min-h-[40px] px-5 py-2.5 text-[15px]",
};
// Cores semânticas opcionais (marcador, nunca o único indicador — o rótulo em
// texto já diferencia a opção). Usadas por grupos como "Status" (pago/aberto/
// cancelado) via a prop `tone`. Não alteram o fundo azul de "selecionado".
const FILTER_CHIP_TONES = {
  success: "#16A34A", warning: "#F38525", error: "#DC2626", info: "#7C3AED",
};
export const FilterChip = memo(function FilterChip({
  selected = false, disabled = false, icon = null, label, badge = null, loading = false,
  onClick, size = "md", color = "primary", tone = null, fullWidth = false, className = "", tooltip,
}) {
  const bloqueado = disabled || loading;
  const cls = [
    "filter-chip inline-flex shrink-0 items-center justify-center gap-2 whitespace-normal rounded-full border text-center transition-all duration-200 ease-out",
    FILTER_CHIP_SIZES[size] || FILTER_CHIP_SIZES.md,
    fullWidth ? "w-full" : "",
    disabled
      ? "cursor-not-allowed border-[var(--filter-chip-border)] bg-[var(--filter-chip-disabled-bg)] font-medium text-[var(--filter-chip-disabled-text)]"
      : selected
        ? "border-[var(--filter-chip-selected)] bg-[var(--filter-chip-selected)] font-semibold text-[var(--filter-chip-text-selected)] shadow-[var(--filter-chip-selected-shadow,none)] hover:border-[var(--filter-chip-selected-hover)] hover:bg-[var(--filter-chip-selected-hover)]"
        : "border-[var(--filter-chip-border)] bg-[var(--filter-chip-bg)] font-medium text-[var(--filter-chip-text)] hover:border-[var(--filter-chip-selected)] hover:bg-[var(--filter-chip-hover-bg)] hover:text-[var(--filter-chip-selected)]",
    !disabled ? "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--filter-chip-selected)]" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button type="button" onClick={bloqueado ? undefined : onClick} disabled={disabled}
      aria-pressed={selected} aria-selected={selected} title={tooltip} data-color={color} className={cls}>
      {loading ? <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" aria-label="Carregando" />
        : (icon && <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5" aria-hidden="true">{icon}</span>)}
      {tone && FILTER_CHIP_TONES[tone] && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: FILTER_CHIP_TONES[tone] }} aria-hidden="true" />
      )}
      <span>{label}</span>
      {badge != null && (
        <span className={`ml-0.5 inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${selected ? "bg-black/10 text-[var(--filter-chip-text-selected)]" : "bg-[#F1F5F9] text-[#475569]"}`}>
          {badge}
        </span>
      )}
    </button>
  );
});

// ── FilterGroup ──────────────────────────────────────────────
// Painel de filtro titulado — padrão OFICIAL para grupos como "Turno",
// "Canal" e "Status" (Dashboard Gerencial), reutilizável em qualquer tela
// administrativa que precise do mesmo formato: card branco + rótulo +
// linha de FilterChip. Substitui implementações ad-hoc (divs soltas sem
// título/card, ou botões próprios) — nenhuma tela deve estilizar isso por
// conta própria. Aplica a paleta azul oficial de filtro (fundo branco,
// selecionado #012E46) via a classe `pp-filter-panel` (src/index.css),
// sem afetar outros usos de FilterChip (permissões, config, templates
// etc.), que continuam com a cor vermelha padrão do sistema.
const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
);
export const FilterGroup = memo(function FilterGroup({
  titulo, icone = null, descricao = null, opcoes, valor, onChange, contagens = null,
  disabled = false, className = "",
}) {
  return (
    <div className={`pp-filter-panel rounded-[14px] border border-[#E2E8F0] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.05)] ${className}`}>
      {/* Cabeçalho do card: tile de ícone + título + subtítulo (visual "gourmet"
          e padronizado — mesmo formato em Turno/Canal/Status). */}
      <div className="flex items-center gap-2.5">
        {icone && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(1, 46, 70,0.08)] text-[#012E46] [&>svg]:h-[18px] [&>svg]:w-[18px]" aria-hidden="true">{icone}</span>
        )}
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-wide leading-tight text-[var(--pp-text)]">{titulo}</p>
          {descricao && <p className="mt-0.5 text-[11px] leading-tight text-[var(--pp-text-muted)]">{descricao}</p>}
        </div>
      </div>
      <div className="my-3 h-px bg-[#EEF1F4]" />
      <div className="flex flex-wrap gap-2" role="group" aria-label={titulo}>
        {opcoes.map((op) => (
          <FilterChip key={op.id} size="sm" selected={valor === op.id} disabled={disabled || op.disabled}
            label={op.label} tone={op.tone || null}
            icon={valor === op.id ? CHECK_ICON : (op.icon || null)}
            badge={contagens ? (contagens[op.id] ?? null) : (op.badge ?? null)}
            onClick={() => onChange(op.id)} />
        ))}
      </div>
    </div>
  );
});
FilterGroup.PADRAO = "todos"; // convenção usada pelo sistema inteiro para a opção "Todos"

// ── FiltersPanel ─────────────────────────────────────────────
// Grade responsiva para exibir vários FilterGroup lado a lado (ex.: Turno +
// Canal + Status). 1 coluna no mobile, 2 no tablet, 3 no desktop — mesmo
// comportamento já validado no Dashboard Gerencial. Para telas com um único
// grupo de filtro, use FilterGroup diretamente (sem este wrapper).
export function FiltersPanel({ children, className = "" }) {
  return <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>{children}</div>;
}

// ── ActiveFiltersSummary ─────────────────────────────────────
// Contagem de filtros ativos + "Limpar filtros" — só aparece quando algum
// grupo estiver fora do valor padrão (não polui a UI quando tudo está em
// "Todos"). `grupos`: [{ valor, opcaoPadrao }]. `onClearAll` deve restaurar
// cada grupo para seu respectivo padrão (a função chamadora decide como).
export function ActiveFiltersSummary({ grupos, onClearAll, className = "" }) {
  const ativos = grupos.filter((g) => g.valor !== (g.opcaoPadrao ?? FilterGroup.PADRAO));
  if (ativos.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-xs font-semibold text-[#64748B]">
        {ativos.length} {ativos.length === 1 ? "filtro ativo" : "filtros ativos"}
      </span>
      <button type="button" onClick={onClearAll}
        className="text-xs font-bold text-[#012E46] transition hover:text-[#012E46] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46]">
        Limpar filtros
      </button>
    </div>
  );
}

// Cabeçalho de página: título (Sora), descrição curta, indicadores e ação principal
export function PageHeader({ icone = null, titulo, descricao, indicadores = [], acao = null }) {
  return (
    <div className="rounded-[2rem] border border-[var(--pp-border)] bg-white p-5 shadow-[0_1px_2px_rgba(1, 46, 70,0.05)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="page-title flex items-center gap-2.5 text-xl font-bold tracking-tight text-[var(--pp-text)]">
            {icone && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#F38525]/30 bg-[#F38525]/10 text-[#F38525] [&>svg]:h-[18px] [&>svg]:w-[18px]">{icone}</span>}
            {titulo}
          </h3>
          {descricao && <p className="mt-1 text-sm leading-6 text-[var(--pp-text-muted)]">{descricao}</p>}
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </div>
      {indicadores.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {indicadores.map((ind, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-[var(--pp-border)]">|</span>}
              <span className={`text-xs font-semibold ${ind.tom === "ok" ? "text-[#2F9E52]" : ind.tom === "alerta" ? "text-[#F38525]" : ind.tom === "erro" ? "text-[#C81E4A]" : ind.tom === "gold" ? "text-[#F38525]" : "text-[var(--pp-text-muted)]"}`}>
                <b className="font-bold text-[var(--pp-text)]">{ind.valor}</b> {ind.rotulo}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Botão de ação principal do PageHeader (coral ou dourado — paleta oficial
// 2026). "blue" mantido como nome da variante por compatibilidade com os
// 18 call-sites existentes; a cor em si já é coral (--pp-primary-hover).
export function PrimeButton({ children, onClick, variante = "blue", className = "", disabled = false, type = "button" }) {
  // Botão de ação padrão (skill botao-acao-padrao): laranja liso, SEM sombra/glow,
  // fonte no padrão do sistema (13px, semibold). A ênfase vem da cor, não da sombra.
  const estilos = {
    blue: "bg-[#F38525] text-[#012E46] hover:bg-[#F38525]",
    gold: "bg-[#F38525] text-[#012E46] hover:bg-[#F38525]",
    ghost: "border border-[var(--pp-border)] bg-white text-[var(--pp-text-body)] hover:bg-[rgba(1, 46, 70,0.04)]",
    danger: "border border-[rgba(200,30,74,0.24)] bg-white text-[#C81E4A] hover:bg-[rgba(200,30,74,0.08)]",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`font-display inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${estilos[variante]} ${className}`}>
      {children}
    </button>
  );
}

// Card de indicador (KPI) com variação opcional vs. período anterior
export function StatCard({ rotulo, valor, sub = null, variacao = null, tom = "neutro", icone = null }) {
  const corValor = tom === "ok" ? "text-emerald-400" : tom === "alerta" ? "text-amber-300" : tom === "gold" ? "text-gold-400" : tom === "azul" ? "text-blue-300" : "text-white";
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{rotulo}</p>
        {icone && <span className="text-slate-500 [&>svg]:h-4 [&>svg]:w-4">{icone}</span>}
      </div>
      <p className={`page-title mt-1 text-xl font-bold ${corValor}`}>{valor}</p>
      {variacao != null && (
        <p className={`mt-0.5 text-[11px] font-semibold ${variacao >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {variacao >= 0 ? "▲" : "▼"} {Math.abs(variacao).toFixed(0)}% em relação ao período anterior
        </p>
      )}
      {sub && variacao == null && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

// Estado vazio padrão — mensagem útil no lugar de "Sem dados"
export function EmptyState({ icone = null, titulo = "Nenhuma informação encontrada para este período.", dica = "Altere os filtros ou aguarde novas movimentações.", acao = null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icone && <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-500 [&>svg]:h-6 [&>svg]:w-6">{icone}</span>}
      <p className="text-sm font-semibold text-slate-300">{titulo}</p>
      <p className="max-w-sm text-xs leading-5 text-slate-500">{dica}</p>
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

// Selo de status padronizado
export function StatusBadge({ tipo = "neutro", children }) {
  const estilos = {
    ok: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
    alerta: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    erro: "border-red-400/30 bg-red-500/10 text-red-300",
    gold: "border-gold-400/40 bg-gold-400/10 text-gold-300",
    neutro: "border-white/10 bg-white/[0.06] text-slate-300",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${estilos[tipo]}`}>{children}</span>;
}
