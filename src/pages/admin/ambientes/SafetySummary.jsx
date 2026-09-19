import { Ban, Check } from "lucide-react";

// Escopo da atualização, em uma olhada: o que muda e o que NUNCA é copiado.
export default function SafetySummary({ safety }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Escopo da atualização">
      <h2 className="text-[15px] font-bold text-[#012E46]">O que será atualizado?</h2>
      <ul className="mt-3 space-y-1.5">
        {safety.updated.map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm text-[#111111]">
            <Check className="h-4 w-4 shrink-0 text-[#012E46]" aria-hidden="true" />
            <span className="sr-only">Será atualizado: </span>
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-[#F3F4F6] pt-4">
        <p className="text-sm font-semibold text-[#111111]">Não serão copiados</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {safety.notCopied.map((item) => (
            <li
              key={item}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D1D5DB] bg-[#F9FAFB] px-2.5 py-1 text-[12px] font-semibold text-[#4B5563]"
            >
              <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="sr-only">Não será copiado: </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
