// ════════════════════════════════════════════════════════════
//  UI KIT — Pedido Prime (Design System global · ETAPA 2)
//  Componentes reutilizáveis na paleta oficial food service:
//    navy #071B33 · petróleo #0B2745 · laranja(ação) #C9951A
//    âmbar premium #E6BC58 · gelo #FAF7F0 · creme #FFFDF8
//  Fontes: Inter (corpo) + Poppins (.font-display, títulos).
//  Regra: use estes componentes/tokens; não espalhe hex solto.
// ════════════════════════════════════════════════════════════
import React from "react";

const cx = (...c) => c.filter(Boolean).join(" ");

/* ── Button ─────────────────────────────────────────────────
   variant: primary(laranja) | secondary(navy) | outline | ghost
            | danger | success | premium(âmbar)
   size: sm | md | lg   ·   full, loading, icon */
const BTN_VARIANTS = {
  primary:   "bg-[#C9951A] text-[#071B33] hover:bg-[#E6BC58] shadow-sm shadow-[#C9951A]/30",
  secondary: "bg-[#071B33] text-white hover:bg-[#0B2745] shadow-sm shadow-[#071B33]/20",
  outline:   "border border-[#E8E2D8] bg-white text-[#071B33] hover:bg-[#FFFDF8] hover:border-[#C9951A]/40",
  ghost:     "bg-transparent text-[#071B33] hover:bg-[#071B33]/5",
  danger:    "bg-[#DC2626] text-white hover:bg-[#EF4444] shadow-sm shadow-[#DC2626]/25",
  success:   "bg-[#16A34A] text-white hover:bg-[#22C55E] shadow-sm shadow-[#16A34A]/25",
  premium:   "bg-[#E6BC58] text-[#071B33] hover:bg-[#F0DCA6]",
};
const BTN_SIZES = {
  sm: "px-3.5 py-2 text-[13px] rounded-xl gap-1.5",
  md: "px-5 py-2.5 text-sm rounded-2xl gap-2",
  lg: "px-6 py-3.5 text-base rounded-2xl gap-2",
};
export function Button({ children, variant = "primary", size = "md", full, loading, disabled, className, type = "button", ...rest }) {
  return (
    <button type={type} disabled={disabled || loading}
      className={cx("font-display inline-flex items-center justify-center font-bold transition active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100",
        BTN_VARIANTS[variant] || BTN_VARIANTS.primary, BTN_SIZES[size] || BTN_SIZES.md, full && "w-full", className)}
      {...rest}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

/* ── Card ───────────────────────────────────────────────────
   tone: light(branco) | cream | dark(navy) */
export function Card({ children, tone = "light", className, hover, ...rest }) {
  const tones = {
    light: "border-[#E8E2D8] bg-white text-[#111827]",
    cream: "border-[#F5E6CF] bg-[#FFFDF8] text-[#111827]",
    dark:  "border-white/10 bg-gradient-to-br from-[#071B33] to-[#04101F] text-white",
  };
  return (
    <div className={cx("rounded-2xl border shadow-[0_1px_2px_rgba(7,27,51,0.05),0_6px_20px_rgba(7,27,51,0.06)]",
      tones[tone] || tones.light, hover && "transition hover:-translate-y-0.5 hover:shadow-lg", className)} {...rest}>
      {children}
    </div>
  );
}

/* ── Badge / StatusBadge ────────────────────────────────────
   Cada status tem cor + texto (não depender só da cor). */
export function Badge({ children, tone = "neutral", className }) {
  const tones = {
    neutral: "bg-[#F1F5F9] text-[#475569]",
    success: "bg-[#DCFCE7] text-[#15803D]",
    warning: "bg-[#FEF3C7] text-[#B45309]",
    danger:  "bg-[#FEE2E2] text-[#B91C1C]",
    dangerDark: "bg-[#FEE2E2] text-[#991B1B]",
    info:    "bg-[#DBEAFE] text-[#2563EB]",
    accent:  "bg-[#FAF0D6] text-[#8A6A12]",
    navy:    "bg-[#071B33]/8 text-[#071B33]",
    petrol:  "bg-[#0B2745]/10 text-[#0B2745]",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold", tones[tone] || tones.neutral, className)}>{children}</span>;
}

// Mapa oficial de status → { tom, rótulo, dot } (cor sólida p/ pontos/bordas).
// Cobre pedido/comanda, financeiro e mesa — cores da identidade food service.
export const STATUS_MAP = {
  // Pedido / comanda
  nova: { tone: "info", label: "Nova", dot: "#2563EB" },
  novo: { tone: "info", label: "Novo", dot: "#2563EB" },
  recebido: { tone: "info", label: "Recebido", dot: "#2563EB" },
  aberta: { tone: "accent", label: "Aberta", dot: "#C9951A" },
  em_preparo: { tone: "warning", label: "Em preparo", dot: "#F2B84B" },
  preparando: { tone: "warning", label: "Preparando", dot: "#F2B84B" },
  pronto: { tone: "success", label: "Pronto", dot: "#16A34A" },
  pronta: { tone: "success", label: "Pronta", dot: "#16A34A" },
  entregue: { tone: "success", label: "Entregue", dot: "#16A34A" },
  aguardando_pagamento: { tone: "info", label: "Aguardando pagamento", dot: "#2563EB" },
  finalizado: { tone: "petrol", label: "Finalizado", dot: "#0B2745" },
  finalizada: { tone: "petrol", label: "Finalizada", dot: "#0B2745" },
  cancelado: { tone: "danger", label: "Cancelado", dot: "#DC2626" },
  cancelada: { tone: "danger", label: "Cancelada", dot: "#DC2626" },
  atrasado: { tone: "dangerDark", label: "Atrasado", dot: "#B91C1C" },
  atrasada: { tone: "dangerDark", label: "Atrasada", dot: "#B91C1C" },
  // Financeiro
  pendente: { tone: "warning", label: "Pendente", dot: "#F2B84B" },
  pago: { tone: "success", label: "Pago", dot: "#16A34A" },
  parcial: { tone: "info", label: "Parcial", dot: "#2563EB" },
  estornado: { tone: "danger", label: "Estornado", dot: "#DC2626" },
  // Mesa
  livre: { tone: "success", label: "Livre", dot: "#16A34A" },
  ocupada: { tone: "warning", label: "Ocupada", dot: "#F2B84B" },
  em_atendimento: { tone: "accent", label: "Em atendimento", dot: "#C9951A" },
};
export function StatusBadge({ status, children, className }) {
  const key = String(status || "").toLowerCase().replace(/\s+/g, "_");
  const s = STATUS_MAP[key] || { tone: "neutral", label: children || status || "—" };
  return <Badge tone={s.tone} className={className}>{children || s.label}</Badge>;
}

/* ── Campos de formulário ───────────────────────────────────*/
const FIELD = "w-full rounded-2xl border border-[#E8E2D8] bg-white px-4 py-3 text-sm text-[#111827] outline-none transition focus:border-[#C9951A] focus:ring-2 focus:ring-[#C9951A]/20 placeholder:text-[#9CA3AF] disabled:bg-[#FAF7F0] disabled:text-[#94A3B8]";
const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#071B33]";
function Field({ label, required, error, hint, children }) {
  return (
    <div>
      {label && <label className={LABEL}>{label}{required && <span className="text-[#DC2626]"> *</span>}</label>}
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-[#DC2626]">{error}</p>
        : hint ? <p className="mt-1 text-xs text-[#6B7280]">{hint}</p> : null}
    </div>
  );
}
export function Input({ label, required, error, hint, className, icon, ...rest }) {
  return (
    <Field label={label} required={required} error={error} hint={hint}>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]">{icon}</span>}
        <input className={cx(FIELD, icon && "pl-11", error && "border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]/15", className)} {...rest} />
      </div>
    </Field>
  );
}
export function Textarea({ label, required, error, hint, className, rows = 3, ...rest }) {
  return (
    <Field label={label} required={required} error={error} hint={hint}>
      <textarea rows={rows} className={cx(FIELD, error && "border-[#DC2626]", className)} {...rest} />
    </Field>
  );
}
export function Select({ label, required, error, hint, className, children, ...rest }) {
  return (
    <Field label={label} required={required} error={error} hint={hint}>
      <select className={cx(FIELD, error && "border-[#DC2626]", className)} {...rest}>{children}</select>
    </Field>
  );
}

/* ── MetricCard (KPI) ───────────────────────────────────────*/
export function MetricCard({ label, value, sub, icon, tone = "navy" }) {
  const cor = { navy: "#071B33", accent: "#C9951A", success: "#16A34A", danger: "#DC2626", info: "#2563EB", amber: "#E6BC58" }[tone] || "#071B33";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">{label}</p>
        {icon && <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFFDF8] text-[#C9951A]">{icon}</span>}
      </div>
      <p className="font-display mt-2 text-2xl font-black leading-tight" style={{ color: cor }}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">{sub}</p>}
    </Card>
  );
}

/* ── Estados: vazio / carregando ────────────────────────────*/
export function Spinner({ className }) {
  return <span className={cx("inline-block animate-spin rounded-full border-2 border-current border-r-transparent", className || "h-5 w-5")} aria-label="Carregando" />;
}
export function LoadingState({ label = "Carregando..." }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <Spinner className="h-7 w-7 text-[#C9951A]" />
      <p className="text-sm font-medium text-[#6B7280]">{label}</p>
    </div>
  );
}
export function EmptyState({ icon = "📋", title = "Nada por aqui ainda", desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#E8E2D8] bg-[#FAF7F0] px-6 py-14 text-center">
      <span className="text-4xl">{icon}</span>
      <p className="font-display text-base font-bold text-[#071B33]">{title}</p>
      {desc && <p className="max-w-sm text-sm text-[#6B7280]">{desc}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ── Alert / mensagem inline ────────────────────────────────*/
export function Alert({ tone = "info", children, className }) {
  const tones = {
    success: "border-[#16A34A]/25 bg-[#DCFCE7] text-[#15803D]",
    warning: "border-[#F2B84B]/25 bg-[#FEF3C7] text-[#B45309]",
    danger:  "border-[#DC2626]/25 bg-[#FEE2E2] text-[#B91C1C]",
    info:    "border-[#2563EB]/25 bg-[#DBEAFE] text-[#1D4ED8]",
  };
  const ic = { success: "✅", warning: "⚠️", danger: "⚠️", info: "ℹ️" }[tone];
  return (
    <div className={cx("flex items-start gap-2 rounded-2xl border p-3 text-sm", tones[tone] || tones.info, className)}>
      <span className="mt-0.5 shrink-0">{ic}</span><span>{children}</span>
    </div>
  );
}

export { cx };
