// ════════════════════════════════════════════════════════════
//  UI KIT — Pedido Prime (Design System global · light premium)
//  Componentes reutilizáveis na paleta light premium:
//    azul #2563EB · dourado premium #D9A441 · fundo #F7F8FA
//    superfícies brancas · texto #182230 / #475467 / #667085
//  Fontes: Inter (corpo) + Poppins (.font-display, títulos).
//  Regra: use estes componentes/tokens; não espalhe hex solto.
// ════════════════════════════════════════════════════════════
import React from "react";

const cx = (...c) => c.filter(Boolean).join(" ");

/* ── Button ─────────────────────────────────────────────────
   variant: primary(dourado) | blue(azul) | secondary(claro/borda)
            | outline | ghost | danger | success | premium(chip suave)
   size: sm | md | lg   ·   full, loading, icon */
const BTN_VARIANTS = {
  primary:   "bg-[#D9A441] text-[#182230] hover:bg-[#C7922F] shadow-sm shadow-[#D9A441]/25",
  blue:      "bg-[#2563EB] text-white hover:bg-[#1D4ED8] shadow-sm shadow-[#2563EB]/25",
  secondary: "border border-[#D0D5DD] bg-white text-[#344054] hover:bg-[#F9FAFB]",
  outline:   "border border-[#E5E7EB] bg-white text-[#182230] hover:bg-[#F9FAFB] hover:border-[#D9A441]/40",
  ghost:     "bg-transparent text-[#182230] hover:bg-[#182230]/5",
  danger:    "bg-[#E5484D] text-white hover:bg-[#EF4444] shadow-sm shadow-[#E5484D]/25",
  success:   "bg-[#22A06B] text-white hover:bg-[#2DBE7E] shadow-sm shadow-[#22A06B]/25",
  premium:   "border border-[#F4D27A] bg-[#FFF7E0] text-[#9A6A00] hover:bg-[#F4D27A]/40",
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
   tone: light(branco) | cream(dourado suave) | dark(navy) */
export function Card({ children, tone = "light", className, hover, ...rest }) {
  const tones = {
    light: "border-[#E5E7EB] bg-white text-[#182230]",
    cream: "border-[#F4D27A]/50 bg-[#FFF7E0] text-[#182230]",
    dark:  "border-white/10 bg-gradient-to-br from-[#061A2E] to-[#03101C] text-white",
  };
  return (
    <div className={cx("rounded-[20px] border shadow-[0_8px_24px_rgba(16,24,40,0.06)]",
      tones[tone] || tones.light, hover && "transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(16,24,40,0.08)]", className)} {...rest}>
      {children}
    </div>
  );
}

/* ── Badge / StatusBadge ────────────────────────────────────
   Cada status tem cor + texto (não depender só da cor). */
export function Badge({ children, tone = "neutral", className }) {
  const tones = {
    neutral: "bg-[#F2F4F7] text-[#475467]",
    success: "bg-[#EAFBF2] text-[#147A4A]",
    warning: "bg-[#FFF4E5] text-[#B45309]",
    danger:  "bg-[#FFF1F2] text-[#B42318]",
    dangerDark: "bg-[#FFE4E6] text-[#8C1C13]",
    info:    "bg-[#EFF6FF] text-[#1D4ED8]",
    accent:  "bg-[#FFF7E0] text-[#9A6A00]",
    navy:    "bg-[#182230]/8 text-[#182230]",
    petrol:  "bg-[#E5E7EB] text-[#475467]",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold", tones[tone] || tones.neutral, className)}>{children}</span>;
}

// Mapa oficial de status → { tom, rótulo, dot } (cor sólida p/ pontos/bordas).
// Cobre pedido/comanda, financeiro e mesa — cores da identidade light premium.
export const STATUS_MAP = {
  // Pedido / comanda
  nova: { tone: "info", label: "Nova", dot: "#2563EB" },
  novo: { tone: "info", label: "Novo", dot: "#2563EB" },
  recebido: { tone: "info", label: "Recebido", dot: "#2563EB" },
  aberta: { tone: "accent", label: "Aberta", dot: "#D9A441" },
  em_preparo: { tone: "warning", label: "Em preparo", dot: "#F59E0B" },
  preparando: { tone: "warning", label: "Preparando", dot: "#F59E0B" },
  pronto: { tone: "success", label: "Pronto", dot: "#22A06B" },
  pronta: { tone: "success", label: "Pronta", dot: "#22A06B" },
  entregue: { tone: "success", label: "Entregue", dot: "#22A06B" },
  aguardando_pagamento: { tone: "info", label: "Aguardando pagamento", dot: "#2563EB" },
  finalizado: { tone: "petrol", label: "Finalizado", dot: "#475467" },
  finalizada: { tone: "petrol", label: "Finalizada", dot: "#475467" },
  cancelado: { tone: "danger", label: "Cancelado", dot: "#E5484D" },
  cancelada: { tone: "danger", label: "Cancelada", dot: "#E5484D" },
  atrasado: { tone: "dangerDark", label: "Atrasado", dot: "#B42318" },
  atrasada: { tone: "dangerDark", label: "Atrasada", dot: "#B42318" },
  // Financeiro
  pendente: { tone: "warning", label: "Pendente", dot: "#F59E0B" },
  pago: { tone: "success", label: "Pago", dot: "#22A06B" },
  parcial: { tone: "info", label: "Parcial", dot: "#2563EB" },
  estornado: { tone: "danger", label: "Estornado", dot: "#E5484D" },
  // Mesa
  livre: { tone: "success", label: "Livre", dot: "#22A06B" },
  ocupada: { tone: "warning", label: "Ocupada", dot: "#F59E0B" },
  em_atendimento: { tone: "accent", label: "Em atendimento", dot: "#D9A441" },
};
export function StatusBadge({ status, children, className }) {
  const key = String(status || "").toLowerCase().replace(/\s+/g, "_");
  const s = STATUS_MAP[key] || { tone: "neutral", label: children || status || "—" };
  return <Badge tone={s.tone} className={className}>{children || s.label}</Badge>;
}

/* ── Campos de formulário ───────────────────────────────────*/
const FIELD = "w-full rounded-2xl border border-[#D0D5DD] bg-white px-4 py-3 text-sm text-[#182230] outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#BFDBFE] placeholder:text-[#98A2B3] disabled:bg-[#F3F4F6] disabled:text-[#94A3B8]";
const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#344054]";
function Field({ label, required, error, hint, children }) {
  return (
    <div>
      {label && <label className={LABEL}>{label}{required && <span className="text-[#E5484D]"> *</span>}</label>}
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-[#E5484D]">{error}</p>
        : hint ? <p className="mt-1 text-xs text-[#667085]">{hint}</p> : null}
    </div>
  );
}
export function Input({ label, required, error, hint, className, icon, ...rest }) {
  return (
    <Field label={label} required={required} error={error} hint={hint}>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]">{icon}</span>}
        <input className={cx(FIELD, icon && "pl-11", error && "border-[#E5484D] focus:border-[#E5484D] focus:ring-[#E5484D]/15", className)} {...rest} />
      </div>
    </Field>
  );
}
export function Textarea({ label, required, error, hint, className, rows = 3, ...rest }) {
  return (
    <Field label={label} required={required} error={error} hint={hint}>
      <textarea rows={rows} className={cx(FIELD, error && "border-[#E5484D]", className)} {...rest} />
    </Field>
  );
}
export function Select({ label, required, error, hint, className, children, ...rest }) {
  return (
    <Field label={label} required={required} error={error} hint={hint}>
      <select className={cx(FIELD, error && "border-[#E5484D]", className)} {...rest}>{children}</select>
    </Field>
  );
}

/* ── MetricCard (KPI) ───────────────────────────────────────*/
export function MetricCard({ label, value, sub, icon, tone = "navy" }) {
  const cor = { navy: "#182230", accent: "#D9A441", success: "#22A06B", danger: "#E5484D", info: "#2563EB", amber: "#D9A441" }[tone] || "#182230";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">{label}</p>
        {icon && <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF7E0] text-[#D9A441]">{icon}</span>}
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
      <Spinner className="h-7 w-7 text-[#D9A441]" />
      <p className="text-sm font-medium text-[#667085]">{label}</p>
    </div>
  );
}
export function EmptyState({ icon = "📋", title = "Nada por aqui ainda", desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F7F8FA] px-6 py-14 text-center">
      <span className="text-4xl">{icon}</span>
      <p className="font-display text-base font-bold text-[#182230]">{title}</p>
      {desc && <p className="max-w-sm text-sm text-[#667085]">{desc}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ── Alert / mensagem inline ────────────────────────────────*/
export function Alert({ tone = "info", children, className }) {
  const tones = {
    success: "border-[#22A06B]/25 bg-[#EAFBF2] text-[#147A4A]",
    warning: "border-[#F59E0B]/25 bg-[#FFF4E5] text-[#B45309]",
    danger:  "border-[#E5484D]/25 bg-[#FFF1F2] text-[#B42318]",
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
