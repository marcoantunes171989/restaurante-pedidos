import { useEffect, useMemo, useState } from "react";
import { buscarHistoricoDocumento, conferirNotaSefaz, explicarNota, linhaDoHistorico, textoDiagnostico } from "../../../lib/fiscal/notasFiscais";
import { postarApiFiscal } from "../../../lib/fiscal/emissaoPdv";
import { buscarXmlDaNota, consumidorDoXml, mascaraDocumentoFiscal } from "../../../lib/fiscal/xmlNota";
import { agruparTentativas, camposTecnicos, categoriaDoEvento, fraseDaTentativa, resumoDasTentativas } from "../../../lib/fiscal/historicoTentativas";

// Painel "Detalhes e histórico" de uma nota. Duas abas:
//  • Detalhes: o que aconteceu (explicação e próximo passo), os dados da nota e as ações feitas nesta tela.
//  • Histórico: agrupado POR TENTATIVA DE ENVIO — cada cartão traz o que foi preparado antes, o resultado da SEFAZ, a causa provável,
//    o que fazer e (para o técnico) os campos técnicos de cada evento.
const botaoLeve = "inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#012E46] hover:border-[#012E46]";
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—");

const COR_RESULTADO = {
  autorizada: ["bg-[#E8F5EC] text-[#1F7A3D]", "border-[#BFE3CB]"],
  rejeitada: ["bg-[#FDECEF] text-[#C81E4A]", "border-[#F5C2CD]"],
  tecnica: ["bg-[#FDECEF] text-[#C81E4A]", "border-[#F5C2CD]"],
  tecnica_apos: ["bg-[#FEF3E2] text-[#8A5200]", "border-[#F8D9A8]"],
  nao_recebida: ["bg-[#FEF3E2] text-[#8A5200]", "border-[#F8D9A8]"],
  sem_resposta: ["bg-[#FEF3E2] text-[#8A5200]", "border-[#F8D9A8]"],
  sem_confirmacao: ["bg-[#FEF3E2] text-[#8A5200]", "border-[#F8D9A8]"],
  interrompida: ["bg-[#EEF2F5] text-[#012E46]", "border-[var(--pp-border)]"],
  em_andamento: ["bg-[#EEF2F5] text-[#012E46]", "border-[var(--pp-border)]"],
};
const QUEM = { cliente: "Cliente", tecnico: "Técnico", contador: "Contador" };
const FILTROS = [["tudo", "Tudo"], ["envios", "Envios à SEFAZ"], ["manutencoes", "Manutenções"], ["sistema", "Sistema"]];

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { /* sem permissão de área de transferência */ }
  try {
    const t = document.createElement("textarea");
    t.value = texto; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  } catch { return false; }
}

/** Linha de um evento de preparo (antes de uma tentativa): manutenção com usuário/motivo/alterações, data renovada, refeito… */
function EventoDePreparo({ linha }) {
  const e = linha.bruto;
  const p = e?.payload || {};
  if (e?.tipo === "MANUTENCAO_FISCAL") {
    const alt = Array.isArray(p.alteracoes) ? p.alteracoes : [];
    return (
      <li className="rounded-lg border border-[#F8D9A8] bg-[#FEF3E2] px-2 py-1.5 text-[12px]" data-testid="evento-manutencao">
        <span className="font-semibold text-[#8A5200]">Manutenção fiscal</span> · {dataHora(e.criado_em)} · por <b>{p.usuario?.nome || p.usuario?.email || "usuário não identificado"}</b>
        <span className="block text-[var(--pp-text-body)]">Motivo: {p.motivo || "—"}</span>
        {alt.length > 0 && <ul className="mt-0.5 list-disc pl-4 text-[11px] text-[var(--pp-text-body)]">{alt.map((a, i) => <li key={i}>{a.campo}: “{a.de || "vazio"}” → “{a.para || "vazio"}”</li>)}</ul>}
      </li>
    );
  }
  if (e?.tipo === "DH_EMISSAO_RENOVADA") return <li className="text-[12px] text-[var(--pp-text-body)]">{dataHora(e.criado_em)} · Data/hora de emissão renovada para o reenvio ({dataHora(p.dhEmi)}).</li>;
  return <li className="text-[12px] text-[var(--pp-text-body)]">{dataHora(e?.criado_em)} · <span className="font-semibold">{linha.titulo}</span>{linha.texto ? ` — ${linha.texto}` : ""}</li>;
}

function CartaoTentativa({ t, linhasPorId, maisRecente, mostrarPreparo }) {
  const [cor, borda] = COR_RESULTADO[t.resultado.tipo] || COR_RESULTADO.sem_confirmacao;
  const dur = t.duracaoMs != null ? (t.duracaoMs < 1000 ? "menos de 1 s" : t.duracaoMs < 60000 ? `${Math.round(t.duracaoMs / 1000)} s` : `${Math.floor(t.duracaoMs / 60000)} min ${Math.round((t.duracaoMs % 60000) / 1000)} s`) : null;
  const preparo = t.preparo.map((e) => linhasPorId.get(e.id)).filter(Boolean);
  return (
    <li className={`rounded-xl border bg-white p-3 ${borda}`} data-testid="tentativa" data-numero={t.numero} data-resultado={t.resultado.tipo}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-[var(--pp-text)]">{t.consulta ? "Consulta à SEFAZ" : `Tentativa ${t.numero}`}{maisRecente ? <span className="ml-1 text-[11px] font-semibold text-[var(--pp-text-muted)]">(mais recente)</span> : null}</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cor}`}>{t.resultado.titulo}</span>
      </div>
      <p className="text-[12px] text-[var(--pp-text-muted)]">{dataHora(t.inicio)}{dur ? ` · resposta em ${dur}` : ""}{t.resultado.protocolo ? ` · protocolo ${t.resultado.protocolo}` : ""}</p>
      {t.resultado.xMotivo && <p className="mt-1 break-words text-[12px] font-semibold text-[var(--pp-text)]">“{t.resultado.xMotivo}”</p>}

      {t.resultado.tipo !== "autorizada" && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="analise-tentativa">
          <div className="rounded-lg bg-[var(--pp-bg)] px-2 py-1.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Causa provável</p><p className="text-[12px] text-[var(--pp-text-body)]">{t.analise.causa}</p></div>
          <div className="rounded-lg bg-[var(--pp-bg)] px-2 py-1.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">O que fazer · {QUEM[t.analise.quem] || "Cliente"}</p><p className="text-[12px] font-semibold text-[var(--pp-text)]">{t.analise.acao}</p></div>
        </div>
      )}

      {mostrarPreparo && preparo.length > 0 && (
        <div className="mt-2" data-testid="preparo-tentativa">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Antes desta tentativa</p>
          <ul className="mt-1 space-y-1">{preparo.map((l) => <EventoDePreparo key={l.id} linha={l} />)}</ul>
        </div>
      )}

      <details className="mt-2" data-testid="detalhes-tecnicos">
        <summary className="cursor-pointer text-[12px] font-semibold text-[#012E46]">Detalhes técnicos</summary>
        <div className="mt-1 space-y-2">
          {[...t.preparo, ...t.eventos].map((e) => (
            <div key={e.id} className="rounded-lg border border-[var(--pp-border)] px-2 py-1">
              <p className="text-[11px] font-semibold text-[var(--pp-text)]">{dataHora(e.criado_em)} · {e.tipo}</p>
              <dl className="grid gap-x-3 sm:grid-cols-[auto_1fr]">
                {camposTecnicos(e).filter(([k]) => k !== "Evento").map(([k, v]) => (<div key={k} className="contents"><dt className="text-[11px] text-[var(--pp-text-muted)]">{k}</dt><dd className="break-all text-[11px] text-[var(--pp-text)]">{v}</dd></div>))}
              </dl>
            </div>
          ))}
        </div>
      </details>
    </li>
  );
}

export default function DetalhesNotaFiscal({ nota, supabase, tentativas = [], onFechar }) {
  const [aba, setAba] = useState("detalhes");
  const [filtro, setFiltro] = useState("tudo");
  const [hist, setHist] = useState({ carregando: true, linhas: [], erro: "", pendente: false });
  const [copiado, setCopiado] = useState("");
  const [versao, setVersao] = useState(0); // sobe depois de uma conferência: recarrega o histórico
  const [conf, setConf] = useState({ ocupado: false, ok: null, texto: "" });
  // Consumidor (CPF/CNPJ) que realmente foi no XML da nota: undefined = carregando, null = não identificado.
  const [consumidor, setConsumidor] = useState(undefined);
  const explicacao = explicarNota(nota);

  useEffect(() => {
    let vivo = true;
    buscarHistoricoDocumento(supabase, nota.id)
      .then((linhas) => { if (vivo) setHist({ carregando: false, linhas, erro: "", pendente: false }); })
      .catch((e) => { if (vivo) setHist({ carregando: false, linhas: [], erro: e.message, pendente: e.code === "MIGRACAO_PENDENTE" }); });
    return () => { vivo = false; };
  }, [supabase, nota.id, nota.status, nota.cStat, versao]);

  useEffect(() => {
    let vivo = true;
    if (!["autorizado", "cancelado"].includes(nota.status)) return undefined;
    buscarXmlDaNota({ documentoId: nota.id, buscar: (corpo) => postarApiFiscal(supabase, corpo) })
      .then((r) => { if (vivo) setConsumidor(r.ok ? consumidorDoXml(r.xml) : undefined); })
      .catch(() => { if (vivo) setConsumidor(undefined); });
    return () => { vivo = false; };
  }, [supabase, nota.id, nota.status]);

  const brutos = useMemo(() => hist.linhas.map((l) => l.bruto).filter(Boolean), [hist.linhas]);
  const linhasPorId = useMemo(() => new Map(hist.linhas.map((l) => [l.id, l])), [hist.linhas]);
  const grupo = useMemo(() => agruparTentativas(brutos), [brutos]);
  const resumo = useMemo(() => resumoDasTentativas(grupo), [grupo]);
  const manutencoes = useMemo(() => brutos.filter((e) => categoriaDoEvento(e) === "manutencao").sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))), [brutos]);
  const sistema = useMemo(() => brutos.filter((e) => categoriaDoEvento(e) === "sistema" && !["MANUTENCAO_FISCAL"].includes(e.tipo)).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))), [brutos]);

  // Controle fiscal: a última conferência na base nacional e, se o número foi inutilizado / não usado, como e quando.
  const ultimaDoTipo = (tipos) => brutos.filter((e) => tipos.includes(e.tipo)).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))[0] || null;
  const ultimaConferencia = ultimaDoTipo(["CONFERIDA_SEFAZ"]);
  const baixaDoNumero = ultimaDoTipo(["INUTILIZADO", "NUMERO_NAO_USADO"]);
  const emitida = ["autorizado", "cancelado"].includes(nota.status) && !!nota.chave;

  async function conferir() {
    setConf({ ocupado: true, ok: null, texto: "" });
    try {
      const r = await conferirNotaSefaz(supabase, nota.id);
      setConf({ ocupado: false, ok: r.conforme, texto: r.conforme ? `Conforme: a SEFAZ confirma a nota (código ${r.cStat}${r.protocolo ? `, protocolo ${r.protocolo}` : ""}).` : `DIVERGENTE: ${(r.divergencias || []).join(" ")}` });
      setVersao((v) => v + 1);
    } catch (e) { setConf({ ocupado: false, ok: false, texto: e.message }); }
  }

  async function copiarDiagnostico() {
    const ok = await copiar(textoDiagnostico(nota, hist.linhas, tentativas));
    setCopiado(ok ? "Diagnóstico copiado. Cole na conversa com o suporte." : "Não foi possível copiar: selecione e copie o texto manualmente.");
  }

  const campos = [
    ["Situação", `${nota.status}${nota.cStat != null ? ` · código ${nota.cStat}` : ""}`],
    ["Motivo / resposta", nota.xMotivo || "—"],
    ["Chave de acesso", nota.chave || "ainda não gerada"],
    ["Protocolo", nota.protocolo || "—"],
    ...(["autorizado", "cancelado"].includes(nota.status) ? [["CPF/CNPJ do consumidor na nota", consumidor === undefined ? "consultando o XML…" : consumidor ? `${consumidor.tipo} ${mascaraDocumentoFiscal(consumidor.documento)} (consta no XML enviado à SEFAZ)` : "não identificado (a nota saiu sem CPF/CNPJ)"]] : []),
    ["Ambiente", nota.ambiente === "homologacao" ? "Homologação (teste, sem valor fiscal)" : "Produção"],
    ["Tipo de emissão", Number(nota.tpEmis || 1) === 1 ? "Normal" : `Contingência (${nota.tpEmis})`],
    ["Criada em", dataHora(nota.criadoEm)],
    ["Autorizada em", nota.dhAutorizacao ? dataHora(nota.dhAutorizacao) : "—"],
  ];
  const abaBtn = (id, rot) => (
    <button type="button" role="tab" aria-selected={aba === id} data-testid={`aba-${id}`} onClick={() => setAba(id)}
      className={`px-3 py-1.5 text-[12px] font-semibold ${aba === id ? "bg-[#012E46] text-white" : "bg-white text-[var(--pp-text-body)]"}`}>{rot}</button>
  );

  return (
    <div className="mt-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3" data-testid="detalhes-nota">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-[var(--pp-text)]">Detalhes e histórico</p>
        <div className="flex gap-2">
          <button type="button" className={botaoLeve} onClick={copiarDiagnostico}>Copiar diagnóstico</button>
          <button type="button" className={botaoLeve} onClick={onFechar}>Fechar</button>
        </div>
      </div>
      {copiado && <p role="status" className="mt-1 text-[12px] font-semibold text-[#1F7A3D]">{copiado}</p>}

      <div className="mt-2 inline-flex overflow-hidden rounded-xl border border-[var(--pp-border)]" role="tablist" aria-label="Detalhes e histórico">
        {abaBtn("detalhes", "Detalhes")}
        {abaBtn("historico", `Histórico${resumo.envios ? ` (${resumo.envios} envio${resumo.envios > 1 ? "s" : ""})` : ""}`)}
      </div>

      {aba === "detalhes" && (
        <div data-testid="painel-detalhes">
          {explicacao && (
            <div className={`mt-2 rounded-lg border px-3 py-2 ${explicacao.tom === "erro" ? "border-[#F5C2CD] bg-[#FDECEF]" : "border-[#F8D9A8] bg-[#FEF3E2]"}`} data-testid="explicacao-nota">
              <p className={`text-[13px] font-bold ${explicacao.tom === "erro" ? "text-[#C81E4A]" : "text-[#8A5200]"}`}>{explicacao.titulo}</p>
              <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">{explicacao.causa}</p>
              {explicacao.passos.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-[12px] font-semibold text-[var(--pp-text)]">
                  {explicacao.passos.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
            </div>
          )}
          <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {campos.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">{k}</dt>
                <dd className="break-words text-[12px] text-[var(--pp-text)]">{v}</dd>
              </div>
            ))}
          </dl>
          {emitida && (
            <div className="mt-3 rounded-lg border border-[var(--pp-border)] bg-white px-3 py-2" data-testid="validacao-sefaz">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Validação na base nacional da SEFAZ</p>
              <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">Esta nota é definitiva: o XML, a chave e o protocolo não podem ser alterados. Para confirmar que ela consta como válida na SEFAZ, confira abaixo (a conferência só lê e fica registrada no histórico).</p>
              {ultimaConferencia && (() => {
                const l = linhaDoHistorico(ultimaConferencia);
                return <p className={`mt-1 text-[12px] font-semibold ${l.falha ? "text-[#C81E4A]" : "text-[#1F7A3D]"}`} data-testid="ultima-conferencia">Última conferência {dataHora(l.quando)}: {l.texto}</p>;
              })()}
              {!ultimaConferencia && <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">Ainda não conferida nesta tela.</p>}
              {conf.texto && <p role="status" className={`mt-1 text-[12px] font-semibold ${conf.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`} data-testid="resultado-conferencia">{conf.texto}</p>}
              <button type="button" className={`${botaoLeve} mt-2`} disabled={conf.ocupado} onClick={conferir} data-testid="btn-conferir-sefaz">{conf.ocupado ? "Consultando a SEFAZ…" : "Conferir na SEFAZ"}</button>
            </div>
          )}
          {nota.status === "descartado" && (
            <div className="mt-3 rounded-lg border border-[var(--pp-border)] bg-white px-3 py-2" data-testid="baixa-numero">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">{nota.protocolo ? "Número inutilizado na SEFAZ" : "Número não usado"}</p>
              {baixaDoNumero ? <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">{dataHora(baixaDoNumero.criado_em)} · {linhaDoHistorico(baixaDoNumero).texto}</p> : <p className="mt-0.5 text-[12px] text-[var(--pp-text-muted)]">Carregando o registro…</p>}
            </div>
          )}
          {tentativas.length > 0 && (
            <>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Ações feitas nesta tela</p>
              <ol className="mt-1 space-y-1.5" data-testid="tentativas-lista">
                {tentativas.map((x, i) => (
                  <li key={`${x.quando}-${i}`} className="flex gap-2 text-[12px]">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${x.ok ? "bg-[#1F7A3D]" : "bg-[#C81E4A]"}`} aria-hidden="true" />
                    <span className="min-w-0"><span className="font-semibold text-[var(--pp-text)]">{x.acao}</span><span className="text-[var(--pp-text-muted)]"> · {dataHora(x.quando)}</span><span className="block break-words text-[var(--pp-text-body)]">{x.texto}</span></span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      {aba === "historico" && (
        <div data-testid="painel-historico" className="mt-2">
          {hist.carregando && <p className="text-[12px] text-[var(--pp-text-muted)]">Carregando o histórico…</p>}
          {!hist.carregando && hist.erro && (
            <p className={`text-[12px] ${hist.pendente ? "text-[#B45309]" : "text-[#C81E4A]"}`} data-testid="historico-erro">
              {hist.erro}{hist.pendente ? " Peça para rodar o script no banco. Enquanto isso, a aba Detalhes já mostra a situação e o motivo atuais." : ""}
            </p>
          )}
          {!hist.carregando && !hist.erro && brutos.length === 0 && <p className="text-[12px] text-[var(--pp-text-muted)]">Nenhum evento registrado ainda.</p>}

          {!hist.carregando && !hist.erro && brutos.length > 0 && (
            <>
              <p className="rounded-lg bg-white px-3 py-2 text-[12px] text-[var(--pp-text)]" data-testid="historico-resumo">
                <b>{resumo.envios}</b> tentativa(s) de envio
                {resumo.rejeicoes ? <> · <b>{resumo.rejeicoes}</b> rejeição(ões) da SEFAZ</> : null}
                {resumo.falhasTecnicas ? <> · <b>{resumo.falhasTecnicas}</b> falha(s) técnica(s)</> : null}
                {resumo.consultas ? <> · <b>{resumo.consultas}</b> consulta(s)</> : null}
                {resumo.manutencoes ? <> · <b>{resumo.manutencoes}</b> manutenção(ões) fiscal(is)</> : null}
                {resumo.ultima ? <span className="block text-[var(--pp-text-muted)]">Última: {fraseDaTentativa(resumo.ultima)}</span> : null}
              </p>

              <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Filtrar o histórico por tipo">
                {FILTROS.map(([id, rot]) => (
                  <button key={id} type="button" aria-pressed={filtro === id} data-testid={`filtro-${id}`} onClick={() => setFiltro(id)}
                    className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${filtro === id ? "border-[#012E46] bg-[#012E46] text-white" : "border-[var(--pp-border)] bg-white text-[var(--pp-text-body)]"}`}>{rot}</button>
                ))}
              </div>

              {(filtro === "tudo" || filtro === "envios") && (
                <ol className="mt-2 space-y-2" data-testid="historico-tentativas">
                  {[...grupo.tentativas].reverse().map((t, i) => <CartaoTentativa key={t.numero} t={t} linhasPorId={linhasPorId} maisRecente={i === 0} mostrarPreparo={filtro === "tudo"} />)}
                  {grupo.tentativas.length === 0 && <li className="text-[12px] text-[var(--pp-text-muted)]">Nenhuma tentativa de envio à SEFAZ registrada ainda.</li>}
                </ol>
              )}
              {filtro === "tudo" && grupo.depois.length > 0 && (
                <div className="mt-2" data-testid="historico-depois">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Depois da última tentativa (preparando a próxima)</p>
                  <ul className="mt-1 space-y-1">{grupo.depois.map((e) => linhasPorId.get(e.id)).filter(Boolean).map((l) => <EventoDePreparo key={l.id} linha={l} />)}</ul>
                </div>
              )}
              {filtro === "manutencoes" && (
                <ul className="mt-2 space-y-1.5" data-testid="historico-manutencoes">
                  {manutencoes.map((e) => linhasPorId.get(e.id)).filter(Boolean).map((l) => <EventoDePreparo key={l.id} linha={l} />)}
                  {manutencoes.length === 0 && <li className="text-[12px] text-[var(--pp-text-muted)]">Nenhuma manutenção fiscal registrada nesta nota.</li>}
                </ul>
              )}
              {filtro === "sistema" && (
                <ul className="mt-2 space-y-1" data-testid="historico-sistema">
                  {sistema.map((e) => linhasPorId.get(e.id)).filter(Boolean).map((l) => <EventoDePreparo key={l.id} linha={l} />)}
                  {sistema.length === 0 && <li className="text-[12px] text-[var(--pp-text-muted)]">Nenhum evento do sistema.</li>}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
