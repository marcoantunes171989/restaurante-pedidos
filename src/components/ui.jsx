// ════════════════════════════════════════════════════════════
//  UI KIT — Pedido Prime (Design System global · ETAPA 2)
//  Componentes reutilizáveis na paleta oficial food service:
//    navy #0B1F33 · petróleo #123A4A · laranja(ação) #F97316
//    âmbar premium #F5B041 · gelo #F8FAFC · creme #FFF7ED
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
  primary:   "bg-[#F97316] text-white hover:bg-[#FB923C] shadow-sm shadow-[#F97316]/30",
  secondary: "bg-[#0B1F33] text-white hover:bg-[#123A4A] shadow-sm shadow-[#0B1F33]/20",
  outline:   "border border-[#E5E7EB] bg-white text-[#0B1F33] hover:bg-[#FFF7ED] hover:border-[#F97316]/40",
  ghost:     "bg-transparent text-[#0B1F33] hover:bg-[#0B1F33]/5",
  danger:    "bg-[#DC2626] text-white hover:bg-[#EF4444] shadow-sm shadow-[#DC2626]/25",
  success:   "bg-[#16A34A] text-white hover:bg-[#22C55E] shadow-sm shadow-[#16A34A]/25",
  premium:   "bg-[#F5B041] text-[#0B1F33] hover:bg-[#FBD38D]",
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
    light: "border-[#E5E7EB] bg-white text-[#1E293B]",
    cream: "border-[#F5E6CF] bg-[#FFF7ED] text-[#1E293B]",
    dark:  "border-white/10 bg-gradient-to-br from-[#0B1F33] to-[#071726] text-white",
  };
  return (
    <div className={cx("rounded-2xl border shadow-[0_1px_2px_rgba(11,31,51,0.05),0_6px_20px_rgba(11,31,51,0.06)]",
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
    warning: "bg-[#FFF7E6] text-[#B45309]",
    danger:  "bg-[#FEE2E2] text-[#B91C1C]",
    info:    "bg-[#EFF6FF] text-[#2563EB]",
    accent:  "bg-[#FFEDD5] text-[#C2410C]",
    navy:    "bg-[#0B1F33]/8 text-[#0B1F33]",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold", tones[tone] || tones.neutral, className)}>{children}</span>;
}

// Mapa oficial de status → { tom, rótulo }. Cobre pedido, financeiro e mesa.
export const STATUS_MAP = {
  // Pedido / comanda
  novo: { tone: "info", label: "Novo" },
  recebido: { tone: "info", label: "Recebido" },
  aberta: { tone: "accent", label: "Aberta" },
  em_preparo: { tone: "warning", label: "Em preparo" },
  preparando: { tone: "warning", label: "Preparando" },
  pronto: { tone: "success", label: "Pronto" },
  entregue: { tone: "success", label: "Entregue" },
  aguardando_pagamento: { tone: "info", label: "Aguardando pagamento" },
  finalizado: { tone: "navy", label: "Finalizado" },
  finalizada: { tone: "navy", label: "Finalizada" },
  cancelado: { tone: "danger", label: "Cancelado" },
  cancelada: { tone: "danger", label: "Cancelada" },
  atrasado: { tone: "danger", label: "Atrasado" },
  // Financeiro
  pendente: { tone: "warning", label: "Pendente" },
  pago: { tone: "success", label: "Pago" },
  parcial: { tone: "info", label: "Parcial" },
  estornado: { tone: "danger", label: "Estornado" },
  // Mesa
  livre: { tone: "success", label: "Livre" },
  ocupada: { tone: "warning", label: "Ocupada" },
  em_atendimento: { tone: "accent", label: "Em atendimento" },
};
export function StatusBadge({ status, children, className }) {
  const key = String(status || "").toLowerCase().replace(/\s+/g, "_");
  const s = STATUS_MAP[key] || { tone: "neutral", label: children || status || "—" };
  return <Badge tone={s.tone} className={className}>{children || s.label}</Badge>;
}

/* ── Campos de formulário ───────────────────────────────────*/
const FIELD = "w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#1E293B] outline-none transition focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20 placeholder:text-[#9CA3AF] disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]";
const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#0B1F33]";
function Field({ label, required, error, hint, children }) {
  return (
    <div>
      {label && <label className={LABEL}>{label}{required && <span className="text-[#DC2626]"> *</span>}</label>}
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-[#DC2626]">{error}</p>
        : hint ? <p className="mt-1 text-xs text-[#64748B]">{hint}</p> : null}
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
  const cor = { navy: "#0B1F33", accent: "#F97316", success: "#16A34A", danger: "#DC2626", info: "#2563EB", amber: "#F5B041" }[tone] || "#0B1F33";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">{label}</p>
        {icon && <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF7ED] text-[#F97316]">{icon}</span>}
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
      <Spinner className="h-7 w-7 text-[#F97316]" />
      <p className="text-sm font-medium text-[#64748B]">{label}</p>
    </div>
  );
}
export function EmptyState({ icon = "📋", title = "Nada por aqui ainda", desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F8FAFC] px-6 py-14 text-center">
      <span className="text-4xl">{icon}</span>
      <p className="font-display text-base font-bold text-[#0B1F33]">{title}</p>
      {desc && <p className="max-w-sm text-sm text-[#64748B]">{desc}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ── Alert / mensagem inline ────────────────────────────────*/
export function Alert({ tone = "info", children, className }) {
  const tones = {
    success: "border-[#16A34A]/25 bg-[#DCFCE7] text-[#15803D]",
    warning: "border-[#F59E0B]/25 bg-[#FFF7E6] text-[#B45309]",
    danger:  "border-[#DC2626]/25 bg-[#FEE2E2] text-[#B91C1C]",
    info:    "border-[#2563EB]/25 bg-[#EFF6FF] text-[#1D4ED8]",
  };
  const ic = { success: "✅", warning: "⚠️", danger: "⚠️", info: "ℹ️" }[tone];
  return (
    <div className={cx("flex items-start gap-2 rounded-2xl border p-3 text-sm", tones[tone] || tones.info, className)}>
      <span className="mt-0.5 shrink-0">{ic}</span><span>{children}</span>
    </div>
  );
}

export { cx };
