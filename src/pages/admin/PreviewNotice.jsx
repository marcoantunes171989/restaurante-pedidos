import { Info } from "lucide-react";

// Aviso padrão de "prévia": dados de exemplo, nenhuma ação executada. Usado por
// Ambientes & Releases e por Manutenção — nunca apresentar fixture como live.
export default function PreviewNotice({ label, children }) {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-xl border border-l-4 border-[#AFC2CC] border-l-[#F38525] bg-[#F0F6F8] px-3.5 py-2.5 text-[13px] leading-5 text-[#012E46]"
      data-testid="preview-notice"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0">
        <b className="font-semibold">{label}</b>
        {children}
      </p>
    </div>
  );
}
