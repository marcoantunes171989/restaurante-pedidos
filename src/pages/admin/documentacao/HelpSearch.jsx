import { Search, X } from "lucide-react";

// Campo "Pesquisar na ajuda" — busca 100% local (helpUtils.searchDoc). O contador
// é uma região `aria-live` para leitores de tela acompanharem o filtro.
export default function HelpSearch({ inputId, value, onChange, shown, total }) {
  const filtrando = value.trim() !== "";
  return (
    <div>
      <label htmlFor={inputId} className="text-[12px] font-semibold text-[#012E46]">Pesquisar na ajuda</label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ex.: release, backup, write fence"
          autoComplete="off"
          spellCheck={false}
          className="min-h-11 w-full rounded-xl border border-[#D1D5DB] bg-white pl-9 pr-11 text-[14px] text-[#111111] placeholder:text-[#6B7280] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#012E46]"
        />
        {filtrando && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Limpar busca"
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#012E46] hover:bg-[#F0F6F8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#012E46]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="mt-1 text-[12px] text-[#6B7280]" aria-live="polite" data-testid="help-result-count">
        {filtrando ? `${shown} de ${total} tópicos` : `${total} tópicos`}
      </p>
    </div>
  );
}
