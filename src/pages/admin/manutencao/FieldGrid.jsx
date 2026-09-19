// Lista de campos rotulados (rótulo + valor), reutilizada por proteções,
// executor, resumo da execução e drawer de detalhes. Mesmo visual dos campos
// do plano do FE1 (ambientes/ReleasePlanCard.jsx).
export default function FieldGrid({ fields, className = "sm:grid-cols-2" }) {
  return (
    <dl className={`grid grid-cols-1 gap-x-4 gap-y-3 ${className}`}>
      {fields.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-[12px] text-[#6B7280]">{f.label}</dt>
          <dd className={`mt-0.5 break-words text-sm font-semibold text-[#111111] ${f.mono ? "font-mono tabular-nums" : ""}`}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
