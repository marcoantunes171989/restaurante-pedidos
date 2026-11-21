import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listarDocumentosFiscais } from "../../../lib/fiscal/notasFiscais";
import { buscarEmitenteFiscal } from "../../../lib/fiscal/fiscalApi";
import { postarApiFiscal } from "../../../lib/fiscal/emissaoPdv";
import { FUNDAMENTO_CANCELAMENTO_NFCE, janelaCancelamentoNfce, nfceForaDoPrazo, podeCancelarNfce, prazoCancelamentoNfceMin, textoContagem } from "../../../lib/fiscal/prazoCancelamento";

// Tela de Cancelamento de NFC-e: lista SOMENTE as NFC-e que ainda podem ser canceladas (autorizada, normal e dentro do prazo legal da UF),
// com a contagem regressiva. Passou do prazo, a nota sai da lista sozinha. O servidor confere o prazo de novo antes de enviar à SEFAZ.
const botao = "inline-flex min-h-9 items-center justify-center rounded-xl bg-[#012E46] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const botaoLeve = "inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--pp-text-body)] transition hover:border-[#012E46] disabled:opacity-45";
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hora = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const JUST_MIN = 15, JUST_MAX = 255;

function LinhaCancelamento({ nota, restanteMs, limite, prazoMin, ocupado, aberto, onAbrir, onConfirmar, onFechar, resultado }) {
  const [texto, setTexto] = useState("");
  const [saiu, setSaiu] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const tam = texto.trim().length;
  const erroTexto = tam < JUST_MIN ? `A justificativa precisa de ${JUST_MIN} letras ou mais (faltam ${JUST_MIN - tam}).` : "";
  const urgente = restanteMs < 5 * 60000;
  const pct = Math.max(0, Math.min(100, (restanteMs / (prazoMin * 60000)) * 100));
  return (
    <li className="rounded-xl border border-[var(--pp-border)] bg-white p-3" data-testid="linha-cancelamento" data-nota={nota.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-[var(--pp-text)]">NFC-e nº {nota.numero} · série {nota.serie} · {brl(nota.valorTotal)}</p>
          <p className="text-[12px] text-[var(--pp-text-muted)]">Autorizada às {hora(nota.dhAutorizacao)} · limite para cancelar: {hora(limite)} · protocolo {nota.protocolo}</p>
          {nota.ambiente === "homologacao" && <p className="text-[11px] text-[var(--pp-text-muted)]">Homologação (teste, sem valor fiscal)</p>}
        </div>
        <div className="text-right">
          <p className={`text-[18px] font-bold tabular-nums ${urgente ? "text-[#C81E4A]" : "text-[#1F7A3D]"}`} data-testid="contagem" aria-label="Tempo restante para cancelar">{textoContagem(restanteMs)}</p>
          <p className="text-[11px] text-[var(--pp-text-muted)]">restantes</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--pp-bg)]" aria-hidden="true"><div className={`h-full ${urgente ? "bg-[#C81E4A]" : "bg-[#1F7A3D]"}`} style={{ width: `${pct}%` }} /></div>

      {aberto ? (
        <div className="mt-3 space-y-2" role="region" aria-label={`Cancelar NFC-e ${nota.numero}`}>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Motivo do cancelamento ({JUST_MIN} a {JUST_MAX} letras)</span>
            <textarea rows={2} maxLength={JUST_MAX} value={texto} onChange={(e) => setTexto(e.target.value)} data-testid="justificativa"
              placeholder="Ex.: Venda desfeita pelo cliente no caixa antes da entrega do pedido"
              className="mt-0.5 w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2 text-[13px] text-[var(--pp-text)] outline-none focus:border-[#012E46]" />
          </label>
          {tam > 0 && erroTexto && <p className="text-[12px] text-[#B45309]">{erroTexto}</p>}
          <label className="flex items-start gap-2 text-[12px] text-[var(--pp-text-body)]">
            <input type="checkbox" checked={saiu} onChange={(e) => setSaiu(e.target.checked)} data-testid="mercadoria-nao-saiu" className="mt-0.5" />
            <span>Confirmo que a <b>mercadoria não saiu</b> (a venda não foi concluída). A lei só permite cancelar nessa condição.</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {!confirmando ? (
              <button type="button" className={botao} disabled={!!erroTexto || !saiu || ocupado} onClick={() => setConfirmando(true)} data-testid="btn-cancelar-nota">Cancelar NFC-e</button>
            ) : (
              <>
                <span className="text-[12px] font-semibold text-[#B45309]">O cancelamento não pode ser desfeito. Confirmar?</span>
                <button type="button" className={botao} disabled={ocupado} onClick={() => onConfirmar(texto.trim())} data-testid="btn-confirmar-cancelamento">{ocupado ? "Cancelando…" : "Sim, cancelar"}</button>
                <button type="button" className={botaoLeve} disabled={ocupado} onClick={() => setConfirmando(false)}>Voltar</button>
              </>
            )}
            <button type="button" className={botaoLeve} disabled={ocupado} onClick={onFechar}>Fechar</button>
          </div>
        </div>
      ) : (
        <div className="mt-2"><button type="button" className={botao} onClick={onAbrir} data-testid="btn-abrir-cancelamento">Cancelar esta NFC-e</button></div>
      )}
      {resultado && <p role="status" data-testid="resultado-cancelamento" className={`mt-2 text-[12px] font-semibold ${resultado.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>{resultado.texto}</p>}
    </li>
  );
}

export default function CancelamentoNfce({ supabase, lojaInfo }) {
  const lojaId = lojaInfo?.id ?? null;
  const [estado, setEstado] = useState({ carregando: true, erro: "", notas: [], uf: "" });
  const [agora, setAgora] = useState(() => new Date());
  const [aberto, setAberto] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [resultados, setResultados] = useState({});
  const ufRef = useRef("");

  const carregar = useCallback(async () => {
    if (lojaId == null) return;
    try {
      if (!ufRef.current) { try { ufRef.current = (await buscarEmitenteFiscal(supabase, lojaId))?.uf || ""; } catch { /* sem UF: vale o teto nacional */ } }
      const notas = await listarDocumentosFiscais(supabase, lojaId, { limite: 100 });
      setEstado({ carregando: false, erro: "", notas, uf: ufRef.current });
    } catch (e) { setEstado((s) => ({ ...s, carregando: false, erro: e.message || "Não foi possível carregar as notas." })); }
  }, [supabase, lojaId]);

  useEffect(() => { carregar(); const t = setInterval(carregar, 15000); return () => clearInterval(t); }, [carregar]);
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 1000); return () => clearInterval(t); }, []);

  const { elegiveis, foraDoPrazo } = useMemo(() => {
    const el = estado.notas.filter((n) => podeCancelarNfce(n, { uf: estado.uf, agora }))
      .map((n) => ({ nota: n, ...janelaCancelamentoNfce({ dhAutorizacao: n.dhAutorizacao, uf: estado.uf, agora }) }))
      .sort((a, b) => a.restanteMs - b.restanteMs);
    return { elegiveis: el, foraDoPrazo: estado.notas.filter((n) => nfceForaDoPrazo(n, { uf: estado.uf, agora })).length };
  }, [estado.notas, estado.uf, agora]);

  async function cancelar(nota, xJust) {
    setOcupado(nota.id);
    try {
      const r = await postarApiFiscal(supabase, { acao: "cancelar", documentoId: nota.id, xJust });
      if (r?.ok) { setResultados((v) => ({ ...v, [nota.id]: { ok: true, texto: `NFC-e nº ${nota.numero} cancelada na SEFAZ. Protocolo ${r.protocolo || "—"}.` } })); setAberto(null); carregar(); }
      else setResultados((v) => ({ ...v, [nota.id]: { ok: false, texto: r?.erro || r?.xMotivo || "Não foi possível cancelar." } }));
    } catch { setResultados((v) => ({ ...v, [nota.id]: { ok: false, texto: "Não foi possível cancelar agora. Tente novamente." } })); } finally { setOcupado(null); }
  }

  if (lojaId == null) return <p className="text-[13px] text-[var(--pp-text-muted)]">Selecione uma empresa.</p>;
  const prazo = prazoCancelamentoNfceMin(estado.uf);
  const concluidas = Object.entries(resultados).filter(([id, r]) => r.ok && !elegiveis.some((e) => e.nota.id === id));

  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby="canc-titulo" data-testid="cancelamento-nfce">
      <h3 id="canc-titulo" className="text-[15px] font-bold text-[var(--pp-text)]">Cancelar NFC-e</h3>
      <p className="mt-0.5 text-[12px] text-[var(--pp-text-muted)]" data-testid="canc-regra">
        Prazo legal{estado.uf ? ` em ${estado.uf}` : ""}: <b>{prazo} minutos</b> contados da autorização, desde que a mercadoria não tenha saído. {FUNDAMENTO_CANCELAMENTO_NFCE}
      </p>
      {estado.carregando && <p className="mt-3 text-[13px] text-[var(--pp-text-muted)]">Carregando…</p>}
      {estado.erro && <p className="mt-3 text-[13px] font-semibold text-[#C81E4A]" data-testid="canc-erro">{estado.erro}</p>}

      {!estado.carregando && !estado.erro && (
        <>
          {concluidas.map(([id, r]) => <p key={id} role="status" className="mt-3 rounded-lg bg-[#E8F5EC] px-3 py-2 text-[12px] font-semibold text-[#1F7A3D]" data-testid="canc-concluido">{r.texto}</p>)}
          {elegiveis.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-[var(--pp-border)] p-4 text-center" data-testid="canc-vazio">
              <p className="text-[13px] font-semibold text-[var(--pp-text)]">Nenhuma NFC-e dentro do prazo de cancelamento.</p>
              <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">Só aparecem notas autorizadas há menos de {prazo} minutos. A lista atualiza sozinha.</p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2" data-testid="canc-lista">
              {elegiveis.map(({ nota, restanteMs, limite, prazoMin }) => (
                <LinhaCancelamento key={nota.id} nota={nota} restanteMs={restanteMs} limite={limite} prazoMin={prazoMin} ocupado={ocupado === nota.id}
                  aberto={aberto === nota.id} onAbrir={() => setAberto(nota.id)} onFechar={() => setAberto(null)} onConfirmar={(t) => cancelar(nota, t)} resultado={resultados[nota.id]} />
              ))}
            </ul>
          )}
          {foraDoPrazo > 0 && (
            <p className="mt-3 text-[12px] text-[var(--pp-text-muted)]" data-testid="canc-fora">
              {foraDoPrazo} NFC-e autorizada(s) já passaram do prazo e não aparecem aqui. Fora do prazo, o cancelamento só por pedido de regularização ao fisco do estado
              (em SP: Posto Fiscal, via SIPET). Fale com o contador.
            </p>
          )}
        </>
      )}
    </section>
  );
}
