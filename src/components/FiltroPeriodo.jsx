/**
 * Filtro de período único do sistema: botões lado a lado em telas largas e,
 * no celular, um botão que abre as opções em uma folha na parte de baixo.
 */
import { useEffect, useState } from "react";
import { CalendarDays, Check, ChevronDown, X } from "lucide-react";
import { PERIODOS, hojeISO, rotuloPeriodoSelecionado } from "../lib/periodos.js";

const CAMPO = "pdv-toque mt-1 min-h-10 w-full min-w-0 rounded-xl border border-[#D8E0E5] bg-white px-3 text-sm font-semibold text-[#012E46] outline-none focus:border-[#012E46]";
const ROTULO = "min-w-0 text-[11px] font-semibold uppercase tracking-wide text-[#667085]";

function Datas({ ini, fim, onIni, onFim }) {
  const hoje = hojeISO();
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className={ROTULO}>De
        <input type="date" value={ini} max={fim || hoje} onChange={(e) => onIni(e.target.value)} className={CAMPO} />
      </label>
      <label className={ROTULO}>Até
        <input type="date" value={fim} min={ini || undefined} max={hoje} onChange={(e) => onFim(e.target.value)} className={CAMPO} />
      </label>
    </div>
  );
}

export default function FiltroPeriodo({ valor, onMudar, ini = "", fim = "", onIni = () => {}, onFim = () => {}, semDatas = false, className = "" }) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return undefined;
    const tecla = (e) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aberto]);

  function escolher(id) {
    onMudar(id);
    if (id !== "periodo" || semDatas) setAberto(false);
  }

  return (
    <div className={`min-w-0 ${className}`}>
      <button type="button" onClick={() => setAberto(true)} aria-haspopup="dialog" aria-expanded={aberto} data-testid="filtro-periodo"
        className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-[#D8E0E5] bg-white px-3.5 text-left text-sm font-semibold text-[#012E46] shadow-[0_1px_2px_rgba(1,46,70,0.05)] lg:hidden">
        <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate"><span className="text-[#667085]">Período: </span>{rotuloPeriodoSelecionado(valor, ini, fim)}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[#667085]" aria-hidden="true" />
      </button>

      <div className="hidden flex-col items-end gap-2 lg:flex">
        <div role="group" aria-label="Período" className="inline-flex flex-wrap items-center gap-0.5 rounded-2xl border border-[#E1E7EB] bg-[#F4F7F8] p-1">
          {PERIODOS.map((p) => {
            const sel = valor === p.id;
            return (
              <button key={p.id} type="button" aria-pressed={sel} onClick={() => onMudar(p.id)}
                className="inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F38525]"
                style={{ background: sel ? "#012E46" : "transparent", color: sel ? "#FFFFFF" : "#475467" }}>
                {p.id === "periodo" && <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />}
                {p.rotulo}
              </button>
            );
          })}
        </div>
        {valor === "periodo" && !semDatas && <div className="w-80"><Datas ini={ini} fim={fim} onIni={onIni} onFim={onFim} /></div>}
      </div>

      {aberto && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-[#012E46]/45 lg:hidden" onClick={() => setAberto(false)} role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Escolher período" onClick={(e) => e.stopPropagation()}
            className="pp-folha w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-semibold text-[#012E46]">Período</p>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E1E7EB] text-[#012E46]"><X className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PERIODOS.map((p) => {
                const sel = valor === p.id;
                return (
                  <button key={p.id} type="button" aria-pressed={sel} onClick={() => escolher(p.id)}
                    className="flex min-h-12 items-center justify-between rounded-2xl border px-3.5 text-sm font-semibold"
                    style={{ borderColor: sel ? "#012E46" : "#E1E7EB", background: sel ? "#012E46" : "#FFFFFF", color: sel ? "#FFFFFF" : "#012E46" }}>
                    {p.rotulo}
                    {sel && <Check className="h-4 w-4" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            {valor === "periodo" && !semDatas && (
              <div className="mt-3 space-y-3">
                <Datas ini={ini} fim={fim} onIni={onIni} onFim={onFim} />
                <button type="button" onClick={() => setAberto(false)} className="min-h-12 w-full rounded-2xl text-sm font-semibold" style={{ background: "#012E46", color: "#FFFFFF" }}>Aplicar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
