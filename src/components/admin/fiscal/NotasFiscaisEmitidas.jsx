import { useCallback, useEffect, useState } from "react";
import { situacaoNota, acoesDaNota, validarTextoEvento, listarDocumentosFiscais, pedirEventoFiscal } from "../../../lib/fiscal/notasFiscais";

// ════════════════════════════════════════════════════════════
//  Aba "Notas emitidas" (Etapa E6): lista as notas da loja e permite
//  cancelar (NF-e/NFC-e) ou corrigir (CC-e, NF-e). O pedido vai ao servidor,
//  que assina e envia à SEFAZ; a confirmação acontece na própria tela.
// ════════════════════════════════════════════════════════════

const botao = "inline-flex min-h-9 items-center justify-center rounded-xl bg-[#012E46] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const botaoLeve = "inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--pp-text-body)] transition hover:border-[#012E46]";
const TOM = {
  ok: "bg-[#E8F5EC] text-[#1F7A3D]", erro: "bg-[#FDECEF] text-[#C81E4A]",
  alerta: "bg-[#FEF3E2] text-[#B45309]", neutro: "bg-[var(--pp-bg)] text-[var(--pp-text-body)]",
};
const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

function PainelEvento({ nota, acao, onFechar, onConcluido, supabase }) {
  const [texto, setTexto] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const cancelar = acao === "cancelar";
  const erroTexto = validarTextoEvento(acao, texto);
  const max = cancelar ? 255 : 1000;
  const numero = `${nota.modelo === 65 ? "NFC-e" : "NF-e"} nº ${nota.numero} (série ${nota.serie})`;

  async function enviar() {
    setEnviando(true);
    try {
      const corpo = cancelar ? { acao: "cancelar", documentoId: nota.id, xJust: texto } : { acao: "cce", documentoId: nota.id, xCorrecao: texto };
      const r = await pedirEventoFiscal(supabase, corpo);
      setResultado({ ok: true, texto: cancelar ? `Nota cancelada na SEFAZ. Protocolo ${r.protocolo}.` : `Correção registrada na SEFAZ (carta nº ${r.nSeq}). Protocolo ${r.protocolo}.` });
      onConcluido();
    } catch (err) {
      setResultado({ ok: false, texto: err.message });
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3" role="region" aria-label={cancelar ? "Cancelar nota" : "Carta de correção"}>
      <p className="text-[13px] font-bold text-[var(--pp-text)]">{cancelar ? `Cancelar ${numero}` : `Carta de correção da ${numero}`}</p>
      {!cancelar && <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">Não pode mudar valores, impostos, quantidade, quem vende ou quem compra, nem a data.</p>}
      <label htmlFor={`evento-texto-${nota.id}`} className="mt-2 block text-[12px] font-semibold text-[var(--pp-text-body)]">
        {cancelar ? "Motivo do cancelamento" : "O que deve ser corrigido"}
      </label>
      <textarea id={`evento-texto-${nota.id}`} rows={cancelar ? 2 : 4} maxLength={max} value={texto} onChange={(e) => setTexto(e.target.value)}
        className="mt-1 w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2 text-[13px] text-[var(--pp-text)] outline-none focus:border-[#012E46]" />
      <p className={`text-[11px] ${erroTexto && texto ? "text-[#B45309]" : "text-[var(--pp-text-muted)]"}`}>{erroTexto && texto ? erroTexto : `${texto.trim().length}/${max} caracteres (mínimo 15).`}</p>
      {resultado && <p role="status" className={`mt-2 text-[12px] font-semibold ${resultado.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>{resultado.texto}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {!resultado?.ok && !confirmando && (
          <button type="button" className={botao} disabled={!!erroTexto} onClick={() => setConfirmando(true)}>{cancelar ? "Cancelar nota" : "Enviar correção"}</button>
        )}
        {confirmando && (
          <>
            <span className="self-center text-[12px] font-semibold text-[#B45309]">{cancelar ? "O cancelamento não pode ser desfeito. Confirmar?" : "A correção fica registrada na SEFAZ. Confirmar?"}</span>
            <button type="button" className={botao} disabled={enviando} onClick={enviar}>{enviando ? "Enviando…" : "Sim, confirmar"}</button>
            <button type="button" className={botaoLeve} disabled={enviando} onClick={() => setConfirmando(false)}>Voltar</button>
          </>
        )}
        <button type="button" className={botaoLeve} disabled={enviando} onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}

export default function NotasFiscaisEmitidas({ supabase, lojaInfo }) {
  const lojaId = lojaInfo?.id ?? null;
  const [notas, setNotas] = useState([]);
  const [estado, setEstado] = useState({ carregando: true, erro: "" });
  const [aberto, setAberto] = useState(null); // { id, acao }

  const buscar = useCallback(async () => {
    try { return { notas: await listarDocumentosFiscais(supabase, lojaId) }; } catch (e) { return { erro: e.message }; }
  }, [supabase, lojaId]);
  const aplicar = useCallback((r) => {
    if (r.erro) setEstado({ carregando: false, erro: r.erro });
    else { setNotas(r.notas); setEstado({ carregando: false, erro: "" }); }
  }, []);
  const recarregar = useCallback(async () => aplicar(await buscar()), [aplicar, buscar]);

  useEffect(() => {
    if (lojaId == null) return undefined;
    let vivo = true;
    buscar().then((r) => { if (vivo) aplicar(r); });
    return () => { vivo = false; };
  }, [lojaId, buscar, aplicar]);

  if (lojaId == null) return <p className="text-[13px] text-[var(--pp-text-muted)]">Selecione uma empresa.</p>;
  if (estado.carregando) return <p className="text-[13px] text-[var(--pp-text-muted)]">Carregando…</p>;
  if (estado.erro) return <div className="rounded-2xl border border-[var(--pp-border)] bg-white p-4"><p className="text-[13px] font-semibold text-[#C81E4A]">{estado.erro}</p></div>;

  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby="notas-titulo" data-testid="notas-fiscais-emitidas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="notas-titulo" className="text-[15px] font-bold text-[var(--pp-text)]">Notas emitidas</h3>
        <button type="button" className={botaoLeve} onClick={recarregar}>Atualizar</button>
      </div>
      {notas.length === 0 ? (
        <p className="mt-2 text-[13px] text-[var(--pp-text-muted)]">Nenhuma nota emitida ainda.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--pp-border)]">
          {notas.map((n) => {
            const s = situacaoNota(n.status);
            const a = acoesDaNota(n);
            return (
              <li key={n.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[13px] font-bold text-[var(--pp-text)]">{n.modelo === 65 ? "NFC-e" : "NF-e"} {n.numero}<span className="font-medium text-[var(--pp-text-muted)]"> · série {n.serie}</span></span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TOM[s.tom]}`}>{s.rotulo}</span>
                  {n.ambiente === "homologacao" && <span className="rounded-full bg-[var(--pp-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--pp-text-muted)]">teste (sem valor fiscal)</span>}
                  <span className="ml-auto text-[13px] font-semibold tabular-nums text-[var(--pp-text)]">{moeda(n.valorTotal)}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-[var(--pp-text-muted)]">
                  {data(n.dhAutorizacao || n.criadoEm)}{n.protocolo ? ` · protocolo ${n.protocolo}` : ""}{n.cartasCorrecao ? ` · ${n.cartasCorrecao} correção(ões)` : ""}
                </p>
                {(n.status === "rejeitado" || n.status === "erro") && n.xMotivo && <p className="mt-0.5 text-[12px] text-[#C81E4A]">{n.xMotivo}</p>}
                {n.ultimoEvento?.status === "rejeitado" && <p className="mt-0.5 text-[12px] text-[#B45309]">Último pedido recusado pela SEFAZ: {n.ultimoEvento.xmotivo}</p>}
                {(a.cancelar || a.cce) && aberto?.id !== n.id && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {a.cancelar && <button type="button" className={botaoLeve} onClick={() => setAberto({ id: n.id, acao: "cancelar" })}>Cancelar nota</button>}
                    {a.cce && <button type="button" className={botaoLeve} onClick={() => setAberto({ id: n.id, acao: "cce" })}>Carta de correção</button>}
                  </div>
                )}
                {aberto?.id === n.id && <PainelEvento nota={n} acao={aberto.acao} supabase={supabase} onFechar={() => setAberto(null)} onConcluido={recarregar} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
