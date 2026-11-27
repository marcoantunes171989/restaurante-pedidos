import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { agruparFuncoes, filtrarFuncoes, funcaoPorCodigo } from "./pdvFuncoes";

/**
 * Paleta de funções do PDV: lista todas as funções com o código de 2 dígitos. O operador clica, usa as setas + Enter,
 * ou digita o código (ex.: 11) ou parte do nome. Código completo abre a função sozinho. Esc fecha.
 */
export default function PdvPaletaFuncoes({ aberta, funcoes = [], onExecutar, onFechar, onBloqueada }) {
  const [termo, setTermo] = useState("");
  const [indice, setIndice] = useState(0);
  const entradaRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!aberta) return undefined;
    const t = setTimeout(() => entradaRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [aberta]);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const visiveis = useMemo(() => filtrarFuncoes(funcoes, termo), [funcoes, termo]);
  const grupos = useMemo(() => agruparFuncoes(visiveis), [visiveis]);
  if (!aberta) return null;

  const fechar = () => { clearTimeout(timerRef.current); setTermo(""); setIndice(0); onFechar?.(); };
  const executar = (f) => {
    if (!f) return;
    clearTimeout(timerRef.current);
    if (!f.disponivel) { onBloqueada?.(`${f.nome}: ${f.bloqueio}`); return; }
    setTermo(""); setIndice(0);
    onExecutar?.(f);
  };
  const aoDigitar = (valor) => {
    setTermo(valor);
    setIndice(0);
    clearTimeout(timerRef.current);
    const exata = funcaoPorCodigo(funcoes, valor);
    // Código completo: abre sozinho (pequena pausa para não atropelar quem ainda digita outro número).
    if (exata) timerRef.current = setTimeout(() => executar(exata), 220);
  };
  const aoTeclar = (e) => {
    if (e.key === "Escape") { e.preventDefault(); fechar(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setIndice((i) => Math.min(visiveis.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndice((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); executar(visiveis[indice] || funcaoPorCodigo(funcoes, termo)); }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-start justify-center bg-black/55 p-3 pt-[6vh] backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }} data-testid="paleta-funcoes">
      <div role="dialog" aria-modal="true" aria-labelledby="paleta-titulo" className="flex max-h-[84dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--pp-border)] bg-white shadow-2xl">
        <header className="space-y-2 border-b border-[var(--pp-border)] px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="paleta-titulo" className="text-base font-black text-[var(--pp-text)]">Funções do PDV</h2>
            <button type="button" onClick={fechar} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-[var(--pp-text-body)] hover:bg-[var(--pp-bg)]">
              Fechar <kbd className="rounded border border-[var(--pp-border)] bg-[var(--pp-bg)] px-1.5 text-[10px]">Esc</kbd><X size={13} aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-xl border-2 border-[#012E46] px-3">
            <span aria-hidden="true" className="font-black text-[var(--pp-text-muted)]">#</span>
            <input
              ref={entradaRef}
              value={termo}
              onChange={(e) => aoDigitar(e.target.value)}
              onKeyDown={aoTeclar}
              autoComplete="off"
              aria-label="Código ou nome da função"
              placeholder="Digite o código (ex.: 11) ou o nome da função"
              data-testid="paleta-entrada"
              className="w-full bg-transparent py-3 text-lg font-bold text-[var(--pp-text)] outline-none placeholder:font-medium placeholder:text-[var(--pp-text-muted)]"
            />
          </div>
          <p className="text-xs text-[var(--pp-text-muted)]">Setas escolhem, <b>Enter</b> executa. Digitando o código completo, a função abre sozinha.</p>
        </header>

        <div className="overflow-auto px-2 pb-3" role="listbox" aria-label="Funções" data-testid="paleta-lista">
          {grupos.map((g) => (
            <section key={g.grupo}>
              <p className="px-2 pb-1 pt-3 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--pp-text-muted)]">{g.grupo}</p>
              <div className="grid gap-x-2 sm:grid-cols-2">
                {g.itens.map((f) => {
                  const pos = visiveis.indexOf(f);
                  const ativo = pos === indice;
                  return (
                    <button
                      key={f.codigo}
                      type="button"
                      role="option"
                      aria-selected={ativo}
                      aria-disabled={!f.disponivel}
                      data-codigo={f.codigo}
                      onClick={() => executar(f)}
                      onMouseEnter={() => setIndice(pos)}
                      className={`grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl p-2 text-left transition ${ativo ? "bg-[var(--pp-bg)]" : ""} ${f.disponivel ? "" : "opacity-50"}`}
                    >
                      <span className="grid h-7 w-9 place-items-center rounded-lg bg-[#012E46] text-[13px] font-black tabular-nums text-white">{f.codigo}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-[var(--pp-text)]">{f.nome}</span>
                        <span className="block truncate text-xs text-[var(--pp-text-muted)]">{f.disponivel ? f.descricao : f.bloqueio}{f.atalho && f.disponivel ? ` · tecla ${f.atalho}` : ""}</span>
                      </span>
                      {f.novo ? <span className="rounded-md bg-[#FEF1E3] px-1.5 py-0.5 text-[10px] font-black uppercase text-[#8A5200]">novo</span> : <span />}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {visiveis.length === 0 && <p className="m-3 rounded-xl border border-dashed border-[var(--pp-border)] p-4 text-center text-sm text-[var(--pp-text-muted)]">Nenhuma função com esse código ou nome.</p>}
        </div>

        <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--pp-border)] px-4 py-2 text-xs text-[var(--pp-text-muted)]">
          {[["F1", "Ajuda"], ["F2", "Buscar"], ["F3", "Mesas"], ["F4", "Pré-conta"], ["F5", "Fechar conta"], ["F6", "Registrar valor"]].map(([k, n]) => (
            <span key={k}><kbd className="rounded border border-[var(--pp-border)] bg-[var(--pp-bg)] px-1.5 text-[10px]">{k}</kbd> {n}</span>
          ))}
        </footer>
      </div>
    </div>
  );
}
