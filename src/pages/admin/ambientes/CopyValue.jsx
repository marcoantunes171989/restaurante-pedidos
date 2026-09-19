import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

// Valor completo (SHA/hash) com botão de copiar. Usa só navigator.clipboard
// (mesmo padrão do restante do projeto) — sem dependência nova e sem rede.
export default function CopyValue({ label, value }) {
  const [feedback, setFeedback] = useState(null); // null | "ok" | "erro"
  const timerRef = useRef(null);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  async function copiar() {
    let resultado = "erro";
    try {
      await navigator.clipboard.writeText(value);
      resultado = "ok";
    } catch { /* clipboard indisponível ou sem permissão */ }
    setFeedback(resultado);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setFeedback(null), 1800);
  }

  return (
    <div className="min-w-0">
      <p className="text-[12px] font-semibold text-[#6B7280]">{label}</p>
      <div className="mt-1 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1.5 font-mono text-[12px] leading-5 text-[#111111]">
          {value}
        </code>
        <button
          type="button"
          onClick={copiar}
          aria-label={`Copiar ${label}`}
          className="inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1 rounded-lg border border-[#D1D5DB] bg-white px-2 text-[12px] font-semibold text-[#012E46] transition hover:bg-[#F0F6F8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46]"
        >
          {feedback === "ok" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      <p className="mt-1 min-h-4 text-[12px] text-[#4B5563]" role="status" aria-live="polite">
        {feedback === "ok" ? "Copiado" : feedback === "erro" ? "Não foi possível copiar" : ""}
      </p>
    </div>
  );
}
