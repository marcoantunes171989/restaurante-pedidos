import { useEffect, useRef, useState } from "react";
import { numeroParaMoeda } from "./pdvHelpers";
import { limiteEmReais, textoDoLimite } from "../../lib/parametrosCaixa";

const TEXTOS = {
  desconto: { titulo: "Desconto", ajuda: "Digite o valor do desconto em reais.", botao: "Aplicar desconto" },
  acrescimo: { titulo: "Acréscimo", ajuda: "Digite o valor a somar na conta, em reais.", botao: "Aplicar acréscimo" },
  cupom: { titulo: "Cupom de desconto", ajuda: "Digite o código do cupom.", botao: "Aplicar cupom" },
};

/**
 * Pequeno modal para as funções Desconto (11), Acréscimo (12) e Cupom (14) da paleta. Valor em centavos digitados; cupom em texto.
 * Com `compra` (soma dos itens), o desconto e o acréscimo podem ser digitados em reais ou em percentual, respeitam o limite
 * da empresa (`limite`) e exigem o motivo.
 */
export default function PdvModalAjuste({ tipo = "desconto", valorAtual = 0, compra = null, limite = null, motivoAtual = "", processando = false, onConfirmar, onRemover, onFechar }) {
  const t = TEXTOS[tipo] || TEXTOS.desconto;
  const ehCupom = tipo === "cupom";
  const comLimite = !ehCupom && compra != null;
  const [digitos, setDigitos] = useState(valorAtual > 0 ? String(Math.round(valorAtual * 100)) : "");
  const [codigo, setCodigo] = useState("");
  const [emPercentual, setEmPercentual] = useState(false);
  const [motivo, setMotivo] = useState(motivoAtual);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select?.(); }, [emPercentual]);

  const digitado = Number(digitos || 0) / 100;
  const valor = comLimite && emPercentual ? Math.floor((Math.round(compra * 100) * Math.round(digitado * 100)) / 10000) / 100 : digitado;
  const maximo = comLimite ? limiteEmReais(limite, compra) : null;
  const passou = comLimite && valor > maximo + 0.0001;
  const faltaMotivo = comLimite && motivo.trim().length < 3;
  const pode = ehCupom ? codigo.trim().length > 0 : valor > 0 && !passou && !faltaMotivo;
  const confirmar = (e) => {
    e?.preventDefault();
    if (!pode || processando) return;
    if (ehCupom) onConfirmar?.(codigo.trim().toUpperCase());
    else if (comLimite) onConfirmar?.(valor, motivo.trim());
    else onConfirmar?.(valor);
  };
  const trocarModo = (percentual) => { setEmPercentual(percentual); setDigitos(""); };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onFechar?.(); } }}>
      <form onSubmit={confirmar} role="dialog" aria-modal="true" aria-labelledby="ajuste-titulo" className="w-full max-w-sm rounded-3xl border border-[var(--pp-border)] bg-white p-5 shadow-2xl" data-testid="modal-ajuste">
        <h2 id="ajuste-titulo" className="text-lg font-black text-[var(--pp-text)]">{t.titulo}</h2>
        <p className="mt-1 text-sm text-[var(--pp-text-body)]">{comLimite ? `Limite da empresa: ${textoDoLimite(limite)}.` : t.ajuda}</p>
        {comLimite && (
          <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Como informar">
            {[[false, "Em reais (R$)"], [true, "Em percentual (%)"]].map(([pct, rotulo]) => (
              <button key={rotulo} type="button" aria-pressed={emPercentual === pct} onClick={() => trocarModo(pct)} data-testid={pct ? "ajuste-percentual" : "ajuste-reais"}
                className={`min-h-11 rounded-xl border text-sm font-black ${emPercentual === pct ? "border-[#012E46] bg-[#012E46] text-white" : "border-[var(--pp-border)] bg-white text-[var(--pp-text-body)]"}`}>{rotulo}</button>
            ))}
          </div>
        )}
        {ehCupom ? (
          <input ref={ref} value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} aria-label="Código do cupom" autoComplete="off" placeholder="Ex.: BEMVINDO10"
            className="mt-3 min-h-12 w-full rounded-xl border-2 border-[#012E46] px-3 text-lg font-bold uppercase text-[var(--pp-text)] outline-none" />
        ) : (
          <input ref={ref} value={digitos === "" ? "" : numeroParaMoeda(digitado)} onChange={(e) => setDigitos(e.target.value.replace(/\D/g, "").slice(0, emPercentual ? 4 : 9))} inputMode="numeric" aria-label={`Valor do ${t.titulo.toLowerCase()}${emPercentual ? " em percentual" : ""}`} placeholder="0,00"
            className="mt-3 min-h-12 w-full rounded-xl border-2 border-[#012E46] px-3 text-right text-2xl font-black tabular-nums text-[var(--pp-text)] outline-none" />
        )}
        {comLimite && (
          <>
            <p className={`mt-2 text-xs font-bold ${passou ? "text-[var(--pp-danger)]" : "text-[var(--pp-text-body)]"}`} role={passou ? "alert" : undefined} data-testid="ajuste-limite">
              {passou ? "Acima do limite. " : ""}{emPercentual && valor > 0 ? `Corresponde a R$ ${numeroParaMoeda(valor)}. ` : ""}Máximo nesta conta: R$ {numeroParaMoeda(maximo)}.
            </p>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, 120))} aria-label="Motivo" placeholder="Motivo (obrigatório)" autoComplete="off"
              className="mt-3 min-h-11 w-full rounded-xl border border-[var(--pp-border)] px-3 text-sm font-semibold text-[var(--pp-text)] outline-none focus:border-[#012E46]" />
          </>
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
