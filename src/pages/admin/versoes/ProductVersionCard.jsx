import { Layers, Tag } from "lucide-react";
import { ToneBadge } from "../ambientes/StatusBadge.jsx";

// "Versão do produto": sem fonte canônica, mostra que ainda não está
// configurada — nunca inventa uma versão.
export function ProductVersionCard({ productVersion }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Versão do produto" data-testid="product-version">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-[#012E46]" aria-hidden="true" />
        <h2 className="text-[15px] font-bold text-[#012E46]">Versão do produto</h2>
      </div>
      <p
        className={`mt-3 text-lg font-bold ${productVersion.configured ? "font-mono text-[#111111]" : "text-[#4B5563]"}`}
        data-testid="product-version-label"
        data-configured={productVersion.configured ? "true" : "false"}
      >
        {productVersion.label}
      </p>
      {productVersion.help && <p className="mt-1 text-[13px] leading-5 text-[#6B7280]">{productVersion.help}</p>}
      {productVersion.sourceLabel && <p className="mt-1 text-[13px] leading-5 text-[#6B7280]">Fonte: {productVersion.sourceLabel}</p>}
    </section>
  );
}

// "Modelo de versionamento": educativo e curto (não é documentação).
export function VersionPolicyCard({ policy }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label={policy.title} data-testid="version-policy">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-[#012E46]" aria-hidden="true" />
          <h2 className="text-[15px] font-bold text-[#012E46]">{policy.title}</h2>
        </div>
        <ToneBadge tone="brand">Modelo</ToneBadge>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-[12px] text-[#6B7280]">Versão</dt>
          <dd className="mt-0.5 text-sm font-semibold text-[#111111]">
            <span className="font-mono" data-testid="version-format">{policy.versionFormat}</span>
            <span className="block text-[12px] font-normal text-[#6B7280]">Ex.: {policy.versionExamples.join(" · ")}</span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[12px] text-[#6B7280]">Release</dt>
          <dd className="mt-0.5 text-sm font-semibold text-[#111111]">
            Sequencial por versão
            <span className="block text-[12px] font-normal text-[#6B7280]">{policy.releaseExample}</span>
          </dd>
        </div>
      </dl>

      <ul className="mt-3 space-y-1.5" aria-label="Significado de cada parte da versão">
        {policy.semantics.map((s) => (
          <li key={s.part} className="flex flex-wrap items-baseline gap-x-2 text-[13px] leading-5" data-part={s.part}>
            <code className="rounded-md border border-[#D1D5DB] bg-[#F9FAFB] px-1.5 py-0.5 font-mono text-[12px] font-semibold text-[#012E46]">{s.part}</code>
            <span className="min-w-0 text-[#111111]">{s.text}</span>
            <span className="font-mono text-[12px] text-[#6B7280]">ex.: {s.example}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[13px] leading-5 text-[#4B5563]">{policy.releaseRule}</p>
      <p className="mt-1 text-[13px] leading-5 text-[#4B5563]"><b className="font-semibold text-[#111111]">Build:</b> {policy.buildRule}</p>
    </section>
  );
}
