import { forwardRef } from "react";
import { CircleHelp } from "lucide-react";

// Botão de ajuda do cabeçalho. Funciona sem tooltip: o nome acessível vem do
// aria-label; o texto "Ajuda" aparece a partir de sm (no celular fica só o ícone).
const AdminHelpButton = forwardRef(function AdminHelpButton({ onClick, expanded = false, label = "Ajuda da página" }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      data-testid="admin-help-button"
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#D1D5DB] bg-white px-3 text-[13px] font-semibold text-[#012E46] transition hover:bg-[#F0F6F8] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46] sm:px-4"
    >
      <CircleHelp className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline" aria-hidden="true">Ajuda</span>
    </button>
  );
});

export default AdminHelpButton;
