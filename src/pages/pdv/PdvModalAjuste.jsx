import { useEffect, useRef, useState } from "react";
import { numeroParaMoeda } from "./pdvHelpers";

const TEXTOS = {
  desconto: { titulo: "Desconto", ajuda: "Digite o valor do desconto em reais.", botao: "Aplicar desconto" },
  acrescimo: { titulo: "Acréscimo", ajuda: "Digite o valor a somar na conta, em reais.", botao: "Aplicar acréscimo" },
  cupom: { titulo: "Cupom de desconto", ajuda: "Digite o código do cupom.", botao: "Aplicar cupom" },
};

/** Pequeno modal para as funções Desconto (11), Acréscimo (12) e Cupom (14) da paleta. Valor em centavos digitados; cupom em texto. */
export default function PdvModalAjuste({ tipo = "desconto", valorAtual = 0, processando = false, onConfirmar, onRemover, onFechar }) {
  const t = TEXTOS[tipo] || TEXTOS.desconto;
  const ehCupom = tipo === "cupom";
  const [digitos, setDigitos] = useState(valorAtual > 0 ? String(Math.round(valorAtual * 100)) : "");
  const [codigo, setCodigo] = useState("");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select?.(); }, []);
  const valor = Number(digitos || 0) / 100;
  const pode = ehCupom ? codigo.trim().length > 0 : valor > 0;
  const confirmar = (e) => { e?.preventDefault(); if (pode && !processando) onConfirmar?.(ehCupom ? codigo.trim().toUpperCase() : valor); };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onFechar?.(); } }}>
      <form onSubmit={confirmar} role="dialog" aria-modal="true" aria-labelledby="ajuste-titulo" className="w-full max-w-sm rounded-3xl border border-[var(--pp-border)] bg-white p-5 shadow-2xl" data-testid="modal-ajuste">
        <h2 id="ajuste-titulo" className="text-lg font-black text-[var(--pp-text)]">{t.titulo}</h2>
        <p className="mt-1 text-sm text-[var(--pp-text-body)]">{t.ajuda}</p>
        {ehCupom ? (
          <input ref={ref} value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} aria-label="Código do cupom" autoComplete="off" placeholder="Ex.: BEMVINDO10"
            className="mt-3 min-h-12 w-full rounded-xl border-2 border-[#012E46] px-3 text-lg font-bold uppercase text-[var(--pp-text)] outline-none" />
        ) : (
          <input ref={ref} value={digitos === "" ? "" : numeroParaMoeda(valor)} onChange={(e) => setDigitos(e.target.value.replace(/\D/g, "").slice(0, 9))} inputMode="numeric" aria-label={`Valor do ${t.titulo.toLowerCase()}`} placeholder="0,00"
            className="mt-3 min-h-12 w-full rounded-xl border-2 border-[#012E46] px-3 text-right text-2xl font-black tabular-nums text-[var(--pp-text)] outline-none" />
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onFechar} className="min-h-11 rounded-2xl border border-[var(--pp-border)] text-sm font-black text-[var(--pp-text-body)]">Cancelar</button>
          <button type="submit" disabled={!pode || processando} data-testid="ajuste-confirmar" className="btn-laranja min-h-11 rounded-2xl text-sm font-black text-[#012E46] disabled:opacity-50">{processando ? "Aplicando…" : t.botao}</button>
        </div>
        {!ehCupom && valorAtual > 0 && onRemover && (
          <button type="button" onClick={onRemover} className="mt-3 w-full text-center text-xs font-bold text-[var(--pp-danger)] underline">Remover {t.titulo.toLowerCase()} atual</button>
        )}
      </form>
    </div>
  );
}
