import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buscarEmitenteFiscal } from "../../../lib/fiscal/fiscalApi";
import { postarApiFiscal } from "../../../lib/fiscal/emissaoPdv";

// Tela de cancelamento (NFC-e e NF-e): lista SOMENTE as notas que ainda podem ser canceladas, com a contagem regressiva. Passou do
// prazo, a nota sai da lista sozinha. As regras de cada modelo vêm em `regras` (CancelamentoNfce.jsx e CancelamentoNfe.jsx).
const botao = "inline-flex min-h-9 items-center justify-center rounded-xl bg-[#012E46] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const botaoLeve = "inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--pp-text-body)] transition hover:border-[#012E46] disabled:opacity-45";
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const JUST_MIN = 15, JUST_MAX = 255;

function LinhaCancelamento({ regras, nota, restanteMs, limite, prazoMin, extemporaneo, ocupado, aberto, onAbrir, onConfirmar, onFechar, resultado }) {
  const [texto, setTexto] = useState("");
  const [saiu, setSaiu] = useState(false);
  const [ciente, setCiente] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const tam = texto.trim().length;
  const erroTexto = tam < JUST_MIN ? `A justificativa precisa de ${JUST_MIN} letras ou mais (faltam ${JUST_MIN - tam}).` : "";
  const urgente = restanteMs < regras.urgenteMs;
  const pct = Math.max(0, Math.min(100, (restanteMs / (prazoMin * 60000)) * 100));
  const falta = !!erroTexto || !saiu || (extemporaneo && !ciente);
  const cor = urgente ? "text-[#C81E4A]" : extemporaneo ? "text-[#B45309]" : "text-[#1F7A3D]";
  const fundo = urgente ? "bg-[#C81E4A]" : extemporaneo ? "bg-[#B45309]" : "bg-[#1F7A3D]";
  return (
    <li className="rounded-xl border border-[var(--pp-border)] bg-white p-3" data-testid="linha-cancelamento" data-nota={nota.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-[var(--pp-text)]">{regras.sigla} nº {nota.numero} · série {nota.serie} · {brl(nota.valorTotal)}</p>
          <p className="text-[12px] text-[var(--pp-text-muted)]">Autorizada {regras.quando(nota.dhAutorizacao)} · limite para cancelar: {regras.ateQuando(limite)} · protocolo {nota.protocolo}</p>
          {nota.ambiente === "homologacao" && <p className="text-[11px] text-[var(--pp-text-muted)]">Homologação (teste, sem valor fiscal)</p>}
          {extemporaneo && <p className="text-[11px] font-semibold text-[#B45309]" data-testid="canc-extemporaneo">{regras.avisoExtemporaneo}</p>}
        </div>
        <div className="text-right">
          <p className={`text-[18px] font-bold tabular-nums ${cor}`} data-testid="contagem" aria-label="Tempo restante para cancelar">{regras.contagem(restanteMs)}</p>
          <p className="text-[11px] text-[var(--pp-text-muted)]">restantes</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--pp-bg)]" aria-hidden="true"><div className={`h-full ${fundo}`} style={{ width: `${pct}%` }} /></div>

      {aberto ? (
        <div className="mt-3 space-y-2" role="region" aria-label={`Cancelar ${regras.sigla} ${nota.numero}`}>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Motivo do cancelamento ({JUST_MIN} a {JUST_MAX} letras)</span>
            <textarea rows={2} maxLength={JUST_MAX} value={texto} onChange={(e) => setTexto(e.target.value)} data-testid="justificativa"
              placeholder={regras.exemploMotivo}
              className="mt-0.5 w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2 text-[13px] text-[var(--pp-text)] outline-none focus:border-[#012E46]" />
          </label>
          {tam > 0 && erroTexto && <p className="text-[12px] text-[#B45309]">{erroTexto}</p>}
          <label className="flex items-start gap-2 text-[12px] text-[var(--pp-text-body)]">
            <input type="checkbox" checked={saiu} onChange={(e) => setSaiu(e.target.checked)} data-testid="mercadoria-nao-saiu" className="mt-0.5" />
            <span>{regras.condicao}</span>
          </label>
          {extemporaneo && (
            <label className="flex items-start gap-2 text-[12px] text-[var(--pp-text-body)]">
              <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} data-testid="ciente-fora-do-prazo" className="mt-0.5" />
              <span>{regras.condicaoExtemporaneo}</span>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!confirmando ? (
              <button type="button" className={botao} disabled={falta || ocupado} onClick={() => setConfirmando(true)} data-testid="btn-cancelar-nota">Cancelar {regras.sigla}</button>
            ) : (
              <>
                <span className="text-[12px] font-semibold text-[#B45309]">O cancelamento não pode ser desfeito. Confirmar?</span>
                <button type="button" className={botao} disabled={ocupado || falta} onClick={() => onConfirmar(texto.trim())} data-testid="btn-confirmar-cancelamento">{ocupado ? "Cancelando…" : "Sim, cancelar"}</button>
                <button type="button" className={botaoLeve} disabled={ocupado} onClick={() => setConfirmando(false)}>Voltar</button>
              </>
            )}
            <button type="button" className={botaoLeve} disabled={ocupado} onClick={onFechar}>Fechar</button>
          </div>
        </div>
      ) : (
        <div className="mt-2"><button type="button" className={botao} onClick={onAbrir} data-testid="btn-abrir-cancelamento">Cancelar esta {regras.sigla}</button></div>
      )}
      {resultado && <p role="status" data-testid="resultado-cancelamento" className={`mt-2 text-[12px] font-semibold ${resultado.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>{resultado.texto}</p>}
    </li>
  );
}

export default function CancelamentoNota({ supabase, lojaInfo, regras }) {
  const lojaId = lojaInfo?.id ?? null;
  const [estado, setEstado] = useState({ carregando: true, erro: "", notas: [], uf: "", parcial: false });
  const [agora, setAgora] = useState(() => new Date());
  const [aberto, setAberto] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [resultados, setResultados] = useState({});
  const ufRef = useRef("");

  const carregar = useCallback(async () => {
    if (lojaId == null) return;
    try {
      if (!ufRef.current) { try { ufRef.current = (await buscarEmitenteFiscal(supabase, lojaId))?.uf || ""; } catch { /* sem UF: vale o prazo geral */ } }
      const { notas, parcial = false } = await regras.listar(supabase, lojaId, { uf: ufRef.current });
      setEstado({ carregando: false, erro: "", notas, uf: ufRef.current, parcial });
    } catch (e) { setEstado((s) => ({ ...s, carregando: false, erro: e.message || "Não foi possível carregar as notas." })); }
  }, [supabase, lojaId, regras]);

  useEffect(() => { carregar(); const t = setInterval(carregar, regras.atualizaMs); return () => clearInterval(t); }, [carregar, regras]);
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 1000); return () => clearInterval(t); }, []);

  const { elegiveis, foraDoPrazo } = useMemo(() => {
    const el = estado.notas.filter((n) => regras.pode(n, { uf: estado.uf, agora }))
      .map((n) => ({ nota: n, ...regras.janela({ dhAutorizacao: n.dhAutorizacao, uf: estado.uf, agora }) }))
      // Primeiro as que estão no prazo regular; dentro de cada grupo, a que vence antes.
      .sort((a, b) => Number(!!a.extemporaneo) - Number(!!b.extemporaneo) || a.restanteMs - b.restanteMs);
    return { elegiveis: el, foraDoPrazo: estado.notas.filter((n) => regras.fora(n, { uf: estado.uf, agora })).length };
  }, [estado.notas, estado.uf, agora, regras]);

  async function cancelar(nota, xJust) {
    setOcupado(nota.id);
    try {
      const r = await postarApiFiscal(supabase, { acao: "cancelar", documentoId: nota.id, xJust });
      if (r?.ok) { setResultados((v) => ({ ...v, [nota.id]: { ok: true, texto: `${regras.sigla} nº ${nota.numero} cancelada na SEFAZ. Protocolo ${r.protocolo || "—"}.` } })); setAberto(null); carregar(); }
      else setResultados((v) => ({ ...v, [nota.id]: { ok: false, texto: r?.erro || r?.xMotivo || "Não foi possível cancelar." } }));
    } catch { setResultados((v) => ({ ...v, [nota.id]: { ok: false, texto: "Não foi possível cancelar agora. Tente novamente." } })); } finally { setOcupado(null); }
  }

  if (lojaId == null) return <p className="text-[13px] text-[var(--pp-text-muted)]">Selecione uma empresa.</p>;
  const concluidas = Object.entries(resultados).filter(([id, r]) => r.ok && !elegiveis.some((e) => e.nota.id === id));

  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby={`${regras.id}-titulo`} data-testid={regras.id}>
      <h3 id={`${regras.id}-titulo`} className="text-[15px] font-bold text-[var(--pp-text)]">Cancelar {regras.sigla}</h3>
      <p className="mt-0.5 text-[12px] text-[var(--pp-text-muted)]" data-testid="canc-regra">{regras.regra(estado.uf)}</p>
      {estado.carregando && <p className="mt-3 text-[13px] text-[var(--pp-text-muted)]">Carregando…</p>}
      {estado.erro && <p className="mt-3 text-[13px] font-semibold text-[#C81E4A]" data-testid="canc-erro">{estado.erro}</p>}

      {!estado.carregando && !estado.erro && (
        <>
          {concluidas.map(([id, r]) => <p key={id} role="status" className="mt-3 rounded-lg bg-[#E8F5EC] px-3 py-2 text-[12px] font-semibold text-[#1F7A3D]" data-testid="canc-concluido">{r.texto}</p>)}
          {elegiveis.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-[var(--pp-border)] p-4 text-center" data-testid="canc-vazio">
              <p className="text-[13px] font-semibold text-[var(--pp-text)]">Nenhuma {regras.sigla} dentro do prazo de cancelamento.</p>
              <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">{regras.vazio(estado.uf)}</p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2" data-testid="canc-lista">
              {elegiveis.map(({ nota, restanteMs, limite, prazoMin, extemporaneo }) => (
                // A chave inclui a janela: quando a nota passa das 24 h, as confirmações são pedidas de novo.
                <LinhaCancelamento key={`${nota.id}-${extemporaneo ? "fora" : "no"}`} regras={regras} nota={nota} restanteMs={restanteMs} limite={limite} prazoMin={prazoMin} extemporaneo={!!extemporaneo} ocupado={ocupado === nota.id}
                  aberto={aberto === nota.id} onAbrir={() => setAberto(nota.id)} onFechar={() => setAberto(null)} onConfirmar={(t) => cancelar(nota, t)} resultado={resultados[nota.id]} />
              ))}
            </ul>
          )}
          {foraDoPrazo > 0 && <p className="mt-3 text-[12px] text-[var(--pp-text-muted)]" data-testid="canc-fora">{regras.avisoFora(foraDoPrazo, estado.uf)}</p>}
          {estado.parcial && <p className="mt-2 text-[12px] text-[var(--pp-text-muted)]" data-testid="canc-parcial">A busca parou nas notas mais recentes. Uma nota mais antiga pode ser cancelada em Notas emitidas.</p>}
        </>
      )}
    </section>
  );
}
