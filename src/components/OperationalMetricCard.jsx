// ════════════════════════════════════════════════════════════
//  Card de métrica reutilizável — Central Operacional (src/pages/
//  OperationalCentral.jsx). Usa exclusivamente os tokens --pp-* já
//  centralizados em src/index.css/docs/design-tokens.md (nenhum hex solto
//  aqui) — ver a var(--pp-x) + trap do Tailwind documentada lá: nunca
//  `bg-[var(--pp-x)]/NN`, sempre var() sem modificador de opacidade ou a
//  variante -soft já pronta.
//
//  Variantes seguem a semântica JÁ documentada em design-tokens.md
//  ("--pp-info/--pp-warning/--pp-success são exclusivas do fluxo de
//  pedidos: recebido/em preparo/pronto") — por isso só "Novos pedidos"
//  (recebido), "Em preparo" e "Prontos" usam essas cores; contadores que
//  não são uma etapa do pipeline (mesas, contas) ficam neutros, e as 3
//  métricas financeiras usam a variante "financial" (azul petróleo da paleta
//  oficial = gestão/dados; substitui o dourado antigo, fora da paleta).
import { Loader2 } from "lucide-react";

const VARIANTS = {
  neutral: {
    iconBg: "bg-[var(--pp-bg)]",
    iconColor: "text-[var(--pp-text-muted)]",
    ring: "",
  },
  primary: {
    iconBg: "bg-[var(--pp-primary-soft)]",
    iconColor: "text-[var(--pp-primary-text)]",
    ring: "",
  },
  info: {
    iconBg: "bg-[var(--pp-info-soft)]",
    iconColor: "text-[var(--pp-info)]",
    ring: "",
  },
  success: {
    iconBg: "bg-[var(--pp-success-soft)]",
    iconColor: "text-[var(--pp-success-text)]",
    ring: "",
  },
  warning: {
    iconBg: "bg-[var(--pp-warning-soft)]",
    iconColor: "text-[var(--pp-warning-text)]",
    ring: "",
  },
  // Financeiro = gestão/dados → AZUL PETRÓLEO (paleta oficial), no lugar do
  // dourado antigo (fora da paleta). Chip petróleo + linha superior petróleo +
  // fundo levemente esverdeado-petróleo (~4,5%). Verde segue reservado a
  // "confirmação/pronto" (sem ambiguidade); petróleo dá o tom institucional.
  financial: {
    iconBg: "bg-[var(--op-nav-accent)]",
    iconColor: "text-white",
    ring: "border-t-2 border-t-[var(--op-nav-accent)]",
    warmBg: "rgba(15, 76, 92, 0.045)",
  },
};

export default function OperationalMetricCard({
  title,
  value,
  icon: Icon,
  variant = "neutral",
  description,
  loading = false,
  onClick,
}) {
  const v = VARIANTS[variant] || VARIANTS.neutral;
  const clicavel = typeof onClick === "function";
  const Tag = clicavel ? "button" : "div";

  return (
    <Tag
      type={clicavel ? "button" : undefined}
      onClick={clicavel ? onClick : undefined}
      aria-label={clicavel ? title : undefined}
      className={`group relative flex flex-col gap-2.5 rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 text-left shadow-[0_1px_2px_rgba(43,35,32,0.04),0_2px_8px_rgba(43,35,32,0.05)] transition-all duration-200 ${v.ring} ${
        clicavel
          ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(43,35,32,0.09)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)] active:translate-y-0 active:shadow-[0_1px_2px_rgba(43,35,32,0.06)]"
          : ""
      }`}
      style={variant === "financial" ? { backgroundColor: v.warmBg } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${v.iconBg}`}>
          {loading ? (
            <Loader2 aria-hidden="true" size={17} className="animate-spin text-[var(--pp-text-muted)]" />
          ) : (
            Icon && <Icon aria-hidden="true" size={17} className={v.iconColor} strokeWidth={2} />
          )}
        </span>
        {clicavel && (
          <span aria-hidden="true" className="text-[var(--pp-text-muted)] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-7 w-16 animate-pulse rounded-md bg-[var(--pp-bg)]" aria-hidden="true" />
      ) : (
        <p className="font-display truncate text-[clamp(1.25rem,4vw,1.75rem)] font-black leading-none tabular-nums text-[var(--pp-text)]">
          {value}
        </p>
      )}

      <div>
        <p className="text-[11px] font-bold uppercase leading-tight tracking-wide text-[var(--pp-text-muted)]">{title}</p>
        {description && !loading && (
          <p className="mt-0.5 text-xs leading-tight text-[var(--pp-text-body)]">{description}</p>
        )}
      </div>
    </Tag>
  );
}
