// ════════════════════════════════════════════════════════════
//  LojaHorarioFuncionamento — editor da grade semanal (Operação)
//
//  Fonte única: tab_lojas.funcionamento. Suporta grade unificada (interno =
//  externo) ou separada por canal, múltiplos intervalos por dia e virada de
//  meia-noite. Validação via horarioFuncionamentoService (não recalcula no JSX).
//  Paleta light oficial. Sem dependências novas.
// ════════════════════════════════════════════════════════════

import { useState } from "react";
import { DIAS, DIAS_ROTULO, validarGrade, gradeVazia } from "../../../lib/horarioFuncionamentoService";

const TIME = "rounded-lg border border-[#D1D5DB] bg-white px-2 py-1.5 text-sm text-[#111111] outline-none focus:border-[#012E46]";
const TIME_ERR = "border-[#C81E4A] focus:border-[#C81E4A]";

const gradeIgual = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

// Uma linha (dia) — módulo-escopo para não criar componente durante o render.
function DiaLinha({ dia, intervalos, erros, readOnly, onToggle, onSetIv, onAddIv, onRemoveIv, onCopiar }) {
  const aberto = intervalos.length > 0;
  return (
    <div className="rounded-xl border border-[#D1D5DB] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="min-w-[72px] text-[13px] font-bold text-[#012E46]">{DIAS_ROTULO[dia]}</span>
          <button type="button" disabled={readOnly} onClick={() => onToggle(dia, !aberto)} aria-pressed={aberto}
            className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${aberto ? "border-[#012E46] bg-[rgba(1,46,70,0.06)] text-[#012E46]" : "border-[#D1D5DB] bg-white text-[#6B7280]"} ${readOnly ? "opacity-60" : ""}`}>
            {aberto ? "Aberto" : "Fechado"}
          </button>
        </div>
        {aberto && !readOnly && (
          <button type="button" onClick={() => onCopiar(dia)} className="text-[11px] font-semibold text-[#F38525] hover:underline">Copiar para todos</button>
        )}
      </div>
      {aberto && (
        <div className="mt-2 space-y-2">
          {intervalos.map((iv, idx) => {
            const erro = erros[`${dia}:${idx}`];
            return (
              <div key={idx}>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`h-${dia}-${idx}-a`}>Abertura {DIAS_ROTULO[dia]} intervalo {idx + 1}</label>
                  <input id={`h-${dia}-${idx}-a`} type="time" disabled={readOnly} aria-invalid={!!erro} value={iv.abre} onChange={(e) => onSetIv(dia, idx, "abre", e.target.value)} className={`${TIME}${erro ? " " + TIME_ERR : ""}`} />
                  <span className="text-[#6B7280]">às</span>
                  <label className="sr-only" htmlFor={`h-${dia}-${idx}-f`}>Fechamento {DIAS_ROTULO[dia]} intervalo {idx + 1}</label>
                  <input id={`h-${dia}-${idx}-f`} type="time" disabled={readOnly} aria-invalid={!!erro} value={iv.fecha} onChange={(e) => onSetIv(dia, idx, "fecha", e.target.value)} className={`${TIME}${erro ? " " + TIME_ERR : ""}`} />
                  {!readOnly && intervalos.length > 1 && (
                    <button type="button" onClick={() => onRemoveIv(dia, idx)} aria-label="Remover intervalo" className="rounded-lg border border-[rgba(200,30,74,0.24)] bg-white px-2 py-1 text-[12px] font-semibold text-[#C81E4A] hover:bg-[rgba(200,30,74,0.06)]">✕</button>
                  )}
                </div>
                {erro && <p className="mt-1 text-[11px] font-semibold text-[#C81E4A]">{erro}</p>}
              </div>
            );
          })}
          {!readOnly && <button type="button" onClick={() => onAddIv(dia)} className="text-[12px] font-semibold text-[#012E46] hover:underline">+ Adicionar intervalo</button>}
        </div>
      )}
    </div>
  );
}

function GradeSemanal({ grade, erros, readOnly, canal, onChange }) {
  const setDia = (dia, intervalos) => onChange({ ...grade, [dia]: intervalos });
  const toggle = (dia, aberto) => setDia(dia, aberto ? [{ abre: "18:00", fecha: "23:00" }] : []);
  const setIv = (dia, idx, campo, valor) => setDia(dia, (grade[dia] || []).map((iv, i) => i === idx ? { ...iv, [campo]: valor } : iv));
  const addIv = (dia) => setDia(dia, [...(grade[dia] || []), { abre: "18:00", fecha: "23:00" }]);
  const removeIv = (dia, idx) => setDia(dia, (grade[dia] || []).filter((_, i) => i !== idx));
  const copiar = (dia) => { const base = grade[dia] || []; const nova = {}; for (const d of DIAS) nova[d] = base.map((iv) => ({ ...iv })); onChange(nova); };
  return (
    <div className="space-y-2" role="group" aria-label={`Grade ${canal}`}>
      {DIAS.map((dia) => (
        <DiaLinha key={dia} dia={dia} intervalos={grade[dia] || []} erros={erros} readOnly={readOnly}
          onToggle={toggle} onSetIv={setIv} onAddIv={addIv} onRemoveIv={removeIv} onCopiar={copiar} />
      ))}
    </div>
  );
}

function LojaHorarioFuncionamento({ value, onChange, modoUso = "ambos", readOnly = false }) {
  const f = value || {};
  const [subaba, setSubaba] = useState(modoUso === "externo" ? "externo" : "interno");
  const [confirmarUnificar, setConfirmarUnificar] = useState(false);

  const setF = (patch) => onChange({ ...f, ...patch });
  const errInterno = validarGrade(f.interno || {}).erros;
  const errExterno = validarGrade(f.externo || {}).erros;

  function escolherUnificado(unificado) {
    if (!unificado) {
      // Separado: parte da grade atual (interna) copiada para os dois (FASE 37).
      const base = f.interno && Object.keys(f.interno).length ? f.interno : f.externo;
      onChange({ ...f, unificado: false, interno: JSON.parse(JSON.stringify(base || gradeVazia())), externo: JSON.parse(JSON.stringify(base || gradeVazia())) });
      return;
    }
    // Unificar: se as grades divergem, pedir qual usar (FASE 38 — sem perda silenciosa).
    if (!gradeIgual(f.interno, f.externo)) { setConfirmarUnificar(true); return; }
    setF({ unificado: true });
  }
  function aplicarUnificado(fonte) {
    const base = fonte === "externo" ? f.externo : f.interno;
    onChange({ ...f, unificado: true, interno: JSON.parse(JSON.stringify(base || gradeVazia())), externo: JSON.parse(JSON.stringify(base || gradeVazia())) });
    setConfirmarUnificar(false);
  }

  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4">
      <h4 className="text-[13px] font-bold uppercase tracking-wide text-[#012E46]">Horário de funcionamento</h4>
      <p className="mt-0.5 text-[12px] text-[#6B7280]">Fonte única do horário da empresa. O cardápio externo e o atendimento interno consultam esta configuração.</p>

      {/* Unificado x separado */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row" role="radiogroup" aria-label="Modo dos horários">
        {[["true", "Usar os mesmos horários para Interno e Externo"], ["false", "Configurar horários diferentes"]].map(([v, rot]) => {
          const sel = String(f.unificado === true) === v;
          return (
            <button key={v} type="button" role="radio" aria-checked={sel} disabled={readOnly} onClick={() => escolherUnificado(v === "true")}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-left text-[12px] font-semibold transition ${sel ? "border-[#012E46] bg-[rgba(1,46,70,0.06)] text-[#012E46]" : "border-[#D1D5DB] bg-white text-[#111111] hover:bg-[#F9FAFB]"} ${readOnly ? "opacity-60" : ""}`}>
              <span className="mr-1">{sel ? "●" : "○"}</span>{rot}
            </button>
          );
        })}
      </div>

      {/* Confirmação ao unificar grades divergentes (FASE 38) */}
      {confirmarUnificar && (
        <div className="mt-3 rounded-xl border border-[rgba(243,133,37,0.4)] bg-[rgba(243,133,37,0.08)] p-3">
          <p className="text-[12px] font-bold text-[#B45309]">Qual horário deseja usar como padrão?</p>
          <p className="text-[11px] text-[#6B7280]">As grades Interno e Externo estão diferentes. Escolha qual será aplicada aos dois.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => aplicarUnificado("interno")} className="rounded-lg bg-[#012E46] px-3 py-1.5 text-[12px] font-bold text-white">Usar Interno</button>
            <button type="button" onClick={() => aplicarUnificado("externo")} className="rounded-lg bg-[#012E46] px-3 py-1.5 text-[12px] font-bold text-white">Usar Externo</button>
            <button type="button" onClick={() => setConfirmarUnificar(false)} className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#111111]">Cancelar</button>
          </div>
        </div>
      )}

      {/* Grades */}
      {f.unificado ? (
        <div className="mt-3">
          <p className="mb-2 text-[12px] font-bold text-[#111111]">Funcionamento geral</p>
          <GradeSemanal grade={f.interno || {}} erros={errInterno} readOnly={readOnly} canal="geral" onChange={(g) => setF({ interno: g, externo: g })} />
        </div>
      ) : (
        <div className="mt-3">
          <div role="tablist" aria-label="Canais" className="mb-2 flex gap-1 border-b border-[#D1D5DB]">
            {[["interno", "Atendimento Interno"], ["externo", "Atendimento Externo"]].map(([id, rot]) => (
              <button key={id} role="tab" aria-selected={subaba === id} type="button" onClick={() => setSubaba(id)}
                className={`border-b-2 px-3 py-2 text-[12px] font-semibold transition ${subaba === id ? "border-[#012E46] text-[#012E46]" : "border-transparent text-[#6B7280] hover:text-[#111111]"}`}>{rot}</button>
            ))}
          </div>
          {modoUso === "interno" && subaba === "externo" && (
            <p className="mb-2 rounded-lg border border-[rgba(243,133,37,0.3)] bg-[rgba(243,133,37,0.06)] px-3 py-2 text-[11px] font-semibold text-[#B45309]">O horário externo ficará disponível quando o modo de uso for Externo ou Ambos.</p>
          )}
          {subaba === "interno"
            ? <GradeSemanal grade={f.interno || {}} erros={errInterno} readOnly={readOnly} canal="interno" onChange={(g) => setF({ interno: g })} />
            : <GradeSemanal grade={f.externo || {}} erros={errExterno} readOnly={readOnly} canal="externo" onChange={(g) => setF({ externo: g })} />}
        </div>
      )}
      <p className="mt-2 text-[11px] text-[#6B7280]">Fuso: {f.timezone || "America/Sao_Paulo"}. Intervalos que viram a meia-noite (ex.: 18:00 às 02:00) são suportados.</p>
    </section>
  );
}

export default LojaHorarioFuncionamento;
