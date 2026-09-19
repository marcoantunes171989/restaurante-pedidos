import { TONES } from "./releaseStatus.js";

// Selo genérico: tom + ícone + TEXTO (o status nunca depende só da cor).
export function ToneBadge({ tone = "neutral", Icon = null, children, className = "", ...rest }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold leading-4 ${TONES[tone] || TONES.neutral} ${className}`}
      {...rest}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span className="min-w-0">{children}</span>
    </span>
  );
}

// Selo de status: recebe o objeto de status já resolvido pelos view-models
// ({ label, tone, Icon }) — o mapeamento vive em releaseStatus.js.
export function StatusBadge({ status, className = "" }) {
  return <ToneBadge tone={status.tone} Icon={status.Icon} className={className}>{status.label}</ToneBadge>;
}
