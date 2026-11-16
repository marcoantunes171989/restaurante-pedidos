import { useCallback, useEffect, useState } from "react";
import { situacaoDaNota, acoesDaNota, validarTextoEvento, listarDocumentosFiscais, pedirEventoFiscal, resumoContingencia, textoPrazo, buscarVendaDaNota, refazerNota, descartarNota } from "../../../lib/fiscal/notasFiscais";
import { refazerFiscalDaVenda } from "../../../lib/fiscal/vendaFiscal";
import { emitirReservada } from "../../../lib/fiscal/emissaoPdv";
import { imprimirNotaFiscal } from "../../../lib/fiscal/imprimirNota";
import { postarApiFiscal } from "../../../lib/fiscal/emissaoPdv";

// ════════════════════════════════════════════════════════════
//  Aba "Notas emitidas" (Etapa E6): lista as notas da loja e permite
//  cancelar (NF-e/NFC-e) ou corrigir (CC-e, NF-e). O pedido vai ao servidor,
//  que assina e envia à SEFAZ; a confirmação acontece na própria tela.
//  E7: aviso das notas em contingência (prazo), "Enviar agora" e
//  "Consultar na SEFAZ" para a nota que ficou sem resposta.
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

function mensagemDoResultado(acao, r) {
  if (acao === "consultar") {
    if (r.situacao === "autorizada") return { ok: true, texto: r.deveCancelar ? "A SEFAZ autorizou esta nota. Como a venda saiu em contingência, cancele esta nota." : `Nota autorizada. Protocolo ${r.protocolo}.` };
    if (r.situacao === "nao_encontrada") return { ok: true, texto: r.numeroNaoUsado ? "Não chegou à SEFAZ: este número não foi usado." : "Não chegou à SEFAZ." };
    if (r.code === "XML_NAO_CONFERE") return { ok: false, texto: r.erro };
    return { ok: false, texto: r.situacao === "indisponivel" ? "A SEFAZ continua sem responder. Tente de novo mais tarde." : (r.xMotivo || r.erro || "Não foi possível consultar.") };
  }
  if (r.situacao === "autorizada") return { ok: true, texto: `Nota autorizada. Protocolo ${r.protocolo}.` };
  if (r.situacao === "rejeitada") return { ok: false, texto: `A SEFAZ recusou: ${r.xMotivo || "motivo não informado"}.` };
  return { ok: false, texto: r.situacao === "indisponivel" ? "A SEFAZ continua fora do ar. A nota segue guardada." : (r.xMotivo || r.erro || "Não foi possível enviar.") };
}

function AvisoContingencia({ resumo, supabase, onConcluido }) {
  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState("");
  async function enviarTodas() {
    setEnviando(true);
    let ok = 0;
    for (const id of resumo.ids) {
      try {
        const r = await pedirEventoFiscal(supabase, { acao: "transmitir_contingencia", documentoId: id });
        if (r.situacao === "autorizada") ok += 1;
      } catch { /* segue para a próxima */ }
    }
    const faltam = resumo.ids.length - ok;
    setTexto(faltam ? `${ok} autorizada(s). ${faltam} continua(m) guardada(s) para enviar depois.` : `Todas as ${ok} nota(s) foram autorizadas.`);
    setEnviando(false);
    onConcluido();
  }
  const urgente = resumo.vencidas > 0;
  return (
    <div role="alert" className={`mt-3 rounded-xl border p-3 ${urgente ? "border-[#F5C2CD] bg-[#FDECEF]" : "border-[#F8D9A8] bg-[#FEF3E2]"}`}>
      <p className={`text-[13px] font-bold ${urgente ? "text-[#C81E4A]" : "text-[#B45309]"}`}>
        {resumo.pendentes} nota(s) em contingência aguardando envio à SEFAZ
      </p>
      <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">
        {urgente ? `${resumo.vencidas} com prazo vencido: envie agora.` : resumo.proximoPrazo ? `Envie ${textoPrazo(resumo.proximoPrazo)}.` : "NF-e da SVC (servidor reserva): envie assim que ele responder."}
      </p>
      {texto && <p role="status" className="mt-1 text-[12px] font-semibold text-[var(--pp-text)]">{texto}</p>}
      <button type="button" className={`${botao} mt-2`} disabled={enviando} onClick={enviarTodas}>{enviando ? "Enviando…" : "Enviar pendentes agora"}</button>
    </div>
  );
}

// U1: descartar número reservado que não será usado (pede o motivo).
function PainelDescartar({ nota, supabase, onFechar, onConcluido }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  async function confirmar() {
    setEnviando(true); setErro("");
    try { await descartarNota(supabase, nota.id, motivo.trim()); onFechar(); onConcluido(); }
    catch (e) { setErro(e.message); } finally { setEnviando(false); }
  }
  return (
    <div className="mt-2 rounded-xl border border-[var(--pp-border)] p-3">
      <label className="block text-[12px] font-semibold text-[var(--pp-text-body)]" htmlFor={`descartar-${nota.id}`}>Por que este número não será usado?</label>
      <input id={`descartar-${nota.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 text-[13px]" placeholder="Ex.: venda refeita em outra nota" />
      <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">O número fica registrado como não usado e não volta a ser usado.</p>
      {erro && <p role="status" className="mt-1 text-[12px] font-semibold text-[#C81E4A]">{erro}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={botao} disabled={enviando || motivo.trim().length < 3} onClick={confirmar}>{enviando ? "Descartando…" : "Descartar número"}</button>
        <button type="button" className={botaoLeve} disabled={enviando} onClick={onFechar}>Voltar</button>
      </div>
    </div>
  );
}

export default function NotasFiscaisEmitidas({ supabase, lojaInfo, produtos = [], regrasLoja = [] }) {
  const lojaId = lojaInfo?.id ?? null;
  const [notas, setNotas] = useState([]);
  const [estado, setEstado] = useState({ carregando: true, erro: "" });
  const [aberto, setAberto] = useState(null); // { id, acao }
  const [ocupado, setOcupado] = useState(null); // nota com envio/consulta em andamento
  const [avisos, setAvisos] = useState({}); // id → { ok, texto }

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

  async function acaoRapida(nota, acao) {
    setOcupado(nota.id);
    try {
      const r = await pedirEventoFiscal(supabase, { acao: acao === "enviar" ? "transmitir_contingencia" : "consultar", documentoId: nota.id });
      setAvisos((v) => ({ ...v, [nota.id]: mensagemDoResultado(acao, r) }));
    } catch (e) {
      setAvisos((v) => ({ ...v, [nota.id]: { ok: false, texto: e.message } }));
    } finally {
      setOcupado(null);
      recarregar();
    }
  }
  const postar = (corpo) => postarApiFiscal(supabase, corpo);
  // U1: nota reservada e nunca enviada → envia agora (SEFAZ fora → contingência, como no caixa).
  async function emitirAgora(nota) {
    setOcupado(nota.id);
    try {
      const r = await emitirReservada({ documentoId: nota.id, numero: nota.numero, nfe: Number(nota.modelo) === 55, postar });
      setAvisos((v) => ({ ...v, [nota.id]: { ok: r.estado === "autorizada" || r.estado === "contingencia", texto: [r.titulo, r.detalhe].filter(Boolean).join(": ") } }));
    } finally { setOcupado(null); recarregar(); }
  }
  // U2: rejeitada → refaz a parte fiscal com o cadastro atual dos produtos e envia de novo.
  async function corrigirEEmitir(nota) {
    setOcupado(nota.id);
    try {
      const atual = await buscarVendaDaNota(supabase, nota.id);
      const venda = refazerFiscalDaVenda(atual.venda, produtos, { lojaFiscalRegras: regrasLoja });
      if (!venda.apto) {
        const falta = venda.itens.flatMap((it) => it.pendencias.map((p) => (p.includes(it.nome) ? p : `${it.nome}: ${p}`)));
        setAvisos((v) => ({ ...v, [nota.id]: { ok: false, texto: `Corrija o cadastro antes: ${falta.slice(0, 3).join(" ")}` } }));
        return;
      }
      await refazerNota(supabase, nota.id, venda);
      const r = await emitirReservada({ documentoId: nota.id, numero: nota.numero, nfe: Number(nota.modelo) === 55, postar });
      setAvisos((v) => ({ ...v, [nota.id]: { ok: r.estado === "autorizada" || r.estado === "contingencia", texto: [r.titulo, r.detalhe].filter(Boolean).join(": ") } }));
    } catch (e) {
      setAvisos((v) => ({ ...v, [nota.id]: { ok: false, texto: e.message } }));
    } finally { setOcupado(null); recarregar(); }
  }
  async function imprimir(nota) {
    const r = await imprimirNotaFiscal({ documentoId: nota.id, buscar: (corpo) => postarApiFiscal(supabase, corpo) });
    if (!r.ok) setAvisos((v) => ({ ...v, [nota.id]: { ok: false, texto: r.erro } }));
  }
  const resumo = resumoContingencia(notas);

  if (lojaId == null) return <p className="text-[13px] text-[var(--pp-text-muted)]">Selecione uma empresa.</p>;
  if (estado.carregando) return <p className="text-[13px] text-[var(--pp-text-muted)]">Carregando…</p>;
  if (estado.erro) return <div className="rounded-2xl border border-[var(--pp-border)] bg-white p-4"><p className="text-[13px] font-semibold text-[#C81E4A]">{estado.erro}</p></div>;

  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby="notas-titulo" data-testid="notas-fiscais-emitidas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="notas-titulo" className="text-[15px] font-bold text-[var(--pp-text)]">Notas emitidas</h3>
        <button type="button" className={botaoLeve} onClick={recarregar}>Atualizar</button>
      </div>
      {resumo.pendentes > 0 && <AvisoContingencia resumo={resumo} supabase={supabase} onConcluido={recarregar} />}
      {notas.length === 0 ? (
        <p className="mt-2 text-[13px] text-[var(--pp-text-muted)]">Nenhuma nota emitida ainda.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--pp-border)]">
          {notas.map((n) => {
            const s = situacaoDaNota(n);
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
                {(n.status === "rejeitado" || n.status === "erro") && n.xMotivo && <p className={`mt-0.5 text-[12px] ${n.contingenciaNumero && Number(n.cStat) === 217 ? "text-[var(--pp-text-muted)]" : "text-[#C81E4A]"}`}>{n.xMotivo}</p>}
                {n.ultimoEvento?.status === "rejeitado" && <p className="mt-0.5 text-[12px] text-[#B45309]">Último pedido recusado pela SEFAZ: {n.ultimoEvento.xmotivo}</p>}
                {[6, 7].includes(n.tpEmis) && n.contingencia && !n.contingencia.prazo && !["autorizado", "cancelado"].includes(n.status) && (
                  <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">
                    Emitida pela SVC (servidor reserva da SEFAZ){n.contingencia.numeroOrigem ? ` no lugar da nº ${n.contingencia.numeroOrigem}` : ""}
                    {n.contingencia.tentativas ? ` · ${n.contingencia.tentativas} tentativa(s)` : ""}
                  </p>
                )}
                {[4, 9].includes(n.tpEmis) && n.contingencia && !["autorizado", "cancelado"].includes(n.status) && (
                  <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">
                    Emitida em contingência{n.tpEmis === 4 ? (n.contingencia.epecProtocolo ? ` EPEC (protocolo ${n.contingencia.epecProtocolo})` : " EPEC — aviso ainda não registrado: não imprima") : ""}{n.contingencia.numeroOrigem ? ` (no lugar da nº ${n.contingencia.numeroOrigem})` : ""} · {n.contingencia.vencida ? "" : "enviar "}{textoPrazo(n.contingencia.prazo)}
                    {n.contingencia.tentativas ? ` · ${n.contingencia.tentativas} tentativa(s)` : ""}
                  </p>
                )}
                {n.contingenciaNumero && !["autorizado", "cancelado"].includes(n.status) && Number(n.cStat) !== 217 && (
                  <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">A venda saiu na {n.modelo === 65 ? "NFC-e" : "NF-e"} nº {n.contingenciaNumero} (contingência). Esta nota não será reenviada: só consultada.</p>
                )}
                {avisos[n.id] && <p role="status" className={`mt-1 text-[12px] font-semibold ${avisos[n.id].ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>{avisos[n.id].texto}</p>}
                {(a.cancelar || a.cce || a.enviar || a.consultar || a.imprimir || a.emitir || a.descartar || a.refazer) && aberto?.id !== n.id && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {a.emitir && <button type="button" className={botao} disabled={ocupado === n.id} onClick={() => emitirAgora(n)}>{ocupado === n.id ? "Enviando…" : "Emitir agora"}</button>}
                    {a.refazer && <button type="button" className={botao} disabled={ocupado === n.id} onClick={() => corrigirEEmitir(n)}>{ocupado === n.id ? "Enviando…" : "Corrigir e emitir de novo"}</button>}
                    {a.descartar && <button type="button" className={botaoLeve} disabled={ocupado === n.id} onClick={() => setAberto({ id: n.id, acao: "descartar" })}>Descartar número</button>}
                    {a.imprimir && <button type="button" className={botaoLeve} onClick={() => imprimir(n)}>{n.modelo === 55 ? "Imprimir DANFE" : "Imprimir NFC-e"}</button>}
                    {a.enviar && <button type="button" className={botao} disabled={ocupado === n.id} onClick={() => acaoRapida(n, "enviar")}>{ocupado === n.id ? "Enviando…" : "Enviar agora"}</button>}
                    {a.consultar && <button type="button" className={botaoLeve} disabled={ocupado === n.id} onClick={() => acaoRapida(n, "consultar")}>{ocupado === n.id ? "Consultando…" : "Consultar na SEFAZ"}</button>}
                    {a.cancelar && <button type="button" className={botaoLeve} onClick={() => setAberto({ id: n.id, acao: "cancelar" })}>Cancelar nota</button>}
                    {a.cce && <button type="button" className={botaoLeve} onClick={() => setAberto({ id: n.id, acao: "cce" })}>Carta de correção</button>}
                  </div>
                )}
                {aberto?.id === n.id && aberto.acao === "descartar" && <PainelDescartar nota={n} supabase={supabase} onFechar={() => setAberto(null)} onConcluido={recarregar} />}
                {aberto?.id === n.id && aberto.acao !== "descartar" && <PainelEvento nota={n} acao={aberto.acao} supabase={supabase} onFechar={() => setAberto(null)} onConcluido={recarregar} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
